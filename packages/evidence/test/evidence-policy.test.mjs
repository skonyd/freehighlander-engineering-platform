import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evidenceBudgetCanTruncateRequiredEvidence,
  evidencePolicyCanGrantAuthority,
  validateEvidencePolicy,
} from '../dist/index.js';

const policy = {
  id: 'final-review-evidence',
  version: '1.0.0',
  allowSummarySubstitution: false,
  requirements: [
    {
      id: 'full-diff',
      kind: 'DIFF',
      exactRevisionRequired: true,
      trustedProvenanceRequired: true,
    },
    {
      id: 'test-evidence',
      kind: 'TEST',
      exactRevisionRequired: true,
      trustedProvenanceRequired: true,
    },
    {
      id: 'authority-relation',
      kind: 'RELATION',
      exactRevisionRequired: true,
      trustedProvenanceRequired: true,
      relationVerificationRequired: true,
    },
  ],
};

const candidates = [
  {
    id: 'full-diff',
    kind: 'DIFF',
    exactRevision: 'abc',
    trustedProvenance: true,
  },
  {
    id: 'test-evidence',
    kind: 'TEST',
    exactRevision: 'abc',
    trustedProvenance: true,
  },
  {
    id: 'authority-relation',
    kind: 'RELATION',
    exactRevision: 'abc',
    trustedProvenance: true,
    relationVerified: true,
  },
];

test('complete exact-bound trusted evidence passes without granting authority', () => {
  const result = validateEvidencePolicy(policy, candidates, { exactRevision: 'abc' });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.satisfiedRequirementIds, [
    'full-diff',
    'test-evidence',
    'authority-relation',
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.authorityGranted, false);
  assert.equal(result.requiredEvidenceMayBeDropped, false);
  assert.equal(evidencePolicyCanGrantAuthority(), false);
  assert.equal(evidenceBudgetCanTruncateRequiredEvidence(), false);
});

test('missing evidence fails closed', () => {
  const result = validateEvidencePolicy(policy, candidates.slice(0, 2), {
    exactRevision: 'abc',
  });

  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.errors, ['missing required evidence: authority-relation']);
});

test('summary cannot substitute raw required evidence kind', () => {
  const result = validateEvidencePolicy(
    policy,
    candidates.map((candidate) =>
      candidate.id === 'full-diff' ? { ...candidate, kind: 'SUMMARY' } : candidate,
    ),
    { exactRevision: 'abc' },
  );

  assert.equal(result.status, 'FAIL');
  assert.equal(
    result.errors.includes('summary cannot substitute required DIFF evidence: full-diff'),
    true,
  );
});

test('revision, provenance and relation mismatches each fail', () => {
  const wrongRevision = validateEvidencePolicy(
    policy,
    candidates.map((candidate) =>
      candidate.id === 'full-diff' ? { ...candidate, exactRevision: 'def' } : candidate,
    ),
    { exactRevision: 'abc' },
  );
  const untrusted = validateEvidencePolicy(
    policy,
    candidates.map((candidate) =>
      candidate.id === 'test-evidence' ? { ...candidate, trustedProvenance: false } : candidate,
    ),
    { exactRevision: 'abc' },
  );
  const unverifiedRelation = validateEvidencePolicy(
    policy,
    candidates.map((candidate) =>
      candidate.id === 'authority-relation' ? { ...candidate, relationVerified: false } : candidate,
    ),
    { exactRevision: 'abc' },
  );

  assert.equal(wrongRevision.status, 'FAIL');
  assert.equal(untrusted.status, 'FAIL');
  assert.equal(unverifiedRelation.status, 'FAIL');
});

test('duplicate requirements and candidates fail closed', () => {
  assert.throws(
    () =>
      validateEvidencePolicy(
        { ...policy, requirements: [...policy.requirements, policy.requirements[0]] },
        candidates,
        { exactRevision: 'abc' },
      ),
    /duplicate evidence requirement id/,
  );

  assert.throws(
    () =>
      validateEvidencePolicy(policy, [...candidates, candidates[0]], {
        exactRevision: 'abc',
      }),
    /duplicate evidence candidate id/,
  );
});

test('summary substitution cannot be enabled by policy input', () => {
  assert.throws(
    () =>
      validateEvidencePolicy({ ...policy, allowSummarySubstitution: true }, candidates, {
        exactRevision: 'abc',
      }),
    /summary substitution must remain disabled/,
  );
});
