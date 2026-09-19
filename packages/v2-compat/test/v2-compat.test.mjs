import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORITATIVE_ARTIFACT_KIND,
  PROVISIONAL_V2_REFERENCE,
  V2_REFERENCE_LOCAL_WORKER_LIMITS,
  V2_REFERENCE_PROFILE,
  V2_REFERENCE_TEST_REVIEW,
  assertProvisionalReference,
  authorityPromotionAllowed,
  candidateIds,
  classifyRisk,
  finalReviewRoute,
  maxRisk,
  parsePrTaskId,
  planTestReviewAttempt,
  recordSuccessfulTestReview,
  sha256Hex,
  stampCandidateAdjudication,
  stampContextTriageAdjudication,
  taskFingerprint,
  testReviewRequired,
  v2FallbackAllowed,
  validateArtifactForStore,
  validateCandidateAdjudication,
  validateContextTriageGate,
  validateTestReview,
} from '../dist/index.js';

const configHash = 'a'.repeat(64);
const revision = 'b'.repeat(40);

function evaluatorArtifact(extra = '') {
  return `STATUS: PASS
ROLE: evaluator
SHA: ${revision}
SCOPE:
  - provisional compatibility
SUMMARY:
  reviewed
FINDINGS:
  - none
TESTS:
  PASS: deterministic
  FAIL: -
  NOT_RUN: -
RESIDUAL_RISK:
  - provisional only
NEXT_ACTION: continue
${extra}`;
}

function preReview(ids = ['DS-001', 'DS-002']) {
  return `STATUS: CANDIDATE
ROLE: pre-review
SHA: ${revision}
SCOPE:
  - diff
SUMMARY:
  candidates
FINDINGS:
${ids.map((id) => `  - ID: ${id}\n    SEVERITY: P2`).join('\n')}
TESTS:
  PASS: -
  FAIL: -
  NOT_RUN: -
RESIDUAL_RISK:
  - provisional
NEXT_ACTION: adjudicate
PRODUCER: local-worker-pre-review
CONFIG_HASH: ${configHash}
`;
}

function triage(status = 'PASS') {
  return `STATUS: ${status}
ROLE: context-triage
SHA: task-fingerprint
TASK_SUMMARY: fixture
RELEVANT_CONTEXTS:
  - none
RELEVANT_FILES:
  - none
RELEVANT_TESTS:
  - none
DEPENDENCIES:
  - none
ACCEPTANCE_CRITERIA_EXTRACTED:
  - none
BASIC_IMPACT:
  - none
AMBIGUITIES:
  - none
RISKS_CANDIDATE:
  - none
UNKNOWN:
  - none
TASK_ID: task-id
TASK_FINGERPRINT: task-fingerprint
REPOSITORY_IDENTITY: owner/repo
BASE_SHA: base-sha
PRODUCER: local-worker-context-triage
CONFIG_HASH: ${configHash}
`;
}

test('FH-01B1 cannot promote authority', () => {
  assert.equal(PROVISIONAL_V2_REFERENCE.referenceStatus, 'PROVISIONAL');
  assert.equal(PROVISIONAL_V2_REFERENCE.authority, 'DISABLED');
  assert.equal(authorityPromotionAllowed(), false);
  assert.doesNotThrow(assertProvisionalReference);
});


test('provisional reference captures full-artifact, Opus and worker budget invariants', () => {
  assert.equal(AUTHORITATIVE_ARTIFACT_KIND, 'full');
  assert.deepEqual(V2_REFERENCE_TEST_REVIEW, {
    model: 'opus',
    effort: 'medium',
    maxRepairRounds: 2,
  });
  assert.equal(V2_REFERENCE_LOCAL_WORKER_LIMITS.gateTimeoutSeconds, 120);
  assert.equal(V2_REFERENCE_LOCAL_WORKER_LIMITS.timeoutSeconds, 600);
  assert.equal(V2_REFERENCE_LOCAL_WORKER_LIMITS.maxTotalSeconds, 900);
  assert.equal(V2_REFERENCE_LOCAL_WORKER_LIMITS.retries, 2);
  assert.equal(V2_REFERENCE_LOCAL_WORKER_LIMITS.retryDelaySeconds, 5);
  assert.equal(V2_REFERENCE_LOCAL_WORKER_LIMITS.maxInputBytes, 2_000_000);
});

test('fallback is availability-only and never semantic model shopping', () => {
  assert.equal(v2FallbackAllowed('quota_exhausted'), true);
  assert.equal(v2FallbackAllowed('rate_limited'), true);
  assert.equal(v2FallbackAllowed('provider_unavailable'), true);
  assert.equal(v2FallbackAllowed('semantic_failure'), false);
  assert.equal(v2FallbackAllowed('malformed_output'), false);
});

