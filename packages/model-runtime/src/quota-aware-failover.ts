import { createHash } from 'node:crypto';

import { validateBindingPlan } from './binding-registry.js';
import type { BindingPlan, ResolvedBinding } from './binding-registry.js';
import type { ProviderFailureKind } from './index.js';

export type BindingReturnPolicy =
  | 'STAY_ON_FALLBACK'
  | 'ASK_BEFORE_RETURN'
  | 'AUTO_RETURN';

export type BindingFailureScope = 'BINDING' | 'PROVIDER';

export type BindingFailoverStatus =
  | 'SWITCHED_TO_FALLBACK'
  | 'NO_FALLBACK_AVAILABLE'
  | 'FALLBACK_FORBIDDEN';

export type PreferredReturnStatus =
  | 'ALREADY_PREFERRED'
  | 'WAITING_FOR_RECOVERY'
  | 'APPROVAL_REQUIRED'
  | 'STAYING_ON_FALLBACK'
  | 'RETURNED_TO_PREFERRED';

export interface BindingFailoverPolicyV1 {
  readonly returnPolicy: BindingReturnPolicy;
  readonly unknownResetRecheckMs: number;
}

export interface BindingCooldownV1 {
  readonly bindingId: string;
  readonly providerId: string;
  readonly model: string;
  readonly failureKind: ProviderFailureKind;
  readonly scope: BindingFailureScope;
  readonly observedAt: string;
  readonly nextCheckAt: string;
  readonly timingSource: 'RESET_AT' | 'RETRY_AFTER' | 'BOUNDED_RECHECK';
}

export interface RoleBindingFailoverStateV1 {
  readonly schemaVersion: 1;
  readonly logicalRole: string;
  readonly planHash: string;
  readonly preferredBindingId: string;
  readonly activeBindingId: string;
  readonly policy: BindingFailoverPolicyV1;
  readonly cooldowns: readonly BindingCooldownV1[];
  readonly nextCheckAt?: string;
  readonly stateHash: string;
  readonly authority: 'NONE';
}

export interface BindingFailureObservation {
  readonly failureKind: ProviderFailureKind;
  readonly scope: BindingFailureScope;
  readonly observedAt: string;
  readonly retryAfterMs?: number;
  readonly resetAt?: string;
  readonly availabilityByBinding: Readonly<Record<string, boolean>>;
}

export interface BindingFailoverTransition {
  readonly status: BindingFailoverStatus;
  readonly state: RoleBindingFailoverStateV1;
  readonly selectedBindingId?: string;
  readonly reason: string;
}

export interface BindingRecoveryObservation {
  readonly bindingId: string;
  readonly observedAt: string;
  readonly available: boolean;
  readonly retryAfterMs?: number;
  readonly resetAt?: string;
}

export interface PreferredBindingReturnInput {
  readonly preferredAvailable: boolean;
  readonly userApprovedReturn?: boolean;
}

export interface PreferredBindingReturnTransition {
  readonly status: PreferredReturnStatus;
  readonly state: RoleBindingFailoverStateV1;
  readonly reason: string;
}

const availabilityFailures = new Set<ProviderFailureKind>([
  'quota_exhausted',
  'rate_limited',
  'auth_unavailable',
  'provider_unavailable',
  'transport_failure',
]);

export function createRoleBindingFailoverState(
  plan: BindingPlan,
  policy: BindingFailoverPolicyV1,
): RoleBindingFailoverStateV1 {
  validateBindingPlan(plan);
  validatePolicy(policy);
  const preferred = plan.bindings[0]!;
  return buildState({
    logicalRole: plan.logicalRole,
    planHash: plan.hash,
    preferredBindingId: preferred.bindingId,
    activeBindingId: preferred.bindingId,
    policy,
    cooldowns: [],
  });
}

