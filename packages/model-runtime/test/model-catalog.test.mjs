import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkCatalogBinding,
  modelCatalogCanGrantAuthority,
  modelCatalogRefreshCanRewriteBindings,
  reconcileModelCatalog,
  refreshModelCatalogFromProvider,
} from '../dist/index.js';

const T1 = '2026-09-24T10:00:00.000Z';
const T2 = '2026-09-24T11:00:00.000Z';
const T3 = '2026-09-24T12:00:00.000Z';

function model(modelId, overrides = {}) {
  return {
    providerId: 'provider-a',
    modelId,
    locality: 'REMOTE',
    source: 'DISCOVERED',
    ...overrides,
  };
}

test('catalog refresh adds models deterministically without authority', () => {
  const first = reconcileModelCatalog({
    providerId: 'provider-a',
    refreshedAt: T1,
    discovered: [
      model('model-b', {
        displayName: ' Model B ',
        capabilities: ['tool_calling', 'structured_output', 'tool_calling'],
        supportedEfforts: ['HIGH', 'low', 'HIGH'],
        contextWindowTokens: 128000,
        maxOutputTokens: 8192,
      }),
      model('model-a'),
    ],
  });

  assert.deepEqual(
    first.records.map((record) => record.modelId),
    ['model-a', 'model-b'],
  );
  assert.equal(first.records[1].displayName, 'Model B');
  assert.deepEqual(first.records[1].capabilities, ['structured_output', 'tool_calling']);
  assert.deepEqual(first.records[1].supportedEfforts, ['high', 'low']);
  assert.equal(first.records[1].discoveredAt, T1);
  assert.equal(first.records[1].lastSeenAt, T1);
  assert.equal(first.records[1].availability, 'AVAILABLE');
  assert.equal(first.authority, 'NONE');
  assert.equal(first.hash.length, 64);
  assert.equal(modelCatalogCanGrantAuthority(), false);
  assert.equal(modelCatalogRefreshCanRewriteBindings(), false);
});

test('refresh preserves discovery time and marks disappeared models unavailable', () => {
  const first = reconcileModelCatalog({
    providerId: 'provider-a',
    refreshedAt: T1,
    discovered: [model('keep'), model('gone')],
  });
  const second = reconcileModelCatalog({
    providerId: 'provider-a',
    refreshedAt: T2,
    previous: first,
    discovered: [model('keep', { availability: 'DEPRECATED' }), model('new-model')],
  });

  const keep = second.records.find((record) => record.modelId === 'keep');
  const gone = second.records.find((record) => record.modelId === 'gone');
  const added = second.records.find((record) => record.modelId === 'new-model');

  assert.equal(keep.discoveredAt, T1);
  assert.equal(keep.lastSeenAt, T2);
  assert.equal(keep.availability, 'DEPRECATED');
  assert.equal(gone.availability, 'UNAVAILABLE');
  assert.equal(gone.unavailableSince, T2);
  assert.equal(gone.lastSeenAt, T1);
  assert.equal(added.discoveredAt, T2);

  const third = reconcileModelCatalog({
    providerId: 'provider-a',
    refreshedAt: T3,
    previous: second,
    discovered: [model('keep'), model('new-model')],
  });
  assert.equal(third.records.find((record) => record.modelId === 'gone').unavailableSince, T2);
});

