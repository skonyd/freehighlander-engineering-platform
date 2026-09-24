import assert from 'node:assert/strict';
import test from 'node:test';

import {
  autonomousMergeReviewV1Schema,
  buildUserFacingErrorV1,
  candidateAdjudicationResultV1Schema,
  errorReportingCanGrantAuthority,
  getRuntimeErrorPatternDefinitionV1,
  malformedOutputCanBecomeSemanticApproval,
  parseStructuredRoleResultV1,
  reviewResultV1Schema,
  runtimeErrorCanExposeRawCause,
  runtimeErrorPattern,
  runtimeErrorReportV1Schema,
  structuredRoleResultCanGrantAuthority,
  structuredRoleResultIsSemanticNegative,
  testAdequacyResultV1Schema,
  userFacingErrorCanContainSecrets,
  userFacingErrorV1Schema,
} from '../dist/index.js';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);

const binding = {
  runId: 'run-001',
  exactRevision: 'abc123',
  scopeHash: H1,
  runSnapshotHash: H2,
};

const finding = {
  id: 'finding-001',
  severity: 'P1',
  summary: 'exact-bound regression',
  evidence: [{ artifactId: 'artifact-001', contentHash: H3 }],
};

function review(verdict) {
  return {
    schemaVersion: 1,
    kind: 'REVIEW',
    binding,
    verdict,
    findings: verdict === 'BLOCKED' ? [finding] : [],
    residualRisk: ['bounded residual'],
  };
}

function adequacy(verdict) {
  return {
    schemaVersion: 1,
    kind: 'TEST_ADEQUACY',
    binding,
    verdict,
    coverage: {
      acceptanceCriteria: true,
      positivePath: true,
      negativePath: true,
      boundaries: true,
      regression: true,
    },
    findings: verdict === 'INSUFFICIENT' ? [finding] : [],
  };
}

function mergeReview(verdict) {
  return {
    schemaVersion: 1,
    kind: 'AUTONOMOUS_MERGE_REVIEW',
    binding,
    verdict,
    findings: verdict === 'APPROVE' ? [] : [finding],
    reviewerIndependenceGroup: 'independent-reviewer-a',
  };
}

test('review results are schema-bound and semantic BLOCKED remains valid data', () => {
  const pass = reviewResultV1Schema.parse(review('PASS'));
  const blocked = reviewResultV1Schema.parse(review('BLOCKED'));

  assert.equal(parseStructuredRoleResultV1(pass).status, 'VALID');
  assert.equal(parseStructuredRoleResultV1(blocked).status, 'VALID');
  assert.equal(structuredRoleResultIsSemanticNegative(pass), false);
  assert.equal(structuredRoleResultIsSemanticNegative(blocked), true);
});

test('test adequacy distinguishes SUFFICIENT from semantic INSUFFICIENT', () => {
  const sufficient = testAdequacyResultV1Schema.parse(adequacy('SUFFICIENT'));
  const insufficient = testAdequacyResultV1Schema.parse(adequacy('INSUFFICIENT'));

  assert.equal(parseStructuredRoleResultV1(sufficient).status, 'VALID');
  assert.equal(parseStructuredRoleResultV1(insufficient).status, 'VALID');
  assert.equal(structuredRoleResultIsSemanticNegative(sufficient), false);
  assert.equal(structuredRoleResultIsSemanticNegative(insufficient), true);
});

test('candidate adjudication is valid structured data but grants no semantic approval authority', () => {
  const value = candidateAdjudicationResultV1Schema.parse({
    schemaVersion: 1,
    kind: 'CANDIDATE_ADJUDICATION',
    binding,
    decisions: [
      {
        candidateId: 'candidate-001',
        decision: 'REJECTED',
        reason: 'not reproducible',
        evidence: [{ artifactId: 'artifact-001', contentHash: H3 }],
      },
    ],
  });

  const parsed = parseStructuredRoleResultV1(value);
  assert.equal(parsed.status, 'VALID');
  assert.equal(structuredRoleResultIsSemanticNegative(value), false);
});

