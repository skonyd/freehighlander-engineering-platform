import type { ProviderFailureKind } from './index.js';
import type { BindingPlan } from './binding-registry.js';
import {
  recordActiveBindingFailure,
  type BindingFailureObservation,
  type BindingFailoverTransition,
  type RoleBindingFailoverStateV1,
} from './quota-aware-failover.js';

export interface FhKuikaRuntimeFailureObservationV1 {
  readonly failureKind: ProviderFailureKind;
  readonly scope: BindingFailureObservation['scope'];
  readonly observedAt: string;
  readonly retryAfterMs?: number;
  readonly resetAt?: string;
  readonly availabilityByBinding: Readonly<Record<string, boolean>>;
}

export interface FhKuikaRuntimeFailoverDecisionV1 {
  readonly schemaVersion: 1;
  readonly failoverApplied: boolean;
  readonly semanticOutcomeConsidered: false;
  readonly transition: BindingFailoverTransition;
  readonly authority: 'NONE';
}

export function applyFhKuikaRuntimeFailoverV1(
  state: RoleBindingFailoverStateV1,
  plan: BindingPlan,
  observation: FhKuikaRuntimeFailureObservationV1,
): FhKuikaRuntimeFailoverDecisionV1 {
  const transition = recordActiveBindingFailure(state, plan, observation);

  return {
    schemaVersion: 1,
    failoverApplied: transition.status === 'SWITCHED_TO_FALLBACK',
    semanticOutcomeConsidered: false,
    transition,
    authority: 'NONE',
  };
}

export function fhKuikaRuntimeFailoverCanUseSemanticOutcome(): false {
  return false;
}

export function fhKuikaRuntimeFailoverCanGrantAuthority(): false {
  return false;
}
