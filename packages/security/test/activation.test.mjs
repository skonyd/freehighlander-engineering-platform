import assert from 'node:assert/strict';
import test from 'node:test';

import { recordHumanDecision } from '@freehighlander/governance';

import {
  buildSecuritySnapshot,
  createSecurityWaiverApprovalPacketV1,
  evaluateSecurityGateWithWaiversV1,
  runAuthoritativeSecurityAssessmentV1,
  securityModelCanSelfApproveWaiver,
  securityScannerCanSelfApproveWaiver,
  securityWaiverCanAuthorizeReleaseDirectly,
  verifySecurityWaiverApprovalV1,
} from '../dist/index.js';

const repository = 'skonyd/freehighlander-engineering-platform';
const revision = 'a'.repeat(40);
const policyHash = 'b'.repeat(64);

const plan = {
  schemaVersion: 1,
  id: 'security-plan-1',
  repository,
  revision,
  policyHash,
  requiredScanners: [{ id: 'sast', version: '1.0.0' }],
};

const options = {
  assessmentId: 'assessment-1',
  observedRevision: revision,
  observedPolicyHash: policyHash,
};

test('authoritative scanner orchestration hashes evidence and remains authority-neutral', async () => {
  const result = await runAuthoritativeSecurityAssessmentV1(
    plan,
    {
      id: 'scanner-runner',
      async execute(request, scanner) {
        assert.equal(request.revision, revision);
        assert.equal(request.policyHash, policyHash);
        assert.equal(scanner.id, 'sast');
        return {
          schemaVersion: 1,
          evidenceId: 'evidence-1',
          evidencePayload: 'raw-scanner-output',
          findings: [],
        };
      },
    },
    options,
  );

  assert.equal(result.snapshot.status, 'CLEAR');
  assert.match(result.assessment.scannerEvidence[0].digest, /^[a-f0-9]{64}$/);
  assert.notEqual(result.assessment.scannerEvidence[0].digest, 'raw-scanner-output');
  assert.equal(result.assessment.scannerEvidence[0].provenance, 'TRUSTED');
  assert.equal(result.authority, 'NONE');
  assert.equal(result.waiverAuthorized, false);
  assert.equal(result.releaseAuthorized, false);
});

test('scanner failures become untrusted digest evidence and fail closed', async () => {
  const result = await runAuthoritativeSecurityAssessmentV1(
    plan,
    {
      id: 'failing-scanner',
      async execute() {
        throw new Error('SECRET scanner failure');
      },
    },
    options,
  );

  assert.equal(result.snapshot.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.assessment.scannerEvidence[0].provenance, 'UNTRUSTED');
  assert.doesNotMatch(JSON.stringify(result), /SECRET scanner failure/);
});

test('human-approved waiver is exact-bound and changes only security gate evidence', async () => {
  const result = await runAuthoritativeSecurityAssessmentV1(
    plan,
    {
      id: 'scanner-runner',
      async execute() {
        return {
          schemaVersion: 1,
          evidenceId: 'evidence-1',
          evidencePayload: 'finding-output',
          findings: [
            {
              id: 'finding-1',
              severity: 'HIGH',
              controlId: 'CTRL-1',
              state: 'OPEN',
            },
          ],
        };
      },
    },
    options,
  );

  assert.equal(result.snapshot.status, 'BLOCKED');
  const packet = await createSecurityWaiverApprovalPacketV1(
    plan,
    result.assessment,
    result.snapshot,
    'finding-1',
  );
  assert.equal(packet.authority, 'HUMAN_REQUIRED');

  const decision = recordHumanDecision(packet.request, 'HUMAN', 'operator-1', 'APPROVE');
  const waiver = verifySecurityWaiverApprovalV1(packet, decision, {
    repository,
    revision,
    securityPolicyHash: policyHash,
    securitySnapshotHash: result.snapshot.snapshotHash,
  });

  const gate = await evaluateSecurityGateWithWaiversV1(
    plan,
    result.assessment,
    result.snapshot,
    [waiver],
  );
  assert.equal(gate.status, 'CLEAR');
  assert.equal(gate.openHighFindings, 0);
  assert.equal(gate.waivedHighFindings, 1);
  assert.equal(gate.authority, 'NONE');
  assert.equal(gate.releaseAuthorized, false);
  assert.equal(securityWaiverCanAuthorizeReleaseDirectly(), false);
});

