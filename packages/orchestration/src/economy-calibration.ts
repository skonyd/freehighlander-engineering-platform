import type { EconomyLedger } from './token-economy.js';

export type EconomyCalibrationRiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface EconomyCalibrationFixture {
  readonly fixtureId: string;
  readonly riskTier: EconomyCalibrationRiskTier;
  readonly standardOutcomeHash: string;
  readonly economyOutcomeHash: string;
  readonly standardProtectedEvidenceHash: string;
  readonly economyProtectedEvidenceHash: string;
  readonly economyLedger: EconomyLedger;
  readonly duplicateStandardRemoteCallPerformed: boolean;
}

export interface EconomyCalibrationPolicy {
  readonly minimumSamples: number;
  readonly requireZeroParityMismatches: true;
  readonly requireZeroProtectedEvidenceMismatches: true;
}

export type EconomyQualificationStatus =
  | 'QUALIFIED'
  | 'INSUFFICIENT_SAMPLES'
  | 'PARITY_MISMATCH'
  | 'PROTECTED_EVIDENCE_MISMATCH'
  | 'LIVE_DUPLICATE_A_B_FORBIDDEN';

export interface EconomyCalibrationReport {
  readonly schemaVersion: 1;
  readonly status: EconomyQualificationStatus;
  readonly sampleCount: number;
  readonly parityMismatches: readonly string[];
  readonly protectedEvidenceMismatches: readonly string[];
  readonly duplicateLiveStandardCallFixtureIds: readonly string[];
  readonly standardRemoteInputTokens: number;
  readonly economyRemoteInputTokens: number;
  readonly remoteInputTokensAvoided: number;
  readonly remoteCallsAvoided: number;
  readonly cacheTokensReportedSeparately: number;
  readonly qualifiedForLossyReduction: boolean;
  readonly authority: 'NONE';
}

export interface PruningCacheImpactInput {
  readonly contextTokensBefore: number;
  readonly contextTokensAfter: number;
  readonly cachedInputTokensBefore: number;
  readonly cachedInputTokensAfter: number;
}

export interface PruningCacheImpact {
  readonly schemaVersion: 1;
  readonly contextTokensRemoved: number;
  readonly cachedInputTokensLost: number;
  readonly cacheAdjustedTokenBenefit: number;
  readonly contextReductionBeneficialAfterCacheImpact: boolean;
  readonly cacheAccountingIsSeparateFromContextReduction: true;
  readonly authority: 'NONE';
}

export function buildOfflineEconomyCalibrationReport(
  fixtures: readonly EconomyCalibrationFixture[],
  policy: EconomyCalibrationPolicy,
): EconomyCalibrationReport {
  if (fixtures.length === 0) throw new Error('economy calibration requires at least one fixture');
  if (!Number.isInteger(policy.minimumSamples) || policy.minimumSamples < 1) {
    throw new Error('minimumSamples must be an integer >= 1');
  }
  if (
    policy.requireZeroParityMismatches !== true ||
    policy.requireZeroProtectedEvidenceMismatches !== true
  ) {
    throw new Error('economy qualification parity constraints cannot be weakened');
  }

  const seen = new Set<string>();
  const parityMismatches: string[] = [];
  const protectedEvidenceMismatches: string[] = [];
  const duplicateLiveStandardCallFixtureIds: string[] = [];
  let standardRemoteInputTokens = 0;
  let economyRemoteInputTokens = 0;
  let remoteCallsAvoided = 0;
  let cacheTokensReportedSeparately = 0;

  for (const fixture of fixtures) {
    const fixtureId = requireText(fixture.fixtureId, 'fixtureId');
    if (seen.has(fixtureId)) throw new Error(`duplicate economy calibration fixture: ${fixtureId}`);
    seen.add(fixtureId);
    validateRiskTier(fixture.riskTier);
    requireSha256(fixture.standardOutcomeHash, 'standardOutcomeHash');
    requireSha256(fixture.economyOutcomeHash, 'economyOutcomeHash');
    requireSha256(fixture.standardProtectedEvidenceHash, 'standardProtectedEvidenceHash');
    requireSha256(fixture.economyProtectedEvidenceHash, 'economyProtectedEvidenceHash');
    validateLedger(fixture.economyLedger);

    if (fixture.standardOutcomeHash !== fixture.economyOutcomeHash) {
      parityMismatches.push(fixtureId);
    }
    if (fixture.standardProtectedEvidenceHash !== fixture.economyProtectedEvidenceHash) {
      protectedEvidenceMismatches.push(fixtureId);
    }
    if (fixture.duplicateStandardRemoteCallPerformed) {
      duplicateLiveStandardCallFixtureIds.push(fixtureId);
    }

    standardRemoteInputTokens += fixture.economyLedger.candidateRemoteInputTokens;
    economyRemoteInputTokens += fixture.economyLedger.finalRemoteInputTokens;
    remoteCallsAvoided += fixture.economyLedger.remoteCallsAvoided;
    cacheTokensReportedSeparately += fixture.economyLedger.cachedInputTokens;
  }

  const status = qualificationStatus({
    sampleCount: fixtures.length,
    minimumSamples: policy.minimumSamples,
    parityMismatches,
    protectedEvidenceMismatches,
    duplicateLiveStandardCallFixtureIds,
  });

  return {
    schemaVersion: 1,
    status,
    sampleCount: fixtures.length,
    parityMismatches: parityMismatches.sort(),
    protectedEvidenceMismatches: protectedEvidenceMismatches.sort(),
    duplicateLiveStandardCallFixtureIds: duplicateLiveStandardCallFixtureIds.sort(),
    standardRemoteInputTokens,
    economyRemoteInputTokens,
    remoteInputTokensAvoided: standardRemoteInputTokens - economyRemoteInputTokens,
    remoteCallsAvoided,
    cacheTokensReportedSeparately,
    qualifiedForLossyReduction: status === 'QUALIFIED',
    authority: 'NONE',
  };
}

