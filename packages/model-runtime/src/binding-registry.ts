import { createHash } from 'node:crypto';

import type { ProviderAdapter, ProviderCapability, ProviderFailureKind } from './index.js';

export type BindingRiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';

const availabilityFailures = new Set<ProviderFailureKind>([
  'quota_exhausted',
  'rate_limited',
  'auth_unavailable',
  'provider_unavailable',
  'transport_failure',
]);

export interface ModelBinding {
  readonly id: string;
  readonly providerId: string;
  readonly model: string;
  readonly capabilities: readonly ProviderCapability[];
  readonly independenceGroup: string;
  readonly allowedRiskTiers: readonly BindingRiskTier[];
  readonly effort?: string;
}

export interface BindingPlan {
  readonly id: string;
  readonly logicalRole: string;
  readonly primaryBindingId: string;
  readonly fallbackBindingIds: readonly string[];
  readonly fallbackPolicy: 'availability-only';
  readonly requiredCapabilities?: readonly ProviderCapability[];
}

export interface BindingSelectionRequest {
  readonly riskTier: BindingRiskTier;
  readonly requiredCapabilities?: readonly ProviderCapability[];
  readonly forbiddenIndependenceGroups?: readonly string[];
  readonly unavailableBindingIds?: readonly string[];
  readonly previousFailureKind?: ProviderFailureKind;
}

export type BindingSelectionStatus = 'SELECTED' | 'NO_ELIGIBLE_BINDING' | 'FALLBACK_FORBIDDEN';

export interface BindingSelection {
  readonly status: BindingSelectionStatus;
  readonly reason: string;
  readonly binding?: ModelBinding;
  readonly usedFallback: boolean;
}

export interface BindingPlanSnapshot {
  readonly schemaVersion: 1;
  readonly plan: BindingPlan;
  readonly bindings: readonly ModelBinding[];
  readonly hash: string;
}

export class ProviderRegistry {
  readonly #providers = new Map<string, ProviderAdapter>();

  register(provider: ProviderAdapter): void {
    requireId(provider.id, 'provider id');
    if (this.#providers.has(provider.id)) {
      throw new Error(`duplicate provider id: ${provider.id}`);
    }
    this.#providers.set(provider.id, provider);
  }

  get(id: string): ProviderAdapter {
    const provider = this.#providers.get(id);
    if (!provider) throw new Error(`unknown provider: ${id}`);
    return provider;
  }

  has(id: string): boolean {
    return this.#providers.has(id);
  }

  ids(): readonly string[] {
    return [...this.#providers.keys()].sort();
  }
}

export class BindingRegistry {
  readonly #bindings = new Map<string, ModelBinding>();

  constructor(readonly providers: ProviderRegistry) {}

  register(binding: ModelBinding): void {
    validateBinding(binding);
    if (this.#bindings.has(binding.id)) {
      throw new Error(`duplicate binding id: ${binding.id}`);
    }

    const provider = this.providers.get(binding.providerId);
    const providerCapabilities = provider.capabilities();
    for (const capability of binding.capabilities) {
      if (!providerCapabilities.has(capability)) {
        throw new Error(
          `binding ${binding.id} claims unsupported provider capability: ${capability}`,
        );
      }
    }

    this.#bindings.set(binding.id, freezeBinding(binding));
  }

  get(id: string): ModelBinding {
    const binding = this.#bindings.get(id);
    if (!binding) throw new Error(`unknown binding: ${id}`);
    return binding;
  }

  has(id: string): boolean {
    return this.#bindings.has(id);
  }

