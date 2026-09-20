import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOperationsSnapshot,
  operationsCanExecuteIntent,
  operationsCanGrantAuthority,
  operationsCanMutateInfrastructure,
  operationsProjection,
  validateHealthSnapshot,
  validateOperationalIntent,
  validateRunbook,
} from '../dist/index.js';

const environment = 'staging';
const service = {
  schemaVersion: 1,
  id: 'svc-api',
  name: 'API',
  criticality: 'HIGH',
  environment,
  resources: [
    { id: 'api', kind: 'SERVICE', environment, locator: 'k8s/ns/app/api' },
    { id: 'db', kind: 'DATABASE', environment, locator: 'postgres/api' },
  ],
  runbookIds: ['rb-api'],
};

const observedAt = '2026-09-20T11:00:00.000Z';
const evidence = (id, resourceId) => ({
  id,
  resourceId,
  observedAt,
  provenance: 'TRUSTED',
  digest: 'a'.repeat(64),
});

const snapshot = {
  schemaVersion: 1,
  id: 'health-1',
  serviceId: service.id,
  environment,
  observedAt,
  resources: [
    { resourceId: 'api', status: 'HEALTHY', evidenceIds: ['e-api'], observedAt },
    { resourceId: 'db', status: 'HEALTHY', evidenceIds: ['e-db'], observedAt },
  ],
  evidence: [evidence('e-api', 'api'), evidence('e-db', 'db')],
};

test('healthy inventory produces deterministic read-only projection', async () => {
  const projection = operationsProjection(service, snapshot);
  const first = await buildOperationsSnapshot(service, snapshot);
  const second = await buildOperationsSnapshot(structuredClone(service), structuredClone(snapshot));

  assert.equal(projection.status, 'HEALTHY');
  assert.equal(projection.authority, 'NONE');
  assert.equal(projection.mutationAuthorized, false);
  assert.equal(projection.operationalIntentExecutionAuthorized, false);
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.equal(operationsCanGrantAuthority(), false);
  assert.equal(operationsCanMutateInfrastructure(), false);
  assert.equal(operationsCanExecuteIntent(), false);
});

test('worst health state is projected deterministically', () => {
  const degraded = {
    ...snapshot,
    resources: [
      snapshot.resources[0],
      { ...snapshot.resources[1], status: 'DEGRADED' },
    ],
  };
  assert.equal(operationsProjection(service, degraded).status, 'DEGRADED');

  const unhealthy = {
    ...snapshot,
    resources: [
      { ...snapshot.resources[0], status: 'UNHEALTHY' },
      { ...snapshot.resources[1], status: 'DEGRADED' },
    ],
  };
  assert.equal(operationsProjection(service, unhealthy).status, 'UNHEALTHY');
});

test('missing resource health fails closed', () => {
  const result = validateHealthSnapshot(service, {
    ...snapshot,
    resources: [snapshot.resources[0]],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /missing health state for resource db/);
});

test('non-unknown health requires evidence', () => {
  const result = validateHealthSnapshot(service, {
    ...snapshot,
    resources: [{ ...snapshot.resources[0], evidenceIds: [] }, snapshot.resources[1]],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /requires evidence/);
});

test('runbooks are versioned and bound to service', () => {
  const runbook = {
    schemaVersion: 1,
    id: 'rb-api',
    version: 2,
    title: 'API recovery',
    serviceId: service.id,
    steps: ['inspect health', 'prepare recovery'],
    supersedesVersion: 1,
  };
  assert.equal(validateRunbook(service, runbook).valid, true);
});

test('operational intents are data only and cannot claim side effects', () => {
  const intent = {
    schemaVersion: 1,
    id: 'intent-1',
    serviceId: service.id,
    environment,
    kind: 'RESTART',
    targetResourceIds: ['api'],
    reason: 'recover availability',
    sideEffects: 'FORBIDDEN',
    authority: 'NONE',
  };
  assert.equal(validateOperationalIntent(service, intent).valid, true);

  const invalid = validateOperationalIntent(service, { ...intent, sideEffects: 'ALLOWED' });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /sideEffects must be FORBIDDEN/);
});
