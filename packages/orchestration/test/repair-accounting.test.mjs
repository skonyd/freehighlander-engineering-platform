import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyRepairEvent,
  createRepairAccountingState,
  repairAccountingCanGrantAuthority,
  staleArtifactCanAdvanceRepairRound,
  transportFailureConsumesSemanticRepairBudget,
  validateRepairAccountingState,
} from '../dist/index.js';

const REV1 = '1'.repeat(40);
const REV2 = '2'.repeat(40);
const REV3 = '3'.repeat(40);

test('transport retry accounting is separate from semantic repair budget', () => {
  const initial = createRepairAccountingState({
    maxSemanticRepairs: 2,
    maxTransportRetries: 1,
  });

  const first = applyRepairEvent(initial, { kind: 'TRANSPORT_FAILURE' });
  assert.equal(first.nextAction, 'RETRY_TRANSPORT');
  assert.equal(first.state.transportRetries, 1);
  assert.equal(first.state.semanticRepairs, 0);
  assert.equal(first.semanticBudgetConsumed, false);

  const second = applyRepairEvent(first.state, { kind: 'TRANSPORT_FAILURE' });
  assert.equal(second.nextAction, 'OPERATOR_REQUIRED');
  assert.equal(second.state.transportRetries, 2);
  assert.equal(second.state.semanticRepairs, 0);
  assert.equal(second.semanticBudgetConsumed, false);

  assert.equal(transportFailureConsumesSemanticRepairBudget(), false);
});

test('only a current new repaired revision consumes semantic repair budget', () => {
  const initial = createRepairAccountingState({
    maxSemanticRepairs: 2,
    maxTransportRetries: 3,
  });

  const stale = applyRepairEvent(initial, {
    kind: 'SEMANTIC_REPAIR_ACCEPTED',
    repairedRevision: REV1,
    artifactCurrent: false,
    reviewScopeMatches: true,
  });
  assert.equal(stale.nextAction, 'IGNORE_STALE');
  assert.equal(stale.state.semanticRepairs, 0);

  const mismatch = applyRepairEvent(initial, {
    kind: 'SEMANTIC_REPAIR_ACCEPTED',
    repairedRevision: REV1,
    artifactCurrent: true,
    reviewScopeMatches: false,
  });
  assert.equal(mismatch.nextAction, 'IGNORE_STALE');
  assert.equal(mismatch.state.semanticRepairs, 0);

  const first = applyRepairEvent(initial, {
    kind: 'SEMANTIC_REPAIR_ACCEPTED',
    repairedRevision: REV1,
    artifactCurrent: true,
    reviewScopeMatches: true,
  });
  assert.equal(first.nextAction, 'REVIEW_REPAIRED_REVISION');
  assert.equal(first.state.semanticRepairs, 1);
  assert.equal(first.state.lastAcceptedRepairRevision, REV1);
  assert.equal(first.semanticBudgetConsumed, true);

  const duplicate = applyRepairEvent(first.state, {
    kind: 'SEMANTIC_REPAIR_ACCEPTED',
    repairedRevision: REV1,
    artifactCurrent: true,
    reviewScopeMatches: true,
  });
  assert.equal(duplicate.nextAction, 'IGNORE_STALE');
  assert.equal(duplicate.state.semanticRepairs, 1);

  const explicitStale = applyRepairEvent(first.state, {
    kind: 'STALE_OR_MISMATCHED_ARTIFACT',
  });
  assert.equal(explicitStale.nextAction, 'IGNORE_STALE');
  assert.equal(explicitStale.state.semanticRepairs, 1);
  assert.equal(staleArtifactCanAdvanceRepairRound(), false);
});

test(
  'final allowed repair is reviewed and the next semantic repair escalates deterministically',
  () => {
  let state = createRepairAccountingState({
    maxSemanticRepairs: 2,
    maxTransportRetries: 2,
  });

  for (const revision of [REV1, REV2]) {
    const decision = applyRepairEvent(state, {
      kind: 'SEMANTIC_REPAIR_ACCEPTED',
      repairedRevision: revision,
      artifactCurrent: true,
      reviewScopeMatches: true,
    });
    assert.equal(decision.nextAction, 'REVIEW_REPAIRED_REVISION');
    state = decision.state;
  }

  assert.equal(state.semanticRepairs, 2);
  assert.equal(state.exhausted, true);

  const transport = applyRepairEvent(state, { kind: 'TRANSPORT_FAILURE' });
  assert.equal(transport.nextAction, 'RETRY_TRANSPORT');
  assert.equal(transport.state.semanticRepairs, 2);

  const anotherRepair = applyRepairEvent(transport.state, {
    kind: 'SEMANTIC_REPAIR_ACCEPTED',
    repairedRevision: REV3,
    artifactCurrent: true,
    reviewScopeMatches: true,
  });
  assert.equal(anotherRepair.nextAction, 'HUMAN_REQUIRED');
  assert.equal(anotherRepair.semanticBudgetConsumed, false);
  assert.equal(anotherRepair.state.semanticRepairs, 2);

    const success = applyRepairEvent(state, { kind: 'SUCCESS' });
    assert.equal(success.nextAction, 'COMPLETE');
    assert.equal(success.state.semanticRepairs, 2);
  },
);

test('repair accounting validation rejects malformed policy state and revisions', () => {
  assert.throws(
    () => createRepairAccountingState({ maxSemanticRepairs: 0, maxTransportRetries: 1 }),
    /maxSemanticRepairs/,
  );
  assert.throws(
    () => createRepairAccountingState({ maxSemanticRepairs: 1, maxTransportRetries: -1 }),
    /maxTransportRetries/,
  );

  const initial = createRepairAccountingState({
    maxSemanticRepairs: 1,
    maxTransportRetries: 1,
  });
  assert.throws(
    () =>
      applyRepairEvent(initial, {
        kind: 'SEMANTIC_REPAIR_ACCEPTED',
        repairedRevision: 'bad',
        artifactCurrent: true,
        reviewScopeMatches: true,
      }),
    /Git revision hash/,
  );

  assert.throws(
    () => validateRepairAccountingState({ ...initial, authority: 'SYSTEM' }),
    /authority must be NONE/,
  );
  assert.throws(
    () =>
      validateRepairAccountingState({
        ...initial,
        semanticRepairs: 1,
        exhausted: true,
      }),
    /lastAcceptedRepairRevision/,
  );
  assert.throws(
    () =>
      validateRepairAccountingState({
        ...initial,
        lastAcceptedRepairRevision: REV1,
      }),
    /requires a semantic repair/,
  );

  assert.equal(repairAccountingCanGrantAuthority(), false);
});