  ids(): readonly string[] {
    return [...this.#bindings.keys()].sort();
  }

  validatePlan(plan: BindingPlan): void {
    validatePlanShape(plan);
    this.get(plan.primaryBindingId);

    const seen = new Set<string>([plan.primaryBindingId]);
    for (const fallbackId of plan.fallbackBindingIds) {
      if (seen.has(fallbackId)) {
        throw new Error(`binding plan ${plan.id} contains duplicate binding: ${fallbackId}`);
      }
      seen.add(fallbackId);
      this.get(fallbackId);
    }
  }

  select(plan: BindingPlan, request: BindingSelectionRequest): BindingSelection {
    this.validatePlan(plan);
    validateSelectionRequest(request);

    if (
      request.previousFailureKind !== undefined &&
      !availabilityFailures.has(request.previousFailureKind)
    ) {
      return {
        status: 'FALLBACK_FORBIDDEN',
        reason: `fallback forbidden after non-availability failure: ${request.previousFailureKind}`,
        usedFallback: false,
      };
    }

    const requiredCapabilities = unique([
      ...(plan.requiredCapabilities ?? []),
      ...(request.requiredCapabilities ?? []),
    ]);
    const unavailable = new Set(request.unavailableBindingIds ?? []);
    const forbiddenGroups = new Set(request.forbiddenIndependenceGroups ?? []);
    const candidateIds = [plan.primaryBindingId, ...plan.fallbackBindingIds];

    for (const [index, bindingId] of candidateIds.entries()) {
      if (unavailable.has(bindingId)) continue;
      const binding = this.get(bindingId);
      if (!binding.allowedRiskTiers.includes(request.riskTier)) continue;
      if (forbiddenGroups.has(binding.independenceGroup)) continue;
      if (!requiredCapabilities.every((capability) => binding.capabilities.includes(capability))) {
        continue;
      }

      return {
        status: 'SELECTED',
        reason:
          index === 0 ? 'primary binding eligible' : 'eligible availability fallback selected',
        binding,
        usedFallback: index > 0,
      };
    }

    return {
      status: 'NO_ELIGIBLE_BINDING',
      reason: 'no binding satisfies availability, capability, risk and independence requirements',
      usedFallback: false,
    };
  }

  snapshot(plan: BindingPlan): BindingPlanSnapshot {
    this.validatePlan(plan);
    const bindings = [plan.primaryBindingId, ...plan.fallbackBindingIds].map((id) => this.get(id));
    const identity = {
      schemaVersion: 1 as const,
      plan: freezePlan(plan),
      bindings,
    };
    return {
      ...identity,
      hash: sha256(canonicalJson(identity)),
    };
  }
}

export function bindingRegistryCanGrantAuthority(): false {
  return false;
}

export function bindingFallbackCanOverrideSemanticFailure(): false {
  return false;
}

function validateBinding(binding: ModelBinding): void {
  requireId(binding.id, 'binding id');
  requireId(binding.providerId, 'provider id');
  requireText(binding.model, 'binding model');
  requireId(binding.independenceGroup, 'independence group');

  if (binding.allowedRiskTiers.length === 0) {
    throw new Error(`binding ${binding.id} must allow at least one risk tier`);
  }
  if (new Set(binding.allowedRiskTiers).size !== binding.allowedRiskTiers.length) {
    throw new Error(`binding ${binding.id} has duplicate risk tiers`);
  }
  if (new Set(binding.capabilities).size !== binding.capabilities.length) {
    throw new Error(`binding ${binding.id} has duplicate capabilities`);
  }
}

function validatePlanShape(plan: BindingPlan): void {
  requireId(plan.id, 'binding plan id');
  requireId(plan.logicalRole, 'logical role');
  requireId(plan.primaryBindingId, 'primary binding id');
  if (plan.fallbackPolicy !== 'availability-only') {
    throw new Error('binding fallback policy must be availability-only');
  }
  if (new Set(plan.requiredCapabilities ?? []).size !== (plan.requiredCapabilities ?? []).length) {
    throw new Error(`binding plan ${plan.id} has duplicate required capabilities`);
  }
}

function validateSelectionRequest(request: BindingSelectionRequest): void {
  if (!['NORMAL', 'HIGH', 'CRITICAL'].includes(request.riskTier)) {
    throw new Error(`invalid risk tier: ${request.riskTier}`);
  }
}

function freezeBinding(binding: ModelBinding): ModelBinding {
  return {
    ...binding,
    capabilities: [...binding.capabilities],
    allowedRiskTiers: [...binding.allowedRiskTiers],
  };
}

function freezePlan(plan: BindingPlan): BindingPlan {
  return {
    ...plan,
    fallbackBindingIds: [...plan.fallbackBindingIds],
    ...(plan.requiredCapabilities ? { requiredCapabilities: [...plan.requiredCapabilities] } : {}),
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function requireId(value: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(value)) {
    throw new Error(`${name} must be a stable lowercase id`);
  }
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