test('task fingerprint is sha256(repository|task) and task IDs remain task-scoped', async () => {
  assert.equal(await taskFingerprint('owner/repo', 'task-1'), await sha256Hex('owner/repo|task-1'));
  assert.notEqual(
    await taskFingerprint('owner/repo', 'task-1'),
    await taskFingerprint('owner/repo', 'task-2'),
  );
});

test('PR marker accepts exactly one valid marker and fails closed on duplicates', () => {
  assert.equal(parsePrTaskId('before <!-- automation-task-id: abc-123 --> after'), 'abc-123');
  assert.equal(parsePrTaskId('no marker'), null);
  assert.equal(
    parsePrTaskId('<!-- automation-task-id: a --> and <!-- automation-task-id: b -->'),
    null,
  );
  const pad = 'x'.repeat(45_000);
  assert.equal(parsePrTaskId(`${pad}<!-- automation-task-id: large-id -->${pad}`), 'large-id');
});

test('risk routing preserves V2 critical/high/normal semantics', () => {
  const critical = classifyRisk({
    files: ['automation/lib/pipeline.sh'],
    semanticLoc: 2,
    sha: revision,
  });
  assert.equal(critical.tier, 'CRITICAL');
  assert.equal(critical.humanRequired, true);

  const high = classifyRisk({
    files: ['apps/web/package.json'],
    semanticLoc: 2,
    sha: revision,
  });
  assert.equal(high.tier, 'HIGH');

  const normal = classifyRisk({
    files: ['packages/example/src/service.ts'],
    semanticLoc: 20,
    sha: revision,
  });
  assert.equal(normal.tier, 'NORMAL');
  assert.equal(normal.controller, 'sonnet');
  assert.equal(normal.effort, 'low');
});

test('risk max and final review route never downgrade effective risk', () => {
  assert.equal(maxRisk('CRITICAL', 'NORMAL'), 'CRITICAL');
  assert.equal(maxRisk('NORMAL', 'HIGH'), 'HIGH');
  assert.deepEqual(finalReviewRoute('CRITICAL'), {
    risk: 'CRITICAL',
    model: 'gpt-6-astra',
    effort: 'medium',
    humanRequired: true,
  });
});

test('Opus routing is deterministic and semantic negative outcomes are not fallback triggers', () => {
  assert.equal(
    testReviewRequired({
      tier: 'HIGH',
      reasons: [],
      title: 'feat: x',
      labels: [],
      files: ['src/x.ts'],
      semanticLoc: 1,
    }),
    true,
  );
  assert.equal(
    testReviewRequired({
      tier: 'NORMAL',
      reasons: [],
      title: 'fix(core): bug',
      labels: [],
      files: ['src/x.ts'],
      semanticLoc: 1,
    }),
    true,
  );
  assert.equal(
    testReviewRequired({
      tier: 'NORMAL',
      reasons: [],
      title: 'feat: x',
      labels: [],
      files: ['src/x.ts', 'src/x.test.ts'],
      semanticLoc: 20,
    }),
    true,
  );
  assert.equal(
    testReviewRequired({
      tier: 'NORMAL',
      reasons: [],
      title: 'feat: rename',
      labels: [],
      files: ['src/x.test.ts'],
      semanticLoc: 0,
    }),
    false,
  );
});

test('test-review validation enforces exact coverage enums and finding on INSUFFICIENT', () => {
  const sufficient = `STATUS: COMPLETE
ROLE: test-review
SHA: ${revision}
TEST_COVERAGE:
  acceptance_criteria: YES
  positive_path: YES
  negative_path: YES
  boundaries: YES
  regression: YES
ORACLE_QUALITY: STRONG
TEST_SUFFICIENCY: SUFFICIENT
FINDINGS:
  - none
PRODUCER: opus-test-review
CONFIG_HASH: ${configHash}
`;
  assert.equal(validateTestReview(sufficient, revision).valid, true);

  const insufficientWithoutFinding = sufficient.replace(
    'TEST_SUFFICIENCY: SUFFICIENT',
    'TEST_SUFFICIENCY: INSUFFICIENT',
  );
  assert.equal(validateTestReview(insufficientWithoutFinding, revision).valid, false);

  const duplicate = sufficient.replace(
    'ORACLE_QUALITY: STRONG',
    'ORACLE_QUALITY: STRONG\nORACLE_QUALITY: ADEQUATE',
  );
  assert.equal(validateTestReview(duplicate, revision).valid, false);
});

