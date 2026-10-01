import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  AuthorityCapabilityActivationService,
  AuthorityCapabilityApprovalCoordinator,
  AuthorityCapabilityExecutionGate,
  createAutomaticRemediationGatedExecutor,
  createGitWriteGatedExecutor,
  createInfrastructureMutationGatedExecutor,
  createReleaseDeployGatedExecutor,
} from '../../../apps/control-plane/dist/index.js';
import { MutationLineageJournalV1 } from '../../../packages/lineage/dist/index.js';
import { AuthorityCapabilityStateStore } from '../../../packages/persistence/dist/index.js';

const REVISION = 'a'.repeat(40);
const REPOSITORY = 'skonyd/freehighlander-engineering-platform';

function activity(id) {
  return {
    schemaVersion: 1,
    activityId: id,
    runId: 'run-b-lane-e2e',
    workspaceHash: 'b'.repeat(64),
    kind: 'COMMAND',
    input: '{}',
    timeoutMs: 1000,
    attempt: 1,
    executionMode: 'LIVE',
  };
}

async function activate(service, coordinator, capability) {
  const before = service.snapshot();
  const requested = service.setRequested(capability, true, before.generation);
  assert.equal(requested.status, 'APPLIED');
  const approved = coordinator.approve(capability, requested.generation);
  assert.equal(approved.status, 'APPROVED');
  const activated = coordinator.activateApproved(capability, requested.generation);
  assert.equal(activated.status, 'APPLIED');
  return activated;
}

test('FH-30B..FH-37B authority-bearing execution is gated revocable and lineage-recorded end to end', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fh-b-lane-e2e-'));
  try {
    const stateStore = new AuthorityCapabilityStateStore(join(root, 'authority.json'));
    const service = new AuthorityCapabilityActivationService(stateStore);
    const coordinator = new AuthorityCapabilityApprovalCoordinator(service, {
      repository: REPOSITORY,
      revision: REVISION,
      approverId: 'b-lane-acceptance-operator',
    });
    const gate = new AuthorityCapabilityExecutionGate({
      stateStore,
      expectedRevision: REVISION,
      observeRevision: () => REVISION,
    });
    const journal = new MutationLineageJournalV1(join(root, 'lineage.jsonl'));

    let delegated = 0;
    const delegate = {
      id: 'b-lane-acceptance-delegate',
      async execute(request) {
        delegated += 1;
        return { status: 'SUCCEEDED', output: request.activityId };
      },
    };

    const git = createGitWriteGatedExecutor(gate, delegate);
    const release = createReleaseDeployGatedExecutor(gate, delegate);
    const infrastructure = createInfrastructureMutationGatedExecutor(gate, delegate);
    const remediation = createAutomaticRemediationGatedExecutor(gate, delegate);

    for (const [name, executor] of [
      ['git-default-deny', git],
      ['release-default-deny', release],
      ['infra-default-deny', infrastructure],
      ['remediation-default-deny', remediation],
    ]) {
      const denied = await executor.execute(activity(name));
      assert.equal(denied.status, 'FAILED');
      assert.equal(denied.failureKind, 'CAPABILITY_GATE_DENIED');
    }
    assert.equal(delegated, 0);

    await activate(service, coordinator, 'GIT_WRITE');
    await activate(service, coordinator, 'RELEASE_DEPLOY');
    await activate(service, coordinator, 'INFRASTRUCTURE_MUTATION');
    await activate(service, coordinator, 'AUTOMATIC_REMEDIATION');

    const activeSnapshot = service.snapshot();
    assert.deepEqual(activeSnapshot.state.activeCapabilities, [
      'GIT_WRITE',
      'RELEASE_DEPLOY',
      'INFRASTRUCTURE_MUTATION',
      'AUTOMATIC_REMEDIATION',
    ]);

    for (const [name, executor, capability, kind] of [
      ['git-live', git, 'GIT_WRITE', 'GIT_WRITE'],
      ['release-live', release, 'RELEASE_DEPLOY', 'RELEASE_MUTATION'],
      ['infra-live', infrastructure, 'INFRASTRUCTURE_MUTATION', 'INFRASTRUCTURE_MUTATION'],
      ['remediation-live', remediation, 'AUTOMATIC_REMEDIATION', 'INCIDENT_REMEDIATION'],
    ]) {
      const decision = gate.check(capability);
      assert.equal(decision.allowed, true);
      const result = await executor.execute(activity(name));
      assert.equal(result.status, 'SUCCEEDED');
      await journal.append({
        actionId: name,
        kind,
        repository: REPOSITORY,
        revision: REVISION,
        occurredAt: '2026-10-01T11:30:00.000Z',
        principalKind: 'SYSTEM',
        capabilities:
          kind === 'INCIDENT_REMEDIATION'
            ? ['AUTOMATIC_REMEDIATION', 'INFRASTRUCTURE_MUTATION']
            : [capability],
        evidenceDigest: 'c'.repeat(64),
        resultDigest: 'd'.repeat(64),
        policyHash: decision.policyHash,
        authorityGeneration: decision.generation,
      });
    }
    assert.equal(delegated, 4);

    const beforeRevoke = service.snapshot();
    const revoked = service.deactivate('INFRASTRUCTURE_MUTATION', beforeRevoke.generation);
    assert.equal(revoked.status, 'APPLIED');
    assert.equal(gate.check('INFRASTRUCTURE_MUTATION').allowed, false);

    const deniedAfterRevoke = await infrastructure.execute(activity('infra-after-revoke'));
    assert.equal(deniedAfterRevoke.status, 'FAILED');
    assert.equal(deniedAfterRevoke.failureKind, 'CAPABILITY_GATE_DENIED');
    assert.equal(delegated, 4);

    const lineage = await journal.read();
    assert.deepEqual(
      lineage.records.map((record) => record.kind),
      ['GIT_WRITE', 'RELEASE_MUTATION', 'INFRASTRUCTURE_MUTATION', 'INCIDENT_REMEDIATION'],
    );
    assert.equal(lineage.records.every((record) => record.authority === 'NONE'), true);

    const driftedGate = new AuthorityCapabilityExecutionGate({
      stateStore,
      expectedRevision: REVISION,
      observeRevision: () => 'e'.repeat(40),
    });
    assert.equal(driftedGate.check('GIT_WRITE').allowed, false);
    assert.match(driftedGate.check('GIT_WRITE').reasons.join(' '), /revision drifted/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
