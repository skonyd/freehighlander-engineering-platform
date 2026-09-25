import { createHash } from 'node:crypto';

export interface LocalOptimizerBindingEvidence {
  readonly bindingId: string;
  readonly bindingPlanHash: string;
  readonly qualificationHash: string;
  readonly modelId: string;
  readonly providerId: string;
  readonly locality: 'LOCAL' | 'REMOTE';
  readonly eligibleForRoleRisk: boolean;
}

export interface LocalOptimizerPolicy {
  readonly targetRemoteTokens: number;
  readonly maxLocalPasses: number;
  readonly minimumIncrementalSavingTokens: number;
}

export interface LocalOptimizerPassObservation {
  readonly pass: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly requiredEvidenceTokens: number;
  readonly protectedAnchorVerificationPassed: boolean;
  readonly optimizerHealthy: boolean;
}

export type LocalOptimizerNextAction =
  | 'CONTINUE_LOCAL'
  | 'READY_FOR_REMOTE'
  | 'FALLBACK_UNCOMPRESSED';

export type LocalOptimizerStopReason =
  | 'TARGET_REACHED'
  | 'MAX_PASSES_REACHED'
  | 'MIN_INCREMENTAL_SAVING_NOT_MET'
  | 'REQUIRED_EVIDENCE_DOMINATES'
  | 'PROTECTED_ANCHOR_FAILED'
  | 'OPTIMIZER_UNHEALTHY';

export interface LocalOptimizerDecision {
  readonly schemaVersion: 1;
  readonly nextAction: LocalOptimizerNextAction;
  readonly stopReason?: LocalOptimizerStopReason;
  readonly pass: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly incrementalSavingTokens: number;
  readonly bindingPlanHash: string;
  readonly qualificationHash: string;
  readonly decisionHash: string;
  readonly authority: 'NONE';
}

export function evaluateLocalOptimizerPass(
  binding: LocalOptimizerBindingEvidence,
  policy: LocalOptimizerPolicy,
  observation: LocalOptimizerPassObservation,
): LocalOptimizerDecision {
  validateBinding(binding);
  validatePolicy(policy);
  validateObservation(observation);

  const incrementalSavingTokens = Math.max(0, observation.inputTokens - observation.outputTokens);
  let nextAction: LocalOptimizerNextAction;
  let stopReason: LocalOptimizerStopReason | undefined;

  if (!observation.optimizerHealthy) {
    nextAction = 'FALLBACK_UNCOMPRESSED';
    stopReason = 'OPTIMIZER_UNHEALTHY';
  } else if (!observation.protectedAnchorVerificationPassed) {
    nextAction = 'FALLBACK_UNCOMPRESSED';
    stopReason = 'PROTECTED_ANCHOR_FAILED';
  } else if (observation.requiredEvidenceTokens > policy.targetRemoteTokens) {
    nextAction = 'READY_FOR_REMOTE';
    stopReason = 'REQUIRED_EVIDENCE_DOMINATES';
  } else if (observation.outputTokens <= policy.targetRemoteTokens) {
    nextAction = 'READY_FOR_REMOTE';
    stopReason = 'TARGET_REACHED';
  } else if (observation.pass >= policy.maxLocalPasses) {
    nextAction = 'READY_FOR_REMOTE';
    stopReason = 'MAX_PASSES_REACHED';
  } else if (incrementalSavingTokens < policy.minimumIncrementalSavingTokens) {
    nextAction = 'READY_FOR_REMOTE';
    stopReason = 'MIN_INCREMENTAL_SAVING_NOT_MET';
  } else {
    nextAction = 'CONTINUE_LOCAL';
  }

  const identity = {
    schemaVersion: 1,
    nextAction,
    stopReason: stopReason ?? null,
    pass: observation.pass,
    inputTokens: observation.inputTokens,
    outputTokens: observation.outputTokens,
    requiredEvidenceTokens: observation.requiredEvidenceTokens,
    incrementalSavingTokens,
    bindingId: binding.bindingId,
    bindingPlanHash: binding.bindingPlanHash,
    qualificationHash: binding.qualificationHash,
    modelId: binding.modelId,
    providerId: binding.providerId,
    locality: binding.locality,
    targetRemoteTokens: policy.targetRemoteTokens,
    maxLocalPasses: policy.maxLocalPasses,
    minimumIncrementalSavingTokens: policy.minimumIncrementalSavingTokens,
    protectedAnchorVerificationPassed: observation.protectedAnchorVerificationPassed,
    optimizerHealthy: observation.optimizerHealthy,
  } as const;

  return {
    schemaVersion: 1,
    nextAction,
    ...(stopReason === undefined ? {} : { stopReason }),
    pass: observation.pass,
    inputTokens: observation.inputTokens,
    outputTokens: observation.outputTokens,
    incrementalSavingTokens,
    bindingPlanHash: binding.bindingPlanHash,
    qualificationHash: binding.qualificationHash,
    decisionHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function localOptimizerCanGrantAuthority(): false {
  return false;
}

export function localOptimizerCanRunRemoteBinding(): false {
  return false;
}

export function localOptimizerCanDropRequiredEvidenceForTarget(): false {
  return false;
}

function validateBinding(binding: LocalOptimizerBindingEvidence): void {
  requireText(binding.bindingId, 'bindingId');
  requireText(binding.modelId, 'modelId');
  requireText(binding.providerId, 'providerId');
  requireSha256(binding.bindingPlanHash, 'bindingPlanHash');
  requireSha256(binding.qualificationHash, 'qualificationHash');

  if (binding.locality !== 'LOCAL') {
    throw new Error('local context optimizer requires LOCAL binding');
  }
  if (!binding.eligibleForRoleRisk) {
    throw new Error('local context optimizer binding must be eligible for role/risk');
  }
}

function validatePolicy(policy: LocalOptimizerPolicy): void {
  requireNonNegativeInteger(policy.targetRemoteTokens, 'targetRemoteTokens');
  if (!Number.isInteger(policy.maxLocalPasses) || policy.maxLocalPasses < 1) {
    throw new Error('maxLocalPasses must be an integer >= 1');
  }
  requireNonNegativeInteger(
    policy.minimumIncrementalSavingTokens,
    'minimumIncrementalSavingTokens',
  );
}

function validateObservation(observation: LocalOptimizerPassObservation): void {
  if (!Number.isInteger(observation.pass) || observation.pass < 1) {
    throw new Error('optimizer pass must be an integer >= 1');
  }
  requireNonNegativeInteger(observation.inputTokens, 'inputTokens');
  requireNonNegativeInteger(observation.outputTokens, 'outputTokens');
  requireNonNegativeInteger(observation.requiredEvidenceTokens, 'requiredEvidenceTokens');

  if (observation.requiredEvidenceTokens > observation.outputTokens) {
    throw new Error('requiredEvidenceTokens cannot exceed outputTokens');
  }
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}

function requireText(value: string, field: string): string {
  if (!value.trim()) throw new Error(`${field} is required`);
  return value;
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
