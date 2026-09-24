import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDiscoveredQualification,
  createEmptyModelManagementStateV1,
  modelManagementStateCanContainSecretValues,
  modelManagementStateCanGrantAuthority,
  reconcileModelCatalog,
  validateManagedProviderConfigV1,
  validateModelManagementStateV1,
} from '../dist/index.js';

function provider(id, kind = 'OPENAI_COMPATIBLE', locality = 'REMOTE') {
  return {
    schemaVersion: 1,
    id,
    kind,
    baseUrl:
      kind === 'GEMINI'
        ? 'https://generativelanguage.googleapis.com'
        : 'http://127.0.0.1:11434',
    locality,
    credential: {
      resolverKind: 'LOCAL_ENV',
      reference: id.toUpperCase().replace(/[^A-Z0-9_]/g, '_') + '_API_KEY',
    },
    authority: 'NONE',
  };
}

test('empty model management state is canonical authority-neutral and secret-free', () => {
  const empty = createEmptyModelManagementStateV1();
  assert.deepEqual(validateModelManagementStateV1(empty), empty);
  assert.equal(modelManagementStateCanContainSecretValues(), false);
  assert.equal(modelManagementStateCanGrantAuthority(), false);
});

test('managed provider config permits only bounded metadata and LOCAL_ENV references', () => {
  const local = validateManagedProviderConfigV1(
    provider('local-provider', 'OPENAI_COMPATIBLE', 'LOCAL'),
  );
  assert.equal(local.baseUrl, 'http://127.0.0.1:11434');
  assert.equal(local.credential.reference, 'LOCAL_PROVIDER_API_KEY');

  const gemini = validateManagedProviderConfigV1(provider('gemini-provider', 'GEMINI', 'REMOTE'));
  assert.equal(gemini.kind, 'GEMINI');

  assert.throws(
    () => validateManagedProviderConfigV1({ ...provider('bad'), apiKey: 'raw-secret' }),
    /field is not allowed: apiKey/,
  );
  assert.throws(
    () =>
      validateManagedProviderConfigV1({
        ...provider('bad'),
        baseUrl: 'https://user:password@example.test',
      }),
    /cannot contain credentials/,
  );
  assert.throws(
    () =>
      validateManagedProviderConfigV1({
        ...provider('bad'),
        credential: { resolverKind: 'LOCAL_ENV', reference: 'not-valid-env-name' },
      }),
    /environment variable name/,
  );
  assert.throws(
    () => validateManagedProviderConfigV1(provider('gemini-local', 'GEMINI', 'LOCAL')),
    /must be REMOTE/,
  );
});

test('model management state requires deterministic provider ordering and uniqueness', () => {
  const state = {
    ...createEmptyModelManagementStateV1(),
    providers: [provider('b-provider'), provider('a-provider')],
  };
  assert.throws(() => validateModelManagementStateV1(state), /strictly sorted/);

  assert.throws(
    () =>
      validateModelManagementStateV1({
        ...state,
        providers: [provider('a-provider'), provider('a-provider')],
      }),
    /duplicate model management provider/,
  );
});

test('model management state validates nested catalog and qualification provenance', () => {
  const managedProvider = provider('p1');
  const catalog = reconcileModelCatalog({
    providerId: 'p1',
    refreshedAt: '2026-09-24T20:30:00.000Z',
    discovered: [
      {
        providerId: 'p1',
        modelId: 'model-a',
        locality: 'REMOTE',
        source: 'DISCOVERED',
      },
    ],
  });
  const qualification = createDiscoveredQualification({
    providerId: 'p1',
    modelId: 'model-a',
    catalogHash: catalog.hash,
  });

  const state = validateModelManagementStateV1({
    schemaVersion: 1,
    providers: [managedProvider],
    catalogs: [catalog],
    qualifications: [qualification],
    publications: [],
    authority: 'NONE',
  });
  assert.equal(state.catalogs[0].hash, catalog.hash);
  assert.equal(state.qualifications[0].hash, qualification.hash);

  assert.throws(
    () =>
      validateModelManagementStateV1({
        ...state,
        catalogs: [{ ...catalog, hash: 'f'.repeat(64) }],
      }),
    /catalog snapshot hash mismatch/,
  );
  assert.throws(
    () =>
      validateModelManagementStateV1({
        ...state,
        qualifications: [{ ...qualification, hash: 'f'.repeat(64) }],
      }),
    /qualification snapshot hash mismatch/,
  );
});

test(
  'model management state rejects nested unmanaged provider references and unknown fields',
  () => {
  const catalog = reconcileModelCatalog({
    providerId: 'missing',
    refreshedAt: '2026-09-24T20:30:00.000Z',
    discovered: [],
  });

  assert.throws(
    () =>
      validateModelManagementStateV1({
        ...createEmptyModelManagementStateV1(),
        catalogs: [catalog],
      }),
    /catalog references unmanaged provider/,
  );

    assert.throws(
      () =>
        validateModelManagementStateV1({
          ...createEmptyModelManagementStateV1(),
          token: 'secret',
        }),
      /field is not allowed: token/,
    );
  },
);
