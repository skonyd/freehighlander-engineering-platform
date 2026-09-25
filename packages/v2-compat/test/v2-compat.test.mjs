import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORITATIVE_ARTIFACT_KIND,
  ACCEPTED_V2_REFERENCE,
  V2_REFERENCE_FULL_VERIFICATION,
  V2_REFERENCE_LOCAL_WORKER_GENERATION,
  V2_REFERENCE_LOCAL_WORKER_LIMITS,
  V2_REFERENCE_PROFILE,
  V2_REFERENCE_TEST_REVIEW,
  assertAcceptedReference,
  authorityPromotionAllowed,
  candidateIds,
  classifyRisk,
  contextTriageHasSignal,
  finalReviewRoute,
  finalReviewScopeHash,
  maxRisk,
  parsePrTaskId,
  planTestReviewAttempt,
  recordSuccessfulTestReview,
  sha256Hex,
  stampCandidateAdjudication,
  stampContextTriageAdjudication,
  taskFingerprint,
  testReviewRequired,
  testReviewScopeHash,
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

test('FH-01B2 records the accepted #207 reference and compatibility promotion', () => {
  assert.equal(ACCEPTED_V2_REFERENCE.provisionalSha, '0e70f4a9680fcc5c287b7926f2aa20170c79f47d');
  assert.equal(ACCEPTED_V2_REFERENCE.mergeSha, 'e4707a3c4267db9d2aadd452782b91045b96724d');
  assert.equal(ACCEPTED_V2_REFERENCE.postMergeHardeningPullRequest, 209);
  assert.equal(ACCEPTED_V2_REFERENCE.sha, '1a8e215b78a3a5008aae6aae36488b3273733b19');
  assert.equal(ACCEPTED_V2_REFERENCE.referenceStatus, 'ACCEPTED');
  assert.equal(ACCEPTED_V2_REFERENCE.authority, 'ENABLED');
  assert.equal(authorityPromotionAllowed(), true);
  assert.doesNotThrow(assertAcceptedReference);
});

