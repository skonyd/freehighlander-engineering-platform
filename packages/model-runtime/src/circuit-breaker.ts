import type { ProviderFailureKind, ProviderHealth } from './index.js';

export type ProviderCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ProviderCircuitBreakerPolicy {
  readonly failureThreshold: number;
  readonly openDurationMs: number;
}

export interface ProviderCircuitSnapshot {
  readonly state: ProviderCircuitState;
  readonly consecutiveAvailabilityFailures: number;
  readonly openedAtMs?: number;
  readonly nextProbeAtMs?: number;
}

export interface ProviderCircuitTransition {
  readonly from: ProviderCircuitState;
  readonly to: ProviderCircuitState;
  readonly reason: string;
}

export interface ProviderCircuitUpdate {
  readonly snapshot: ProviderCircuitSnapshot;
  readonly transition?: ProviderCircuitTransition;
}

export interface ProviderCircuitDecision extends ProviderCircuitUpdate {
  readonly allowed: boolean;
  readonly reason: 'CIRCUIT_CLOSED' | 'HALF_OPEN_PROBE' | 'CIRCUIT_OPEN';
}

export interface ProviderHealthSnapshot {
  readonly providerId: string;
  readonly available: boolean;
  readonly detail?: string;
  readonly circuit: ProviderCircuitSnapshot;
}

export class ProviderCircuitBreaker {
  #state: ProviderCircuitState = 'CLOSED';
  #consecutiveAvailabilityFailures = 0;
  #openedAtMs: number | undefined;
  #nextProbeAtMs: number | undefined;

  constructor(readonly policy: ProviderCircuitBreakerPolicy) {
    validatePolicy(policy);
  }

  snapshot(): ProviderCircuitSnapshot {
    return {
      state: this.#state,
      consecutiveAvailabilityFailures: this.#consecutiveAvailabilityFailures,
      ...(this.#openedAtMs !== undefined ? { openedAtMs: this.#openedAtMs } : {}),
      ...(this.#nextProbeAtMs !== undefined ? { nextProbeAtMs: this.#nextProbeAtMs } : {}),
    };
  }

  beforeRequest(nowMs: number): ProviderCircuitDecision {
    validateNow(nowMs);

    if (this.#state === 'OPEN') {
      if (this.#nextProbeAtMs !== undefined && nowMs >= this.#nextProbeAtMs) {
        const transition = this.#transition('HALF_OPEN', 'probe window reached');
        return {
          allowed: true,
          reason: 'HALF_OPEN_PROBE',
          snapshot: this.snapshot(),
          transition,
        };
      }

      return {
        allowed: false,
        reason: 'CIRCUIT_OPEN',
        snapshot: this.snapshot(),
      };
    }

    return {
      allowed: true,
      reason: this.#state === 'HALF_OPEN' ? 'HALF_OPEN_PROBE' : 'CIRCUIT_CLOSED',
      snapshot: this.snapshot(),
    };
  }

  recordSuccess(nowMs: number): ProviderCircuitUpdate {
    validateNow(nowMs);
    const previous = this.#state;
    this.#state = 'CLOSED';
    this.#consecutiveAvailabilityFailures = 0;
    this.#openedAtMs = undefined;
    this.#nextProbeAtMs = undefined;

    return {
      snapshot: this.snapshot(),
      ...(previous !== 'CLOSED'
        ? {
            transition: {
              from: previous,
              to: 'CLOSED' as const,
              reason: 'provider availability recovered',
            },
          }
        : {}),
    };
  }

  recordFailure(
    kind: ProviderFailureKind,
    nowMs: number,
    retryAfterMs?: number,
  ): ProviderCircuitUpdate {
    validateNow(nowMs);
    validateRetryAfter(retryAfterMs);

    if (!isAvailabilityFailureKind(kind)) {
      return this.recordSuccess(nowMs);
    }

    if (this.#state === 'HALF_OPEN') {
      return this.#open(nowMs, kind, retryAfterMs, 'half-open probe failed');
    }

    if (this.#state === 'OPEN') {
      const extension = effectiveOpenDuration(this.policy.openDurationMs, retryAfterMs);
      const candidate = nowMs + extension;
      if (this.#nextProbeAtMs === undefined || candidate > this.#nextProbeAtMs) {
        this.#nextProbeAtMs = candidate;
      }
      return { snapshot: this.snapshot() };
    }

    this.#consecutiveAvailabilityFailures += 1;
    if (this.#consecutiveAvailabilityFailures < this.policy.failureThreshold) {
      return { snapshot: this.snapshot() };
    }

    return this.#open(nowMs, kind, retryAfterMs, 'availability failure threshold reached');
  }

  #open(
    nowMs: number,
    kind: ProviderFailureKind,
    retryAfterMs: number | undefined,
    reason: string,
  ): ProviderCircuitUpdate {
    const previous = this.#state;
    this.#state = 'OPEN';
    this.#openedAtMs = nowMs;
    this.#nextProbeAtMs =
      nowMs + effectiveOpenDuration(this.policy.openDurationMs, retryAfterMs);

    return {
      snapshot: this.snapshot(),
      transition: {
        from: previous,
        to: 'OPEN',
        reason: `${reason}: ${kind}`,
      },
    };
  }

  #transition(to: ProviderCircuitState, reason: string): ProviderCircuitTransition {
    const from = this.#state;
    this.#state = to;
    return { from, to, reason };
  }
}

export function buildProviderHealthSnapshot(
  providerId: string,
  health: ProviderHealth,
  circuit: ProviderCircuitBreaker,
): ProviderHealthSnapshot {
  if (!providerId.trim()) throw new Error('providerId is required');

  return {
    providerId,
    available: health.available,
    ...(health.detail ? { detail: health.detail } : {}),
    circuit: circuit.snapshot(),
  };
}

export function providerCircuitCanChangeAuthority(): false {
  return false;
}

export function providerCircuitCanTripOnSemanticFailure(): false {
  return false;
}

const availabilityFailures = new Set<ProviderFailureKind>([
  'quota_exhausted',
  'rate_limited',
  'auth_unavailable',
  'provider_unavailable',
  'transport_failure',
]);

function isAvailabilityFailureKind(kind: ProviderFailureKind): boolean {
  return availabilityFailures.has(kind);
}

function effectiveOpenDuration(baseMs: number, retryAfterMs: number | undefined): number {
  return Math.max(baseMs, retryAfterMs ?? 0);
}

function validatePolicy(policy: ProviderCircuitBreakerPolicy): void {
  if (!Number.isInteger(policy.failureThreshold) || policy.failureThreshold < 1) {
    throw new Error('failureThreshold must be a positive integer');
  }
  if (!Number.isFinite(policy.openDurationMs) || policy.openDurationMs < 1) {
    throw new Error('openDurationMs must be positive');
  }
}

function validateNow(nowMs: number): void {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error('nowMs must be a non-negative finite number');
  }
}

function validateRetryAfter(retryAfterMs: number | undefined): void {
  if (
    retryAfterMs !== undefined &&
    (!Number.isFinite(retryAfterMs) || retryAfterMs < 0)
  ) {
    throw new Error('retryAfterMs must be a non-negative finite number');
  }
}
