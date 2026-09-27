import type { CoreHomeRoleBindingHealthView } from './home.js';
import type { DashboardModelAggregate } from './read-model.js';
import {
  optimizeFhKuikaRoutingV1,
  type FhKuikaRoutingCandidateV1,
  type FhKuikaRoutingDecisionV1,
  type FhKuikaRoutingHealth,
  type FhKuikaRoutingRequestV1,
} from './kuika-routing-optimizer.js';

export interface FhKuikaRoutingTelemetryProjectionV1 {
  readonly schemaVersion: 1;
  readonly logicalRole: string;
  readonly candidates: readonly FhKuikaRoutingCandidateV1[];
  readonly observedAggregateCount: number;
  readonly providerStateApplied: boolean;
  readonly authority: 'NONE';
}

export interface FhKuikaRoutingTelemetryDecisionV1 {
  readonly schemaVersion: 1;
  readonly projection: FhKuikaRoutingTelemetryProjectionV1;
  readonly decision: FhKuikaRoutingDecisionV1;
  readonly bridge: FhKuikaRoutingFailoverBridgeV1;
  readonly authority: 'NONE';
}

export interface FhKuikaRoutingFailoverBridgeV1 {
  readonly schemaVersion: 1;
  readonly logicalRole: string;
  readonly preferredBindingId: string | null;
  readonly currentActiveBindingId: string | null;
  readonly selectedBindingId: string | null;
  readonly selectionDiffersFromActive: boolean;
  readonly allowedFailureTriggers: readonly [
    'QUOTA_EXHAUSTED',
    'RATE_LIMITED',
    'PROVIDER_UNAVAILABLE',
    'TRANSPORT',
    'AUTH',
  ];
  readonly semanticFailureTriggerAllowed: false;
  readonly runtimeMutationPerformed: false;
  readonly applyAuthorized: false;
  readonly authority: 'NONE';
}

export function projectFhKuikaRoutingTelemetryV1(
  logicalRole: string,
  candidates: readonly FhKuikaRoutingCandidateV1[],
  aggregates: readonly DashboardModelAggregate[],
  roleBindings: readonly CoreHomeRoleBindingHealthView[],
): FhKuikaRoutingTelemetryProjectionV1 {
  const roleAggregate = aggregates.filter((item) => item.logicalRole === logicalRole);
  const bindingState = roleBindings.find((item) => item.logicalRole === logicalRole) ?? null;

  return {
    schemaVersion: 1,
    logicalRole,
    candidates: candidates.map((candidate) =>
      enrichCandidate(candidate, roleAggregate, bindingState),
    ),
    observedAggregateCount: roleAggregate.length,
    providerStateApplied: bindingState !== null,
    authority: 'NONE',
  };
}

export function evaluateFhKuikaRoutingWithTelemetryV1(
  request: FhKuikaRoutingRequestV1,
  aggregates: readonly DashboardModelAggregate[],
  roleBindings: readonly CoreHomeRoleBindingHealthView[],
): FhKuikaRoutingTelemetryDecisionV1 {
  const projection = projectFhKuikaRoutingTelemetryV1(
    request.logicalRole,
    request.candidates,
    aggregates,
    roleBindings,
  );
  const decision = optimizeFhKuikaRoutingV1({
    ...request,
    candidates: projection.candidates,
  });
  const roleBinding = roleBindings.find((item) => item.logicalRole === request.logicalRole) ?? null;
  const bridge = buildFhKuikaRoutingFailoverBridgeV1(decision, roleBinding);

  return {
    schemaVersion: 1,
    projection,
    decision,
    bridge,
    authority: 'NONE',
  };
}

