import { createHash } from 'node:crypto';

import {
  BindingRegistry,
  resolveBindingPlan,
  validateBindingPlan,
  type BindingPlan,
  type BindingRiskTier,
  type ModelBindingDefinition,
  type ProviderRegistry,
} from './binding-registry.js';
import type { ModelCatalogManagementService } from './model-catalog-management.js';
import type { ModelQualificationSnapshotV1 } from './model-qualification.js';

export interface RoleBindingManagementAuditEvent {
  readonly type: 'model.binding.changed';
  readonly operationId: string;
  readonly timestamp: string;
  readonly payload: {
    readonly action: 'BINDING_CHANGE';
    readonly providerId: string;
    readonly modelId: string;
    readonly bindingId: string;
    readonly logicalRole: string;
    readonly riskTier: BindingRiskTier;
    readonly previousHash?: string;
    readonly currentHash: string;
    readonly previousState?: string;
    readonly currentState: string;
    readonly itemCount: number;
  };
}

export interface RoleBindingManagementAuditSink {
  append(event: RoleBindingManagementAuditEvent): Promise<void>;
}

export interface RoleBindingPreviewInput {
  readonly logicalRole: string;
  readonly riskTier: BindingRiskTier;
  readonly primary: ModelBindingDefinition;
  readonly fallbacks?: readonly ModelBindingDefinition[];
  readonly qualifications: Readonly<Record<string, ModelQualificationSnapshotV1>>;
  readonly requiredCapabilities?: BindingPlan['requiredCapabilities'];
  readonly requiredIndependenceGroup?: string;
}

export interface RoleBindingPublicationV1 {
  readonly schemaVersion: 1;
  readonly logicalRole: string;
  readonly riskTier: BindingRiskTier;
  readonly publishedAt: string;
  readonly primary: ModelBindingDefinition;
  readonly fallbacks: readonly ModelBindingDefinition[];
  readonly plan: BindingPlan;
  readonly hash: string;
  readonly authority: 'NONE';
}

export class RoleBindingManagementService {
  readonly #published = new Map<string, RoleBindingPublicationV1>();

  constructor(
    readonly providers: ProviderRegistry,
    readonly catalogs: ModelCatalogManagementService,
    readonly auditSink: RoleBindingManagementAuditSink,
    initialPublications: readonly RoleBindingPublicationV1[] = [],
  ) {
    for (const publication of initialPublications) {
      validateRoleBindingPublicationV1(publication);
      const key = publicationKey(publication.logicalRole, publication.riskTier);
      if (this.#published.has(key)) {
        throw new Error(
          `duplicate initial role binding publication ${publication.logicalRole}/${publication.riskTier}`,
        );
      }
      this.#published.set(key, publication);
    }
  }

  preview(input: RoleBindingPreviewInput): BindingPlan {
    const logicalRole = requireId(input.logicalRole, 'logicalRole');
    const fallbacks = input.fallbacks ?? [];
    const definitions = [input.primary, ...fallbacks];
    const registry = new BindingRegistry();

    for (const definition of definitions) {
      registry.register(cloneBinding(definition));
    }

    const catalogByProvider = Object.fromEntries(
      [...new Set(definitions.map((definition) => definition.providerId))]
        .sort()
        .map((providerId) => {
          const catalog = this.catalogs.getCatalog(providerId);
          if (!catalog) {
            throw new Error(`no managed catalog for provider ${providerId}`);
          }
          return [providerId, catalog];
        }),
    );

    return resolveBindingPlan(this.providers, registry, {
      logicalRole,
      riskTier: input.riskTier,
      ...(input.requiredCapabilities ? { requiredCapabilities: input.requiredCapabilities } : {}),
      ...(input.requiredIndependenceGroup
        ? { requiredIndependenceGroup: input.requiredIndependenceGroup }
        : {}),
      primaryBindingId: input.primary.id,
      ...(fallbacks.length > 0
        ? { fallbackBindingIds: fallbacks.map((binding) => binding.id) }
        : {}),
      catalogByProvider,
      qualificationByBinding: input.qualifications,
    });
  }

