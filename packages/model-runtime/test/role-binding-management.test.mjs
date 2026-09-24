import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ModelCatalogManagementService,
  ProviderRegistry,
  RoleBindingManagementService,
  createDiscoveredQualification,
  grantModelEligibility,
  recordCapabilityProbe,
  recordShadowVerification,
  roleBindingManagementCanGrantAuthority,
  validateBindingPlan,
  validateRoleBindingPublicationV1,
} from '../dist/index.js';

function provider(id, models) {
  return {
    id,
    capabilities() {
      return new Set(['structured_output']);
    },
    async health() {
      return { available: true };
    },
    async listModels() {
      return models;
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

async function setupCatalog(models) {
  const providers = new ProviderRegistry();
  providers.register(provider('p1', models));
  const catalogAudit = new AuditSink();
  const catalogs = new ModelCatalogManagementService(providers, catalogAudit);
  const refresh = await catalogs.refreshProvider({
    providerId: 'p1',
    refreshedAt: '2026-09-24T18:00:00.000Z',
    operationId: 'refresh',
  });
  return { providers, catalogs, snapshot: refresh.snapshot };
}

function qualify(snapshot, modelId, role, riskTier, suffix = '1') {
  const discovered = createDiscoveredQualification({
    providerId: snapshot.providerId,
    modelId,
    catalogHash: snapshot.hash,
  });
  const probed = recordCapabilityProbe(discovered, {
    evidenceHash: suffix.repeat(64),
    status: 'PASS',
    probedAt: '2026-09-24T18:01:00.000Z',
  });
  const shadow = recordShadowVerification(probed, {
    evidenceHash: String(Number(suffix) + 1).repeat(64),
    status: 'PASS',
    verifiedAt: '2026-09-24T18:02:00.000Z',
    role,
    riskTier,
  });
  return grantModelEligibility(shadow, {
    role,
    riskTier,
    grantedAt: '2026-09-24T18:03:00.000Z',
    decisionHash: String(Number(suffix) + 2).repeat(64),
  });
}

function binding(id, version, model, effort = 'medium') {
  return {
    id,
    version,
    providerId: 'p1',
    model,
    effort,
    requiredCapabilities: ['structured_output'],
    allowedRiskTiers: ['NORMAL', 'HIGH'],
    independenceGroup: 'review-group',
  };
}

test('preview validates catalog, qualification, capabilities and supported effort without publishing', async () => {
  const { providers, catalogs, snapshot } = await setupCatalog([
    {
      modelId: 'model-a',
      locality: 'REMOTE',
      capabilities: ['structured_output'],
      supportedEfforts: ['low', 'medium', 'high'],
    },
  ]);
  const audit = new AuditSink();
  const service = new RoleBindingManagementService(providers, catalogs, audit);
  const primary = binding('reviewer-primary', '1.0.0', 'model-a', 'high');
  const qualification = qualify(snapshot, 'model-a', 'final-review', 'HIGH');

  const plan = service.preview({
    logicalRole: 'final-review',
    riskTier: 'HIGH',
    primary,
    qualifications: { [primary.id]: qualification },
  });

  assert.equal(plan.bindings[0].model, 'model-a');
  assert.equal(plan.bindings[0].effort, 'high');
  assert.equal(plan.authorityGranted, false);
  assert.equal(service.getPublished('final-review', 'HIGH'), undefined);
  assert.equal(audit.events.length, 0);
});

test('preview rejects unsupported effort and non-eligible qualification deterministically', async () => {
  const { providers, catalogs, snapshot } = await setupCatalog([
    {
      modelId: 'model-a',
      locality: 'REMOTE',
      capabilities: ['structured_output'],
      supportedEfforts: ['low', 'medium'],
    },
  ]);
  const service = new RoleBindingManagementService(providers, catalogs, new AuditSink());
  const unsupported = binding('reviewer-primary', '1.0.0', 'model-a', 'high');
  const qualification = qualify(snapshot, 'model-a', 'final-review', 'HIGH');

  assert.throws(
    () =>
      service.preview({
        logicalRole: 'final-review',
        riskTier: 'HIGH',
        primary: unsupported,
        qualifications: { [unsupported.id]: qualification },
      }),
    /effort high is unsupported/,
  );

  const eligibleNormal = qualify(snapshot, 'model-a', 'final-review', 'NORMAL', '4');
  const supported = binding('reviewer-primary-v2', '2.0.0', 'model-a', 'medium');
  assert.throws(
    () =>
      service.preview({
        logicalRole: 'final-review',
        riskTier: 'HIGH',
        primary: supported,
        qualifications: { [supported.id]: eligibleNormal },
      }),
    /not eligible for final-review\/HIGH/,
  );
});

test('publish emits metadata audit before exposing the new role binding snapshot', async () => {
  const { providers, catalogs, snapshot } = await setupCatalog([
    {
      modelId: 'model-a',
      locality: 'REMOTE',
      capabilities: ['structured_output'],
      supportedEfforts: ['medium'],
    },
  ]);
  const audit = new AuditSink();
  const service = new RoleBindingManagementService(providers, catalogs, audit);
  const primary = binding('controller-primary', '1.0.0', 'model-a');
  const qualification = qualify(snapshot, 'model-a', 'controller', 'NORMAL');

  const published = await service.publish({
    logicalRole: 'controller',
    riskTier: 'NORMAL',
    primary,
    qualifications: { [primary.id]: qualification },
    operationId: 'publish-controller',
    publishedAt: '2026-09-24T18:10:00.000Z',
  });

  assert.equal(service.getPublished('controller', 'NORMAL').hash, published.hash);
  assert.equal(published.authority, 'NONE');
  assert.equal(audit.events.length, 1);
  assert.deepEqual(audit.events[0].payload, {
    action: 'BINDING_CHANGE',
    providerId: 'p1',
    modelId: 'model-a',
    bindingId: 'controller-primary',
    logicalRole: 'controller',
    riskTier: 'NORMAL',
    currentHash: published.hash,
    currentState: 'controller-primary@1.0.0',
    itemCount: 1,
  });
});

test('audit failure prevents publication and replacement preserves historical snapshot', async () => {
  const { providers, catalogs, snapshot } = await setupCatalog([
    {
      modelId: 'model-a',
      locality: 'REMOTE',
      capabilities: ['structured_output'],
      supportedEfforts: ['medium'],
    },
    {
      modelId: 'model-b',
      locality: 'REMOTE',
      capabilities: ['structured_output'],
      supportedEfforts: ['medium'],
    },
  ]);
  const audit = new AuditSink();
  const service = new RoleBindingManagementService(providers, catalogs, audit);

  const firstBinding = binding('controller-v1', '1.0.0', 'model-a');
  const firstQualification = qualify(snapshot, 'model-a', 'controller', 'NORMAL');
  const first = await service.publish({
    logicalRole: 'controller',
    riskTier: 'NORMAL',
    primary: firstBinding,
    qualifications: { [firstBinding.id]: firstQualification },
    operationId: 'first',
    publishedAt: '2026-09-24T18:10:00.000Z',
  });

  audit.fail = true;
  const failedBinding = binding('controller-v2', '2.0.0', 'model-b');
  const failedQualification = qualify(snapshot, 'model-b', 'controller', 'NORMAL', '4');
  await assert.rejects(
    () =>
      service.publish({
        logicalRole: 'controller',
        riskTier: 'NORMAL',
        primary: failedBinding,
        qualifications: { [failedBinding.id]: failedQualification },
        operationId: 'failed',
        publishedAt: '2026-09-24T18:20:00.000Z',
      }),
    /audit unavailable/,
  );
  assert.equal(service.getPublished('controller', 'NORMAL').hash, first.hash);

  audit.fail = false;
  const second = await service.publish({
    logicalRole: 'controller',
    riskTier: 'NORMAL',
    primary: failedBinding,
    qualifications: { [failedBinding.id]: failedQualification },
    operationId: 'second',
    publishedAt: '2026-09-24T18:30:00.000Z',
  });

  assert.notEqual(first.hash, second.hash);
  assert.equal(first.primary.model, 'model-a');
  assert.equal(second.primary.model, 'model-b');
  assert.equal(audit.events[1].payload.previousHash, first.hash);
  assert.equal(audit.events[1].payload.previousState, 'controller-v1@1.0.0');
});

test('publish supports qualified fallback bindings and deterministic listing', async () => {
  const { providers, catalogs, snapshot } = await setupCatalog([
    {
      modelId: 'primary-model',
      locality: 'REMOTE',
      capabilities: ['structured_output'],
      supportedEfforts: ['medium'],
    },
    {
      modelId: 'fallback-model',
      locality: 'REMOTE',
      capabilities: ['structured_output'],
      supportedEfforts: ['medium'],
    },
  ]);
  const audit = new AuditSink();
  const service = new RoleBindingManagementService(providers, catalogs, audit);
  const primary = binding('test-primary', '1.0.0', 'primary-model');
  const fallback = binding('test-fallback', '1.0.0', 'fallback-model');
  const primaryQualification = qualify(snapshot, 'primary-model', 'test-review', 'NORMAL');
  const fallbackQualification = qualify(snapshot, 'fallback-model', 'test-review', 'NORMAL', '4');

  const publication = await service.publish({
    logicalRole: 'test-review',
    riskTier: 'NORMAL',
    primary,
    fallbacks: [fallback],
    qualifications: {
      [primary.id]: primaryQualification,
      [fallback.id]: fallbackQualification,
    },
    operationId: 'test-review',
    publishedAt: '2026-09-24T18:10:00.000Z',
  });

  assert.deepEqual(
    publication.plan.bindings.map((item) => item.bindingId),
    ['test-primary', 'test-fallback'],
  );
  assert.equal(audit.events[0].payload.itemCount, 2);

  const controller = binding('controller', '1.0.0', 'primary-model');
  const controllerQualification = qualify(snapshot, 'primary-model', 'controller', 'NORMAL', '7');
  await service.publish({
    logicalRole: 'controller',
    riskTier: 'NORMAL',
    primary: controller,
    qualifications: { [controller.id]: controllerQualification },
    operationId: 'controller',
    publishedAt: '2026-09-24T18:11:00.000Z',
  });

  assert.deepEqual(
    service.listPublished().map((item) => item.logicalRole),
    ['controller', 'test-review'],
  );
  assert.equal(roleBindingManagementCanGrantAuthority(), false);
});

test('preview fails closed without managed catalog and publish validates management metadata', async () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1', []));
  const catalogs = new ModelCatalogManagementService(providers, new AuditSink());
  const service = new RoleBindingManagementService(providers, catalogs, new AuditSink());
  const primary = binding('b1', '1.0.0', 'missing-model');

  assert.throws(
    () =>
      service.preview({
        logicalRole: 'controller',
        riskTier: 'NORMAL',
        primary,
        qualifications: {},
      }),
    /no managed catalog/,
  );

  await assert.rejects(
    () =>
      service.publish({
        logicalRole: 'controller',
        riskTier: 'NORMAL',
        primary,
        qualifications: {},
        operationId: '   ',
        publishedAt: 'not-a-date',
      }),
    /operationId is required/,
  );
});

test('validated role binding publication rehydrates without emitting audit', async () => {
  const { providers, catalogs, snapshot } = await setupCatalog([
    {
      modelId: 'model-a',
      locality: 'REMOTE',
      capabilities: ['structured_output'],
      supportedEfforts: ['medium'],
    },
  ]);
  const primary = binding('controller-primary', '1.0.0', 'model-a');
  const qualification = qualify(snapshot, 'model-a', 'controller', 'NORMAL');
  const firstAudit = new AuditSink();
  const first = new RoleBindingManagementService(providers, catalogs, firstAudit);
  const publication = await first.publish({
    logicalRole: 'controller',
    riskTier: 'NORMAL',
    primary,
    qualifications: { [primary.id]: qualification },
    operationId: 'publish',
    publishedAt: '2026-09-24T21:30:00.000Z',
  });

  validateBindingPlan(publication.plan);
  validateRoleBindingPublicationV1(publication);

  const restoredAudit = new AuditSink();
  const restored = new RoleBindingManagementService(providers, catalogs, restoredAudit, [
    publication,
  ]);

  assert.equal(restored.getPublished('controller', 'NORMAL').hash, publication.hash);
  assert.deepEqual(restored.listPublished(), [publication]);
  assert.equal(restoredAudit.events.length, 0);
});

test('role binding publication rehydration fails closed on plan and publication tamper', async () => {
  const { providers, catalogs, snapshot } = await setupCatalog([
    {
      modelId: 'model-a',
      locality: 'REMOTE',
      capabilities: ['structured_output'],
      supportedEfforts: ['medium'],
    },
  ]);
  const primary = binding('controller-primary', '1.0.0', 'model-a');
  const qualification = qualify(snapshot, 'model-a', 'controller', 'NORMAL');
  const service = new RoleBindingManagementService(providers, catalogs, new AuditSink());
  const publication = await service.publish({
    logicalRole: 'controller',
    riskTier: 'NORMAL',
    primary,
    qualifications: { [primary.id]: qualification },
    operationId: 'publish',
    publishedAt: '2026-09-24T21:30:00.000Z',
  });

  const tamperedPlan = {
    ...publication.plan,
    bindings: publication.plan.bindings.map((item) => ({ ...item, model: 'model-b' })),
  };
  assert.throws(() => validateBindingPlan(tamperedPlan), /hash mismatch/);

  const tamperedPublication = { ...publication, hash: 'f'.repeat(64) };
  assert.throws(
    () => validateRoleBindingPublicationV1(tamperedPublication),
    /publication hash mismatch/,
  );
  assert.throws(
    () =>
      new RoleBindingManagementService(providers, catalogs, new AuditSink(), [
        tamperedPublication,
      ]),
    /publication hash mismatch/,
  );
});

test('role binding publication rehydration rejects duplicate role-risk state and identity mismatch', async () => {
  const { providers, catalogs, snapshot } = await setupCatalog([
    {
      modelId: 'model-a',
      locality: 'REMOTE',
      capabilities: ['structured_output'],
      supportedEfforts: ['medium'],
    },
  ]);
  const primary = binding('controller-primary', '1.0.0', 'model-a');
  const qualification = qualify(snapshot, 'model-a', 'controller', 'NORMAL');
  const service = new RoleBindingManagementService(providers, catalogs, new AuditSink());
  const publication = await service.publish({
    logicalRole: 'controller',
    riskTier: 'NORMAL',
    primary,
    qualifications: { [primary.id]: qualification },
    operationId: 'publish',
    publishedAt: '2026-09-24T21:30:00.000Z',
  });

  assert.throws(
    () =>
      new RoleBindingManagementService(providers, catalogs, new AuditSink(), [
        publication,
        publication,
      ]),
    /duplicate initial role binding publication/,
  );

  assert.throws(
    () =>
      validateRoleBindingPublicationV1({
        ...publication,
        logicalRole: 'other-role',
      }),
    /plan identity mismatch/,
  );
});
