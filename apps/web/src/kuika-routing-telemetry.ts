import type {
  FhKuikaRoutingCandidateV1,
  FhKuikaRoutingDataClass,
  FhKuikaRoutingHealth,
  FhKuikaRoutingLocality,
  FhKuikaRoutingRiskTier,
} from './kuika-routing-optimizer.js';

export interface FhKuikaRoutingTelemetryCandidateInputV1 {
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
  readonly recentCalls: number;
  readonly recentSuccessfulCalls: number;
  readonly observedLatencyMs?: number;
  readonly observedCostUsd?: number;
}

export interface FhKuikaRoutingTelemetryEvidenceV1 {
  readonly bindingId: string;
  readonly availabilityRatio: number | null;
  readonly recentCalls: number;
  readonly recentSuccessfulCalls: number;
  readonly observedLatencyMs: number | null;
  readonly observedCostUsd: number | null;
  readonly health: FhKuikaRoutingHealth;
  readonly semanticOutcomeUsed: false;
  readonly authority: 'NONE';
}

export function buildFhKuikaRoutingCandidateFromTelemetryV1(
  input: FhKuikaRoutingTelemetryCandidateInputV1,
): {
  readonly candidate: FhKuikaRoutingCandidateV1;
  readonly evidence: FhKuikaRoutingTelemetryEvidenceV1;
} {
  requireCount(input.recentCalls, 'recentCalls');
  requireCount(input.recentSuccessfulCalls, 'recentSuccessfulCalls');
  if (input.recentSuccessfulCalls > input.recentCalls) {
    throw new Error('recentSuccessfulCalls cannot exceed recentCalls');
  }

  const observedLatencyMs = normalizeOptionalMetric(input.observedLatencyMs, 'observedLatencyMs');
  const observedCostUsd = normalizeOptionalMetric(input.observedCostUsd, 'observedCostUsd');

  return {
    candidate: {
      bindingId: input.bindingId,
      provider: input.provider,
      model: input.model,
      locality: input.locality,
      qualified: input.qualified,
      supportedRiskTiers: [...input.supportedRiskTiers],
      allowedDataClasses: [...input.allowedDataClasses],
      capabilities: [...input.capabilities],
      maxContextTokens: input.maxContextTokens,
      independenceGroup: input.independenceGroup,
      health: input.health,
      ...(input.retryAt === undefined ? {} : { retryAt: input.retryAt }),
      ...(observedCostUsd === null ? {} : { estimatedCallCostUsd: observedCostUsd }),
      ...(observedLatencyMs === null ? {} : { observedLatencyMs }),
    },
    evidence: {
      bindingId: input.bindingId,
      availabilityRatio:
        input.recentCalls === 0 ? null : input.recentSuccessfulCalls / input.recentCalls,
      recentCalls: input.recentCalls,
      recentSuccessfulCalls: input.recentSuccessfulCalls,
      observedLatencyMs,
      observedCostUsd,
      health: input.health,
      semanticOutcomeUsed: false,
      authority: 'NONE',
    },
  };
}

export function routingTelemetryCanUseSemanticOutcome(): false {
  return false;
}

export function routingTelemetryCanGrantAuthority(): false {
  return false;
}

function requireCount(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(field + ' must be a non-negative integer');
  }
}

function normalizeOptionalMetric(value: number | undefined, field: string): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(field + ' must be a non-negative finite number');
  }
  return value;
}
