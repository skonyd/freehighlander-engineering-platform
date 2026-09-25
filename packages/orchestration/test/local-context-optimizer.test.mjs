import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateLocalOptimizerPass,
  localOptimizerCanDropRequiredEvidenceForTarget,
  localOptimizerCanGrantAuthority,
  localOptimizerCanRunRemoteBinding,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

function binding(overrides = {}) {
  return {
    bindingId: 'context-optimizer-local',
    bindingPlanHash: hash('1'),
    qualificationHash: hash('2'),
    modelId: 'local-model',
    providerId: 'local-provider',
    locality: 'LOCAL',
    eligibleForRoleRisk: true,
    ...overrides,
  };
}

function policy(overrides = {}) {
  return {
    targetRemoteTokens: 1000,
    maxLocalPasses: 4,
    minimumIncrementalSavingTokens: 100,
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    pass: 1,
    inputTokens: 2000,
    outputTokens: 1500,
    requiredEvidenceTokens: 500,
    protectedAnchorVerificationPassed: true,
    optimizerHealthy: true,
    ...overrides,
  };
}

test('healthy useful pass continues local optimization while above target', () => {
  const result = evaluateLocalOptimizerPass(binding(), policy(), observation());

  assert.equal(result.nextAction, 'CONTINUE_LOCAL');
  assert.equal(result.stopReason, undefined);
  assert.equal(result.incrementalSavingTokens, 500);
  assert.equal(result.authority, 'NONE');
});

test('target reached stops local passes and proceeds with remote packet', () => {
  const result = evaluateLocalOptimizerPass(
    binding(),
    policy(),
    observation({ outputTokens: 900, requiredEvidenceTokens: 500 }),
  );

  assert.equal(result.nextAction, 'READY_FOR_REMOTE');
  assert.equal(result.stopReason, 'TARGET_REACHED');
});

test('required evidence may exceed target without being dropped', () => {
  const result = evaluateLocalOptimizerPass(
    binding(),
    policy(),
    observation({
      inputTokens: 1800,
      outputTokens: 1400,
      requiredEvidenceTokens: 1200,
    }),
  );

  assert.equal(result.nextAction, 'READY_FOR_REMOTE');
  assert.equal(result.stopReason, 'REQUIRED_EVIDENCE_DOMINATES');
  assert.equal(localOptimizerCanDropRequiredEvidenceForTarget(), false);
});

test('maximum local pass count bounds optimization loops', () => {
  const result = evaluateLocalOptimizerPass(
    binding(),
    policy({ maxLocalPasses: 2 }),
    observation({ pass: 2 }),
  );

  assert.equal(result.nextAction, 'READY_FOR_REMOTE');
  assert.equal(result.stopReason, 'MAX_PASSES_REACHED');
});

test('small incremental saving stops further local optimization', () => {
  const result = evaluateLocalOptimizerPass(
    binding(),
    policy({ minimumIncrementalSavingTokens: 200 }),
    observation({ inputTokens: 1600, outputTokens: 1500 }),
  );

  assert.equal(result.nextAction, 'READY_FOR_REMOTE');
  assert.equal(result.stopReason, 'MIN_INCREMENTAL_SAVING_NOT_MET');
  assert.equal(result.incrementalSavingTokens, 100);
});

test('protected-anchor failure rejects optimized packet and falls back uncompressed', () => {
  const result = evaluateLocalOptimizerPass(
    binding(),
    policy(),
    observation({ protectedAnchorVerificationPassed: false }),
  );

  assert.equal(result.nextAction, 'FALLBACK_UNCOMPRESSED');
  assert.equal(result.stopReason, 'PROTECTED_ANCHOR_FAILED');
});

test('unhealthy local optimizer falls back without a remote semantic substitution', () => {
  const result = evaluateLocalOptimizerPass(
    binding(),
    policy(),
    observation({ optimizerHealthy: false }),
  );

  assert.equal(result.nextAction, 'FALLBACK_UNCOMPRESSED');
  assert.equal(result.stopReason, 'OPTIMIZER_UNHEALTHY');
});

test('remote or non-eligible binding cannot act as local optimizer', () => {
  assert.throws(
    () => evaluateLocalOptimizerPass(binding({ locality: 'REMOTE' }), policy(), observation()),
    /requires LOCAL binding/,
  );
  assert.throws(
    () =>
      evaluateLocalOptimizerPass(
        binding({ eligibleForRoleRisk: false }),
        policy(),
        observation(),
      ),
    /must be eligible for role\/risk/,
  );

  assert.equal(localOptimizerCanRunRemoteBinding(), false);
});

test('decision identity is exact-bound to binding qualification and pass observation', () => {
  const first = evaluateLocalOptimizerPass(binding(), policy(), observation());
  const differentQualification = evaluateLocalOptimizerPass(
    binding({ qualificationHash: hash('3') }),
    policy(),
    observation(),
  );
  const differentPass = evaluateLocalOptimizerPass(
    binding(),
    policy(),
    observation({ pass: 2 }),
  );

  assert.notEqual(first.decisionHash, differentQualification.decisionHash);
  assert.notEqual(first.decisionHash, differentPass.decisionHash);
});

test('optimizer control remains authority-neutral', () => {
  assert.equal(localOptimizerCanGrantAuthority(), false);
});

test('invalid policies observations and binding identities fail closed', () => {
  assert.throws(
    () => evaluateLocalOptimizerPass(binding(), policy({ targetRemoteTokens: -1 }), observation()),
    /targetRemoteTokens/,
  );
  assert.throws(
    () => evaluateLocalOptimizerPass(binding(), policy({ maxLocalPasses: 0 }), observation()),
    /maxLocalPasses/,
  );
  assert.throws(
    () =>
      evaluateLocalOptimizerPass(
        binding(),
        policy({ minimumIncrementalSavingTokens: -1 }),
        observation(),
      ),
    /minimumIncrementalSavingTokens/,
  );
  assert.throws(
    () => evaluateLocalOptimizerPass(binding(), policy(), observation({ pass: 0 })),
    /optimizer pass/,
  );
  assert.throws(
    () =>
      evaluateLocalOptimizerPass(
        binding(),
        policy(),
        observation({ outputTokens: 400, requiredEvidenceTokens: 500 }),
      ),
    /cannot exceed outputTokens/,
  );
  assert.throws(
    () =>
      evaluateLocalOptimizerPass(
        binding({ bindingPlanHash: 'bad' }),
        policy(),
        observation(),
      ),
    /bindingPlanHash/,
  );
});
