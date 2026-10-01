import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityExecutionGate,
  createGatedIncidentRemediationExecutor,
  incidentRemediationCanBypassAutomaticRemediationGate,
  infrastructureRemediationCanBypassInfrastructureGate,
  remediationRequestCanChooseActionOrTargets,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const EVIDENCE_HASH = 'b'.repeat(64);

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fh36b-remediation-'));
  const store = new AuthorityCapabilityStateStore(join(root, 'authority.json'));
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });
  const evidence = {
    schemaVersion: 1,
    incidentId: 'incident-1',
    remediationId: 'remediation-1',
    sourceRevision: REVISION,
    evidenceHash: EVIDENCE_HASH,
    serviceId: 'svc-api',
    environment: 'prod',
    operation: 'RESTART',
    targetResourceIds: ['api-1'],
    requiresInfrastructureMutation: true,
    ...overrides,
  };
  const calls = [];
  const adapter = {
    id: 'remediation-provider',
    async execute(action) {
      calls.push(action);
      return {
        schemaVersion: 1,
        receiptId: 'receipt-1',
        incidentId: action.incidentId,
        remediationId: action.remediationId,
        operation: action.operation,
      };
    },
  };
  return { store, gate, evidence, calls, adapter };
}

function setCapabilities(store, requestedCapabilities, activeCapabilities) {
  const current = store.read();
  assert.equal(
    store.write(current.generation, {
      schemaVersion: 1,
      requestedCapabilities,
      activeCapabilities,
    }).status,
    'WRITTEN',
  );
}

function input(evidence, overrides = {}) {
  return {
    schemaVersion: 1,
    incidentId: evidence.incidentId,
    remediationId: evidence.remediationId,
    sourceRevision: evidence.sourceRevision,
    evidenceHash: evidence.evidenceHash,
    ...overrides,
  };
}

function request(value) {
  return {
    schemaVersion: 1,
    activityId: 'remediation-activity',
    runId: 'run-001',
    workspaceHash: 'c'.repeat(64),
    kind: 'COMMAND',
    input: typeof value === 'string' ? value : JSON.stringify(value),
    timeoutMs: 1000,
    attempt: 1,
    executionMode: 'LIVE',
  };
}

test('FH-36B remediation remains default DENY and exposes no gate bypass', async () => {
  const fx = fixture();
  const executor = createGatedIncidentRemediationExecutor(fx.gate, fx.evidence, fx.adapter);
  const result = await executor.execute(request(input(fx.evidence)));

  assert.equal(result.failureKind, 'CAPABILITY_GATE_DENIED');
  assert.deepEqual(fx.calls, []);
  assert.equal(incidentRemediationCanBypassAutomaticRemediationGate(), false);
  assert.equal(infrastructureRemediationCanBypassInfrastructureGate(), false);
  assert.equal(remediationRequestCanChooseActionOrTargets(), false);
});

test('infrastructure remediation requires both automatic and infrastructure capabilities', async () => {
  for (const [active, expected] of [
    [['AUTOMATIC_REMEDIATION'], 'CAPABILITY_GATE_DENIED'],
    [['INFRASTRUCTURE_MUTATION'], 'CAPABILITY_GATE_DENIED'],
    [
      ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION'],
      'SUCCEEDED',
    ],
  ]) {
    const fx = fixture();
    setCapabilities(fx.store, active, active);
    const executor = createGatedIncidentRemediationExecutor(fx.gate, fx.evidence, fx.adapter);
    const result = await executor.execute(request(input(fx.evidence)));
    if (expected === 'SUCCEEDED') {
      assert.equal(result.status, 'SUCCEEDED');
      assert.equal(fx.calls.length, 1);
    } else {
      assert.equal(result.failureKind, expected);
      assert.deepEqual(fx.calls, []);
    }
  }
});

test('non-infrastructure notification remediation requires only automatic remediation', async () => {
  const fx = fixture({
    operation: 'NOTIFY',
    targetResourceIds: ['oncall'],
    requiresInfrastructureMutation: false,
  });
  setCapabilities(fx.store, ['AUTOMATIC_REMEDIATION'], ['AUTOMATIC_REMEDIATION']);

  const result = await createGatedIncidentRemediationExecutor(
    fx.gate,
    fx.evidence,
    fx.adapter,
  ).execute(request(input(fx.evidence)));

  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(fx.calls.length, 1);
});

