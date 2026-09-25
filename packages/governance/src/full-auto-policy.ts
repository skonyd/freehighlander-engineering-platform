import { createHash } from 'node:crypto';

import type { RiskTier } from '@freehighlander/contracts';

import type { PolicyDecision } from './policy-engine.js';

export type FullAutoProfile = 'OFF' | 'SAFE' | 'BALANCED' | 'CUSTOM';
export type FullAutoQuorumStatus = 'APPROVED' | 'REJECTED' | 'BLOCKED' | 'INSUFFICIENT';

export interface FullAutoPolicyConfiguration {
  readonly profile: FullAutoProfile;
  readonly customAllowedRiskTiers?: readonly RiskTier[];
}

export interface FullAutoMergeIntentInput {
  readonly configuration: FullAutoPolicyConfiguration;
  readonly policyDecision: PolicyDecision;
  readonly riskTier: RiskTier;
  readonly quorumHash: string;
  readonly quorumStatus: FullAutoQuorumStatus;
  readonly runSnapshotHash: string;
  readonly reviewScopeHash: string;
  readonly deterministicGatesPass: boolean;
  readonly exactCurrent: boolean;
  readonly reviewerIndependenceValid: boolean;
  readonly bindingSnapshotCurrent: boolean;
  readonly changeBudgetPass: boolean;
  readonly runtimeContainmentPass: boolean;
  readonly remoteHeadMatches: boolean;
  readonly requiredCiCurrent: boolean;
  readonly unresolvedBlockingFindings: boolean;
}

export type FullAutoMergeIntentStatus = 'SHADOW_INTENT_READY' | 'BLOCKED';

export type FullAutoMergeIntentReason =
  | 'READY'
  | 'PROFILE_OFF'
  | 'RISK_NOT_DELEGATED'
  | 'POLICY_DENY'
  | 'HUMAN_REQUIRED'
  | 'POLICY_NOT_QUORUM'
  | 'QUORUM_NOT_APPROVED'
  | 'DETERMINISTIC_GATE_FAILED'
  | 'STALE_SCOPE'
  | 'INDEPENDENCE_INVALID'
  | 'BINDING_SNAPSHOT_STALE'
  | 'CHANGE_BUDGET_FAILED'
  | 'RUNTIME_CONTAINMENT_FAILED'
  | 'REMOTE_HEAD_MISMATCH'
  | 'CI_NOT_CURRENT'
  | 'BLOCKING_FINDINGS';

export interface FullAutoMergeIntentDecision {
  readonly schemaVersion: 1;
  readonly status: FullAutoMergeIntentStatus;
  readonly reason: FullAutoMergeIntentReason;
  readonly profile: FullAutoProfile;
  readonly riskTier: RiskTier;
  readonly policyHash: string;
  readonly quorumHash: string;
  readonly runSnapshotHash: string;
  readonly reviewScopeHash: string;
  readonly decisionHash: string;
  readonly executionAuthorized: false;
  readonly authority: 'SYSTEM_POLICY';
}

export function evaluateFullAutoMergeIntent(
  input: FullAutoMergeIntentInput,
): FullAutoMergeIntentDecision {
  validateConfiguration(input.configuration);
  requireSha256(input.policyDecision.policyHash, 'policyHash');
  requireSha256(input.quorumHash, 'quorumHash');
  requireSha256(input.runSnapshotHash, 'runSnapshotHash');
  requireSha256(input.reviewScopeHash, 'reviewScopeHash');

  const reason = evaluateReason(input);
  const status: FullAutoMergeIntentStatus =
    reason === 'READY' ? 'SHADOW_INTENT_READY' : 'BLOCKED';

  const identity = {
    schemaVersion: 1,
    status,
    reason,
    profile: input.configuration.profile,
    customAllowedRiskTiers: normalizedCustomRiskTiers(input.configuration),
    riskTier: input.riskTier,
    policyHash: input.policyDecision.policyHash,
    policyEffect: input.policyDecision.effect,
    matchedRuleIds: [...input.policyDecision.matchedRuleIds].sort(),
    quorumHash: input.quorumHash,
    quorumStatus: input.quorumStatus,
    runSnapshotHash: input.runSnapshotHash,
    reviewScopeHash: input.reviewScopeHash,
    deterministicGatesPass: input.deterministicGatesPass,
    exactCurrent: input.exactCurrent,
    reviewerIndependenceValid: input.reviewerIndependenceValid,
    bindingSnapshotCurrent: input.bindingSnapshotCurrent,
    changeBudgetPass: input.changeBudgetPass,
    runtimeContainmentPass: input.runtimeContainmentPass,
    remoteHeadMatches: input.remoteHeadMatches,
    requiredCiCurrent: input.requiredCiCurrent,
    unresolvedBlockingFindings: input.unresolvedBlockingFindings,
  } as const;

  return {
    schemaVersion: 1,
    status,
    reason,
    profile: input.configuration.profile,
    riskTier: input.riskTier,
    policyHash: input.policyDecision.policyHash,
    quorumHash: input.quorumHash,
    runSnapshotHash: input.runSnapshotHash,
    reviewScopeHash: input.reviewScopeHash,
    decisionHash: sha256(canonicalJson(identity)),
    executionAuthorized: false,
    authority: 'SYSTEM_POLICY',
  };
}

