export type FhKuikaRoutingRiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';
export type FhKuikaRoutingDataClass = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'SECRET';
export type FhKuikaRoutingLocality = 'LOCAL' | 'REMOTE';

export type FhKuikaRoutingHealth =
  | 'AVAILABLE'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTH_FAILED'
  | 'UNKNOWN';

export type FhKuikaRoutingExclusionReason =
  | 'NOT_QUALIFIED'
  | 'RISK_TIER_UNSUPPORTED'
  | 'DATA_CLASS_UNSUPPORTED'
  | 'REQUIRED_CAPABILITY_MISSING'
  | 'CONTEXT_TOO_SMALL'
  | 'INDEPENDENCE_CONFLICT'
  | 'COST_LIMIT_EXCEEDED'
  | 'UNAVAILABLE';

export interface FhKuikaRoutingCandidateV1 {
  readonly bindingId: string;
  readonly provider: string;
  readonly model: string;
  readonly locality: FhKuikaRoutingLocality;
  readonly qualified: boolean;
  readonly supportedRiskTiers: readonly FhKuikaRoutingRiskTier[];
  readonly allowedDataClasses: readonly FhKuikaRoutingDataClass[];
  readonly capabilities: readonly string[];
  readonly maxContextTokens: number;
  readonly independenceGroup: string;
  readonly health: FhKuikaRoutingHealth;
  readonly retryAt?: string;
  readonly estimatedCallCostUsd?: number;
  readonly observedLatencyMs?: number;
}

export interface FhKuikaRoutingRequestV1 {
  readonly schemaVersion: 1;
  readonly logicalRole: string;
  readonly preferredBindingId: string;
  readonly riskTier: FhKuikaRoutingRiskTier;
  readonly dataClassification: FhKuikaRoutingDataClass;
  readonly requiredCapabilities: readonly string[];
  readonly requiredContextTokens: number;
  readonly excludedIndependenceGroups: readonly string[];
  readonly maxEstimatedCallCostUsd?: number;
  readonly candidates: readonly FhKuikaRoutingCandidateV1[];
  readonly authority: 'NONE';
}

export interface FhKuikaRoutingCandidateEvaluationV1 {
  readonly bindingId: string;
  readonly eligible: boolean;
  readonly exclusionReasons: readonly FhKuikaRoutingExclusionReason[];
  readonly preferred: boolean;
}

export interface FhKuikaRoutingDecisionV1 {
  readonly schemaVersion: 1;
  readonly logicalRole: string;
  readonly selectedBindingId: string | null;
  readonly evaluations: readonly FhKuikaRoutingCandidateEvaluationV1[];
  readonly reason: string;
  readonly semanticOutcomeConsidered: false;
  readonly authority: 'NONE';
  readonly executionAuthorized: false;
}

export function optimizeFhKuikaRoutingV1(
  request: FhKuikaRoutingRequestV1,
): FhKuikaRoutingDecisionV1 {
  validateRequest(request);

  const evaluations = request.candidates.map((candidate) => evaluateCandidate(candidate, request));
  const eligible = evaluations.filter((evaluation) => evaluation.eligible);
  const preferred = eligible.find((evaluation) => evaluation.preferred);
  const selected = preferred ?? eligible[0] ?? null;

  return {
    schemaVersion: 1,
    logicalRole: request.logicalRole,
    selectedBindingId: selected?.bindingId ?? null,
    evaluations,
    reason: decisionReason(request, selected, preferred !== undefined),
    semanticOutcomeConsidered: false,
    authority: 'NONE',
    executionAuthorized: false,
  };
}

export function routingOptimizerCanGrantAuthority(): false {
  return false;
}

export function routingOptimizerCanExecuteCall(): false {
  return false;
}

export function routingOptimizerCanUseSemanticOutcome(): false {
  return false;
}

export function routingOptimizerCanRetrySemanticFailure(): false {
  return false;
}

function evaluateCandidate(
  candidate: FhKuikaRoutingCandidateV1,
  request: FhKuikaRoutingRequestV1,
): FhKuikaRoutingCandidateEvaluationV1 {
  validateCandidate(candidate);

  const reasons: FhKuikaRoutingExclusionReason[] = [];

  if (!candidate.qualified) reasons.push('NOT_QUALIFIED');
  if (!candidate.supportedRiskTiers.includes(request.riskTier)) {
    reasons.push('RISK_TIER_UNSUPPORTED');
  }
  if (!candidate.allowedDataClasses.includes(request.dataClassification)) {
    reasons.push('DATA_CLASS_UNSUPPORTED');
  }
  if (
    request.requiredCapabilities.some(
      (capability) => !candidate.capabilities.includes(capability),
    )
  ) {
    reasons.push('REQUIRED_CAPABILITY_MISSING');
  }
  if (candidate.maxContextTokens < request.requiredContextTokens) {
    reasons.push('CONTEXT_TOO_SMALL');
  }
  if (request.excludedIndependenceGroups.includes(candidate.independenceGroup)) {
    reasons.push('INDEPENDENCE_CONFLICT');
  }
  if (
    request.maxEstimatedCallCostUsd !== undefined &&
    candidate.estimatedCallCostUsd !== undefined &&
    candidate.estimatedCallCostUsd > request.maxEstimatedCallCostUsd
  ) {
    reasons.push('COST_LIMIT_EXCEEDED');
  }
  if (candidate.health !== 'AVAILABLE') reasons.push('UNAVAILABLE');

  return {
    bindingId: candidate.bindingId,
    eligible: reasons.length === 0,
    exclusionReasons: reasons,
    preferred: candidate.bindingId === request.preferredBindingId,
  };
}