test('autonomous merge review schema accepts approve block and human-required without granting authority', () => {
  const approve = autonomousMergeReviewV1Schema.parse(mergeReview('APPROVE'));
  const block = autonomousMergeReviewV1Schema.parse(mergeReview('BLOCK'));
  const human = autonomousMergeReviewV1Schema.parse(mergeReview('HUMAN_REQUIRED'));

  assert.equal(parseStructuredRoleResultV1(approve).status, 'VALID');
  assert.equal(parseStructuredRoleResultV1(block).status, 'VALID');
  assert.equal(parseStructuredRoleResultV1(human).status, 'VALID');
  assert.equal(structuredRoleResultIsSemanticNegative(approve), false);
  assert.equal(structuredRoleResultIsSemanticNegative(block), true);
  assert.equal(structuredRoleResultIsSemanticNegative(human), true);
});

test('malformed output is distinct from a valid semantic negative result', () => {
  const malformed = parseStructuredRoleResultV1({
    ...review('PASS'),
    schemaVersion: 2,
    binding: { ...binding, scopeHash: 'not-a-hash' },
    unexpected: true,
  });

  assert.equal(malformed.status, 'MALFORMED');
  if (malformed.status === 'MALFORMED') {
    assert.ok(malformed.errors.length > 0);
    assert.ok(malformed.errors.some((error) => error.includes('schemaVersion')));
  }

  const semanticNegative = parseStructuredRoleResultV1(review('BLOCKED'));
  assert.equal(semanticNegative.status, 'VALID');
  if (semanticNegative.status === 'VALID') {
    assert.equal(structuredRoleResultIsSemanticNegative(semanticNegative.value), true);
  }
});

test('structured role outputs are data and cannot grant authority', () => {
  assert.equal(structuredRoleResultCanGrantAuthority(), false);
  assert.equal(malformedOutputCanBecomeSemanticApproval(), false);
});

function runtimeError(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'RUNTIME_ERROR',
    errorId: 'error-001',
    patternId: 'FH-PROVIDER-001',
    errorClass: 'PROVIDER',
    severity: 'ERROR',
    retryability: 'AFTER_BACKOFF',
    binding,
    component: 'model-runtime',
    operation: 'provider-invoke',
    correlationId: 'corr-001',
    technicalSummary: 'provider returned a transport failure',
    failureKind: 'transport-failure',
    evidence: [{ artifactId: 'artifact-001', contentHash: H3 }],
    occurredAt: '2026-09-24T07:00:00+03:00',
    authority: 'NONE',
    ...overrides,
  };
}

test('runtime error reports use registered deterministic patterns and exact binding', () => {
  const value = runtimeErrorReportV1Schema.parse(runtimeError());

  assert.equal(value.patternId, 'FH-PROVIDER-001');
  assert.equal(value.errorClass, 'PROVIDER');
  assert.equal(
    runtimeErrorPattern(value),
    'FH-PROVIDER-001:PROVIDER:model-runtime:provider-invoke:AFTER_BACKOFF',
  );

  const pattern = getRuntimeErrorPatternDefinitionV1(value.patternId);
  assert.equal(pattern.defaultAction, 'RETRY');
  assert.equal(pattern.defaultImpact, 'DEGRADED');
  assert.equal(pattern.userTitle, 'Model or tool provider is unavailable');

  assert.throws(
    () =>
      runtimeErrorReportV1Schema.parse(
        runtimeError({ patternId: 'FH-PROVIDER-001', errorClass: 'WORKSPACE' }),
      ),
    /errorClass must match the registered pattern/,
  );
  assert.throws(() =>
    runtimeErrorReportV1Schema.parse(runtimeError({ patternId: 'FH-UNKNOWN-999' })),
  );
  assert.throws(
    () => getRuntimeErrorPatternDefinitionV1('FH-UNKNOWN-999'),
    /unknown runtime error/,
  );
});

