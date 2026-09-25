import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSecretRequirementV1 } from '../../../packages/governance/dist/index.js';
import {
  bindLocalSecret,
  createLocalSecretProfileStore,
  defaultSecretRequirementsFile,
  doctorLocalSecrets,
  doctorResumeSecretHandles,
  inspectLocalSecretProfile,
  loadSecretRequirements,
  localSecretProfileFile,
  readLocalSecretProfile,
  serializePortableSecretRequirements,
  unbindLocalSecret,
  writeLocalSecretProfile,
} from '../lib/secrets.mjs';

test('local secret profiles persist only resolver metadata under the gitignored runtime directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fh-secrets-'));
  process.env.FH_TEST_OPENAI_KEY = 'runtime-only-material';

  try {
    const file = localSecretProfileFile(root, 'work-laptop');
    assert.equal(
      file,
      path.join(root, '.freehighlander', 'runtime', 'secret-bindings', 'work-laptop.json'),
    );

    const store = createLocalSecretProfileStore(root, 'work-laptop');
    const initial = readLocalSecretProfile(store, 'work-laptop');
    const profile = bindLocalSecret(initial.profile, {
      profileId: 'work-laptop',
      handleId: 'provider.openai.api',
      resolverKind: 'LOCAL_ENV',
      reference: 'FH_TEST_OPENAI_KEY',
      storage: 'MACHINE_LOCAL',
      accountProfile: null,
      portableReferenceApproved: false,
    });
    const written = writeLocalSecretProfile(store, initial.generation, profile);
    assert.equal(written.generation, 1);

    const raw = await readFile(store.filePath, 'utf8');
    assert.match(raw, /FH_TEST_OPENAI_KEY/);
    assert.doesNotMatch(raw, /runtime-only-material/);

    const inspection = await inspectLocalSecretProfile(written.profile, {
      environment: process.env,
      platform: 'linux',
    });
    assert.equal(inspection.evidence[0].health, 'HEALTHY');
    assert.equal(inspection.secretValuesPresent, false);
    assert.doesNotMatch(JSON.stringify(inspection), /runtime-only-material/);
    assert.doesNotMatch(JSON.stringify(inspection), /FH_TEST_OPENAI_KEY/);
  } finally {
    delete process.env.FH_TEST_OPENAI_KEY;
    await rm(root, { recursive: true, force: true });
  }
});

