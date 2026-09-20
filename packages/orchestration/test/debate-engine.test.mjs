import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDebateSnapshot,
  createDebateSession,
  debateConfigurationCanGrantAuthority,
  debateConsensusCanGrantAuthority,
  evaluateDebate,
  publishDebate,
  recordDebateOpinion,
} from '../dist/index.js';

const debate = publishDebate({
  id: 'review-council',
  version: '1.0.0',
  maxRounds: 2,
  participants: [
    { id: 'security', roleVersion: 'security-reviewer@1.0.0', independenceGroup: 'security' },
    { id: 'testing', roleVersion: 'test-reviewer@1.0.0', independenceGroup: 'testing' },
  ],
});

function opinion(participantId, round, verdict, peerContextUsed = false) {
  return {
    participantId,
    round,
    verdict,
    evidenceHash: `${participantId}-${round}-evidence`,
    peerContextUsed,
  };
}

test('debate definition is deterministic and participant-order independent', () => {
  const first = debate;
  const second = publishDebate({
    ...first.definition,
    participants: [...first.definition.participants].reverse(),
  });

  assert.equal(first.debateHash, second.debateHash);
});

test('invalid participants and unbounded rounds fail closed', () => {
  assert.throws(
    () =>
      publishDebate({
        id: 'bad',
        version: '1.0.0',
        maxRounds: 0,
        participants: debate.definition.participants,
      }),
    /maxRounds/,
  );

  assert.throws(
    () =>
      publishDebate({
        id: 'duplicate',
        version: '1.0.0',
        maxRounds: 1,
        participants: [debate.definition.participants[0], debate.definition.participants[0]],
      }),
    /duplicate debate participant/,
  );
});

test('round zero must be independent', () => {
  const session = createDebateSession(debate);
  assert.throws(
    () => recordDebateOpinion(session, opinion('security', 0, 'PASS', true)),
    /round zero must be independent/,
  );
});

test('one opinion per participant per round is enforced', () => {
  let session = createDebateSession(debate);
  session = recordDebateOpinion(session, opinion('security', 0, 'PASS'));

  assert.throws(
    () => recordDebateOpinion(session, opinion('security', 0, 'FAIL')),
    /duplicate debate opinion/,
  );
});

test('unanimous completed round returns non-authoritative consensus', () => {
  let session = createDebateSession(debate);
  session = recordDebateOpinion(session, opinion('security', 0, 'PASS'));
  session = recordDebateOpinion(session, opinion('testing', 0, 'PASS'));

  const outcome = evaluateDebate(session);
  assert.equal(outcome.status, 'CONSENSUS');
  assert.equal(outcome.consensusVerdict, 'PASS');
  assert.equal(outcome.authorityGranted, false);
  assert.equal(debateConsensusCanGrantAuthority(), false);
});

test('disagreement continues while bounded rounds remain', () => {
  let session = createDebateSession(debate);
  session = recordDebateOpinion(session, opinion('security', 0, 'PASS'));
  session = recordDebateOpinion(session, opinion('testing', 0, 'FAIL'));

  const outcome = evaluateDebate(session);
  assert.equal(outcome.status, 'CONTINUE');
  assert.equal(outcome.nextRound, 1);
  assert.equal(outcome.authorityGranted, false);
});

test('unresolved final-round disagreement escalates to human', () => {
  let session = createDebateSession(debate);
  session = recordDebateOpinion(session, opinion('security', 0, 'PASS'));
  session = recordDebateOpinion(session, opinion('testing', 0, 'FAIL'));
  session = recordDebateOpinion(session, opinion('security', 1, 'PASS', true));
  session = recordDebateOpinion(session, opinion('testing', 1, 'FAIL', true));

  const outcome = evaluateDebate(session);
  assert.equal(outcome.status, 'HUMAN_REQUIRED');
  assert.equal(outcome.authorityGranted, false);
});

test('later rounds cannot skip an incomplete prior round', () => {
  let session = createDebateSession(debate);
  session = recordDebateOpinion(session, opinion('security', 0, 'PASS'));

  assert.throws(
    () => recordDebateOpinion(session, opinion('testing', 1, 'FAIL', true)),
    /previous debate round must be complete/,
  );
});

test('debate snapshot is deterministic for opinion insertion order', () => {
  let first = createDebateSession(debate);
  first = recordDebateOpinion(first, opinion('security', 0, 'PASS'));
  first = recordDebateOpinion(first, opinion('testing', 0, 'PASS'));

  let second = createDebateSession(debate);
  second = recordDebateOpinion(second, opinion('testing', 0, 'PASS'));
  second = recordDebateOpinion(second, opinion('security', 0, 'PASS'));

  assert.equal(buildDebateSnapshot(first).snapshotHash, buildDebateSnapshot(second).snapshotHash);
});

test('debate configuration cannot grant authority', () => {
  assert.equal(debateConfigurationCanGrantAuthority(), false);
});
