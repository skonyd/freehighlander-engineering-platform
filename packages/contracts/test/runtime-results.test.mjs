import assert from 'node:assert/strict';
import test from 'node:test';

import {
  autonomousMergeReviewV1Schema,
  candidateAdjudicationResultV1Schema,
  malformedOutputCanBecomeSemanticApproval,
  parseStructuredRoleResultV1,
  reviewResultV1Schema,
  structuredRoleResultCanGrantAuthority,
  structuredRoleResultIsSemanticNegative,
  testAdequacyResultV1Schema,
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