export function buildFhKuikaRoutingFailoverBridgeV1(
  decision: FhKuikaRoutingDecisionV1,
  roleBinding: CoreHomeRoleBindingHealthView | null,
): FhKuikaRoutingFailoverBridgeV1 {
  if (decision.authority !== 'NONE' || decision.executionAuthorized !== false) {
    throw new Error('routing decision must remain authority-neutral and non-executing');
  }
  if (roleBinding && roleBinding.logicalRole !== decision.logicalRole) {
    throw new Error('routing decision and role binding must use the same logical role');
  }

  return {
    schemaVersion: 1,
    logicalRole: decision.logicalRole,
    preferredBindingId: roleBinding?.preferredBindingId ?? null,
    currentActiveBindingId: roleBinding?.activeBindingId ?? null,
    selectedBindingId: decision.selectedBindingId,
    selectionDiffersFromActive:
      decision.selectedBindingId !== null &&
      decision.selectedBindingId !== (roleBinding?.activeBindingId ?? null),
    allowedFailureTriggers: [
      'QUOTA_EXHAUSTED',
      'RATE_LIMITED',
      'PROVIDER_UNAVAILABLE',
      'TRANSPORT',
      'AUTH',
    ],
    semanticFailureTriggerAllowed: false,
    runtimeMutationPerformed: false,
    applyAuthorized: false,
    authority: 'NONE',
  };
}

export function routingTelemetryProjectionCanInvokeModel(): false {
  return false;
}

export function routingTelemetryProjectionCanInferAvailabilityFromHistory(): false {
  return false;
}

export function routingFailoverBridgeCanApply(): false {
  return false;
}

export function routingFailoverBridgeCanUseSemanticFailure(): false {
  return false;
}

function enrichCandidate(
  candidate: FhKuikaRoutingCandidateV1,
  aggregates: readonly DashboardModelAggregate[],
  bindingState: CoreHomeRoleBindingHealthView | null,
): FhKuikaRoutingCandidateV1 {
  const aggregate = aggregates.find(
    (item) => item.provider === candidate.provider && item.model === candidate.model,
  );

  const observedCost =
    aggregate && aggregate.calls > 0
      ? (aggregate.actualCostUsd || aggregate.estimatedCostUsd) / aggregate.calls
      : undefined;
  const observedLatency = aggregate?.averageLatencyMs ?? undefined;
  const live = projectLiveHealth(candidate, bindingState);

  return {
    ...candidate,
    ...(observedCost === undefined ? {} : { estimatedCallCostUsd: observedCost }),
    ...(observedLatency === undefined ? {} : { observedLatencyMs: observedLatency }),
    ...(live === null ? {} : live),
  };
}

function projectLiveHealth(
  candidate: FhKuikaRoutingCandidateV1,
  bindingState: CoreHomeRoleBindingHealthView | null,
): { readonly health: FhKuikaRoutingHealth; readonly retryAt?: string } | null {
  if (!bindingState) return null;

  if (candidate.bindingId === bindingState.activeBindingId) {
    return { health: bindingState.state === 'UNAVAILABLE' ? 'UNKNOWN' : 'AVAILABLE' };
  }

  if (candidate.bindingId !== bindingState.preferredBindingId) return null;

  if (bindingState.state === 'ACTIVE') return { health: 'AVAILABLE' };
  if (bindingState.state !== 'FALLBACK_ACTIVE' && bindingState.state !== 'UNAVAILABLE') {
    return { health: 'UNKNOWN' };
  }

  const health = mapFailureKind(bindingState.failureKind);
  return {
    health,
    ...(bindingState.nextCheckAt === undefined ? {} : { retryAt: bindingState.nextCheckAt }),
  };
}

function mapFailureKind(value: string | undefined): FhKuikaRoutingHealth {
  switch (value) {
    case 'quota_exhausted':
      return 'QUOTA_EXHAUSTED';
    case 'rate_limited':
      return 'RATE_LIMITED';
    case 'provider_unavailable':
    case 'transport_failure':
      return 'PROVIDER_UNAVAILABLE';
    case 'auth_unavailable':
      return 'AUTH_FAILED';
    default:
      return 'UNKNOWN';
  }
}