export function recordActiveBindingFailure(
  state: RoleBindingFailoverStateV1,
  plan: BindingPlan,
  observation: BindingFailureObservation,
): BindingFailoverTransition {
  validateStateAgainstPlan(state, plan);
  const observedAt = normalizeTimestamp(observation.observedAt, 'observedAt');

  if (!availabilityFailures.has(observation.failureKind)) {
    return {
      status: 'FALLBACK_FORBIDDEN',
      state,
      reason: `fallback forbidden after ${observation.failureKind}`,
    };
  }

  const active = bindingById(plan, state.activeBindingId);
  const cooldown = buildCooldown(active, state.policy, observation, observedAt);
  const cooldowns = upsertCooldown(state.cooldowns, cooldown);
  const currentIndex = plan.bindings.findIndex((binding) => binding.bindingId === active.bindingId);

  const candidate = plan.bindings
    .slice(currentIndex + 1)
    .find(
      (binding) =>
        observation.availabilityByBinding[binding.bindingId] === true &&
        !isBlockedByCooldown(cooldowns, binding),
    );

  if (!candidate) {
    return {
      status: 'NO_FALLBACK_AVAILABLE',
      state: buildState({
        ...state,
        cooldowns,
      }),
      reason: 'no later eligible fallback binding is currently available',
    };
  }

  return {
    status: 'SWITCHED_TO_FALLBACK',
    state: buildState({
      ...state,
      activeBindingId: candidate.bindingId,
      cooldowns,
    }),
    selectedBindingId: candidate.bindingId,
    reason: `availability failure on ${active.bindingId}; switched to ${candidate.bindingId}`,
  };
}

export function recordBindingRecoveryObservation(
  state: RoleBindingFailoverStateV1,
  plan: BindingPlan,
  observation: BindingRecoveryObservation,
): RoleBindingFailoverStateV1 {
  validateStateAgainstPlan(state, plan);
  const binding = bindingById(plan, observation.bindingId);
  const observedAt = normalizeTimestamp(observation.observedAt, 'observedAt');

  const applicable = state.cooldowns.filter((cooldown) =>
    cooldownAppliesToBinding(cooldown, binding),
  );
  if (applicable.length === 0) {
    if (observation.available) return state;
    throw new Error('binding recovery observation requires an existing cooldown');
  }

  if (observation.available) {
    const cooldowns = state.cooldowns.filter(
      (cooldown) => !cooldownAppliesToBinding(cooldown, binding),
    );
    return buildState({ ...state, cooldowns });
  }

  const updated = state.cooldowns.map((cooldown) => {
    if (!cooldownAppliesToBinding(cooldown, binding)) return cooldown;
    const timing = resolveNextCheck(
      observedAt,
      state.policy,
      observation.retryAfterMs,
      observation.resetAt,
    );
    return {
      ...cooldown,
      observedAt,
      nextCheckAt: timing.nextCheckAt,
      timingSource: timing.timingSource,
    };
  });

  return buildState({ ...state, cooldowns: updated });
}

export function evaluatePreferredBindingReturn(
  state: RoleBindingFailoverStateV1,
  plan: BindingPlan,
  input: PreferredBindingReturnInput,
): PreferredBindingReturnTransition {
  validateStateAgainstPlan(state, plan);

  if (state.activeBindingId === state.preferredBindingId) {
    return { status: 'ALREADY_PREFERRED', state, reason: 'preferred binding is already active' };
  }

  const preferred = bindingById(plan, state.preferredBindingId);
  if (isBlockedByCooldown(state.cooldowns, preferred) || !input.preferredAvailable) {
    return {
      status: 'WAITING_FOR_RECOVERY',
      state,
      reason: 'preferred binding has not been confirmed available again',
    };
  }

  if (state.policy.returnPolicy === 'STAY_ON_FALLBACK') {
    return {
      status: 'STAYING_ON_FALLBACK',
      state,
      reason: 'return policy keeps the current fallback active',
    };
  }

  if (
    state.policy.returnPolicy === 'ASK_BEFORE_RETURN' &&
    input.userApprovedReturn !== true
  ) {
    return {
      status: 'APPROVAL_REQUIRED',
      state,
      reason: 'user approval is required before returning to the preferred binding',
    };
  }

  return {
    status: 'RETURNED_TO_PREFERRED',
    state: buildState({ ...state, activeBindingId: state.preferredBindingId }),
    reason:
      state.policy.returnPolicy === 'AUTO_RETURN'
        ? 'preferred binding recovered and auto-return is enabled'
        : 'preferred binding recovered and user approved the return',
  };
}

