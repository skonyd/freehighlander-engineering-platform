import {
  refreshModelCatalogFromProvider,
  type ModelCatalogSnapshotV1,
} from './model-catalog.js';
import type { ProviderRegistry } from './binding-registry.js';

export interface ModelCatalogManagementAuditEvent {
  readonly type: 'model.catalog.refreshed';
  readonly operationId: string;
  readonly timestamp: string;
  readonly payload: {
    readonly action: 'REFRESH';
    readonly providerId: string;
    readonly previousHash?: string;
    readonly currentHash: string;
    readonly itemCount: number;
  };
}

export interface ModelCatalogManagementAuditSink {
  append(event: ModelCatalogManagementAuditEvent): Promise<void>;
}

export interface ModelCatalogRefreshResult {
  readonly providerId: string;
  readonly previousHash?: string;
  readonly currentHash: string;
  readonly addedModelIds: readonly string[];
  readonly becameUnavailableModelIds: readonly string[];
  readonly restoredModelIds: readonly string[];
  readonly deprecatedModelIds: readonly string[];
  readonly snapshot: ModelCatalogSnapshotV1;
  readonly authority: 'NONE';
  readonly bindingsRewritten: false;
}

export class ModelCatalogManagementService {
  readonly #catalogs = new Map<string, ModelCatalogSnapshotV1>();

  constructor(
    readonly providers: ProviderRegistry,
    readonly auditSink: ModelCatalogManagementAuditSink,
  ) {}

  getCatalog(providerId: string): ModelCatalogSnapshotV1 | undefined {
    return this.#catalogs.get(requireId(providerId, 'providerId'));
  }

  listCatalogs(): readonly ModelCatalogSnapshotV1[] {
    return [...this.#catalogs.values()].sort((left, right) =>
      left.providerId.localeCompare(right.providerId),
    );
  }

  async refreshProvider(input: {
    readonly providerId: string;
    readonly refreshedAt: string;
    readonly operationId: string;
  }): Promise<ModelCatalogRefreshResult> {
    const providerId = requireId(input.providerId, 'providerId');
    const operationId = requireId(input.operationId, 'operationId');
    const previous = this.#catalogs.get(providerId);
    const provider = this.providers.get(providerId).adapter;

    const snapshot = await refreshModelCatalogFromProvider(provider, input.refreshedAt, previous);
    const result = buildRefreshResult(previous, snapshot);

    const event: ModelCatalogManagementAuditEvent = {
      type: 'model.catalog.refreshed',
      operationId,
      timestamp: snapshot.refreshedAt,
      payload: {
        action: 'REFRESH',
        providerId,
        ...(previous ? { previousHash: previous.hash } : {}),
        currentHash: snapshot.hash,
        itemCount: snapshot.records.length,
      },
    };

    // Publish the refreshed catalog only after its audit record is durable.
    await this.auditSink.append(event);
    this.#catalogs.set(providerId, snapshot);
    return result;
  }
}

export function modelCatalogManagementCanGrantAuthority(): false {
  return false;
}

export function modelCatalogManagementCanRewriteBindings(): false {
  return false;
}

function buildRefreshResult(
  previous: ModelCatalogSnapshotV1 | undefined,
  snapshot: ModelCatalogSnapshotV1,
): ModelCatalogRefreshResult {
  const previousById = new Map((previous?.records ?? []).map((record) => [record.modelId, record]));
  const addedModelIds: string[] = [];
  const becameUnavailableModelIds: string[] = [];
  const restoredModelIds: string[] = [];
  const deprecatedModelIds: string[] = [];

  for (const record of snapshot.records) {
    const before = previousById.get(record.modelId);
    if (!before && record.availability !== 'UNAVAILABLE') {
      addedModelIds.push(record.modelId);
    }
    if (
      record.availability === 'UNAVAILABLE' &&
      before !== undefined &&
      before.availability !== 'UNAVAILABLE'
    ) {
      becameUnavailableModelIds.push(record.modelId);
    }
    if (
      before?.availability === 'UNAVAILABLE' &&
      record.availability !== 'UNAVAILABLE'
    ) {
      restoredModelIds.push(record.modelId);
    }
    if (record.availability === 'DEPRECATED') {
      deprecatedModelIds.push(record.modelId);
    }
  }

  return {
    providerId: snapshot.providerId,
    ...(previous ? { previousHash: previous.hash } : {}),
    currentHash: snapshot.hash,
    addedModelIds: addedModelIds.sort(),
    becameUnavailableModelIds: becameUnavailableModelIds.sort(),
    restoredModelIds: restoredModelIds.sort(),
    deprecatedModelIds: deprecatedModelIds.sort(),
    snapshot,
    authority: 'NONE',
    bindingsRewritten: false,
  };
}

function requireId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}
