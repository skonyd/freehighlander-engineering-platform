import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaReviewRequestV1,
  fhKuikaReviewRequestCanAuthorizeExecution,
  fhKuikaReviewRequestCanGrantAuthority,
  validateFhKuikaReviewRequestV1,
} from '../dist/index.js';

function request() {
  return createFhKuikaReviewRequestV1({
    requestId: 'review-1',
    repository: 'skonyd/freehighlander-engineering-platform',
    exactRevision: 'a'.repeat(40),
    producerRole: 'implementation-agent',
    reviewerRole: 'independent-reviewer',
    independenceGroup: 'review-group-b',
    evidence: [
      {
        evidenceId: 'evidence-1',
        exactRevision: 'a'.repeat(40),
      },
    ],
  });
}

test('FH-KUIKA REVIEW request is exact-revision bound and authority-neutral', () => {
  const value = request();

  assert.equal(value.schemaVersion, 1);
  assert.equal(value.authority, 'NONE');
  assert.equal(value.executionAuthorized, false);
  assert.equal(value.evidence[0].exactRevision, value.exactRevision);
  assert.equal(fhKuikaReviewRequestCanGrantAuthority(), false);
  assert.equal(fhKuikaReviewRequestCanAuthorizeExecution(), false);
  assert.deepEqual(validateFhKuikaReviewRequestV1(value), { valid: true, errors: [] });
});

test('FH-KUIKA REVIEW request rejects producer self-review and evidence drift', () => {
  const value = request();
  const invalid = {
    ...value,
    reviewerRole: value.producerRole,
    evidence: [
      ...value.evidence,
      {
        evidenceId: 'evidence-2',
        exactRevision: 'b'.repeat(40),
      },
    ],
  };

  const result = validateFhKuikaReviewRequestV1(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('producerRole and reviewerRole must be different'));
  assert.ok(result.errors.some((error) => error.includes('not bound to request exactRevision')));
});

test('FH-KUIKA REVIEW request requires evidence and unique evidence IDs', () => {
  const value = request();

  const none = validateFhKuikaReviewRequestV1({ ...value, evidence: [] });
  assert.equal(none.valid, false);
  assert.ok(none.errors.includes('review request requires at least one evidence reference'));

  const duplicate = validateFhKuikaReviewRequestV1({
    ...value,
    evidence: [...value.evidence, ...value.evidence],
  });
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some((error) => error.includes('duplicate evidenceId')));
});
