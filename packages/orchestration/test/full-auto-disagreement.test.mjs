import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFullAutoReviewCouncil,
  createFullAutoReviewSession,
  evaluateFullAutoReviewCouncil,
  fullAutoBoundedDisagreementCanGrantAuthority,
  fullAutoNonApproveConsensusCanMerge,
  recordFullAutoReviewerOpinion,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

function council(maxRounds = 2) {
  return createFullAutoReviewCouncil({
    id: 'full-auto-review',
    version: '1.0.0',
    maxRounds,
    reviewScopeHash: hash('1'),
    runSnapshotHash: hash('2'),
    producerIndependenceGroup: 'producer',
    reviewers: [
      {
        id: 'reviewer-a',
        logicalRole: 'autonomous-merge-reviewer-a',
        bindingSnapshotHash: hash('a'),
        independenceGroup: 'group-a',
      },
      {
        id: 'reviewer-b',
        logicalRole: 'autonomous-merge-reviewer-b',
        bindingSnapshotHash: hash('b'),
        independenceGroup: 'group-b',
      },
    ],
  });
}

function opinion(reviewerId, round, verdict, peerContextUsed = false) {
  return {
    reviewerId,
    round,
    verdict,
    evidenceHash: hash(reviewerId === 'reviewer-a' ? 'c' : 'd'),
    peerContextUsed,
  };
}

test('round zero remains independent and unanimous APPROVE creates non-authoritative evidence', () => {
  let session = createFullAutoReviewSession(council());
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-a', 0, 'APPROVE'),
  );
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-b', 0, 'APPROVE'),
  );

  const outcome = evaluateFullAutoReviewCouncil(session);
  assert.equal(outcome.status, 'APPROVED');
  assert.equal(outcome.consensusVerdict, 'APPROVE');
  assert.equal(outcome.round, 0);
  assert.match(outcome.consensusEvidenceHash, /^[a-f0-9]{64}$/);
  assert.equal(outcome.authorityGranted, false);
  assert.equal(fullAutoBoundedDisagreementCanGrantAuthority(), false);
});

test('round-zero disagreement requests one bounded peer-aware round when available', () => {
  let session = createFullAutoReviewSession(council(2));
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-a', 0, 'APPROVE'),
  );
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-b', 0, 'REJECT'),
  );

  const outcome = evaluateFullAutoReviewCouncil(session);
  assert.equal(outcome.status, 'PEER_ROUND_REQUIRED');
  assert.equal(outcome.nextRound, 1);
  assert.equal(outcome.authorityGranted, false);
});

test('peer-aware final round may approve only with unanimous APPROVE', () => {
  let session = createFullAutoReviewSession(council(2));
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-a', 0, 'APPROVE'),
  );
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-b', 0, 'REJECT'),
  );
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-a', 1, 'APPROVE', true),
  );
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-b', 1, 'APPROVE', true),
  );

  const outcome = evaluateFullAutoReviewCouncil(session);
  assert.equal(outcome.status, 'APPROVED');
  assert.equal(outcome.consensusVerdict, 'APPROVE');
  assert.equal(outcome.round, 1);
});

test('bounded disagreement exhaustion becomes HUMAN_REQUIRED', () => {
  let session = createFullAutoReviewSession(council(2));
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-a', 0, 'APPROVE'),
  );
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-b', 0, 'REJECT'),
  );
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-a', 1, 'APPROVE', true),
  );
  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-b', 1, 'REJECT', true),
  );

  const outcome = evaluateFullAutoReviewCouncil(session);
  assert.equal(outcome.status, 'HUMAN_REQUIRED');
  assert.equal(outcome.authorityGranted, false);
});

test('unanimous non-approve consensus is terminal and cannot merge', () => {
  for (const verdict of ['REJECT', 'BLOCKED', 'INSUFFICIENT']) {
    let session = createFullAutoReviewSession(council());
    session = recordFullAutoReviewerOpinion(
      session,
      opinion('reviewer-a', 0, verdict),
    );
    session = recordFullAutoReviewerOpinion(
      session,
      opinion('reviewer-b', 0, verdict),
    );

    const outcome = evaluateFullAutoReviewCouncil(session);
    assert.equal(outcome.status, 'BLOCKED_BY_REVIEW');
    assert.equal(outcome.consensusVerdict, verdict);
  }
  assert.equal(fullAutoNonApproveConsensusCanMerge(), false);
});

test('round zero peer context and skipped rounds remain rejected by debate engine', () => {
  let session = createFullAutoReviewSession(council(2));
  assert.throws(
    () =>
      recordFullAutoReviewerOpinion(
        session,
        opinion('reviewer-a', 0, 'APPROVE', true),
      ),
    /round zero must be independent/,
  );

  session = recordFullAutoReviewerOpinion(
    session,
    opinion('reviewer-a', 0, 'APPROVE'),
  );
  assert.throws(
    () =>
      recordFullAutoReviewerOpinion(
        session,
        opinion('reviewer-b', 1, 'APPROVE', true),
      ),
    /previous debate round must be complete/,
  );
});

test('reviewer and producer independence is validated before session creation', () => {
  assert.throws(
    () =>
      createFullAutoReviewCouncil({
        id: 'bad',
        version: '1.0.0',
        maxRounds: 2,
        reviewScopeHash: hash('1'),
        runSnapshotHash: hash('2'),
        producerIndependenceGroup: 'group-a',
        reviewers: [
          {
            id: 'reviewer-a',
            logicalRole: 'reviewer-a',
            bindingSnapshotHash: hash('a'),
            independenceGroup: 'group-a',
          },
          {
            id: 'reviewer-b',
            logicalRole: 'reviewer-b',
            bindingSnapshotHash: hash('b'),
            independenceGroup: 'group-b',
          },
        ],
      }),
    /independent from producer/,
  );

  assert.throws(
    () =>
      createFullAutoReviewCouncil({
        id: 'bad',
        version: '1.0.0',
        maxRounds: 2,
        reviewScopeHash: hash('1'),
        runSnapshotHash: hash('2'),
        producerIndependenceGroup: 'producer',
        reviewers: [
          {
            id: 'reviewer-a',
            logicalRole: 'reviewer-a',
            bindingSnapshotHash: hash('a'),
            independenceGroup: 'same',
          },
          {
            id: 'reviewer-b',
            logicalRole: 'reviewer-b',
            bindingSnapshotHash: hash('b'),
            independenceGroup: 'same',
          },
        ],
      }),
    /independence groups must differ/,
  );
});

test('council identity changes with exact scope or binding snapshot', () => {
  const first = council();
  const changedScope = createFullAutoReviewCouncil({
    id: 'full-auto-review',
    version: '1.0.0',
    maxRounds: 2,
    reviewScopeHash: hash('9'),
    runSnapshotHash: hash('2'),
    producerIndependenceGroup: 'producer',
    reviewers: first.reviewers,
  });
  const changedBinding = createFullAutoReviewCouncil({
    id: 'full-auto-review',
    version: '1.0.0',
    maxRounds: 2,
    reviewScopeHash: hash('1'),
    runSnapshotHash: hash('2'),
    producerIndependenceGroup: 'producer',
    reviewers: [
      first.reviewers[0],
      { ...first.reviewers[1], bindingSnapshotHash: hash('e') },
    ],
  });

  assert.notEqual(first.councilHash, changedScope.councilHash);
  assert.notEqual(first.councilHash, changedBinding.councilHash);
});