export function evaluatePruningCacheImpact(input: PruningCacheImpactInput): PruningCacheImpact {
  validateNonNegativeInteger(input.contextTokensBefore, 'contextTokensBefore');
  validateNonNegativeInteger(input.contextTokensAfter, 'contextTokensAfter');
  validateNonNegativeInteger(input.cachedInputTokensBefore, 'cachedInputTokensBefore');
  validateNonNegativeInteger(input.cachedInputTokensAfter, 'cachedInputTokensAfter');

  if (input.contextTokensAfter > input.contextTokensBefore) {
    throw new Error('contextTokensAfter cannot exceed contextTokensBefore');
  }
  if (input.cachedInputTokensBefore > input.contextTokensBefore) {
    throw new Error('cachedInputTokensBefore cannot exceed contextTokensBefore');
  }
  if (input.cachedInputTokensAfter > input.contextTokensAfter) {
    throw new Error('cachedInputTokensAfter cannot exceed contextTokensAfter');
  }

  const contextTokensRemoved = input.contextTokensBefore - input.contextTokensAfter;
  const cachedInputTokensLost = Math.max(
    0,
    input.cachedInputTokensBefore - input.cachedInputTokensAfter,
  );
  const cacheAdjustedTokenBenefit = contextTokensRemoved - cachedInputTokensLost;

  return {
    schemaVersion: 1,
    contextTokensRemoved,
    cachedInputTokensLost,
    cacheAdjustedTokenBenefit,
    contextReductionBeneficialAfterCacheImpact: cacheAdjustedTokenBenefit > 0,
    cacheAccountingIsSeparateFromContextReduction: true,
    authority: 'NONE',
  };
}

export function economyCalibrationCanGrantAuthority(): false {
  return false;
}

export function economyQualificationCanIgnoreParityMismatch(): false {
  return false;
}

export function productionEconomyRequiresLiveDuplicateStandardCall(): false {
  return false;
}

function qualificationStatus(input: {
  readonly sampleCount: number;
  readonly minimumSamples: number;
  readonly parityMismatches: readonly string[];
  readonly protectedEvidenceMismatches: readonly string[];
  readonly duplicateLiveStandardCallFixtureIds: readonly string[];
}): EconomyQualificationStatus {
  if (input.duplicateLiveStandardCallFixtureIds.length > 0) {
    return 'LIVE_DUPLICATE_A_B_FORBIDDEN';
  }
  if (input.protectedEvidenceMismatches.length > 0) return 'PROTECTED_EVIDENCE_MISMATCH';
  if (input.parityMismatches.length > 0) return 'PARITY_MISMATCH';
  if (input.sampleCount < input.minimumSamples) return 'INSUFFICIENT_SAMPLES';
  return 'QUALIFIED';
}

function validateLedger(ledger: EconomyLedger): void {
  if (ledger.schemaVersion !== 1 || ledger.authority !== 'NONE') {
    throw new Error('economy calibration requires an authority-neutral EconomyLedgerV1');
  }
  validateNonNegativeInteger(ledger.candidateRemoteInputTokens, 'candidateRemoteInputTokens');
  validateNonNegativeInteger(ledger.finalRemoteInputTokens, 'finalRemoteInputTokens');
  validateNonNegativeInteger(ledger.remoteCallsAvoided, 'remoteCallsAvoided');
  validateNonNegativeInteger(ledger.cachedInputTokens, 'cachedInputTokens');
  if (ledger.finalRemoteInputTokens > ledger.candidateRemoteInputTokens) {
    throw new Error('economy final remote input cannot exceed candidate remote input');
  }
}

function validateRiskTier(value: EconomyCalibrationRiskTier): void {
  if (value !== 'NORMAL' && value !== 'HIGH' && value !== 'CRITICAL') {
    throw new Error('economy calibration risk tier is invalid');
  }
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function requireSha256(value: string, field: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${field} must be lowercase sha256`);
  }
  return value;
}

function validateNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}
