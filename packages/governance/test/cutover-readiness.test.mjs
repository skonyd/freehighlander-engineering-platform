import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cutoverCanBypassFinalReferenceAcceptance,
  cutoverReadinessCanEnableAuthority,
  evaluateV3CutoverReadiness,
} from '../dist/index.js';

const ready = {
  provisionalReferenceSha: 'provisional-sha',
  finalAcceptedReferenceSha: 'final-sha',
  parityReferenceSha: 'final-sha',
  referenceStatus: 'ACCEPTED',
  deltaReviewed: true,
  paritySuitePassed: true,
  postPortSmokePassed: true,
  authorityPromotionReviewed: true,
  humanApprovalVerified: true,
  policyDecision: 'ALLOW',
  parityStatus: 'PASS',
};

test('all prerequisites produce READY without enabling authority', () => {
  const result = evaluateV3CutoverReadiness(ready);

  assert.equal(result.status, 'READY');
  assert.equal(result.cutoverMayBeApplied, true);
  assert.equal(result.authorityEnabled, false);
  assert.deepEqual(result.reasons, []);
  assert.equal(cutoverReadinessCanEnableAuthority(), false);
  assert.equal(cutoverCanBypassFinalReferenceAcceptance(), false);
});

test('provisional reference blocks cutover even when every other signal passes', () => {
  const result = evaluateV3CutoverReadiness({
    ...ready,
    referenceStatus: 'PROVISIONAL',
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.cutoverMayBeApplied, false);
  assert.equal(result.authorityEnabled, false);
  assert.match(result.reasons.join('\n'), /must be ACCEPTED/);
});

test('parity PASS alone is insufficient', () => {
  const result = evaluateV3CutoverReadiness({
    ...ready,
    referenceStatus: 'PROVISIONAL',
    finalAcceptedReferenceSha: undefined,
    parityReferenceSha: undefined,
    deltaReviewed: false,
    postPortSmokePassed: false,
    authorityPromotionReviewed: false,
    humanApprovalVerified: false,
    policyDecision: 'HUMAN_REQUIRED',
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.cutoverMayBeApplied, false);
  assert.ok(result.reasons.length >= 6);
});

test('final-reference and parity-reference SHA mismatch blocks cutover', () => {
  const result = evaluateV3CutoverReadiness({
    ...ready,
    parityReferenceSha: 'other-sha',
  });

  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reasons.join('\n'), /must match final accepted/);
});

test('negative parity, smoke, human or policy signal fails closed', () => {
  for (const mutation of [
    { parityStatus: 'MISMATCH' },
    { paritySuitePassed: false },
    { postPortSmokePassed: false },
    { authorityPromotionReviewed: false },
    { humanApprovalVerified: false },
    { policyDecision: 'DENY' },
  ]) {
    const result = evaluateV3CutoverReadiness({ ...ready, ...mutation });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.authorityEnabled, false);
  }
});

test('missing provisional reference identity fails closed', () => {
  assert.throws(
    () => evaluateV3CutoverReadiness({ ...ready, provisionalReferenceSha: ' ' }),
    /provisionalReferenceSha is required/,
  );
});