export function listDueBindingChecks(
  state: RoleBindingFailoverStateV1,
  observedAt: string,
): readonly BindingCooldownV1[] {
  validateStateShape(state);
  const now = Date.parse(normalizeTimestamp(observedAt, 'observedAt'));
  return state.cooldowns
    .filter((cooldown) => Date.parse(cooldown.nextCheckAt) <= now)
    .sort(
      (left, right) =>
        left.nextCheckAt.localeCompare(right.nextCheckAt) ||
        left.bindingId.localeCompare(right.bindingId),
    );
}

export function validateRoleBindingFailoverState(
  state: RoleBindingFailoverStateV1,
  plan: BindingPlan,
): void {
  validateStateAgainstPlan(state, plan);
}

export function quotaAwareFailoverCanGrantAuthority(): false {
  return false;
}

export function semanticFailureCanAdvanceFallbackChain(): false {
  return false;
}

function buildCooldown(
  binding: ResolvedBinding,
  policy: BindingFailoverPolicyV1,
  observation: BindingFailureObservation,
  observedAt: string,
): BindingCooldownV1 {
  const timing = resolveNextCheck(
    observedAt,
    policy,
    observation.retryAfterMs,
    observation.resetAt,
  );
  if (observation.scope !== 'BINDING' && observation.scope !== 'PROVIDER') {
    throw new Error('binding failure scope is invalid');
  }
  return {
    bindingId: binding.bindingId,
    providerId: binding.providerId,
    model: binding.model,
    failureKind: observation.failureKind,
    scope: observation.scope,
    observedAt,
    nextCheckAt: timing.nextCheckAt,
    timingSource: timing.timingSource,
  };
}

function resolveNextCheck(
  observedAt: string,
  policy: BindingFailoverPolicyV1,
  retryAfterMs?: number,
  resetAt?: string,
): Pick<BindingCooldownV1, 'nextCheckAt' | 'timingSource'> {
  const observedMs = Date.parse(observedAt);

  if (resetAt !== undefined) {
    const normalizedReset = normalizeTimestamp(resetAt, 'resetAt');
    if (Date.parse(normalizedReset) < observedMs) {
      throw new Error('resetAt cannot be before observedAt');
    }
    return { nextCheckAt: normalizedReset, timingSource: 'RESET_AT' };
  }

  if (retryAfterMs !== undefined) {
    if (!Number.isInteger(retryAfterMs) || retryAfterMs < 0) {
      throw new Error('retryAfterMs must be a non-negative integer');
    }
    return {
      nextCheckAt: new Date(observedMs + retryAfterMs).toISOString(),
      timingSource: 'RETRY_AFTER',
    };
  }

  return {
    nextCheckAt: new Date(observedMs + policy.unknownResetRecheckMs).toISOString(),
    timingSource: 'BOUNDED_RECHECK',
  };
}

function upsertCooldown(
  cooldowns: readonly BindingCooldownV1[],
  next: BindingCooldownV1,
): readonly BindingCooldownV1[] {
  const kept = cooldowns.filter((existing) => {
    if (next.scope === 'PROVIDER') return existing.providerId !== next.providerId;
    return existing.bindingId !== next.bindingId;
  });
  return [...kept, next].sort(
    (left, right) =>
      left.providerId.localeCompare(right.providerId) ||
      left.bindingId.localeCompare(right.bindingId),
  );
}

function isBlockedByCooldown(
  cooldowns: readonly BindingCooldownV1[],
  binding: ResolvedBinding,
): boolean {
  return cooldowns.some((cooldown) => cooldownAppliesToBinding(cooldown, binding));
}

function cooldownAppliesToBinding(
  cooldown: BindingCooldownV1,
  binding: ResolvedBinding,
): boolean {
  return cooldown.scope === 'PROVIDER'
    ? cooldown.providerId === binding.providerId
    : cooldown.bindingId === binding.bindingId;
}

function bindingById(plan: BindingPlan, bindingId: string): ResolvedBinding {
  const binding = plan.bindings.find((candidate) => candidate.bindingId === bindingId);
  if (!binding) throw new Error(`binding ${bindingId} is not present in the pinned plan`);
  return binding;
}

