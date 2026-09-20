import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTestingSnapshot,
  evaluateShadowTestGate,
  testPassCanAuthorizeMerge,
  testPassCanAuthorizeRelease,
  testingCanExecuteProductionMutation,
  testingCanGrantAuthority,
  validateTestPlan,
  validateTestRun,
} from '../dist/index.js';

const repository = 'skonyd/freehighlander-engineering-platform';
const revision = '2e713fdc4cd3472aeb7d10d08121499f7c2d425e';
const environmentFingerprint = 'b'.repeat(64);

const plan = {
  schemaVersion: 1,
  id: 'fh-32a-plan',
  revision: 1,
  developmentCandidateId: 'fh-31a-candidate',
  repository,
  revisionUnderTest: revision,
  environment: {
    id: 'node-24-linux',
    fingerprint: environmentFingerprint,
  },
  requiredAcceptanceCriteria: ['AC-1', 'AC-2'],
  cases: [
    {
      id: 'TC-1',
      title: 'Validate exact revision binding',
      kind: 'CONTRACT',
      required: true,
      acceptanceCriteria: ['AC-1'],
    },
    {
      id: 'TC-2',
      title: 'Validate authority boundary',
      kind: 'UNIT',
      required: true,
      acceptanceCriteria: ['AC-2'],
    },
  ],
};

const evidence = (id) => ({
  id,
  kind: 'REPORT',
  digest: 'a'.repeat(64),
  provenance: 'TRUSTED',
});

const run = {
  schemaVersion: 1,
  id: 'run-1',
  planId: plan.id,
  repository,
  revision,
  environmentFingerprint,
  results: [
    {
      caseId: 'TC-1',
      status: 'PASS',
      repository,
      revision,
      environmentFingerprint,
      evidence: [evidence('E-1')],
      durationMs: 12,
    },
    {
      caseId: 'TC-2',
      status: 'PASS',
      repository,
      revision,
      environmentFingerprint,
      evidence: [evidence('E-2')],
      durationMs: 7,
    },
  ],
};

test('valid plan provides complete required acceptance coverage', () => {
  assert.equal(validateTestPlan(plan).valid, true);
});

test('exact revision and environment mismatch fail closed', () => {
  const wrongRevision = validateTestRun(plan, {
    ...run,
    revision: 'c'.repeat(40),
  });
  const wrongEnvironment = validateTestRun(plan, {
    ...run,
    environmentFingerprint: 'different',
  });

  assert.equal(wrongRevision.valid, false);
  assert.match(wrongRevision.errors.join('\n'), /revision must match/);
  assert.equal(wrongEnvironment.valid, false);
  assert.match(wrongEnvironment.errors.join('\n'), /environmentFingerprint must match/);
});

test('missing coverage in the plan fails closed', () => {
  const result = validateTestPlan({
    ...plan,
    cases: [plan.cases[0]],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /AC-2 lacks required test coverage/);
});

test('PASS is read-only evidence and grants no authority', async () => {
  const evaluation = evaluateShadowTestGate(plan, run);
  const first = await buildTestingSnapshot(plan, run);
  const second = await buildTestingSnapshot(structuredClone(plan), structuredClone(run));

  assert.equal(evaluation.status, 'PASS');
  assert.equal(evaluation.authority, 'NONE');
  assert.equal(evaluation.mergeAuthorized, false);
  assert.equal(evaluation.releaseAuthorized, false);
  assert.equal(evaluation.promotionAuthorized, false);
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.equal(testingCanGrantAuthority(), false);
  assert.equal(testPassCanAuthorizeMerge(), false);
  assert.equal(testPassCanAuthorizeRelease(), false);
  assert.equal(testingCanExecuteProductionMutation(), false);
});

test('required failure produces FAIL without merge or release authority', () => {
  const failed = {
    ...run,
    results: [{ ...run.results[0], status: 'FAIL' }, run.results[1]],
  };

  const evaluation = evaluateShadowTestGate(plan, failed);
  assert.equal(evaluation.status, 'FAIL');
  assert.equal(evaluation.mergeAuthorized, false);
  assert.equal(evaluation.releaseAuthorized, false);
});

test('missing or skipped required result is insufficient evidence', () => {
  const missing = {
    ...run,
    results: [run.results[0]],
  };
  const skipped = {
    ...run,
    results: [run.results[0], { ...run.results[1], status: 'SKIPPED', evidence: [] }],
  };

  assert.equal(evaluateShadowTestGate(plan, missing).status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(evaluateShadowTestGate(plan, skipped).status, 'INSUFFICIENT_EVIDENCE');
});

test('non-skipped results require digest-bound evidence', () => {
  const result = validateTestRun(plan, {
    ...run,
    results: [{ ...run.results[0], evidence: [] }, run.results[1]],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /requires evidence/);
});