export function fullAutoMergeIntentCanExecuteInShadowMode(): false {
  return false;
}

export function fullAutoProfileCanDelegateRisk(
  configuration: FullAutoPolicyConfiguration,
  riskTier: RiskTier,
): boolean {
  validateConfiguration(configuration);

  if (configuration.profile === 'OFF') return false;
  if (configuration.profile === 'SAFE') return riskTier === 'NORMAL';
  if (configuration.profile === 'BALANCED') return riskTier === 'NORMAL' || riskTier === 'HIGH';

  return normalizedCustomRiskTiers(configuration).includes(riskTier);
}

function evaluateReason(input: FullAutoMergeIntentInput): FullAutoMergeIntentReason {
  if (input.configuration.profile === 'OFF') return 'PROFILE_OFF';
  if (!fullAutoProfileCanDelegateRisk(input.configuration, input.riskTier)) {
    return 'RISK_NOT_DELEGATED';
  }
  if (input.policyDecision.effect === 'DENY') return 'POLICY_DENY';
  if (input.policyDecision.effect === 'HUMAN_REQUIRED') return 'HUMAN_REQUIRED';
  if (input.policyDecision.effect !== 'MODEL_QUORUM_REQUIRED') return 'POLICY_NOT_QUORUM';
  if (input.quorumStatus !== 'APPROVED') return 'QUORUM_NOT_APPROVED';
  if (!input.deterministicGatesPass) return 'DETERMINISTIC_GATE_FAILED';
  if (!input.exactCurrent) return 'STALE_SCOPE';
  if (!input.reviewerIndependenceValid) return 'INDEPENDENCE_INVALID';
  if (!input.bindingSnapshotCurrent) return 'BINDING_SNAPSHOT_STALE';
  if (!input.changeBudgetPass) return 'CHANGE_BUDGET_FAILED';
  if (!input.runtimeContainmentPass) return 'RUNTIME_CONTAINMENT_FAILED';
  if (!input.remoteHeadMatches) return 'REMOTE_HEAD_MISMATCH';
  if (!input.requiredCiCurrent) return 'CI_NOT_CURRENT';
  if (input.unresolvedBlockingFindings) return 'BLOCKING_FINDINGS';
  return 'READY';
}

function validateConfiguration(configuration: FullAutoPolicyConfiguration): void {
  if (!['OFF', 'SAFE', 'BALANCED', 'CUSTOM'].includes(configuration.profile)) {
    throw new Error('Full Auto profile is invalid');
  }

  const customRiskTiers = configuration.customAllowedRiskTiers ?? [];
  if (configuration.profile === 'CUSTOM' && customRiskTiers.length === 0) {
    throw new Error('CUSTOM Full Auto profile requires at least one allowed risk tier');
  }
  if (configuration.profile !== 'CUSTOM' && customRiskTiers.length > 0) {
    throw new Error('customAllowedRiskTiers is only valid for CUSTOM profile');
  }
  if (customRiskTiers.some((riskTier) => !['NORMAL', 'HIGH', 'CRITICAL'].includes(riskTier))) {
    throw new Error('Full Auto custom risk tier is invalid');
  }
}

function normalizedCustomRiskTiers(
  configuration: FullAutoPolicyConfiguration,
): readonly RiskTier[] {
  return [...new Set(configuration.customAllowedRiskTiers ?? [])].sort();
}

function requireSha256(value: string, field: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${field} must be lowercase sha256`);
  }
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
