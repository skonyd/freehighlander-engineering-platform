import { validateSecretBindingV1, type SecretBindingV1 } from './portable-secret-binding.js';
import {
  validateSecretInjectionReceipt,
  type SecretInjectionPlan,
  type SecretInjectionReceipt,
} from './secret-broker.js';
import type {
  SecretMaterialInjectionSink,
  SecretResolverRegistry,
} from './secret-resolver-runtime.js';

export type SecretReceiptReleaseReason =
  'USER_CANCEL' | 'DEADLINE_EXCEEDED' | 'SHUTDOWN' | 'PARENT_CANCELLED' | 'COMPLETED' | 'EXPIRED';

export interface SecretReceiptReleaseFailure {
  readonly receiptId: string;
  readonly handleId: string;
  readonly failureClass: 'REVOKE_FAILED';
}

export interface SecretReceiptReleaseSummary {
  readonly reason: SecretReceiptReleaseReason;
  readonly attemptedReceiptIds: readonly string[];
  readonly revokedReceiptIds: readonly string[];
  readonly failures: readonly SecretReceiptReleaseFailure[];
  readonly activeReceiptCount: number;
  readonly complete: boolean;
  readonly authority: 'NONE';
  readonly secretValuesPresent: false;
}

interface TrackedSecretReceipt {
  readonly binding: SecretBindingV1;
  readonly receipt: SecretInjectionReceipt;
}

export class SecretReceiptScope {
  readonly #entries = new Map<string, TrackedSecretReceipt>();

  get activeReceiptCount(): number {
    return this.#entries.size;
  }

  track(
    binding: SecretBindingV1,
    plan: SecretInjectionPlan,
    receipt: SecretInjectionReceipt,
  ): void {
    validateSecretBindingV1(binding);
    if (binding.handleId !== plan.handleId) {
      throw new Error('secret receipt binding and injection plan mismatch');
    }
    const validation = validateSecretInjectionReceipt(plan, receipt);
    if (!validation.valid) {
      throw new Error(
        'secret receipt tracking rejected invalid receipt: ' + validation.errors.join('; '),
      );
    }
    if (this.#entries.has(receipt.receiptId)) {
      throw new Error('duplicate tracked secret receipt id');
    }

    this.#entries.set(receipt.receiptId, {
      binding: { ...binding },
      receipt: { ...receipt },
    });
  }

  has(receiptId: string): boolean {
    return this.#entries.has(receiptId);
  }

  activeReceiptIds(): readonly string[] {
    return [...this.#entries.keys()].sort();
  }

  async revokeAll(
    registry: Pick<SecretResolverRegistry, 'revoke'>,
    sink: SecretMaterialInjectionSink,
    reason: Exclude<SecretReceiptReleaseReason, 'EXPIRED'>,
  ): Promise<SecretReceiptReleaseSummary> {
    validateReleaseReason(reason);
    return this.#revokeReceiptIds(this.activeReceiptIds(), registry, sink, reason);
  }

  async revokeExpired(
    now: string,
    registry: Pick<SecretResolverRegistry, 'revoke'>,
    sink: SecretMaterialInjectionSink,
  ): Promise<SecretReceiptReleaseSummary> {
    const nowMs = requireTimestamp(now, 'now');
    const expiredReceiptIds = [...this.#entries.values()]
      .filter((entry) => Date.parse(entry.receipt.expiresAt) <= nowMs)
      .map((entry) => entry.receipt.receiptId)
      .sort();
    return this.#revokeReceiptIds(expiredReceiptIds, registry, sink, 'EXPIRED');
  }

  async #revokeReceiptIds(
    receiptIds: readonly string[],
    registry: Pick<SecretResolverRegistry, 'revoke'>,
    sink: SecretMaterialInjectionSink,
    reason: SecretReceiptReleaseReason,
  ): Promise<SecretReceiptReleaseSummary> {
    const revokedReceiptIds: string[] = [];
    const failures: SecretReceiptReleaseFailure[] = [];

    for (const receiptId of receiptIds) {
      const tracked = this.#entries.get(receiptId);
      if (!tracked) continue;
      try {
        await registry.revoke(tracked.binding, receiptId, sink);
        this.#entries.delete(receiptId);
        revokedReceiptIds.push(receiptId);
      } catch {
        failures.push({
          receiptId,
          handleId: tracked.receipt.handleId,
          failureClass: 'REVOKE_FAILED',
        });
      }
    }

    return {
      reason,
      attemptedReceiptIds: [...receiptIds],
      revokedReceiptIds,
      failures,
      activeReceiptCount: this.#entries.size,
      complete: failures.length === 0,
      authority: 'NONE',
      secretValuesPresent: false,
    };
  }
}

export function secretReceiptScopeIsDrained(scope: SecretReceiptScope): boolean {
  return scope.activeReceiptCount === 0;
}

export function secretReceiptLifecycleCanPersistSecretValues(): false {
  return false;
}

export function secretReceiptLifecycleCanGrantAuthority(): false {
  return false;
}

function validateReleaseReason(reason: SecretReceiptReleaseReason): void {
  if (
    ![
      'USER_CANCEL',
      'DEADLINE_EXCEEDED',
      'SHUTDOWN',
      'PARENT_CANCELLED',
      'COMPLETED',
      'EXPIRED',
    ].includes(reason)
  ) {
    throw new Error('unsupported secret receipt release reason');
  }
}

function requireTimestamp(value: string, name: string): number {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(name + ' must be a canonical ISO timestamp');
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(name + ' must be a canonical ISO timestamp');
  }
  return parsed;
}
