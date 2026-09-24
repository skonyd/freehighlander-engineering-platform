import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSecretBindingProfileV1,
  createSecretBindingV1,
  createSecretRequirementV1,
  evaluateSecretBindingStatusV1,
  secretBindingCanContainSecretValues,
  secretBindingCanExportCredentialMaterial,
  secretBindingCanGrantAuthority,
  validateSecretBindingProfileV1,
  validateSecretBindingV1,
  validateSecretRequirementV1,
} from '../dist/index.js';

function requirement(overrides = {}) {
  return createSecretRequirementV1({
    handleId: 'provider.openai.api',
    purpose: 'Authenticate the OpenAI provider adapter',
    allowedTargets: ['PROVIDER_AUTH'],
    requiredCapabilities: ['provider-auth'],
    requiredForRoles: ['implementer'],
    optional: false,
    ...overrides,
  });
}

function binding(overrides = {}) {
  return createSecretBindingV1({
    profileId: 'work-laptop',
    handleId: 'provider.openai.api',
    resolverKind: 'OS_KEYCHAIN',
    storage: 'MACHINE_LOCAL',
    reference: 'keychain-service/openai',
    accountProfile: 'work-account',
    portableReferenceApproved: false,
    ...overrides,
  });
}

function evidence(overrides = {}) {
  return {
    resolverKind: 'OS_KEYCHAIN',
    health: 'HEALTHY',
    authenticated: true,
    availableCapabilities: ['provider-auth'],
    ...overrides,
  };
}

test('portable secret requirement and binding normalize metadata without secret values', () => {
  const req = createSecretRequirementV1({
    handleId: 'provider.openai.api',
    purpose: 'Provider authentication',
    allowedTargets: ['TOOL_AUTH', 'PROVIDER_AUTH'],
    requiredCapabilities: ['z-capability', 'a-capability'],
    requiredForRoles: ['reviewer', 'implementer'],
    optional: false,
  });
  const b = binding();
  const profile = createSecretBindingProfileV1('work-laptop', [b]);

  assert.deepEqual(req.allowedTargets, ['PROVIDER_AUTH', 'TOOL_AUTH']);
  assert.deepEqual(req.requiredCapabilities, ['a-capability', 'z-capability']);
  assert.deepEqual(req.requiredForRoles, ['implementer', 'reviewer']);
  assert.equal(req.authority, 'NONE');
  assert.equal(b.authority, 'NONE');
  assert.equal(profile.authority, 'NONE');

  validateSecretRequirementV1(req);
  validateSecretBindingV1(b);
  validateSecretBindingProfileV1(profile);
});

test('resolver reference formats remain metadata-only and backend specific', () => {
  const cases = [
    ['LOCAL_ENV', 'OPENAI_API_KEY'],
    ['OS_KEYCHAIN', 'service/openai/account/work'],
    ['ONEPASSWORD', 'op://engineering/openai/api-key'],
    ['BITWARDEN_SECRETS_MANAGER', 'bw://project-123/secret-456'],
    ['HASHICORP_VAULT', 'vault://kv/team/openai#api-key'],
    ['EXTERNAL_BROKER', 'external-vault/item-123'],
    ['GITHUB_AUTH_CAPABILITY', 'github-auth://gh-cli'],
  ];

  for (const [resolverKind, reference] of cases) {
    const value = createSecretBindingV1({
      profileId: 'profile-001',
      handleId: 'provider.secret.ref',
      resolverKind,
      storage: 'MACHINE_LOCAL',
      reference,
      accountProfile: null,
      portableReferenceApproved: false,
    });
    assert.equal(value.reference, reference);
  }

  assert.throws(() => binding({ resolverKind: 'LOCAL_ENV', reference: 'not-valid-env-name' }));
  assert.throws(() => binding({ resolverKind: 'ONEPASSWORD', reference: 'vault/item' }));
  assert.throws(() =>
    binding({ resolverKind: 'BITWARDEN_SECRETS_MANAGER', reference: 'project/secret' }),
  );
  assert.throws(() => binding({ resolverKind: 'HASHICORP_VAULT', reference: 'kv/path' }));
  assert.throws(() =>
    binding({ resolverKind: 'GITHUB_AUTH_CAPABILITY', reference: 'gh-cli' }),
  );
});