test('stale denied forged and model waiver decisions fail closed', async () => {
  const assessment = {
    schemaVersion: 1,
    id: 'assessment-1',
    planId: plan.id,
    repository,
    revision,
    policyHash,
    scannerEvidence: [
      {
        id: 'evidence-1',
        scannerId: 'sast',
        scannerVersion: '1.0.0',
        repository,
        revision,
        policyHash,
        provenance: 'TRUSTED',
        digest: 'c'.repeat(64),
      },
    ],
    findings: [
      {
        id: 'finding-1',
        scannerId: 'sast',
        severity: 'CRITICAL',
        controlId: 'CTRL-1',
        state: 'OPEN',
        evidenceDigest: 'c'.repeat(64),
      },
    ],
  };
  const snapshot = await buildSecuritySnapshot(plan, assessment);
  const packet = await createSecurityWaiverApprovalPacketV1(
    plan,
    assessment,
    snapshot,
    'finding-1',
  );

  const denied = recordHumanDecision(packet.request, 'HUMAN', 'operator-1', 'DENY');
  assert.throws(
    () =>
      verifySecurityWaiverApprovalV1(packet, denied, {
        repository,
        revision,
        securityPolicyHash: policyHash,
        securitySnapshotHash: snapshot.snapshotHash,
      }),
    /not APPROVE/,
  );

  const approved = recordHumanDecision(packet.request, 'HUMAN', 'operator-1', 'APPROVE');
  assert.throws(
    () =>
      verifySecurityWaiverApprovalV1(packet, approved, {
        repository,
        revision: 'd'.repeat(40),
        securityPolicyHash: policyHash,
        securitySnapshotHash: snapshot.snapshotHash,
      }),
    /stale/,
  );

  assert.throws(
    () => recordHumanDecision(packet.request, 'MODEL', 'model-1', 'APPROVE'),
    /requires HUMAN principal/,
  );
  assert.equal(securityScannerCanSelfApproveWaiver(), false);
  assert.equal(securityModelCanSelfApproveWaiver(), false);

  const forged = { ...approved, decisionHash: '0'.repeat(64) };
  assert.throws(
    () =>
      verifySecurityWaiverApprovalV1(packet, forged, {
        repository,
        revision,
        securityPolicyHash: policyHash,
        securitySnapshotHash: snapshot.snapshotHash,
      }),
    /binding is invalid/,
  );
});

test('forged snapshot and non-open waiver requests are rejected', async () => {
  const clean = await runAuthoritativeSecurityAssessmentV1(
    plan,
    {
      id: 'scanner-runner',
      async execute() {
        return {
          schemaVersion: 1,
          evidenceId: 'evidence-1',
          evidencePayload: 'output',
          findings: [
            {
              id: 'finding-1',
              severity: 'HIGH',
              controlId: 'CTRL-1',
              state: 'REMEDIATED',
              remediationPayload: 'fixed',
            },
          ],
        };
      },
    },
    options,
  );

  await assert.rejects(
    () =>
      createSecurityWaiverApprovalPacketV1(
        plan,
        clean.assessment,
        { ...clean.snapshot, snapshotHash: '0'.repeat(64) },
        'finding-1',
      ),
    /snapshot binding is stale/,
  );
  await assert.rejects(
    () =>
      createSecurityWaiverApprovalPacketV1(
        plan,
        clean.assessment,
        clean.snapshot,
        'finding-1',
      ),
    /requires an OPEN finding/,
  );
  await assert.rejects(
    () =>
      createSecurityWaiverApprovalPacketV1(
        plan,
        clean.assessment,
        clean.snapshot,
        'missing',
      ),
    /does not exist/,
  );
});

test('revision policy and malformed scanner outcomes fail closed', async () => {
  const executor = {
    id: 'scanner-runner',
    async execute() {
      return {
        schemaVersion: 1,
        evidenceId: 'evidence-1',
        evidencePayload: 'output',
        findings: [],
      };
    },
  };

  await assert.rejects(
    () =>
      runAuthoritativeSecurityAssessmentV1(plan, executor, {
        ...options,
        observedRevision: 'd'.repeat(40),
      }),
    /observed revision/,
  );
  await assert.rejects(
    () =>
      runAuthoritativeSecurityAssessmentV1(plan, executor, {
        ...options,
        observedPolicyHash: 'd'.repeat(64),
      }),
    /observed policy/,
  );

  const malformed = [
    null,
    { schemaVersion: 2, evidenceId: 'evidence-1', evidencePayload: 'x', findings: [] },
    { schemaVersion: 1, evidenceId: '!', evidencePayload: 'x', findings: [] },
    { schemaVersion: 1, evidenceId: 'evidence-1', evidencePayload: 3, findings: [] },
    { schemaVersion: 1, evidenceId: 'evidence-1', evidencePayload: 'x', findings: null },
  ];

  for (const outcome of malformed) {
    const result = await runAuthoritativeSecurityAssessmentV1(
      plan,
      { id: 'bad-scanner', async execute() { return outcome; } },
      options,
    );
    assert.equal(result.snapshot.status, 'INSUFFICIENT_EVIDENCE');
  }
});
