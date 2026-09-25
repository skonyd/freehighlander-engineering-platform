import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createDiscoveredQualification,
  grantModelEligibility,
  recordCapabilityProbe,
  recordShadowVerification,
} from '../../../packages/model-runtime/dist/index.js';
import {
  createModelManagementStore,
  parseCliArgs,
  previewManagedBinding,
  publishManagedBinding,
  readModelManagementState,
  refreshManagedProvider,
  removeManagedProvider,
  requireOption,
  resolveManagedCredential,
  setManagedProvider,
  writeModelManagementState,
} from '../lib/model-management.mjs';

const PROBE_HASH = 'b'.repeat(64);
const SHADOW_HASH = 'c'.repeat(64);
const DECISION_HASH = 'd'.repeat(64);

test('model management CLI parser preserves repeated options and validates required values', () => {
  const parsed = parseCliArgs([
    'binding',
    'preview',
    '--role',
    'controller',
    '--capability',
    'usage_token_breakdown',
    '--capability',
    'reasoning_effort',
  ]);

  assert.equal(parsed.command, 'binding');
  assert.equal(parsed.subcommand, 'preview');
  assert.deepEqual(parsed.options.capability, ['usage_token_breakdown', 'reasoning_effort']);
  assert.equal(requireOption(parsed.options, 'role'), 'controller');
  assert.throws(() => requireOption(parsed.options, 'missing'), /--missing is required/);

  const optionOnly = parseCliArgs(['status', '--state', '/tmp/model-state.json']);
  assert.equal(optionOnly.command, 'status');
  assert.equal(optionOnly.subcommand, undefined);
  assert.equal(optionOnly.options.state, '/tmp/model-state.json');
});

test('atomic model management store persists references only and rejects stale CAS writes', async () => {
  const root = await makeTempRoot();
  try {
    const store = createModelManagementStore(root);
    const initial = readModelManagementState(store);
    assert.equal(initial.generation, 0);

    const mutation = setManagedProvider(initial.state, {
      id: 'local-provider',
      kind: 'OPENAI_COMPATIBLE',
      baseUrl: 'http://127.0.0.1:11434',
      locality: 'LOCAL',
      credentialEnv: 'LOCAL_PROVIDER_API_KEY',
    });
    const written = writeModelManagementState(store, initial.generation, mutation.state);
    assert.equal(written.generation, 1);

    const raw = await readFile(store.filePath, 'utf8');
    assert.match(raw, /LOCAL_PROVIDER_API_KEY/);
    assert.doesNotMatch(raw, /super-secret-value/);

    process.env.LOCAL_PROVIDER_API_KEY = 'super-secret-value';
    const reread = readModelManagementState(store);
    assert.equal(reread.state.providers[0].credential.reference, 'LOCAL_PROVIDER_API_KEY');

    assert.throws(() => writeModelManagementState(store, 0, reread.state), /GENERATION_CONFLICT/);
  } finally {
    delete process.env.LOCAL_PROVIDER_API_KEY;
    await rm(root, { recursive: true, force: true });
  }
});

test('provider configuration change invalidates provider-bound derived state', async () => {
  const server = await startModelServer(['model-a']);
  try {
    const state0 = setManagedProvider(
      {
        schemaVersion: 1,
        providers: [],
        catalogs: [],
        qualifications: [],
        publications: [],
        authority: 'NONE',
      },
      {
        id: 'local-provider',
        kind: 'OPENAI_COMPATIBLE',
        baseUrl: server.baseUrl,
        locality: 'LOCAL',
        credentialEnv: null,
      },
    ).state;

    const first = await refreshManagedProvider(
      state0,
      'local-provider',
      '2026-09-24T20:40:00.000Z',
      {},
    );
    const discovered = createDiscoveredQualification({
      providerId: 'local-provider',
      modelId: 'model-a',
      catalogHash: first.result.snapshot.hash,
    });
    const withQualification = {
      ...first.state,
      qualifications: [discovered],
    };

    const changed = setManagedProvider(withQualification, {
      id: 'local-provider',
      kind: 'OPENAI_COMPATIBLE',
      baseUrl: server.baseUrl + '/replacement',
      locality: 'LOCAL',
      credentialEnv: null,
    });

    assert.equal(changed.changed, true);
    assert.deepEqual(changed.state.catalogs, []);
    assert.deepEqual(changed.state.qualifications, []);
    assert.equal(changed.invalidated.catalogs, 1);
    assert.equal(changed.invalidated.qualifications, 1);
  } finally {
    await server.close();
  }
});