test('credential-shaped resolver references fail closed', () => {
  for (const reference of [
    'sk-example-value',
    'ghp_examplevalue',
    'github_pat_examplevalue',
    'xoxb-example',
    'token=examplevalue',
    'api_key=examplevalue',
    '-----BEGIN PRIVATE KEY-----',
    'line-one\nline-two',
  ]) {
    assert.throws(() =>
      createSecretBindingV1({
        profileId: 'profile-001',
        handleId: 'provider.secret.ref',
        resolverKind: 'EXTERNAL_BROKER',
        storage: 'MACHINE_LOCAL',
        reference,
        accountProfile: null,
        portableReferenceApproved: false,
      }),
    );
  }
});

test('portable references require explicit approval while templates never contain locators', () => {
  const portable = createSecretBindingV1({
    profileId: 'macbook',
    handleId: 'provider.anthropic.api',
    resolverKind: 'ONEPASSWORD',
    storage: 'PORTABLE_REFERENCE',
    reference: 'op://engineering/anthropic/api-key',
    accountProfile: null,
    portableReferenceApproved: true,
  });
  assert.equal(portable.storage, 'PORTABLE_REFERENCE');

  assert.throws(() =>
    createSecretBindingV1({
      ...portable,
      schemaVersion: undefined,
      authority: undefined,
      portableReferenceApproved: false,
    }),
  );

  const template = createSecretBindingV1({
    profileId: 'project-template',
    handleId: 'provider.anthropic.api',
    resolverKind: 'ONEPASSWORD',
    storage: 'PROJECT_TEMPLATE',
    reference: null,
    accountProfile: null,
    portableReferenceApproved: false,
  });
  assert.equal(template.reference, null);

  assert.throws(() =>
    createSecretBindingV1({
      profileId: 'project-template',
      handleId: 'provider.anthropic.api',
      resolverKind: 'ONEPASSWORD',
      storage: 'PROJECT_TEMPLATE',
      reference: 'op://engineering/anthropic/api-key',
      accountProfile: null,
      portableReferenceApproved: false,
    }),
  );
  assert.throws(() =>
    createSecretBindingV1({
      profileId: 'project-template',
      handleId: 'provider.anthropic.api',
      resolverKind: 'ONEPASSWORD',
      storage: 'PROJECT_TEMPLATE',
      reference: null,
      accountProfile: null,
      portableReferenceApproved: true,
    }),
  );
});

test('required resolvable handle yields READY without exposing a value', () => {
  const profile = createSecretBindingProfileV1('work-laptop', [binding()]);
  const result = evaluateSecretBindingStatusV1([requirement()], profile, [evidence()]);

  assert.deepEqual(result, {
    status: 'READY',
    resolutions: [
      {
        handleId: 'provider.openai.api',
        status: 'RESOLVABLE',
        profileId: 'work-laptop',
        resolverKind: 'OS_KEYCHAIN',
        reasons: [],
      },
    ],
    authority: 'NONE',
    secretValuesPresent: false,
  });
});

test('required secret gaps block only as configuration evidence and optional gaps stay partial', () => {
  const emptyProfile = createSecretBindingProfileV1('work-laptop', []);

  const required = evaluateSecretBindingStatusV1([requirement()], emptyProfile, []);
  assert.equal(required.status, 'BLOCKED_CONFIGURATION');
  assert.equal(required.resolutions[0]?.status, 'BLOCKED_CONFIGURATION');
  assert.deepEqual(required.resolutions[0]?.reasons, ['no machine-resolvable binding is configured']);

  const optional = evaluateSecretBindingStatusV1(
    [requirement({ optional: true })],
    emptyProfile,
    [],
  );
  assert.equal(optional.status, 'PARTIAL');
  assert.equal(optional.resolutions[0]?.status, 'OPTIONAL_UNAVAILABLE');
});

test('project template is a requirement declaration and not a resolvable binding', () => {
  const template = createSecretBindingV1({
    profileId: 'work-laptop',
    handleId: 'provider.openai.api',
    resolverKind: 'OS_KEYCHAIN',
    storage: 'PROJECT_TEMPLATE',
    reference: null,
    accountProfile: null,
    portableReferenceApproved: false,
  });
  const profile = createSecretBindingProfileV1('work-laptop', [template]);

  const result = evaluateSecretBindingStatusV1([requirement()], profile, [
    evidence(),
  ]);
  assert.equal(result.status, 'BLOCKED_CONFIGURATION');
  assert.deepEqual(result.resolutions[0]?.reasons, [
    'no machine-resolvable binding is configured',
  ]);
});

