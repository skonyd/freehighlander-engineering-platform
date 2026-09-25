import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEconomyLedger,
  buildOfflineEconomyCalibrationReport,
  economyCalibrationCanGrantAuthority,
  economyQualificationCanIgnoreParityMismatch,
  evaluatePruningCacheImpact,
  productionEconomyRequiresLiveDuplicateStandardCall,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

function ledger(overrides = {}) {
  return buildEconomyLedger({
    candidateRemoteInputTokens: 1000,
    reductions: {
      exactDedupeTokens: 100,
      staleSupersededTokens: 100,
      artifactizationTokens: 100,
      repoMapJitTokens: 100,
      lazyToolSchemaTokens: 100,
      localCompressionTokens: 0,
      nodeResultReuseTokens: 0,
    },
    finalRemoteInputTokens: 500,
    remoteOutputTokens: 100,
    cachedInputTokens: 100,
    remoteCallsAvoided: 1,
    localOnlyCalls: 1,
    extraLocalDurationMs: 500,
    ...overrides,
  });
}

function fixture(id, overrides = {}) {
  return {
    fixtureId: id,
    riskTier: 'NORMAL',
    standardOutcomeHash: hash('a'),
    economyOutcomeHash: hash('a'),
    standardProtectedEvidenceHash: hash('b'),
    economyProtectedEvidenceHash: hash('b'),
    economyLedger: ledger(),
    duplicateStandardRemoteCallPerformed: false,
    ...overrides,
  };
}

const policy = {
  minimumSamples: 2,
  requireZeroParityMismatches: true,
  requireZeroProtectedEvidenceMismatches: true,
};

test('offline corpus qualifies only with exact outcome and protected-evidence parity', () => {
  const report = buildOfflineEconomyCalibrationReport(
    [fixture('normal-1'), fixture('normal-2')],
    policy,
  );

  assert.equal(report.status, 'QUALIFIED');
  assert.equal(report.qualifiedForLossyReduction, true);
  assert.equal(report.sampleCount, 2);
  assert.equal(report.standardRemoteInputTokens, 2000);
  assert.equal(report.economyRemoteInputTokens, 1000);
  assert.equal(report.remoteInputTokensAvoided, 1000);
  assert.equal(report.remoteCallsAvoided, 2);
  assert.equal(report.cacheTokensReportedSeparately, 200);
  assert.equal(report.authority, 'NONE');
});

test('semantic outcome mismatch blocks Economy qualification', () => {
  const report = buildOfflineEconomyCalibrationReport(
    [
      fixture('normal-1'),
      fixture('normal-2', {
        economyOutcomeHash: hash('c'),
      }),
    ],
    policy,
  );

  assert.equal(report.status, 'PARITY_MISMATCH');
  assert.deepEqual(report.parityMismatches, ['normal-2']);
  assert.equal(report.qualifiedForLossyReduction, false);
  assert.equal(economyQualificationCanIgnoreParityMismatch(), false);
});

test('protected evidence mismatch takes precedence over ordinary outcome qualification', () => {
  const report = buildOfflineEconomyCalibrationReport(
    [
      fixture('normal-1'),
      fixture('normal-2', {
        economyProtectedEvidenceHash: hash('d'),
      }),
    ],
    policy,
  );

  assert.equal(report.status, 'PROTECTED_EVIDENCE_MISMATCH');
  assert.deepEqual(report.protectedEvidenceMismatches, ['normal-2']);
  assert.equal(report.qualifiedForLossyReduction, false);
});

test('qualification is offline and rejects mandatory duplicate live Standard calls', () => {
  const report = buildOfflineEconomyCalibrationReport(
    [
      fixture('normal-1'),
      fixture('normal-2', {
        duplicateStandardRemoteCallPerformed: true,
      }),
    ],
    policy,
  );

  assert.equal(report.status, 'LIVE_DUPLICATE_A_B_FORBIDDEN');
  assert.equal(productionEconomyRequiresLiveDuplicateStandardCall(), false);
});

test('minimum corpus size is explicit and bounded', () => {
  const report = buildOfflineEconomyCalibrationReport([fixture('normal-1')], policy);
  assert.equal(report.status, 'INSUFFICIENT_SAMPLES');
  assert.equal(report.qualifiedForLossyReduction, false);
});

test('pruning reports context saving and lost cache separately', () => {
  const impact = evaluatePruningCacheImpact({
    contextTokensBefore: 12000,
    contextTokensAfter: 7000,
    cachedInputTokensBefore: 6000,
    cachedInputTokensAfter: 3000,
  });

  assert.equal(impact.contextTokensRemoved, 5000);
  assert.equal(impact.cachedInputTokensLost, 3000);
  assert.equal(impact.cacheAdjustedTokenBenefit, 2000);
  assert.equal(impact.contextReductionBeneficialAfterCacheImpact, true);
  assert.equal(impact.cacheAccountingIsSeparateFromContextReduction, true);
});

test('pruning can be rejected when cache loss dominates context reduction', () => {
  const impact = evaluatePruningCacheImpact({
    contextTokensBefore: 10000,
    contextTokensAfter: 8000,
    cachedInputTokensBefore: 7000,
    cachedInputTokensAfter: 3000,
  });

  assert.equal(impact.contextTokensRemoved, 2000);
  assert.equal(impact.cachedInputTokensLost, 4000);
  assert.equal(impact.cacheAdjustedTokenBenefit, -2000);
  assert.equal(impact.contextReductionBeneficialAfterCacheImpact, false);
});

test('calibration and cache accounting remain authority-neutral and fail closed', () => {
  assert.equal(economyCalibrationCanGrantAuthority(), false);

  assert.throws(
    () =>
      buildOfflineEconomyCalibrationReport([fixture('normal-1')], {
        ...policy,
        requireZeroParityMismatches: false,
      }),
    /cannot be weakened/,
  );

  assert.throws(
    () =>
      evaluatePruningCacheImpact({
        contextTokensBefore: 100,
        contextTokensAfter: 101,
        cachedInputTokensBefore: 0,
        cachedInputTokensAfter: 0,
      }),
    /cannot exceed/,
  );
});
