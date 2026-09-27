import type { FhKuikaRoutingDecisionV1 } from './kuika-routing-optimizer.js';

export type FhKuikaAvailabilityFailureKind =
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TRANSPORT'
  | 'TIMEOUT'
  | 'AUTH';

export interface FhKuikaRoutingFailoverPlanV1 {
  readonly schemaVersion: 1;
  readonly logicalRole: string;
  readonly selectedBindingId: string | null;
  readonly eligibleBindingOrder: readonly string[];
  readonly allowedFailureKinds: readonly FhKuikaAvailabilityFailureKind[];
  readonly semanticFailureFallbackAllowed: false;
  readonly malformedResponseFallbackAllowed: false;
  readonly runtimeApplicationAuthorized: false;
  readonly authority: 'NONE';
}

export function buildFhKuikaRoutingFailoverPlanV1(
  decision: FhKuikaRoutingDecisionV1,
): FhKuikaRoutingFailoverPlanV1 {
  if (decision.semanticOutcomeConsidered !== false) {
    throw new Error('routing decision must not consider semantic outcome');
  }
  if (decision.authority !== 'NONE' || decision.executionAuthorized !== false) {
    throw new Error('routing decision must remain non-authoritative');
  }

  const eligibleBindingOrder = decision.evaluations
    .filter((item) => item.eligible)
    .map((item) => item.bindingId);

  return {
    schemaVersion: 1,
    logicalRole: decision.logicalRole,
    selectedBindingId: decision.selectedBindingId,
    eligibleBindingOrder,
    allowedFailureKinds: [
      'QUOTA_EXHAUSTED',
      'RATE_LIMITED',
      'PROVIDER_UNAVAILABLE',
      'TRANSPORT',
      'TIMEOUT',
      'AUTH',
    ],
    semanticFailureFallbackAllowed: false,
    malformedResponseFallbackAllowed: false,
    runtimeApplicationAuthorized: false,
    authority: 'NONE',
  };
}

export function routingFailoverPlanCanApplyRuntime(): false {
  return false;
}

export function routingFailoverPlanCanRetrySemanticFailure(): false {
  return false;
}

export function routingFailoverPlanCanGrantAuthority(): false {
  return false;
}