test('HUMAN_REQUIRED error pattern cannot masquerade as an automatic retry', () => {
  const valid = runtimeErrorReportV1Schema.parse(
    runtimeError({
      patternId: 'FH-HUMAN-001',
      errorClass: 'HUMAN_REQUIRED',
      severity: 'WARNING',
      retryability: 'AFTER_USER_ACTION',
    }),
  );
  assert.equal(valid.retryability, 'AFTER_USER_ACTION');

  assert.throws(
    () =>
      runtimeErrorReportV1Schema.parse(
        runtimeError({
          patternId: 'FH-HUMAN-001',
          errorClass: 'HUMAN_REQUIRED',
          severity: 'WARNING',
          retryability: 'SAFE_IMMEDIATE',
        }),
      ),
    /HUMAN_REQUIRED errors must wait for user action/,
  );
});

test('user-facing error builder produces detailed bounded redacted display data', () => {
  const internal = runtimeErrorReportV1Schema.parse(runtimeError());
  const user = buildUserFacingErrorV1(internal, {
    summary: 'The configured model provider could not complete the request.',
    whatHappened: 'The provider connection failed before a valid model result was returned.',
    nextAction: 'Retry after the provider recovers. No project state was changed.',
    safeDetails: [
      { label: 'Provider', value: 'primary-model-provider' },
      { label: 'Run', value: internal.binding.runId },
    ],
    redactionStatus: 'APPLIED',
  });

  assert.equal(user.kind, 'USER_ERROR');
  assert.equal(user.errorId, internal.errorId);
  assert.equal(user.patternId, internal.patternId);
  assert.equal(user.context.runId, internal.binding.runId);
  assert.equal(user.context.exactRevision, internal.binding.exactRevision);
  assert.equal(user.context.component, internal.component);
  assert.equal(user.context.operation, internal.operation);
  assert.equal(user.impact, 'DEGRADED');
  assert.equal(user.action, 'RETRY');
  assert.equal(user.retryability, 'AFTER_BACKOFF');
  assert.equal(user.safeForUserDisplay, true);
  assert.equal(user.redactionStatus, 'APPLIED');
  assert.deepEqual(user.evidence, internal.evidence);
  assert.equal(user.authority, 'NONE');

  const explicitEvidence = buildUserFacingErrorV1(internal, {
    summary: 'Provider failed.',
    whatHappened: 'A safe provider error was recorded.',
    nextAction: 'Retry later.',
    evidence: [],
    redactionStatus: 'NOT_REQUIRED',
  });
  assert.deepEqual(explicitEvidence.evidence, []);
  assert.deepEqual(explicitEvidence.safeDetails, []);
});

test('user-facing errors reject raw diagnostic fields and incomplete user-action states', () => {
  const internal = runtimeErrorReportV1Schema.parse(
    runtimeError({
      patternId: 'FH-AUTH-001',
      errorClass: 'AUTHENTICATION',
      retryability: 'AFTER_USER_ACTION',
    }),
  );
  const valid = buildUserFacingErrorV1(internal, {
    summary: 'Authentication is unavailable.',
    whatHappened: 'The required provider credential could not be resolved.',
    nextAction: 'Reauthenticate the provider and retry this work item.',
    redactionStatus: 'APPLIED',
  });

  assert.equal(valid.action, 'REAUTHENTICATE');
  assert.throws(() =>
    userFacingErrorV1Schema.parse({
      ...valid,
      rawCause: 'secret provider response',
    }),
  );

  assert.throws(() =>
    userFacingErrorV1Schema.parse({
      ...valid,
      retryability: 'AFTER_USER_ACTION',
      action: 'NONE',
    }),
  );

  assert.throws(() =>
    userFacingErrorV1Schema.parse({
      ...valid,
      safeForUserDisplay: false,
    }),
  );
});

test('error reporting contracts never grant authority or raw-cause permission', () => {
  assert.equal(runtimeErrorCanExposeRawCause(), false);
  assert.equal(userFacingErrorCanContainSecrets(), false);
  assert.equal(errorReportingCanGrantAuthority(), false);
});