function validateRequest(request: FhKuikaRoutingRequestV1): void {
  if (request.schemaVersion !== 1) {
    throw new Error('routing request schemaVersion must be 1');
  }
  if (request.authority !== 'NONE') {
    throw new Error('routing request authority must be NONE');
  }
  requireIdentifier(request.logicalRole, 'logicalRole');
  requireIdentifier(request.preferredBindingId, 'preferredBindingId');
  requirePositiveInteger(
    request.requiredContextTokens,
    'requiredContextTokens',
    10_000_000,
  );
  normalizeIdentifiers(request.requiredCapabilities, 'required capability');
  normalizeIdentifiers(request.excludedIndependenceGroups, 'excluded independence group');

  if (
    request.maxEstimatedCallCostUsd !== undefined &&
    (!Number.isFinite(request.maxEstimatedCallCostUsd) || request.maxEstimatedCallCostUsd < 0)
  ) {
    throw new Error('maxEstimatedCallCostUsd must be a non-negative finite number');
  }

  if (request.candidates.length === 0) {
    throw new Error('routing candidates are required');
  }
  const ids = new Set<string>();
  for (const candidate of request.candidates) {
    if (ids.has(candidate.bindingId)) {
      throw new Error('routing candidate bindingIds must be unique');
    }
    ids.add(candidate.bindingId);
  }
}

function validateCandidate(candidate: FhKuikaRoutingCandidateV1): void {
  requireIdentifier(candidate.bindingId, 'bindingId');
  requireSingleLine(candidate.provider, 'provider');
  requireSingleLine(candidate.model, 'model');
  requireIdentifier(candidate.independenceGroup, 'independenceGroup');
  requirePositiveInteger(candidate.maxContextTokens, 'maxContextTokens', 10_000_000);
  normalizeIdentifiers(candidate.capabilities, 'candidate capability');

  if (candidate.supportedRiskTiers.length === 0) {
    throw new Error('candidate supportedRiskTiers are required');
  }
  if (candidate.allowedDataClasses.length === 0) {
    throw new Error('candidate allowedDataClasses are required');
  }

  if (
    candidate.estimatedCallCostUsd !== undefined &&
    (!Number.isFinite(candidate.estimatedCallCostUsd) || candidate.estimatedCallCostUsd < 0)
  ) {
    throw new Error('candidate estimatedCallCostUsd must be a non-negative finite number');
  }
  if (
    candidate.observedLatencyMs !== undefined &&
    (!Number.isFinite(candidate.observedLatencyMs) || candidate.observedLatencyMs < 0)
  ) {
    throw new Error('candidate observedLatencyMs must be a non-negative finite number');
  }
  if (candidate.retryAt !== undefined && Number.isNaN(Date.parse(candidate.retryAt))) {
    throw new Error('candidate retryAt must be a valid timestamp');
  }
}

function decisionReason(
  request: FhKuikaRoutingRequestV1,
  selected: FhKuikaRoutingCandidateEvaluationV1 | null,
  preferredSelected: boolean,
): string {
  if (!selected) {
    return 'No candidate satisfies all deterministic pre-call constraints.';
  }
  if (preferredSelected) {
    return 'Preferred binding satisfies all deterministic pre-call constraints.';
  }
  return (
    'Preferred binding is ineligible; selected next eligible binding by declared candidate order: ' +
    selected.bindingId +
    '.'
  );
}

function normalizeIdentifiers(values: readonly string[], field: string): readonly string[] {
  const normalized = values.map((value) => requireIdentifier(value, field));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(field + ' values must be unique');
  }
  return normalized;
}

function requireIdentifier(value: string, field: string): string {
  const normalized = requireSingleLine(value, field);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(normalized)) {
    throw new Error(field + ' must be a bounded identifier');
  }
  return normalized;
}

function requireSingleLine(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  if (normalized.length > 500 || /[\r\n\t]/.test(normalized)) {
    throw new Error(field + ' must be a bounded single-line value');
  }
  return normalized;
}

function requirePositiveInteger(value: number, field: string, maximum: number): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(field + ' must be an integer between 1 and ' + maximum);
  }
}
