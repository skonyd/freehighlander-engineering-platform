import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFullAutoQuorumArtifact,
  fullAutoQuorumCanGrantAuthority,
  fullAutoQuorumIsMergeEvidenceComplete,
  validateFullAutoQuorumArtifact,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

const scope = {
  repository: 'skonyd/freehighlander-engineering-platform',
  headRevision: 'a'.repeat(40),
  baseRevision: 'b'.repeat(40),
  runSnapshotHash: hash('1'),
  policyHash: hash('2'),
  catalogSnapshotHash: hash('3'),
  requiredEvidenceHash: hash('4'),
  reviewScopeHash: hash('5'),
  changeBudgetResultHash: hash('6'),
  runtimeContainmentHash: hash('7'),
  testReviewEvidenceHash: hash('8'),
  candidateEvidenceHash: hash('9'),
};

function reviewer(
  reviewerId,
  logicalRole,
  independenceGroup,
  verdict = 'APPROVE',
  bindingSnapshotHash = hash(reviewerId === 'reviewer-a' ? 'a' : 'b'),
) {
  return {
    reviewerId,
    logicalRole,
    bindingSnapshotHash,
    independenceGroup,
    round: 0,
    peerContextUsed: false,
    verdict,
    findingsHash: hash(reviewerId === 'reviewer-a' ? 'c' : 'd'),
    scopeHash: scope.reviewScopeHash,
  };
}

const reviewerA = reviewer(
  'reviewer-a',
  'autonomous-merge-reviewer-a',
  'provider-a',
);
const reviewerB = reviewer(
  'reviewer-b',
  'autonomous-merge-reviewer-b',
  'provider-b',
);

test('two independent APPROVE reviews create deterministic non-authoritative quorum evidence', () => {
  const first = buildFullAutoQuorumArtifact({
    scope,
    producerIndependenceGroup: 'producer',
    reviewers: [reviewerA, reviewerB],
  });
  const second = buildFullAutoQuorumArtifact({
    scope,
    producerIndependenceGroup: 'producer',
    reviewers: [reviewerB, reviewerA],
  });

  assert.equal(first.status, 'APPROVED');
  assert.equal(first.quorumHash, second.quorumHash);
  assert.equal(first.authorityGranted, false);
  assert.equal(fullAutoQuorumCanGrantAuthority(), false);
  assert.equal(fullAutoQuorumIsMergeEvidenceComplete(first), true);
  assert.doesNotThrow(() => validateFullAutoQuorumArtifact(first));
});

test('reviewer identity and independence must remain distinct from peer and producer', () => {
  assert.throws(
    () =>
      buildFullAutoQuorumArtifact({
        scope,
        producerIndependenceGroup: 'producer',
        reviewers: [reviewerA, { ...reviewerB, reviewerId: reviewerA.reviewerId }],
      }),
    /reviewer ids must differ/,
  );

  assert.throws(
    () =>
      buildFullAutoQuorumArtifact({
        scope,
        producerIndependenceGroup: 'producer',
        reviewers: [reviewerA, { ...reviewerB, logicalRole: reviewerA.logicalRole }],
      }),
    /logical reviewer roles must differ/,
  );

  assert.throws(
    () =>
      buildFullAutoQuorumArtifact({
        scope,
        producerIndependenceGroup: 'producer',
        reviewers: [reviewerA, { ...reviewerB, independenceGroup: reviewerA.independenceGroup }],
      }),
    /independence groups must differ/,
  );

  assert.throws(
    () =>
      buildFullAutoQuorumArtifact({
        scope,
        producerIndependenceGroup: 'provider-a',
        reviewers: [reviewerA, reviewerB],
      }),
    /independent from the producer/,
  );
});

test('round zero is mandatory and peer-aware evidence cannot satisfy autonomous quorum', () => {
  assert.throws(
    () =>
      buildFullAutoQuorumArtifact({
        scope,
        producerIndependenceGroup: 'producer',
        reviewers: [reviewerA, { ...reviewerB, round: 1 }],
      }),
    /independent round zero/,
  );

  assert.throws(
    () =>
      buildFullAutoQuorumArtifact({
        scope,
        producerIndependenceGroup: 'producer',
        reviewers: [reviewerA, { ...reviewerB, peerContextUsed: true }],
      }),
    /may not use peer context/,
  );
});

test('both reviewers must bind to the exact immutable review scope', () => {
  assert.throws(
    () =>
      buildFullAutoQuorumArtifact({
        scope,
        producerIndependenceGroup: 'producer',
        reviewers: [reviewerA, { ...reviewerB, scopeHash: hash('e') }],
      }),
    /scope hash mismatch/,
  );
});

test('one non-approve verdict never produces merge-complete quorum evidence', () => {
  const rejected = buildFullAutoQuorumArtifact({
    scope,
    producerIndependenceGroup: 'producer',
    reviewers: [reviewerA, { ...reviewerB, verdict: 'REJECT' }],
  });
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(fullAutoQuorumIsMergeEvidenceComplete(rejected), false);

  const blocked = buildFullAutoQuorumArtifact({
    scope,
    producerIndependenceGroup: 'producer',
    reviewers: [reviewerA, { ...reviewerB, verdict: 'BLOCKED' }],
  });
  assert.equal(blocked.status, 'BLOCKED');

  const insufficient = buildFullAutoQuorumArtifact({
    scope,
    producerIndependenceGroup: 'producer',
    reviewers: [reviewerA, { ...reviewerB, verdict: 'INSUFFICIENT' }],
  });
  assert.equal(insufficient.status, 'INSUFFICIENT');
});

test('binding snapshot changes create a different quorum identity', () => {
  const first = buildFullAutoQuorumArtifact({
    scope,
    producerIndependenceGroup: 'producer',
    reviewers: [reviewerA, reviewerB],
  });
  const changed = buildFullAutoQuorumArtifact({
    scope,
    producerIndependenceGroup: 'producer',
    reviewers: [
      reviewerA,
      { ...reviewerB, bindingSnapshotHash: hash('f') },
    ],
  });

  assert.notEqual(first.quorumHash, changed.quorumHash);
});

test('tampered status or hash is rejected fail-closed', () => {
  const artifact = buildFullAutoQuorumArtifact({
    scope,
    producerIndependenceGroup: 'producer',
    reviewers: [reviewerA, reviewerB],
  });

  assert.throws(
    () => validateFullAutoQuorumArtifact({ ...artifact, status: 'BLOCKED' }),
    /status mismatch/,
  );
  assert.throws(
    () => validateFullAutoQuorumArtifact({ ...artifact, quorumHash: hash('0') }),
    /hash mismatch/,
  );
});