test('accepted reference captures full verification, reviewer and worker invariants', () => {
  assert.equal(AUTHORITATIVE_ARTIFACT_KIND, 'full');
  assert.deepEqual(V2_REFERENCE_TEST_REVIEW, {
    model: 'claude-opus-5-5',
    effort: 'low',
    maxRepairRounds: 2,
  });
  assert.deepEqual(V2_REFERENCE_FULL_VERIFICATION, [
    'npm run verify',
    'bash scripts/check-docs.sh',
    'bash automation/tests/run.sh',
  ]);
  assert.deepEqual(V2_REFERENCE_LOCAL_WORKER_GENERATION, {
    temperature: 1,
    topP: 0.95,
    topK: 20,
    minP: 0,
    presencePenalty: 0,
    repetitionPenalty: 1,
    reasoningEffort: 'medium',
    enableThinking: true,
    preserveThinking: false,
    maxTokens: 16_384,
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
    model: 'gpt-6-sol',
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

test('reference profile is the accepted #207 + #209 compatibility profile', () => {
  assert.equal(V2_REFERENCE_PROFILE.finalReview.normal.model, 'gpt-6-sol');
  assert.equal(V2_REFERENCE_PROFILE.finalReview.normal.effort, 'medium');
  assert.equal(V2_REFERENCE_PROFILE.finalReview.critical.model, 'gpt-6-sol');
  assert.equal(V2_REFERENCE_PROFILE.controller.critical.effort, 'medium');
  assert.equal(ACCEPTED_V2_REFERENCE.pullRequest, 207);
});

test('protocol rejects duplicate STATUS and ROLE fields fail-closed', () => {
  const duplicateStatus = preReview().replace(
    'STATUS: CANDIDATE',
    'STATUS: CANDIDATE\nSTATUS: CANDIDATE',
  );
  assert.equal(
    validateArtifactForStore('pre-review', duplicateStatus, {
      expectedSha: revision,
      configHash,
    }).valid,
    false,
  );

  const duplicateRole = preReview().replace(
    'ROLE: pre-review',
    'ROLE: pre-review\nROLE: pre-review',
  );
  assert.equal(
    validateArtifactForStore('pre-review', duplicateRole, {
      expectedSha: revision,
      configHash,
    }).valid,
    false,
  );
});

test('context-triage signal detection is status-independent and CRLF-safe', () => {
  assert.equal(contextTriageHasSignal(triage('PASS')), false);

  const withAmbiguity = triage('PASS').replace(
    'AMBIGUITIES:\n  - none',
    'AMBIGUITIES:\n  - API ownership is unclear',
  );
  assert.equal(contextTriageHasSignal(withAmbiguity), true);
  assert.equal(contextTriageHasSignal(withAmbiguity.replaceAll('\n', '\r\n')), true);
});

test('PASS context-triage with a real signal still requires current adjudication', async () => {
  const withSignal = triage('PASS').replace(
    'RISKS_CANDIDATE:\n  - none',
    'RISKS_CANDIDATE:\n  - authorization boundary changed',
  );

  assert.equal(
    (
      await validateContextTriageGate({
        triage: withSignal,
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
    withSignal,
  );

  assert.equal(
    (
      await validateContextTriageGate({
        triage: withSignal,
        taskFingerprint: 'task-fingerprint',
        baseSha: 'base-sha',
        configHash,
        adjudication,
      })
    ).valid,
    true,
  );
});

test('test-review scope hash is deterministic and separator-collision safe', async () => {
  const first = await testReviewScopeHash('base', 'a|b', 'c', 'triage');
  const second = await testReviewScopeHash('base', 'a', 'b|c', 'triage');
  assert.notEqual(first, second);
  assert.equal(first, await testReviewScopeHash('base', 'a|b', 'c', 'triage'));
  assert.notEqual(first, await testReviewScopeHash('base', 'a|b', 'c', 'triage-2'));
});

test('test-review artifact is exact-bound to one canonical scope hash', async () => {
  const scopeHash = await testReviewScopeHash('base', 'title', 'body', 'triage');
  const artifact = `STATUS: COMPLETE
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
SCOPE_HASH: ${scopeHash}
`;

  assert.equal(
    validateArtifactForStore('test-review', artifact, {
      expectedSha: revision,
      configHash,
      expectedTestReviewScopeHash: scopeHash,
    }).valid,
    true,
  );
  assert.equal(
    validateArtifactForStore('test-review', artifact, {
      expectedSha: revision,
      configHash,
      expectedTestReviewScopeHash: '0'.repeat(64),
    }).valid,
    false,
  );
  assert.equal(
    validateArtifactForStore('test-review', artifact + `SCOPE_HASH: ${scopeHash}\n`, {
      expectedSha: revision,
      configHash,
      expectedTestReviewScopeHash: scopeHash,
    }).valid,
    false,
  );
});

test('final-review scope binds exact mutable PR and policy identity', async () => {
  const input = {
    headSha: revision,
    baseSha: 'c'.repeat(40),
    title: 'feat: exact scope',
    body: 'acceptance criteria',
    labels: 'risk:high',
    taskId: 'task-1',
    triageHash: 'd'.repeat(64),
    configHash,
    effectiveRisk: 'HIGH',
  };
  const scopeHash = await finalReviewScopeHash(input);
  assert.equal(scopeHash, await finalReviewScopeHash(input));
  assert.notEqual(scopeHash, await finalReviewScopeHash({ ...input, labels: 'risk:critical' }));
  assert.notEqual(scopeHash, await finalReviewScopeHash({ ...input, taskId: 'task-2' }));
  assert.notEqual(scopeHash, await finalReviewScopeHash({ ...input, effectiveRisk: 'CRITICAL' }));

  const artifact = `${evaluatorArtifact()}SCOPE_HASH: ${scopeHash}
PRODUCER: gpt-6-sol-final-review
CONFIG_HASH: ${configHash}
INITIAL_RISK: NORMAL
FINAL_RISK: HIGH
EFFECTIVE_RISK: HIGH
MODEL: gpt-6-sol
EFFORT: medium
`;
  assert.equal(
    validateArtifactForStore('final-review', artifact, {
      expectedSha: revision,
      configHash,
      expectedFinalReviewScopeHash: scopeHash,
    }).valid,
    true,
  );
  assert.equal(
    validateArtifactForStore('final-review', artifact, {
      expectedSha: revision,
      configHash,
      expectedFinalReviewScopeHash: 'f'.repeat(64),
    }).valid,
    false,
  );
});
