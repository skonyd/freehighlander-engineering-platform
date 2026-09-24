import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ModelCatalogManagementService,
  ProviderRegistry,
  modelCatalogManagementCanGrantAuthority,
  modelCatalogManagementCanRewriteBindings,
} from '../dist/index.js';

function provider(id, state) {
  return {
    id,
    capabilities() {
      return new Set();
    },
    async health() {
      return state.healthy === false
        ? { available: false, detail: 'offline' }
        : { available: true };
    },
    async listModels() {
      return state.models;
    },
    async invoke() {
      throw new Error('not used');
    },
  };
}

class AuditSink {
  events = [];
  fail = false;

  async append(event) {
    if (this.fail) throw new Error('audit unavailable');
    this.events.push(event);
  }
}

test('refresh discovers models, publishes catalog and emits aggregate audit metadata', async () => {
  const state = {
    models: [
      { modelId: 'model-b', locality: 'REMOTE' },
      { modelId: 'model-a', locality: 'REMOTE', supportedEfforts: ['low', 'high'] },
    ],
  };
  const providers = new ProviderRegistry();
  providers.register(provider('p1', state));
  const audit = new AuditSink();
  const service = new ModelCatalogManagementService(providers, audit);

  const result = await service.refreshProvider({
    providerId: 'p1',
    refreshedAt: '2026-09-24T18:00:00.000Z',
    operationId: 'refresh-1',
  });

  assert.deepEqual(result.addedModelIds, ['model-a', 'model-b']);
  assert.deepEqual(result.becameUnavailableModelIds, []);
  assert.equal(result.authority, 'NONE');
  assert.equal(result.bindingsRewritten, false);
  assert.equal(service.getCatalog('p1').hash, result.currentHash);
  assert.equal(audit.events.length, 1);
  assert.deepEqual(audit.events[0].payload, {
    action: 'REFRESH',
    providerId: 'p1',
    currentHash: result.currentHash,
    itemCount: 2,
  });
  assert.equal('modelId' in audit.events[0].payload, false);
});

test('later refresh marks disappeared models unavailable without mutating history', async () => {
  const state = {
    models: [
      { modelId: 'keep', locality: 'LOCAL' },
      { modelId: 'remove', locality: 'LOCAL' },
    ],
  };
  const providers = new ProviderRegistry();
  providers.register(provider('local', state));
  const audit = new AuditSink();
  const service = new ModelCatalogManagementService(providers, audit);

  const first = await service.refreshProvider({
    providerId: 'local',
    refreshedAt: '2026-09-24T18:00:00.000Z',
    operationId: 'refresh-1',
  });
  state.models = [{ modelId: 'keep', locality: 'LOCAL' }];

  const second = await service.refreshProvider({
    providerId: 'local',
    refreshedAt: '2026-09-24T19:00:00.000Z',
    operationId: 'refresh-2',
  });

  assert.deepEqual(second.becameUnavailableModelIds, ['remove']);
  assert.equal(
    second.snapshot.records.find((record) => record.modelId === 'remove').availability,
    'UNAVAILABLE',
  );
  assert.equal(
    first.snapshot.records.find((record) => record.modelId === 'remove').availability,
    'AVAILABLE',
  );
  assert.equal(audit.events[1].payload.previousHash, first.currentHash);
  assert.equal(audit.events[1].payload.currentHash, second.currentHash);
});

test('refresh reports restored and deprecated models for management surfaces', async () => {
  const state = {
    models: [
      { modelId: 'restore', locality: 'REMOTE' },
      { modelId: 'deprecated', locality: 'REMOTE', availability: 'DEPRECATED' },
    ],
  };
  const providers = new ProviderRegistry();
  providers.register(provider('p1', state));
  const audit = new AuditSink();
  const service = new ModelCatalogManagementService(providers, audit);

  const first = await service.refreshProvider({
    providerId: 'p1',
    refreshedAt: '2026-09-24T18:00:00.000Z',
    operationId: 'one',
  });
  assert.deepEqual(first.deprecatedModelIds, ['deprecated']);

  state.models = [{ modelId: 'deprecated', locality: 'REMOTE', availability: 'DEPRECATED' }];
  await service.refreshProvider({
    providerId: 'p1',
    refreshedAt: '2026-09-24T19:00:00.000Z',
    operationId: 'two',
  });

  state.models = [
    { modelId: 'restore', locality: 'REMOTE' },
    { modelId: 'deprecated', locality: 'REMOTE', availability: 'DEPRECATED' },
  ];
  const restored = await service.refreshProvider({
    providerId: 'p1',
    refreshedAt: '2026-09-24T20:00:00.000Z',
    operationId: 'three',
  });
  assert.deepEqual(restored.restoredModelIds, ['restore']);
  assert.deepEqual(restored.deprecatedModelIds, ['deprecated']);
});

test('health/discovery and audit failures do not publish a new catalog', async () => {
  const unhealthyState = {
    healthy: false,
    models: [{ modelId: 'never', locality: 'REMOTE' }],
  };
  const providers = new ProviderRegistry();
  providers.register(provider('bad', unhealthyState));
  const audit = new AuditSink();
  const service = new ModelCatalogManagementService(providers, audit);

  await assert.rejects(
    () =>
      service.refreshProvider({
        providerId: 'bad',
        refreshedAt: '2026-09-24T18:00:00.000Z',
        operationId: 'bad-health',
      }),
    /not healthy/,
  );
  assert.equal(service.getCatalog('bad'), undefined);
  assert.equal(audit.events.length, 0);

  const healthyState = {
    models: [{ modelId: 'model-a', locality: 'REMOTE' }],
  };
  providers.register(provider('p1', healthyState));
  audit.fail = true;
  await assert.rejects(
    () =>
      service.refreshProvider({
        providerId: 'p1',
        refreshedAt: '2026-09-24T18:00:00.000Z',
        operationId: 'audit-fail',
      }),
    /audit unavailable/,
  );
  assert.equal(service.getCatalog('p1'), undefined);
});

test(
  'catalog management lists providers deterministically and never grants authority',
  async () => {
  const providers = new ProviderRegistry();
  providers.register(provider('z-provider', { models: [] }));
  providers.register(provider('a-provider', { models: [] }));
  const audit = new AuditSink();
  const service = new ModelCatalogManagementService(providers, audit);

  await service.refreshProvider({
    providerId: 'z-provider',
    refreshedAt: '2026-09-24T18:00:00.000Z',
    operationId: 'z',
  });
  await service.refreshProvider({
    providerId: 'a-provider',
    refreshedAt: '2026-09-24T18:00:00.000Z',
    operationId: 'a',
  });

  assert.deepEqual(
    service.listCatalogs().map((snapshot) => snapshot.providerId),
    ['a-provider', 'z-provider'],
  );
  assert.equal(modelCatalogManagementCanGrantAuthority(), false);
    assert.equal(modelCatalogManagementCanRewriteBindings(), false);
  },
);

test('catalog management rejects empty identifiers and unknown providers', async () => {
  const providers = new ProviderRegistry();
  const service = new ModelCatalogManagementService(providers, new AuditSink());

  assert.throws(() => service.getCatalog('   '), /providerId is required/);
  await assert.rejects(
    () =>
      service.refreshProvider({
        providerId: 'missing',
        refreshedAt: '2026-09-24T18:00:00.000Z',
        operationId: 'refresh',
      }),
    /unknown provider/,
  );
  await assert.rejects(
    () =>
      service.refreshProvider({
        providerId: 'missing',
        refreshedAt: '2026-09-24T18:00:00.000Z',
        operationId: '   ',
      }),
    /operationId is required/,
  );
});