test('resolver health authentication capability and missing evidence fail closed', () => {
  const profile = createSecretBindingProfileV1('work-laptop', [binding()]);

  const noEvidence = evaluateSecretBindingStatusV1([requirement()], profile, []);
  assert.deepEqual(noEvidence.resolutions[0]?.reasons, ['resolver health is unverifiable']);

  const unhealthy = evaluateSecretBindingStatusV1([requirement()], profile, [
    evidence({
      health: 'UNAVAILABLE',
      authenticated: false,
      availableCapabilities: [],
    }),
  ]);
  assert.equal(unhealthy.status, 'BLOCKED_CONFIGURATION');
  assert.deepEqual(unhealthy.resolutions[0]?.reasons, [
    'resolver authentication is unavailable',
    'resolver capability is unavailable: provider-auth',
    'resolver is not healthy',
  ]);

  const unknownAuth = evaluateSecretBindingStatusV1([requirement()], profile, [
    evidence({ authenticated: null }),
  ]);
  assert.equal(unknownAuth.status, 'READY');
});

test('profile and evidence identities are deterministic and duplicates fail closed', () => {
  const a = createSecretBindingV1({
    ...binding(),
    schemaVersion: undefined,
    authority: undefined,
    handleId: 'provider.anthropic.api',
  });
  const b = binding();
  const profile = createSecretBindingProfileV1('work-laptop', [b, a]);
  assert.deepEqual(
    profile.bindings.map((item) => item.handleId),
    ['provider.anthropic.api', 'provider.openai.api'],
  );

  assert.throws(() => createSecretBindingProfileV1('work-laptop', [b, b]));
  assert.throws(() =>
    createSecretBindingProfileV1('other-profile', [b]),
  );
  assert.throws(() =>
    evaluateSecretBindingStatusV1([requirement(), requirement()], profile, [evidence()]),
  );
  assert.throws(() =>
    evaluateSecretBindingStatusV1([requirement()], profile, [evidence(), evidence()]),
  );
});

test('malformed requirement binding profile and resolver evidence fail closed', () => {
  const req = requirement();
  const b = binding();
  const profile = createSecretBindingProfileV1('work-laptop', [b]);

  assert.throws(() => validateSecretRequirementV1({ ...req, schemaVersion: 2 }));
  assert.throws(() => validateSecretRequirementV1({ ...req, authority: 'SYSTEM_POLICY' }));
  assert.throws(() =>
    validateSecretRequirementV1({
      ...req,
      requiredCapabilities: ['z-capability', 'a-capability'],
    }),
  );

  assert.throws(() => validateSecretBindingV1({ ...b, schemaVersion: 2 }));
  assert.throws(() => validateSecretBindingV1({ ...b, authority: 'SYSTEM_POLICY' }));
  assert.throws(() => validateSecretBindingProfileV1({ ...profile, schemaVersion: 2 }));
  assert.throws(() =>
    validateSecretBindingProfileV1({ ...profile, authority: 'SYSTEM_POLICY' }),
  );

  for (const resolverEvidence of [
    evidence({ resolverKind: 'UNKNOWN' }),
    evidence({ health: 'BROKEN' }),
    evidence({ authenticated: 'yes' }),
    evidence({ availableCapabilities: ['provider-auth', 'provider-auth'] }),
    evidence({ availableCapabilities: ['x'] }),
  ]) {
    assert.throws(() => evaluateSecretBindingStatusV1([req], profile, [resolverEvidence]));
  }
});

test('requirement constructors reject invalid targets roles identifiers and duplicate metadata', () => {
  for (const input of [
    { handleId: 'x' },
    { purpose: ' ' },
    { allowedTargets: [] },
    { allowedTargets: ['UNKNOWN'] },
    { allowedTargets: ['PROVIDER_AUTH', 'PROVIDER_AUTH'] },
    { requiredCapabilities: ['cap-a', 'cap-a'] },
    { requiredCapabilities: ['x'] },
    { requiredForRoles: [] },
    { requiredForRoles: ['x'] },
    { requiredForRoles: ['role-a', 'role-a'] },
  ]) {
    assert.throws(() =>
      createSecretRequirementV1({
        handleId: 'provider.openai.api',
        purpose: 'Provider authentication',
        allowedTargets: ['PROVIDER_AUTH'],
        requiredCapabilities: ['provider-auth'],
        requiredForRoles: ['implementer'],
        optional: false,
        ...input,
      }),
    );
  }
});

test('portable secret binding metadata cannot grant authority export or contain values', () => {
  assert.equal(secretBindingCanContainSecretValues(), false);
  assert.equal(secretBindingCanExportCredentialMaterial(), false);
  assert.equal(secretBindingCanGrantAuthority(), false);
});
