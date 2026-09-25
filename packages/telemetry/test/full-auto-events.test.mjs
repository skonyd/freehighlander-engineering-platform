import assert from 'node:assert/strict';
import test from 'node:test';

import { createFullAutoEvent } from '../dist/index.js';

const hash = (character) => character.repeat(64);

function basePayload(overrides = {}) {
  return {
    action: 'QUORUM',
    profile: 'BALANCED',
    riskTier: 'HIGH',
    exactRevision: 'a'.repeat(40),
    reviewScopeHash: hash('1'),
    bindingSnapshotHash: hash('2'),
    quorumHash: hash('3'),
    reviewerABindingId: 'reviewer-a-binding',
    reviewerAModel: 'model-a',
    reviewerAEffort: 'medium',
    reviewerAIndependenceGroup: 'group-a',
    reviewerAVerdict: 'APPROVE',
    reviewerBBindingId: 'reviewer-b-binding',
    reviewerBModel: 'model-b',
    reviewerBEffort: 'low',
    reviewerBIndependenceGroup: 'group-b',
    reviewerBVerdict: 'APPROVE',
    roundCount: 1,
    quorumStatus: 'APPROVED',
    ...overrides,
  };
}

function event(type, payload) {
  return createFullAutoEvent({
    type,
    timestamp: '2026-09-25T17:00:00.000Z',
    runId: 'run-full-auto',
    payload,
  });
}

test('Full Auto quorum telemetry records reviewer metadata without raw prompt content', () => {
  const result = event('full_auto.quorum.completed', basePayload());

  assert.equal(result.payload.action, 'QUORUM');
  assert.equal(result.payload.reviewerAModel, 'model-a');
  assert.equal(result.payload.reviewerBModel, 'model-b');
  assert.equal(result.payload.quorumStatus, 'APPROVED');
  assert.equal(result.schemaVersion, 1);
});

test('Full Auto merge intent telemetry binds quorum policy and decision hashes', () => {
  const result = event(
    'full_auto.merge.intent',
    basePayload({
      action: 'MERGE_INTENT',
      decisionHash: hash('4'),
      policyHash: hash('5'),
      policyDecision: 'MODEL_QUORUM_REQUIRED',
      intentStatus: 'SHADOW_INTENT_READY',
    }),
  );

  assert.equal(result.payload.action, 'MERGE_INTENT');
  assert.equal(result.payload.intentStatus, 'SHADOW_INTENT_READY');
  assert.equal(result.payload.policyDecision, 'MODEL_QUORUM_REQUIRED');
});

test('Full Auto merge result records attempted succeeded or blocked outcome', () => {
  const succeeded = event(
    'full_auto.merge.result',
    basePayload({
      action: 'MERGE_RESULT',
      decisionHash: hash('4'),
      mergeAttempted: true,
      mergeSucceeded: true,
      resultStatus: 'SUCCEEDED',
    }),
  );
  assert.equal(succeeded.payload.mergeSucceeded, true);

  const blocked = event(
    'full_auto.merge.result',
    basePayload({
      action: 'MERGE_RESULT',
      decisionHash: hash('4'),
      mergeAttempted: false,
      mergeSucceeded: false,
      resultStatus: 'BLOCKED',
      reasonCode: 'REMOTE_HEAD_MISMATCH',
    }),
  );
  assert.equal(blocked.payload.resultStatus, 'BLOCKED');
  assert.equal(blocked.payload.reasonCode, 'REMOTE_HEAD_MISMATCH');
});

test('Full Auto event type must match its action', () => {
  assert.throws(
    () =>
      event(
        'full_auto.merge.intent',
        basePayload({
          action: 'QUORUM',
        }),
      ),
    /action does not match event type/,
  );
});

test('action-specific required metadata fails closed', () => {
  const quorum = basePayload();
  delete quorum.reviewerAVerdict;
  assert.throws(() => event('full_auto.quorum.completed', quorum), /requires reviewerAVerdict/);

  assert.throws(
    () =>
      event(
        'full_auto.merge.intent',
        basePayload({
          action: 'MERGE_INTENT',
          policyDecision: 'MODEL_QUORUM_REQUIRED',
          intentStatus: 'SHADOW_INTENT_READY',
        }),
      ),
    /requires decisionHash/,
  );

  assert.throws(
    () =>
      event(
        'full_auto.merge.result',
        basePayload({
          action: 'MERGE_RESULT',
          decisionHash: hash('4'),
          mergeAttempted: false,
          mergeSucceeded: true,
          resultStatus: 'SUCCEEDED',
        }),
      ),
    /cannot succeed without an attempted merge/,
  );
});

test('Full Auto telemetry rejects raw prompt secret or unknown fields by whitelist', () => {
  for (const [field, value] of [
    ['prompt', 'hidden prompt'],
    ['rawResponse', 'raw model response'],
    ['secretValue', 'secret'],
  ]) {
    assert.throws(
      () =>
        event('full_auto.quorum.completed', {
          ...basePayload(),
          [field]: value,
        }),
      /field is not allowed/,
    );
  }
});

test('Full Auto telemetry validates hashes profiles risk and bounded round count', () => {
  assert.throws(
    () => event('full_auto.quorum.completed', basePayload({ reviewScopeHash: 'bad' })),
    /reviewScopeHash/,
  );
  assert.throws(
    () => event('full_auto.quorum.completed', basePayload({ profile: 'UNKNOWN' })),
    /profile is invalid/,
  );
  assert.throws(
    () => event('full_auto.quorum.completed', basePayload({ riskTier: 'UNKNOWN' })),
    /riskTier is invalid/,
  );
  assert.throws(
    () => event('full_auto.quorum.completed', basePayload({ roundCount: 0 })),
    /roundCount/,
  );
});