  async publish(
    input: RoleBindingPreviewInput & {
      readonly operationId: string;
      readonly publishedAt: string;
    },
  ): Promise<RoleBindingPublicationV1> {
    const operationId = requireId(input.operationId, 'operationId');
    const publishedAt = normalizeTimestamp(input.publishedAt, 'publishedAt');
    const logicalRole = requireId(input.logicalRole, 'logicalRole');
    const plan = this.preview(input);
    const key = publicationKey(logicalRole, input.riskTier);
    const previous = this.#published.get(key);

    const identity = {
      schemaVersion: 1 as const,
      logicalRole,
      riskTier: input.riskTier,
      publishedAt,
      primary: cloneBinding(input.primary),
      fallbacks: (input.fallbacks ?? []).map(cloneBinding),
      plan,
      authority: 'NONE' as const,
    };
    const publication: RoleBindingPublicationV1 = {
      ...identity,
      hash: sha256Canonical(identity),
    };

    const event: RoleBindingManagementAuditEvent = {
      type: 'model.binding.changed',
      operationId,
      timestamp: publishedAt,
      payload: {
        action: 'BINDING_CHANGE',
        providerId: input.primary.providerId,
        modelId: input.primary.model,
        bindingId: input.primary.id,
        logicalRole,
        riskTier: input.riskTier,
        ...(previous ? { previousHash: previous.hash } : {}),
        currentHash: publication.hash,
        ...(previous
          ? {
              previousState: `${previous.primary.id}@${previous.primary.version}`,
            }
          : {}),
        currentState: `${input.primary.id}@${input.primary.version}`,
        itemCount: publication.plan.bindings.length,
      },
    };

    // Do not expose a new binding publication unless its audit record is durable.
    await this.auditSink.append(event);
    this.#published.set(key, publication);
    return publication;
  }

  getPublished(
    logicalRole: string,
    riskTier: BindingRiskTier,
  ): RoleBindingPublicationV1 | undefined {
    return this.#published.get(publicationKey(requireId(logicalRole, 'logicalRole'), riskTier));
  }

  listPublished(): readonly RoleBindingPublicationV1[] {
    return [...this.#published.values()].sort((left, right) => {
      const roleOrder = left.logicalRole.localeCompare(right.logicalRole);
      return roleOrder !== 0 ? roleOrder : left.riskTier.localeCompare(right.riskTier);
    });
  }
}

export function validateRoleBindingPublicationV1(publication: RoleBindingPublicationV1): void {
  if (publication.schemaVersion !== 1) {
    throw new Error('role binding publication schemaVersion must be 1');
  }
  if (publication.authority !== 'NONE') {
    throw new Error('role binding publication authority must be NONE');
  }
  const logicalRole = requireId(publication.logicalRole, 'logicalRole');
  if (!['NORMAL', 'HIGH', 'CRITICAL'].includes(publication.riskTier)) {
    throw new Error('role binding publication riskTier is invalid');
  }
  const publishedAt = normalizeTimestamp(publication.publishedAt, 'publishedAt');
  if (publishedAt !== publication.publishedAt) {
    throw new Error('role binding publication publishedAt must be canonical ISO');
  }

  validateBindingPlan(publication.plan);
  if (publication.plan.logicalRole !== logicalRole || publication.plan.riskTier !== publication.riskTier) {
    throw new Error('role binding publication plan identity mismatch');
  }

  const definitions = [publication.primary, ...publication.fallbacks];
  const registry = new BindingRegistry();
  for (const definition of definitions) registry.register(cloneBinding(definition));

  if (publication.plan.bindings.length !== definitions.length) {
    throw new Error('role binding publication plan binding count mismatch');
  }
  for (const [index, definition] of definitions.entries()) {
    const resolved = publication.plan.bindings[index];
    if (
      resolved === undefined ||
      resolved.bindingId !== definition.id ||
      resolved.bindingVersion !== definition.version ||
      resolved.providerId !== definition.providerId ||
      resolved.model !== definition.model ||
      resolved.effort !== definition.effort ||
      resolved.independenceGroup !== definition.independenceGroup
    ) {
      throw new Error('role binding publication plan binding identity mismatch');
    }
  }

  const identity = {
    schemaVersion: 1 as const,
    logicalRole,
    riskTier: publication.riskTier,
    publishedAt,
    primary: cloneBinding(publication.primary),
    fallbacks: publication.fallbacks.map(cloneBinding),
    plan: publication.plan,
    authority: 'NONE' as const,
  };
  if (sha256Canonical(identity) !== publication.hash) {
    throw new Error('role binding publication hash mismatch');
  }
}

export function roleBindingManagementCanGrantAuthority(): false {
  return false;
}

function publicationKey(logicalRole: string, riskTier: BindingRiskTier): string {
  return `${logicalRole}\u0000${riskTier}`;
}

function cloneBinding(binding: ModelBindingDefinition): ModelBindingDefinition {
  return {
    ...binding,
    ...(binding.requiredCapabilities
      ? { requiredCapabilities: [...binding.requiredCapabilities] }
      : {}),
    allowedRiskTiers: [...binding.allowedRiskTiers],
  };
}

function requireId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function normalizeTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value.trim() || Number.isNaN(parsed)) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return new Date(parsed).toISOString();
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