test('trusted remediation evidence enforces operation capability semantics', () => {
  const base = fixture();
  const invalid = [
    { schemaVersion: 2 },
    { incidentId: '' },
    { remediationId: '' },
    { serviceId: '' },
    { environment: '' },
    { environment: 'x'.repeat(129) },
    { environment: 'bad\0env' },
    { sourceRevision: 'bad' },
    { evidenceHash: 'bad' },
    { operation: 'DELETE' },
    { sourceRevision: 'd'.repeat(40) },
    { operation: 'RESTART', requiresInfrastructureMutation: false },
    { operation: 'NOTIFY', requiresInfrastructureMutation: true },
    { targetResourceIds: [] },
    { targetResourceIds: Array.from({ length: 129 }, (_, i) => 'r-' + i) },
    { targetResourceIds: ['!'] },
    { targetResourceIds: ['api-1', 'api-1'] },
  ];

  for (const patch of invalid) {
    const fx = fixture(patch);
    assert.throws(() =>
      createGatedIncidentRemediationExecutor(base.gate, fx.evidence, base.adapter),
    );
  }
  assert.throws(() => createGatedIncidentRemediationExecutor(base.gate, base.evidence, null));
  assert.throws(() =>
    createGatedIncidentRemediationExecutor(base.gate, base.evidence, {
      id: 'provider',
      execute: null,
    }),
  );
  assert.throws(() =>
    createGatedIncidentRemediationExecutor(base.gate, base.evidence, {
      id: '!',
      execute: async () => ({}),
    }),
  );
});

test('request cannot choose action targets or infrastructure requirement', async () => {
  const fx = fixture();
  setCapabilities(
    fx.store,
    ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION'],
    ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION'],
  );
  const executor = createGatedIncidentRemediationExecutor(fx.gate, fx.evidence, fx.adapter);
  const cases = [
    '{',
    '[]',
    input(fx.evidence, { operation: 'NOTIFY' }),
    input(fx.evidence, { targetResourceIds: ['other'] }),
    input(fx.evidence, { requiresInfrastructureMutation: false }),
    input(fx.evidence, { schemaVersion: 2 }),
    input(fx.evidence, { incidentId: 'incident-2' }),
    input(fx.evidence, { remediationId: 'remediation-2' }),
    input(fx.evidence, { sourceRevision: 'd'.repeat(40) }),
    input(fx.evidence, { evidenceHash: 'd'.repeat(64) }),
  ];

  for (const value of cases) {
    const result = await executor.execute(request(value));
    assert.equal(result.failureKind, 'INCIDENT_REMEDIATION_INPUT_INVALID');
  }
  assert.deepEqual(fx.calls, []);
});

test('all side-effecting remediation operations are trusted-evidence driven', async () => {
  for (const operation of ['RESTART', 'SCALE', 'ROLLBACK', 'CONFIGURE', 'ISOLATE']) {
    const fx = fixture({ operation });
    setCapabilities(
      fx.store,
      ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION'],
      ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION'],
    );
    const result = await createGatedIncidentRemediationExecutor(
      fx.gate,
      fx.evidence,
      fx.adapter,
    ).execute(request(input(fx.evidence)));
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(fx.calls[0].operation, operation);
  }
});

test('adapter failures and forged receipts fail closed', async () => {
  const fx = fixture();
  setCapabilities(
    fx.store,
    ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION'],
    ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION'],
  );

  const throwing = createGatedIncidentRemediationExecutor(fx.gate, fx.evidence, {
    id: 'throwing-provider',
    async execute() {
      throw new Error('provider failed');
    },
  });
  assert.equal(
    (await throwing.execute(request(input(fx.evidence)))).failureKind,
    'INCIDENT_REMEDIATION_FAILED',
  );

  for (const receipt of [
    null,
    { schemaVersion: 2 },
    {
      schemaVersion: 1,
      receiptId: '!',
      incidentId: 'incident-1',
      remediationId: 'remediation-1',
      operation: 'RESTART',
    },
    {
      schemaVersion: 1,
      receiptId: 'receipt-1',
      incidentId: 'incident-2',
      remediationId: 'remediation-1',
      operation: 'RESTART',
    },
    {
      schemaVersion: 1,
      receiptId: 'receipt-1',
      incidentId: 'incident-1',
      remediationId: 'remediation-2',
      operation: 'RESTART',
    },
    {
      schemaVersion: 1,
      receiptId: 'receipt-1',
      incidentId: 'incident-1',
      remediationId: 'remediation-1',
      operation: 'SCALE',
    },
  ]) {
    const executor = createGatedIncidentRemediationExecutor(fx.gate, fx.evidence, {
      id: 'bad-receipt-provider',
      async execute() {
        return receipt;
      },
    });
    assert.equal(
      (await executor.execute(request(input(fx.evidence)))).failureKind,
      'INCIDENT_REMEDIATION_FAILED',
    );
  }
});

test('revocation is observed before the next remediation side effect', async () => {
  const fx = fixture();
  setCapabilities(
    fx.store,
    ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION'],
    ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION'],
  );
  const executor = createGatedIncidentRemediationExecutor(fx.gate, fx.evidence, fx.adapter);
  assert.equal((await executor.execute(request(input(fx.evidence)))).status, 'SUCCEEDED');

  const current = fx.store.read();
  assert.equal(
    fx.store.write(current.generation, {
      schemaVersion: 1,
      requestedCapabilities: ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION'],
      activeCapabilities: ['AUTOMATIC_REMEDIATION'],
    }).status,
    'WRITTEN',
  );

  const blocked = await executor.execute(request(input(fx.evidence)));
  assert.equal(blocked.failureKind, 'CAPABILITY_GATE_DENIED');
  assert.equal(fx.calls.length, 1);
});