test('binding checks never silently migrate unavailable or unknown models', () => {
  const snapshot = reconcileModelCatalog({
    providerId: 'provider-a',
    refreshedAt: T1,
    discovered: [
      model('current', { supportedEfforts: ['low', 'high'] }),
      model('no-effort'),
      model('deprecated', { availability: 'DEPRECATED' }),
    ],
  });
  const unavailable = reconcileModelCatalog({
    providerId: 'provider-a',
    refreshedAt: T2,
    previous: snapshot,
    discovered: [model('current', { supportedEfforts: ['low', 'high'] }), model('no-effort')],
  });

  assert.deepEqual(checkCatalogBinding(unavailable, 'current', 'high'), {
    status: 'AVAILABLE',
    providerId: 'provider-a',
    modelId: 'current',
    supportedEffort: true,
    maySilentlyRewriteBinding: false,
    authority: 'NONE',
  });
  assert.equal(checkCatalogBinding(unavailable, 'current', 'medium').supportedEffort, false);
  assert.equal(checkCatalogBinding(unavailable, 'current').supportedEffort, null);
  assert.equal(checkCatalogBinding(unavailable, 'no-effort', 'high').supportedEffort, false);
  assert.equal(checkCatalogBinding(unavailable, 'deprecated').status, 'UNAVAILABLE');

  const unknown = checkCatalogBinding(unavailable, 'missing');
  assert.equal(unknown.status, 'UNKNOWN_MODEL');
  assert.equal(unknown.supportedEffort, null);
  assert.equal(unknown.maySilentlyRewriteBinding, false);
});

test('manual local models and optional limits are supported without pretending discovery', () => {
  const snapshot = reconcileModelCatalog({
    providerId: 'local',
    refreshedAt: T1,
    discovered: [
      {
        providerId: 'local',
        modelId: 'local-model',
        displayName: ' ',
        locality: 'LOCAL',
        source: 'MANUAL',
      },
    ],
  });

  assert.equal(snapshot.records[0].displayName, 'local-model');
  assert.equal(snapshot.records[0].locality, 'LOCAL');
  assert.equal(snapshot.records[0].source, 'MANUAL');
  assert.equal(snapshot.records[0].contextWindowTokens, undefined);
  assert.equal(snapshot.records[0].maxOutputTokens, undefined);
});

test('catalog reconciliation fails closed on malformed discovery and prior state', () => {
  assert.throws(
    () =>
      reconcileModelCatalog({
        providerId: 'provider-a',
        refreshedAt: 'not-a-time',
        discovered: [],
      }),
    /refreshedAt/,
  );
  assert.throws(
    () =>
      reconcileModelCatalog({
        providerId: 'provider-a',
        refreshedAt: T1,
        discovered: [model('dup'), model('dup')],
      }),
    /duplicate discovered model/,
  );
  assert.throws(
    () =>
      reconcileModelCatalog({
        providerId: 'provider-a',
        refreshedAt: T1,
        discovered: [model('wrong', { providerId: 'provider-b' })],
      }),
    /providerId mismatch/,
  );
  for (const field of ['contextWindowTokens', 'maxOutputTokens']) {
    assert.throws(
      () =>
        reconcileModelCatalog({
          providerId: 'provider-a',
          refreshedAt: T1,
          discovered: [model('bad-limit', { [field]: 0 })],
        }),
      /positive integer/,
    );
  }

  const valid = reconcileModelCatalog({
    providerId: 'provider-a',
    refreshedAt: T1,
    discovered: [model('one')],
  });
  assert.throws(
    () =>
      reconcileModelCatalog({
        providerId: 'provider-b',
        refreshedAt: T2,
        previous: valid,
        discovered: [],
      }),
    /providerId mismatch/,
  );
  assert.throws(
    () =>
      reconcileModelCatalog({
        providerId: 'provider-a',
        refreshedAt: T2,
        previous: { ...valid, schemaVersion: 2 },
        discovered: [],
      }),
    /schemaVersion/,
  );
  assert.throws(
    () =>
      reconcileModelCatalog({
        providerId: 'provider-a',
        refreshedAt: T2,
        previous: { ...valid, authority: 'MERGE' },
        discovered: [],
      }),
    /authority/,
  );
});

