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