test('local OpenAI-compatible refresh health-checks discovery and marks removed models unavailable', async () => {
  const server = await startModelServer(['model-a']);
  try {
    const initial = setManagedProvider(
      {
        schemaVersion: 1,
        providers: [],
        catalogs: [],
        qualifications: [],
        publications: [],
        authority: 'NONE',
      },
      {
        id: 'local-provider',
        kind: 'OPENAI_COMPATIBLE',
        baseUrl: server.baseUrl,
        locality: 'LOCAL',
        credentialEnv: null,
      },
    ).state;

    const first = await refreshManagedProvider(
      initial,
      'local-provider',
      '2026-09-24T20:40:00.000Z',
      {},
    );
    assert.deepEqual(first.result.addedModelIds, ['model-a']);
    assert.equal(first.result.bindingsRewritten, false);
    assert.equal(first.result.authority, 'NONE');
    assert.equal(first.auditEvents.length, 1);
    assert.equal(first.auditEvents[0].payload.providerId, 'local-provider');
    assert.equal(server.requests, 2);

    server.models.splice(0, server.models.length);
    const second = await refreshManagedProvider(
      first.state,
      'local-provider',
      '2026-09-24T20:41:00.000Z',
      {},
    );

    assert.deepEqual(second.result.becameUnavailableModelIds, ['model-a']);
    assert.equal(second.result.snapshot.records[0].availability, 'UNAVAILABLE');
    assert.equal(second.result.bindingsRewritten, false);
    assert.equal(second.state.publications.length, 0);
    assert.equal(server.requests, 4);
  } finally {
    await server.close();
  }
});

test('binding preview and publish require exact eligible qualification and remain authority-neutral', async () => {
  const server = await startModelServer(['model-a']);
  try {
    const configured = setManagedProvider(
      {
        schemaVersion: 1,
        providers: [],
        catalogs: [],
        qualifications: [],
        publications: [],
        authority: 'NONE',
      },
      {
        id: 'local-provider',
        kind: 'OPENAI_COMPATIBLE',
        baseUrl: server.baseUrl,
        locality: 'LOCAL',
        credentialEnv: null,
      },
    ).state;
    const refreshed = await refreshManagedProvider(
      configured,
      'local-provider',
      '2026-09-24T20:40:00.000Z',
      {},
    );

    const discovered = createDiscoveredQualification({
      providerId: 'local-provider',
      modelId: 'model-a',
      catalogHash: refreshed.result.snapshot.hash,
    });
    const probed = recordCapabilityProbe(discovered, {
      evidenceHash: PROBE_HASH,
      status: 'PASS',
      probedAt: '2026-09-24T20:42:00.000Z',
    });
    const shadow = recordShadowVerification(probed, {
      evidenceHash: SHADOW_HASH,
      status: 'PASS',
      verifiedAt: '2026-09-24T20:43:00.000Z',
      role: 'controller',
      riskTier: 'NORMAL',
    });
    const eligible = grantModelEligibility(shadow, {
      role: 'controller',
      riskTier: 'NORMAL',
      grantedAt: '2026-09-24T20:44:00.000Z',
      decisionHash: DECISION_HASH,
    });
    const state = { ...refreshed.state, qualifications: [eligible] };
    const args = {
      role: 'controller',
      risk: 'NORMAL',
      provider: 'local-provider',
      model: 'model-a',
      bindingId: 'controller-local',
      version: '1.0.0',
      independenceGroup: 'local',
    };

    const preview = previewManagedBinding(state, args, {});
    assert.equal(preview.plan.authorityGranted, false);

    const published = await publishManagedBinding(state, args, '2026-09-24T20:45:00.000Z', {});
    assert.equal(published.publication.authority, 'NONE');
    assert.equal(published.state.publications.length, 1);
    assert.equal(published.auditEvents.length, 1);

    assert.throws(
      () => previewManagedBinding({ ...refreshed.state, qualifications: [discovered] }, args, {}),
      /expected exactly one ELIGIBLE qualification/,
    );
  } finally {
    await server.close();
  }
});

async function makeTempRoot() {
  const { mkdtemp } = await import('node:fs/promises');
  return mkdtemp(path.join(os.tmpdir(), 'fh-model-management-'));
}

async function startModelServer(initialModels) {
  const models = [...initialModels];
  let requests = 0;
  const server = http.createServer((request, response) => {
    if (request.url !== '/v1/models') {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    requests += 1;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('mock model server did not expose a TCP address');
  }

  return {
    models,
    get requests() {
      return requests;
    },
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test('credential resolution and provider removal fail closed without leaking or guessing', () => {
  const provider = {
    schemaVersion: 1,
    id: 'remote-provider',
    kind: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://example.test',
    locality: 'REMOTE',
    credential: { resolverKind: 'LOCAL_ENV', reference: 'REMOTE_PROVIDER_API_KEY' },
    authority: 'NONE',
  };

  assert.equal(
    resolveManagedCredential(provider, { REMOTE_PROVIDER_API_KEY: 'runtime-secret' }),
    'runtime-secret',
  );
  assert.throws(
    () => resolveManagedCredential(provider, {}),
    /credential environment variable is unavailable/,
  );

  const state = setManagedProvider(
    {
      schemaVersion: 1,
      providers: [],
      catalogs: [],
      qualifications: [],
      publications: [],
      authority: 'NONE',
    },
    {
      id: 'remote-provider',
      kind: 'OPENAI_COMPATIBLE',
      baseUrl: 'https://example.test',
      locality: 'REMOTE',
      credentialEnv: 'REMOTE_PROVIDER_API_KEY',
    },
  ).state;
  const removed = removeManagedProvider(state, 'remote-provider');
  assert.equal(removed.state.providers.length, 0);
  assert.throws(
    () => removeManagedProvider(removed.state, 'remote-provider'),
    /unknown managed provider/,
  );
});
