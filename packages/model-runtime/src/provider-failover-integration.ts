import type { BindingPlan } from './binding-registry.js';
import {
  recordActiveBindingFailure,
  type BindingFailoverTransition,
  type BindingFailureScope,
  type RoleBindingFailoverStateV1,
} from './quota-aware-failover.js';
import type { ProviderFailureKind } from './index.js';

export interface NormalizedProviderFailureV1 {
  readonly schemaVersion: 1;
  readonly failureKind: ProviderFailureKind;
  readonly scope: BindingFailureScope;
  readonly retryAfterMs?: number;
  readonly httpStatus?: number;
  readonly authority: 'NONE';
}

export interface ApplyProviderFailureInput {
  readonly observedAt: string;
  readonly availabilityByBinding: Readonly<Record<string, boolean>>;
}

export type ProviderFailureDiagnosisCauseKind =
  | 'AUTHENTICATION'
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TRANSPORT'
  | 'MALFORMED_OUTPUT';

export interface ProviderFailureDiagnosisContext {
  readonly providerId: string;
  readonly bindingId: string;
  readonly fallbackBindingId?: string;
  readonly recoveryAt?: string;
}

export interface ProviderFailureDiagnosisV1 {
  readonly schemaVersion: 1;
  readonly causeCode: string;
  readonly causeKind: ProviderFailureDiagnosisCauseKind;
  readonly certainty: 'CONFIRMED_SIGNAL';
  readonly headline: string;
  readonly sourceComponent: string;
  readonly sourceOperation: 'provider-invoke';
  readonly failedStep: 'Invoke selected model binding';
  readonly rootCause: string;
  readonly observedSignal: string;
  readonly nextAction: string;
  readonly retryAt?: string;
  readonly authority: 'NONE';
}

const providerFailureKinds = new Set<ProviderFailureKind>([
  'quota_exhausted',
  'rate_limited',
  'auth_unavailable',
  'provider_unavailable',
  'transport_failure',
  'semantic_failure',
  'malformed_output',
]);

export function normalizeProviderInvocationFailure(
  error: unknown,
): NormalizedProviderFailureV1 | null {
  if (!isRecord(error) || typeof error.kind !== 'string') return null;
  if (!providerFailureKinds.has(error.kind as ProviderFailureKind)) return null;

  const failureKind = error.kind as ProviderFailureKind;
  const retryAfterMs = normalizeOptionalRetryAfter(error.retryAfterMs);
  const httpStatus = normalizeOptionalHttpStatus(error.status);

  return {
    schemaVersion: 1,
    failureKind,
    scope: providerFailureScope(failureKind),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    ...(httpStatus === undefined ? {} : { httpStatus }),
    authority: 'NONE',
  };
}