test('catalog identifiers and effort metadata are normalized and validated', () => {
  assert.throws(
    () => reconcileModelCatalog({ providerId: ' ', refreshedAt: T1, discovered: [] }),
    /providerId/,
  );
  assert.throws(
    () =>
      reconcileModelCatalog({
        providerId: 'provider-a',
        refreshedAt: T1,
        discovered: [model(' ')],
      }),
    /modelId/,
  );
  assert.throws(
    () =>
      reconcileModelCatalog({
        providerId: 'provider-a',
        refreshedAt: T1,
        discovered: [model('x', { supportedEfforts: [' '] })],
      }),
    /supported effort/,
  );
  assert.throws(
    () =>
      checkCatalogBinding(
        reconcileModelCatalog({
          providerId: 'provider-a',
          refreshedAt: T1,
          discovered: [],
        }),
        ' ',
      ),
    /modelId/,
  );
});

test('provider discovery refresh requires health and preserves provider-neutral metadata', async () => {
  let listed = 0;
  const provider = {
    id: 'provider-a',
    capabilities: () => new Set(['structured_output']),
    health: async () => ({ available: true }),
    invoke: async () => ({ output: 'ok', model: 'm' }),
    listModels: async () => {
      listed += 1;
      return [
        {
          modelId: 'discovered',
          displayName: 'Discovered Model',
          capabilities: ['structured_output'],
          supportedEfforts: ['low', 'high'],
          contextWindowTokens: 64000,
          maxOutputTokens: 4096,
          locality: 'REMOTE',
          availability: 'DEPRECATED',
        },
      ];
    },
  };

  const snapshot = await refreshModelCatalogFromProvider(provider, T1);
  assert.equal(listed, 1);
  assert.equal(snapshot.providerId, 'provider-a');
  assert.equal(snapshot.records[0].modelId, 'discovered');
  assert.equal(snapshot.records[0].source, 'DISCOVERED');
  assert.equal(snapshot.records[0].availability, 'DEPRECATED');
  assert.deepEqual(snapshot.records[0].supportedEfforts, ['high', 'low']);
});

test('provider discovery refresh fails closed before listing when provider health is unavailable', async () => {
  let listed = 0;
  const provider = {
    id: 'provider-a',
    capabilities: () => new Set(),
    health: async () => ({ available: false, detail: 'offline' }),
    invoke: async () => ({ output: 'ok', model: 'm' }),
    listModels: async () => {
      listed += 1;
      return [];
    },
  };

  await assert.rejects(
    () => refreshModelCatalogFromProvider(provider, T1),
    /not healthy for model discovery/,
  );
  assert.equal(listed, 0);
});

test('provider without discovery support fails closed and existing catalog is not rewritten', async () => {
  const previous = reconcileModelCatalog({
    providerId: 'provider-a',
    refreshedAt: T1,
    discovered: [model('existing')],
  });
  const provider = {
    id: 'provider-a',
    capabilities: () => new Set(),
    health: async () => ({ available: true }),
    invoke: async () => ({ output: 'ok', model: 'm' }),
  };

  await assert.rejects(
    () => refreshModelCatalogFromProvider(provider, T2, previous),
    /does not support model discovery/,
  );
  assert.equal(previous.records[0].availability, 'AVAILABLE');
  assert.equal(previous.refreshedAt, T1);
});

test('provider discovery refresh reconciles prior snapshots without silent binding migration', async () => {
  const previous = reconcileModelCatalog({
    providerId: 'provider-a',
    refreshedAt: T1,
    discovered: [model('old'), model('keep')],
  });
  const provider = {
    id: 'provider-a',
    capabilities: () => new Set(),
    health: async () => ({ available: true }),
    invoke: async () => ({ output: 'ok', model: 'm' }),
    listModels: async () => [
      { modelId: 'keep', locality: 'REMOTE' },
      { modelId: 'new', locality: 'LOCAL' },
    ],
  };

  const refreshed = await refreshModelCatalogFromProvider(provider, T2, previous);
  assert.equal(checkCatalogBinding(refreshed, 'old').status, 'UNAVAILABLE');
  assert.equal(checkCatalogBinding(refreshed, 'new').status, 'AVAILABLE');
  assert.equal(checkCatalogBinding(refreshed, 'old').maySilentlyRewriteBinding, false);
});