test('trusted candidate adjudication is stamped by wrapper and bound to full pre-review', async () => {
  const pre = preReview();
  const controller = `${evaluatorArtifact()}CANDIDATE_DECISION: DS-001|REJECTED|false positive|evidence-1
CANDIDATE_DECISION: DS-002|ACCEPTED|confirmed|evidence-2
`;
  const stamped = await stampCandidateAdjudication(controller, revision, configHash, pre);

  assert.equal(
    validateArtifactForStore('candidate-adjudication', stamped, {
      expectedSha: revision,
      configHash,
      trustedStore: false,
    }).valid,
    false,
  );
  assert.equal(
    (
      await validateCandidateAdjudication({
        preReview: pre,
        preReviewFull: pre,
        adjudication: stamped,
        revision,
        configHash,
      })
    ).valid,
    true,
  );

  const changedPre = preReview(['DS-001', 'DS-002', 'DS-003']);
  assert.equal(
    (
      await validateCandidateAdjudication({
        preReview: changedPre,
        preReviewFull: changedPre,
        adjudication: stamped,
        revision,
        configHash,
      })
    ).valid,
    false,
  );
});

test('candidate adjudication requires exact unique candidate decision set', async () => {
  const pre = preReview();
  const controller = `${evaluatorArtifact()}CANDIDATE_DECISION: DS-001|REJECTED|x|e1
CANDIDATE_DECISION: DS-001|ACCEPTED|y|e2
`;
  const stamped = await stampCandidateAdjudication(controller, revision, configHash, pre);
  const validation = await validateCandidateAdjudication({
    preReview: pre,
    preReviewFull: pre,
    adjudication: stamped,
    revision,
    configHash,
  });
  assert.equal(validation.valid, false);
});

test('context triage PASS is base-bound; WARN requires current-content adjudication', async () => {
  assert.equal(
    (
      await validateContextTriageGate({
        triage: triage('PASS'),
        taskFingerprint: 'task-fingerprint',
        baseSha: 'base-sha',
        configHash,
      })
    ).valid,
    true,
  );

  assert.equal(
    (
      await validateContextTriageGate({
        triage: triage('PASS'),
        taskFingerprint: 'task-fingerprint',
        baseSha: 'different-base',
        configHash,
      })
    ).valid,
    false,
  );

  assert.equal(
    (
      await validateContextTriageGate({
        triage: triage('WARN'),
        taskFingerprint: 'task-fingerprint',
        baseSha: 'base-sha',
        configHash,
      })
    ).valid,
    false,
  );

  const controllerAdjudication = evaluatorArtifact().replace(
    `SHA: ${revision}`,
    'SHA: task-fingerprint',
  );
  const adjudication = await stampContextTriageAdjudication(
    controllerAdjudication,
    configHash,
    triage('WARN'),
  );

  assert.equal(
    (
      await validateContextTriageGate({
        triage: triage('WARN'),
        taskFingerprint: 'task-fingerprint',
        baseSha: 'base-sha',
        configHash,
        adjudication,
      })
    ).valid,
    true,
  );
});

test('repair rounds increment only after successful review of a new repair SHA', () => {
  const initial = {
    lastReviewedSha: null,
    lastOutcome: null,
    repairRounds: 0,
  };
  const firstPlan = planTestReviewAttempt({
    currentSha: 'sha-1',
    validArtifactExists: false,
    state: initial,
    maxRepairRounds: 2,
  });
  assert.equal(firstPlan.pendingRepair, false);

  const insufficient = recordSuccessfulTestReview({
    currentSha: 'sha-1',
    outcome: 'INSUFFICIENT',
    pendingRepair: firstPlan.pendingRepair,
    previousState: initial,
  });
  assert.equal(insufficient.repairRounds, 0);

  const repairPlan = planTestReviewAttempt({
    currentSha: 'sha-2',
    validArtifactExists: false,
    state: insufficient,
    maxRepairRounds: 2,
  });
  assert.equal(repairPlan.pendingRepair, true);
  assert.equal(repairPlan.blockedByRoundLimit, false);

  const repaired = recordSuccessfulTestReview({
    currentSha: 'sha-2',
    outcome: 'SUFFICIENT',
    pendingRepair: repairPlan.pendingRepair,
    previousState: insufficient,
  });
  assert.equal(repaired.repairRounds, 1);

  const retrySameSha = planTestReviewAttempt({
    currentSha: 'sha-2',
    validArtifactExists: false,
    state: repaired,
    maxRepairRounds: 2,
  });
  assert.equal(retrySameSha.pendingRepair, false);
  assert.equal(retrySameSha.callRequired, true);
});

test('repair round limit blocks before another paid review call', () => {
  const plan = planTestReviewAttempt({
    currentSha: 'sha-3',
    validArtifactExists: false,
    state: {
      lastReviewedSha: 'sha-2',
      lastOutcome: 'INSUFFICIENT',
      repairRounds: 2,
    },
    maxRepairRounds: 2,
  });

  assert.equal(plan.pendingRepair, true);
  assert.equal(plan.blockedByRoundLimit, true);
});

test('reference profile is the captured PR #207 compatibility profile', () => {
  assert.equal(V2_REFERENCE_PROFILE.finalReview.critical.model, 'gpt-6-astra');
  assert.equal(V2_REFERENCE_PROFILE.controller.critical.effort, 'medium');
  assert.equal(PROVISIONAL_V2_REFERENCE.pullRequest, 207);
});