test('secret profile writes are generation-CAS protected and unbind removes only the selected handle', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fh-secrets-cas-'));
  try {
    const store = createLocalSecretProfileStore(root, 'home-desktop');
    const initial = readLocalSecretProfile(store, 'home-desktop');
    const first = bindLocalSecret(initial.profile, {
      profileId: 'home-desktop',
      handleId: 'provider.openai.api',
      resolverKind: 'LOCAL_ENV',
      reference: 'OPENAI_API_KEY',
    });
    const second = bindLocalSecret(first, {
      profileId: 'home-desktop',
      handleId: 'github.repo.auth',
      resolverKind: 'GITHUB_AUTH_CAPABILITY',
      reference: 'github-auth://current-user',
    });
    const written = writeLocalSecretProfile(store, 0, second);

    assert.throws(() => writeLocalSecretProfile(store, 0, written.profile), /GENERATION_CONFLICT/);

    const after = unbindLocalSecret(written.profile, 'provider.openai.api');
    assert.deepEqual(
      after.bindings.map((binding) => binding.handleId),
      ['github.repo.auth'],
    );
    assert.throws(() => unbindLocalSecret(after, 'provider.openai.api'), /does not exist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('doctor blocks missing required handle without exposing configured references', async () => {
  const profile = bindLocalSecret(
    {
      schemaVersion: 1,
      profileId: 'work-laptop',
      bindings: [],
      authority: 'NONE',
    },
    {
      profileId: 'work-laptop',
      handleId: 'provider.openai.api',
      resolverKind: 'LOCAL_ENV',
      reference: 'OPENAI_API_KEY',
    },
  );

  const requirements = [
    createSecretRequirementV1({
      handleId: 'provider.openai.api',
      purpose: 'provider authentication',
      allowedTargets: ['PROVIDER_AUTH'],
      requiredCapabilities: ['EPHEMERAL_INJECTION'],
      requiredForRoles: ['controller'],
      optional: false,
    }),
    createSecretRequirementV1({
      handleId: 'provider.gemini.api',
      purpose: 'optional provider authentication',
      allowedTargets: ['PROVIDER_AUTH'],
      requiredCapabilities: ['EPHEMERAL_INJECTION'],
      requiredForRoles: ['worker'],
      optional: true,
    }),
  ];

  const ready = await doctorLocalSecrets(profile, requirements, {
    environment: { OPENAI_API_KEY: 'runtime-only-material' },
    platform: 'linux',
  });
  assert.notEqual(ready.status, 'BLOCKED_CONFIGURATION');
  assert.equal(ready.secretValuesPresent, false);
  assert.doesNotMatch(JSON.stringify(ready), /runtime-only-material|OPENAI_API_KEY/);

  const blocked = await doctorLocalSecrets(profile, requirements, {
    environment: {},
    platform: 'linux',
  });
  assert.equal(blocked.status, 'BLOCKED_CONFIGURATION');
  assert.equal(
    blocked.resolutions.find((entry) => entry.handleId === 'provider.openai.api').status,
    'BLOCKED_CONFIGURATION',
  );
});

test('portable requirement manifest contains only logical metadata and loads deterministically', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fh-secret-requirements-'));
  try {
    const requirements = [
      createSecretRequirementV1({
        handleId: 'provider.openai.api',
        purpose: 'provider authentication',
        allowedTargets: ['PROVIDER_AUTH'],
        requiredCapabilities: ['EPHEMERAL_INJECTION'],
        requiredForRoles: ['controller'],
        optional: false,
      }),
      createSecretRequirementV1({
        handleId: 'github.repo.auth',
        purpose: 'repository authentication',
        allowedTargets: ['TOOL_AUTH'],
        requiredCapabilities: ['GITHUB_AUTH'],
        requiredForRoles: ['controller'],
        optional: false,
      }),
    ];
    const manifest = serializePortableSecretRequirements(requirements);
    assert.equal(manifest.authority, 'NONE');
    assert.equal(manifest.secretValuesPresent, false);
    assert.deepEqual(
      manifest.requirements.map((requirement) => requirement.handleId),
      ['github.repo.auth', 'provider.openai.api'],
    );

    const file = defaultSecretRequirementsFile(root);
    await fsMkdir(path.dirname(file));
    await writeFile(file, JSON.stringify(manifest, null, 2), 'utf8');
    const loaded = await loadSecretRequirements(file);
    assert.deepEqual(
      loaded.map((requirement) => requirement.handleId),
      ['github.repo.auth', 'provider.openai.api'],
    );
    assert.doesNotMatch(JSON.stringify(manifest), /api[_-]?key|token|password/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function fsMkdir(directory) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(directory, { recursive: true });
}


test('resume secret readiness evaluates only handles required by the portable manifest', async () => {
  const profile = bindLocalSecret(
    {
      schemaVersion: 1,
      profileId: 'work-laptop',
      bindings: [],
      authority: 'NONE',
    },
    {
      profileId: 'work-laptop',
      handleId: 'provider.openai.api',
      resolverKind: 'LOCAL_ENV',
      reference: 'OPENAI_API_KEY',
    },
  );

  const requirements = [
    createSecretRequirementV1({
      handleId: 'provider.openai.api',
      purpose: 'OpenAI provider authentication',
      allowedTargets: ['PROVIDER_AUTH'],
      requiredCapabilities: ['EPHEMERAL_INJECTION'],
      requiredForRoles: ['controller'],
      optional: false,
    }),
    createSecretRequirementV1({
      handleId: 'provider.gemini.api',
      purpose: 'Gemini provider authentication',
      allowedTargets: ['PROVIDER_AUTH'],
      requiredCapabilities: ['EPHEMERAL_INJECTION'],
      requiredForRoles: ['worker'],
      optional: false,
    }),
    createSecretRequirementV1({
      handleId: 'github.repo.auth',
      purpose: 'repository authentication',
      allowedTargets: ['TOOL_AUTH'],
      requiredCapabilities: ['GITHUB_AUTH'],
      requiredForRoles: ['controller'],
      optional: false,
    }),
  ];

  const blocked = await doctorResumeSecretHandles(
    profile,
    requirements,
    ['provider.gemini.api', 'provider.openai.api'],
    {
      environment: { OPENAI_API_KEY: 'runtime-only-material' },
      platform: 'linux',
    },
  );

  assert.equal(blocked.status, 'BLOCKED_CONFIGURATION');
  assert.deepEqual(blocked.requiredHandleIds, ['provider.gemini.api', 'provider.openai.api']);
  assert.deepEqual(blocked.resolvableHandleIds, ['provider.openai.api']);
  assert.deepEqual(blocked.blockedHandleIds, ['provider.gemini.api']);
  assert.equal(blocked.secretDependentWorkReady, false);
  assert.equal(blocked.resolutions.some((entry) => entry.handleId === 'github.repo.auth'), false);
  assert.equal(blocked.secretValuesPresent, false);
  assert.doesNotMatch(JSON.stringify(blocked), /runtime-only-material|OPENAI_API_KEY/);

  const ready = await doctorResumeSecretHandles(
    profile,
    requirements,
    ['provider.openai.api'],
    {
      environment: { OPENAI_API_KEY: 'runtime-only-material' },
      platform: 'linux',
    },
  );
  assert.equal(ready.status, 'READY');
  assert.deepEqual(ready.blockedHandleIds, []);
  assert.equal(ready.secretDependentWorkReady, true);
});

test('resume secret readiness fails closed when required handle metadata is absent', async () => {
  const profile = {
    schemaVersion: 1,
    profileId: 'work-laptop',
    bindings: [],
    authority: 'NONE',
  };

  const result = await doctorResumeSecretHandles(
    profile,
    [],
    ['provider.unknown.api'],
    {
      environment: {},
      platform: 'linux',
    },
  );

  assert.equal(result.status, 'BLOCKED_CONFIGURATION');
  assert.deepEqual(result.blockedHandleIds, ['provider.unknown.api']);
  assert.equal(result.secretDependentWorkReady, false);
  assert.deepEqual(result.resolutions, [
    {
      handleId: 'provider.unknown.api',
      status: 'BLOCKED_CONFIGURATION',
      profileId: 'work-laptop',
      resolverKind: null,
      reasons: ['secret requirement metadata is missing'],
    },
  ]);
});

test('resume secret readiness with no required handles is READY without probing unrelated bindings', async () => {
  let probeCalls = 0;
  const profile = bindLocalSecret(
    {
      schemaVersion: 1,
      profileId: 'work-laptop',
      bindings: [],
      authority: 'NONE',
    },
    {
      profileId: 'work-laptop',
      handleId: 'provider.openai.api',
      resolverKind: 'LOCAL_ENV',
      reference: 'OPENAI_API_KEY',
    },
  );

  const result = await doctorResumeSecretHandles(profile, [], [], {
    registry: {
      async probe() {
        probeCalls += 1;
        throw new Error('unrelated binding must not be probed');
      },
    },
  });

  assert.equal(result.status, 'READY');
  assert.deepEqual(result.requiredHandleIds, []);
  assert.deepEqual(result.resolutions, []);
  assert.equal(result.secretDependentWorkReady, true);
  assert.equal(probeCalls, 0);
});