function validateStateAgainstPlan(state: RoleBindingFailoverStateV1, plan: BindingPlan): void {
  validateBindingPlan(plan);
  validateStateShape(state);
  if (state.planHash !== plan.hash) throw new Error('failover state plan hash mismatch');
  if (state.logicalRole !== plan.logicalRole) throw new Error('failover state logical role mismatch');
  if (state.preferredBindingId !== plan.bindings[0]!.bindingId) {
    throw new Error('failover state preferred binding mismatch');
  }
  bindingById(plan, state.activeBindingId);
  for (const cooldown of state.cooldowns) {
    const binding = bindingById(plan, cooldown.bindingId);
    if (binding.providerId !== cooldown.providerId || binding.model !== cooldown.model) {
      throw new Error('failover cooldown binding identity mismatch');
    }
  }
  const rebuilt = buildState({
    logicalRole: state.logicalRole,
    planHash: state.planHash,
    preferredBindingId: state.preferredBindingId,
    activeBindingId: state.activeBindingId,
    policy: state.policy,
    cooldowns: state.cooldowns,
  });
  if (rebuilt.stateHash !== state.stateHash) throw new Error('failover state hash mismatch');
}

function validateStateShape(state: RoleBindingFailoverStateV1): void {
  if (state.schemaVersion !== 1) throw new Error('failover state schemaVersion must be 1');
  if (state.authority !== 'NONE') throw new Error('failover state authority must remain NONE');
  validatePolicy(state.policy);
  requireText(state.logicalRole, 'logicalRole');
  requireSha256(state.planHash, 'planHash');
  requireText(state.preferredBindingId, 'preferredBindingId');
  requireText(state.activeBindingId, 'activeBindingId');
  requireSha256(state.stateHash, 'stateHash');
  for (const cooldown of state.cooldowns) {
    requireText(cooldown.bindingId, 'cooldown bindingId');
    requireText(cooldown.providerId, 'cooldown providerId');
    requireText(cooldown.model, 'cooldown model');
    normalizeTimestamp(cooldown.observedAt, 'cooldown observedAt');
    normalizeTimestamp(cooldown.nextCheckAt, 'cooldown nextCheckAt');
    if (!availabilityFailures.has(cooldown.failureKind)) {
      throw new Error('cooldown failure kind must be availability-class');
    }
    if (cooldown.scope !== 'BINDING' && cooldown.scope !== 'PROVIDER') {
      throw new Error('cooldown scope is invalid');
    }
  }
}

function buildState(
  input: Omit<RoleBindingFailoverStateV1, 'schemaVersion' | 'nextCheckAt' | 'stateHash' | 'authority'>,
): RoleBindingFailoverStateV1 {
  validatePolicy(input.policy);
  const cooldowns = [...input.cooldowns].sort(
    (left, right) =>
      left.nextCheckAt.localeCompare(right.nextCheckAt) ||
      left.bindingId.localeCompare(right.bindingId),
  );
  const nextCheckAt = cooldowns[0]?.nextCheckAt;
  const identity = {
    schemaVersion: 1,
    logicalRole: input.logicalRole,
    planHash: input.planHash,
    preferredBindingId: input.preferredBindingId,
    activeBindingId: input.activeBindingId,
    policy: input.policy,
    cooldowns,
    nextCheckAt: nextCheckAt ?? null,
  } as const;

  return {
    schemaVersion: 1,
    logicalRole: input.logicalRole,
    planHash: input.planHash,
    preferredBindingId: input.preferredBindingId,
    activeBindingId: input.activeBindingId,
    policy: input.policy,
    cooldowns,
    ...(nextCheckAt ? { nextCheckAt } : {}),
    stateHash: sha256Canonical(identity),
    authority: 'NONE',
  };
}

function validatePolicy(policy: BindingFailoverPolicyV1): void {
  if (!['STAY_ON_FALLBACK', 'ASK_BEFORE_RETURN', 'AUTO_RETURN'].includes(policy.returnPolicy)) {
    throw new Error('binding return policy is invalid');
  }
  if (!Number.isInteger(policy.unknownResetRecheckMs) || policy.unknownResetRecheckMs < 1) {
    throw new Error('unknownResetRecheckMs must be an integer >= 1');
  }
}

function normalizeTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value.trim() || Number.isNaN(parsed)) throw new Error(`${field} must be an ISO timestamp`);
  return new Date(parsed).toISOString();
}

function requireText(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required`);
}

function requireSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field} must be lowercase sha256`);
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
