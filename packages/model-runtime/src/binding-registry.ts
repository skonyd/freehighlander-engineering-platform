import { createHash } from 'node:crypto';

import type {
  ProviderAdapter,
  ProviderCapability,
  ProviderFailureKind,
} from './index.js';

export type BindingRiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface ProviderRegistration {
  readonly id: string;
  readonly adapter: ProviderAdapter;
  readonly capabilities: ReadonlySet<ProviderCapability>;
}

export interface ModelBindingDefinition {
  readonly id: string;
  readonly providerId: string;
  readonly model: string;
  readonly effort?: string;
  readonly requiredCapabilities?: readonly ProviderCapability[];
  readonly allowedRiskTiers: readonly BindingRiskTier[];
  readonly independenceGroup: string;
}

export interface BindingPlanRequest {
  readonly logicalRole: string;
  readonly riskTier: BindingRiskTier;
  readonly requiredCapabilities?: readonly ProviderCapability[];
  readonly requiredIndependenceGroup?: string;
  readonly primaryBindingId: string;
  readonly fallbackBindingIds?: readonly string[];
}

export interface ResolvedBinding {
  readonly bindingId: string;
  readonly providerId: string;
  readonly model: string;
  readonly effort?: string;
  readonly capabilities: readonly ProviderCapability[];
  readonly independenceGroup: string;
}

export interface BindingPlan {
  readonly schemaVersion: 1;
  readonly logicalRole: string;
  readonly riskTier: BindingRiskTier;
  readonly requiredCapabilities: readonly ProviderCapability[];
  readonly requiredIndependenceGroup?: string;
  readonly bindings: readonly ResolvedBinding[];
  readonly hash: string;
  readonly authorityGranted: false;
}

export type BindingSelection =
  | {
      readonly status: 'SELECTED';
      readonly binding: ResolvedBinding;
      readonly fallbackUsed: boolean;
    }
  | {
      readonly status: 'NO_AVAILABLE_BINDING' | 'SEMANTIC_FAILURE_NO_FALLBACK';
      readonly binding?: undefined;
      readonly fallbackUsed: false;
      readonly reason: string;
    };

export class ProviderRegistry {
  readonly #providers = new Map<string, ProviderRegistration>();

  register(adapter: ProviderAdapter): void {
    const id = requireId(adapter.id, 'provider id');
    if (this.#providers.has(id)) throw new Error(`duplicate provider id: ${id}`);

    this.#providers.set(id, {
      id,
      adapter,
      capabilities: new Set(adapter.capabilities()),
    });
  }

  get(id: string): ProviderRegistration {
    const provider = this.#providers.get(id);
    if (!provider) throw new Error(`unknown provider: ${id}`);
    return provider;
  }

  has(id: string): boolean {
    return this.#providers.has(id);
  }
}

export class BindingRegistry {
  readonly #bindings = new Map<string, ModelBindingDefinition>();

  register(binding: ModelBindingDefinition): void {
    const normalized = validateBinding(binding);
    if (this.#bindings.has(normalized.id)) {
      throw new Error(`duplicate binding id: ${normalized.id}`);
    }
    this.#bindings.set(normalized.id, normalized);
  }

  get(id: string): ModelBindingDefinition {
    const binding = this.#bindings.get(id);
    if (!binding) throw new Error(`unknown binding: ${id}`);
    return binding;
  }
}

export function resolveBindingPlan(
  providers: ProviderRegistry,
  bindings: BindingRegistry,
  request: BindingPlanRequest,
): BindingPlan {
  requireId(request.logicalRole, 'logicalRole');
  const requiredCapabilities = uniqueSorted(request.requiredCapabilities ?? []);
  const orderedIds = [request.primaryBindingId, ...(request.fallbackBindingIds ?? [])];

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('binding plan contains duplicate binding references');
  }

  const resolved = orderedIds.map((bindingId) => {
    const binding = bindings.get(bindingId);
    const provider = providers.get(binding.providerId);

    if (!binding.allowedRiskTiers.includes(request.riskTier)) {
      throw new Error(
        `binding ${binding.id} is not allowed for risk tier ${request.riskTier}`,
      );
    }

    const required = uniqueSorted([
      ...requiredCapabilities,
      ...(binding.requiredCapabilities ?? []),
    ]);
    for (const capability of required) {
      if (!provider.capabilities.has(capability)) {
        throw new Error(
          `binding ${binding.id} requires unsupported capability ${capability}`,
        );
      }
    }

    if (
      request.requiredIndependenceGroup !== undefined &&
      binding.independenceGroup !== request.requiredIndependenceGroup
    ) {
      throw new Error(
        `binding ${binding.id} independence group ${binding.independenceGroup} does not satisfy ${request.requiredIndependenceGroup}`,
      );
    }

    return {
      bindingId: binding.id,
      providerId: binding.providerId,
      model: binding.model,
      ...(binding.effort ? { effort: binding.effort } : {}),
      capabilities: required,
      independenceGroup: binding.independenceGroup,
    } satisfies ResolvedBinding;
  });

  const identity = {
    schemaVersion: 1,
    logicalRole: request.logicalRole,
    riskTier: request.riskTier,
    requiredCapabilities,
    requiredIndependenceGroup: request.requiredIndependenceGroup ?? null,
    bindings: resolved,
  } as const;

  return {
    schemaVersion: 1,
    logicalRole: request.logicalRole,
    riskTier: request.riskTier,
    requiredCapabilities,
    ...(request.requiredIndependenceGroup
      ? { requiredIndependenceGroup: request.requiredIndependenceGroup }
      : {}),
    bindings: resolved,
    hash: sha256Canonical(identity),
    authorityGranted: false,
  };
}

export function selectBinding(
  plan: BindingPlan,
  availability: Readonly<Record<string, boolean>>,
  previousFailure?: ProviderFailureKind,
): BindingSelection {
  if (previousFailure !== undefined && !availabilityFailures.has(previousFailure)) {
    return {
      status: 'SEMANTIC_FAILURE_NO_FALLBACK',
      fallbackUsed: false,
      reason: `fallback forbidden after ${previousFailure}`,
    };
  }

  for (const [index, binding] of plan.bindings.entries()) {
    if (availability[binding.providerId] === true) {
      return {
        status: 'SELECTED',
        binding,
        fallbackUsed: index > 0,
      };
    }
  }

  return {
    status: 'NO_AVAILABLE_BINDING',
    fallbackUsed: false,
    reason: 'no eligible provider is currently available',
  };
}

export function bindingRegistryCanGrantAuthority(): false {
  return false;
}

const availabilityFailures = new Set<ProviderFailureKind>([
  'quota_exhausted',
  'rate_limited',
  'auth_unavailable',
  'provider_unavailable',
  'transport_failure',
]);

function validateBinding(binding: ModelBindingDefinition): ModelBindingDefinition {
  requireId(binding.id, 'binding id');
  requireId(binding.providerId, 'provider id');
  requireId(binding.model, 'model');
  requireId(binding.independenceGroup, 'independenceGroup');
  if (binding.allowedRiskTiers.length === 0) {
    throw new Error(`binding ${binding.id} must allow at least one risk tier`);
  }

  return {
    ...binding,
    allowedRiskTiers: [...new Set(binding.allowedRiskTiers)],
    requiredCapabilities: uniqueSorted(binding.requiredCapabilities ?? []),
  };
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function requireId(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} is required`);
  return value;
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
