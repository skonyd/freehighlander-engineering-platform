export type EconomyMode = 'STANDARD' | 'TOKEN_ECONOMY';

export type RemoteCallDecisionStatus = 'CALL_REMOTE' | 'SKIP_REMOTE' | 'DEFER_FOR_LOCAL_BATCH';

export type RemoteCallDecisionReason =
  | 'STANDARD_MODE'
  | 'POLICY_REQUIRES_REMOTE'
  | 'INDEPENDENT_REMOTE_REVIEW_REQUIRED'
  | 'SEMANTIC_NEGATIVE_NO_MODEL_SHOPPING'
  | 'EXACT_NODE_RESULT_REUSABLE'
  | 'ELIGIBLE_LOCAL_RESULT_AVAILABLE'
  | 'DETERMINISTIC_RESOLUTION_AVAILABLE'
  | 'BATCH_READ_ONLY_WORK_FIRST'
  | 'REMOTE_RESULT_REQUIRED';

export interface RemoteCallNecessityInput {
  readonly mode: EconomyMode;
  readonly policyRequiresRemote: boolean;
  readonly independentRemoteReviewRequired: boolean;
  readonly completedEquivalentSemanticNegative: boolean;
  readonly exactNodeResultReusable: boolean;
  readonly eligibleLocalResultAvailable: boolean;
  readonly deterministicResolutionAvailable: boolean;
  readonly batchableReadOnlyWorkPending: boolean;
}

export interface RemoteCallNecessityDecision {
  readonly status: RemoteCallDecisionStatus;
  readonly reason: RemoteCallDecisionReason;
  readonly authority: 'NONE';
}

export interface EconomyLedgerReduction {
  readonly exactDedupeTokens: number;
  readonly staleSupersededTokens: number;
  readonly artifactizationTokens: number;
  readonly repoMapJitTokens: number;
  readonly lazyToolSchemaTokens: number;
  readonly localCompressionTokens: number;
  readonly nodeResultReuseTokens: number;
}

export interface EconomyLedgerInput {
  readonly candidateRemoteInputTokens: number;
  readonly reductions: EconomyLedgerReduction;
  readonly finalRemoteInputTokens: number;
  readonly remoteOutputTokens: number;
  readonly cachedInputTokens: number;
  readonly remoteCallsAvoided: number;
  readonly localOnlyCalls: number;
  readonly extraLocalDurationMs: number;
}

export interface EconomyLedger {
  readonly schemaVersion: 1;
  readonly candidateRemoteInputTokens: number;
  readonly reductions: EconomyLedgerReduction;
  readonly totalReducedTokens: number;
  readonly finalRemoteInputTokens: number;
  readonly remoteOutputTokens: number;
  readonly cachedInputTokens: number;
  readonly remoteCallsAvoided: number;
  readonly localOnlyCalls: number;
  readonly extraLocalDurationMs: number;
  readonly remoteInputSavingRatio: number;
  readonly cacheSavingsReportedSeparately: true;
  readonly authority: 'NONE';
}

export function evaluateRemoteCallNecessity(
  input: RemoteCallNecessityInput,
): RemoteCallNecessityDecision {
  if (input.mode === 'STANDARD') {
    return decision('CALL_REMOTE', 'STANDARD_MODE');
  }
  if (input.mode !== 'TOKEN_ECONOMY') {
    throw new Error('economy mode is invalid');
  }

  if (input.policyRequiresRemote) {
    return decision('CALL_REMOTE', 'POLICY_REQUIRES_REMOTE');
  }
  if (input.independentRemoteReviewRequired) {
    return decision('CALL_REMOTE', 'INDEPENDENT_REMOTE_REVIEW_REQUIRED');
  }
  if (input.completedEquivalentSemanticNegative) {
    return decision('SKIP_REMOTE', 'SEMANTIC_NEGATIVE_NO_MODEL_SHOPPING');
  }
  if (input.exactNodeResultReusable) {
    return decision('SKIP_REMOTE', 'EXACT_NODE_RESULT_REUSABLE');
  }
  if (input.eligibleLocalResultAvailable) {
    return decision('SKIP_REMOTE', 'ELIGIBLE_LOCAL_RESULT_AVAILABLE');
  }
  if (input.deterministicResolutionAvailable) {
    return decision('SKIP_REMOTE', 'DETERMINISTIC_RESOLUTION_AVAILABLE');
  }
  if (input.batchableReadOnlyWorkPending) {
    return decision('DEFER_FOR_LOCAL_BATCH', 'BATCH_READ_ONLY_WORK_FIRST');
  }
  return decision('CALL_REMOTE', 'REMOTE_RESULT_REQUIRED');
}

export function buildEconomyLedger(input: EconomyLedgerInput): EconomyLedger {
  validateNonNegativeInteger(input.candidateRemoteInputTokens, 'candidateRemoteInputTokens');
  validateNonNegativeInteger(input.finalRemoteInputTokens, 'finalRemoteInputTokens');
  validateNonNegativeInteger(input.remoteOutputTokens, 'remoteOutputTokens');
  validateNonNegativeInteger(input.cachedInputTokens, 'cachedInputTokens');
  validateNonNegativeInteger(input.remoteCallsAvoided, 'remoteCallsAvoided');
  validateNonNegativeInteger(input.localOnlyCalls, 'localOnlyCalls');
  validateNonNegativeInteger(input.extraLocalDurationMs, 'extraLocalDurationMs');

  for (const [field, value] of Object.entries(input.reductions)) {
    validateNonNegativeInteger(value, field);
  }

  const totalReducedTokens = Object.values(input.reductions).reduce(
    (total, value) => total + value,
    0,
  );

  if (totalReducedTokens > input.candidateRemoteInputTokens) {
    throw new Error('economy reductions cannot exceed candidate remote input tokens');
  }

  const expectedFinal = input.candidateRemoteInputTokens - totalReducedTokens;
  if (expectedFinal !== input.finalRemoteInputTokens) {
    throw new Error('economy ledger does not reconcile candidate and final remote input tokens');
  }

  if (input.cachedInputTokens > input.finalRemoteInputTokens) {
    throw new Error('cached input tokens cannot exceed final remote input tokens');
  }

  const remoteInputSavingRatio =
    input.candidateRemoteInputTokens === 0
      ? 0
      : totalReducedTokens / input.candidateRemoteInputTokens;

  return {
    schemaVersion: 1,
    candidateRemoteInputTokens: input.candidateRemoteInputTokens,
    reductions: { ...input.reductions },
    totalReducedTokens,
    finalRemoteInputTokens: input.finalRemoteInputTokens,
    remoteOutputTokens: input.remoteOutputTokens,
    cachedInputTokens: input.cachedInputTokens,
    remoteCallsAvoided: input.remoteCallsAvoided,
    localOnlyCalls: input.localOnlyCalls,
    extraLocalDurationMs: input.extraLocalDurationMs,
    remoteInputSavingRatio,
    cacheSavingsReportedSeparately: true,
    authority: 'NONE',
  };
}

export function tokenEconomyCanSuppressPolicyRequiredRemoteCall(): false {
  return false;
}

export function tokenEconomyCanEscalateSemanticNegativeForShopping(): false {
  return false;
}

export function economyLedgerCanGrantAuthority(): false {
  return false;
}

function decision(
  status: RemoteCallDecisionStatus,
  reason: RemoteCallDecisionReason,
): RemoteCallNecessityDecision {
  return { status, reason, authority: 'NONE' };
}

function validateNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}