export function diagnoseProviderInvocationFailure(
  error: unknown,
  context: ProviderFailureDiagnosisContext,
): ProviderFailureDiagnosisV1 | null {
  const normalized = normalizeProviderInvocationFailure(error);
  if (normalized === null || normalized.failureKind === 'semantic_failure') return null;

  const providerId = normalizePublicIdentifier(context.providerId, 'providerId');
  const bindingId = normalizePublicIdentifier(context.bindingId, 'bindingId');
  const fallbackBindingId =
    context.fallbackBindingId === undefined
      ? undefined
      : normalizePublicIdentifier(context.fallbackBindingId, 'fallbackBindingId');
  const retryAt =
    context.recoveryAt === undefined ? undefined : normalizeIsoTimestamp(context.recoveryAt);

  const common = {
    schemaVersion: 1 as const,
    certainty: 'CONFIRMED_SIGNAL' as const,
    sourceComponent: providerId,
    sourceOperation: 'provider-invoke' as const,
    failedStep: 'Invoke selected model binding' as const,
    observedSignal: buildObservedSignal(normalized),
    ...(retryAt === undefined ? {} : { retryAt }),
    authority: 'NONE' as const,
  };

  switch (normalized.failureKind) {
    case 'quota_exhausted':
      return {
        ...common,
        causeCode: 'PROVIDER_QUOTA_EXHAUSTED',
        causeKind: 'QUOTA_EXHAUSTED',
        headline: 'Selected model quota exhausted',
        rootCause: `Provider ${providerId} rejected binding ${bindingId} because its current quota is exhausted.`,
        nextAction: recoveryAction(fallbackBindingId, retryAt, 'quota reset'),
      };
    case 'rate_limited':
      return {
        ...common,
        causeCode: 'PROVIDER_RATE_LIMITED',
        causeKind: 'RATE_LIMITED',
        headline: 'Provider rate limit reached',
        rootCause: `Provider ${providerId} temporarily rate-limited binding ${bindingId}.`,
        nextAction: recoveryAction(fallbackBindingId, retryAt, 'rate-limit window'),
      };
    case 'auth_unavailable':
      return {
        ...common,
        causeCode: 'PROVIDER_AUTH_UNAVAILABLE',
        causeKind: 'AUTHENTICATION',
        headline: 'Provider authentication unavailable',
        rootCause: `Binding ${bindingId} cannot authenticate to provider ${providerId}.`,
        nextAction: 'Restore the provider credential or authentication session before retrying',
      };
    case 'provider_unavailable':
      return {
        ...common,
        causeCode: 'PROVIDER_UNAVAILABLE',
        causeKind: 'PROVIDER_UNAVAILABLE',
        headline: 'Provider is unavailable',
        rootCause: `Provider ${providerId} is currently unavailable for binding ${bindingId}.`,
        nextAction: recoveryAction(fallbackBindingId, retryAt, 'provider recovery'),
      };
    case 'transport_failure':
      return {
        ...common,
        causeCode: 'PROVIDER_TRANSPORT_FAILURE',
        causeKind: 'TRANSPORT',
        headline: 'Provider connection failed',
        rootCause: `The request for binding ${bindingId} could not complete its transport to provider ${providerId}.`,
        nextAction: recoveryAction(fallbackBindingId, retryAt, 'connection recovery'),
      };
    case 'malformed_output':
      return {
        ...common,
        causeCode: 'PROVIDER_MALFORMED_OUTPUT',
        causeKind: 'MALFORMED_OUTPUT',
        headline: 'Provider returned invalid output',
        rootCause: `Provider ${providerId} returned output that does not satisfy the binding ${bindingId} response contract.`,
        nextAction: 'Inspect the structured-output evidence and correct the provider or adapter contract',
      };
    case 'semantic_failure':
      return null;
  }
}

export function applyProviderInvocationFailure(
  state: RoleBindingFailoverStateV1,
  plan: BindingPlan,
  error: unknown,
  input: ApplyProviderFailureInput,
): BindingFailoverTransition {
  const normalized = normalizeProviderInvocationFailure(error);
  if (normalized === null) {
    return {
      status: 'FALLBACK_FORBIDDEN',
      state,
      reason: 'unrecognized provider failure cannot trigger fallback',
    };
  }

  return recordActiveBindingFailure(state, plan, {
    failureKind: normalized.failureKind,
    scope: normalized.scope,
    observedAt: input.observedAt,
    ...(normalized.retryAfterMs === undefined ? {} : { retryAfterMs: normalized.retryAfterMs }),
    availabilityByBinding: input.availabilityByBinding,
  });
}

export function providerFailureScope(failureKind: ProviderFailureKind): BindingFailureScope {
  if (failureKind === 'quota_exhausted' || failureKind === 'rate_limited') {
    return 'BINDING';
  }
  return 'PROVIDER';
}

export function providerFailureIntegrationCanGrantAuthority(): false {
  return false;
}

function buildObservedSignal(failure: NormalizedProviderFailureV1): string {
  const parts = [failure.failureKind];
  if (failure.httpStatus !== undefined) parts.push(`HTTP ${failure.httpStatus}`);
  if (failure.retryAfterMs !== undefined) parts.push(`Retry-After ${failure.retryAfterMs}ms`);
  return parts.join('; ');
}

function recoveryAction(
  fallbackBindingId: string | undefined,
  retryAt: string | undefined,
  recoveryCondition: string,
): string {
  if (fallbackBindingId !== undefined) {
    return retryAt === undefined
      ? `Continue with fallback binding ${fallbackBindingId}; probe the preferred binding after the bounded recovery check`
      : `Continue with fallback binding ${fallbackBindingId}; retry the preferred binding after ${retryAt}`;
  }

  return retryAt === undefined
    ? `Retry after the ${recoveryCondition}; no reset time was reported`
    : `Retry after ${retryAt}`;
}

function normalizePublicIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(normalized)) {
    throw new Error(`${field} must be a safe bounded identifier`);
  }
  return normalized;
}

function normalizeIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error('recoveryAt must be an ISO timestamp');
  return new Date(parsed).toISOString();
}

function normalizeOptionalRetryAfter(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0) return undefined;
  return value as number;
}

function normalizeOptionalHttpStatus(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 100 || (value as number) > 599) {
    return undefined;
  }
  return value as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
