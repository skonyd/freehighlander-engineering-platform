import { createHash } from 'node:crypto';

import type { ProviderAdapter, ProviderCapability } from './index.js';

export type ModelCatalogSource = 'DISCOVERED' | 'MANUAL';
export type ModelCatalogLocality = 'LOCAL' | 'REMOTE';
export type ModelCatalogAvailability = 'AVAILABLE' | 'DEPRECATED' | 'UNAVAILABLE';

export interface ModelCatalogRecordInput {
  readonly providerId: string;
  readonly modelId: string;
  readonly displayName?: string;
  readonly capabilities?: readonly ProviderCapability[];
  readonly supportedEfforts?: readonly string[];
  readonly contextWindowTokens?: number;
  readonly maxOutputTokens?: number;
  readonly locality: ModelCatalogLocality;
  readonly source: ModelCatalogSource;
  readonly availability?: Exclude<ModelCatalogAvailability, 'UNAVAILABLE'>;
}

export interface ModelCatalogRecordV1 {
  readonly providerId: string;
  readonly modelId: string;
  readonly displayName: string;
  readonly capabilities: readonly ProviderCapability[];
  readonly supportedEfforts: readonly string[];
  readonly contextWindowTokens?: number;
  readonly maxOutputTokens?: number;
  readonly locality: ModelCatalogLocality;
  readonly source: ModelCatalogSource;
  readonly availability: ModelCatalogAvailability;
  readonly discoveredAt: string;
  readonly lastSeenAt: string;
  readonly unavailableSince?: string;
}

export interface ModelCatalogSnapshotV1 {
  readonly schemaVersion: 1;
  readonly providerId: string;
  readonly refreshedAt: string;
  readonly records: readonly ModelCatalogRecordV1[];
  readonly hash: string;
  readonly authority: 'NONE';
}

export interface ModelCatalogReconcileInput {
  readonly providerId: string;
  readonly refreshedAt: string;
  readonly discovered: readonly ModelCatalogRecordInput[];
  readonly previous?: ModelCatalogSnapshotV1;
}

export interface ModelCatalogBindingCheck {
  readonly status: 'AVAILABLE' | 'DEPRECATED' | 'UNAVAILABLE' | 'UNKNOWN_MODEL';
  readonly providerId: string;
  readonly modelId: string;
  readonly supportedEffort: boolean | null;
  readonly maySilentlyRewriteBinding: false;
  readonly authority: 'NONE';
}

export async function refreshModelCatalogFromProvider(
  provider: ProviderAdapter,
  refreshedAt: string,
  previous?: ModelCatalogSnapshotV1,
): Promise<ModelCatalogSnapshotV1> {
  const health = await provider.health();
  if (!health.available) {
    throw new Error(`provider ${provider.id} is not healthy for model discovery`);
  }
  if (!provider.listModels) {
    throw new Error(`provider ${provider.id} does not support model discovery`);
  }

  const discovered = await provider.listModels();
  return reconcileModelCatalog({
    providerId: provider.id,
    refreshedAt,
    ...(previous ? { previous } : {}),
    discovered: discovered.map((model) => ({
      providerId: provider.id,
      modelId: model.modelId,
      ...(model.displayName === undefined ? {} : { displayName: model.displayName }),
      capabilities: model.capabilities ?? [],
      supportedEfforts: model.supportedEfforts ?? [],
      ...(model.contextWindowTokens === undefined
        ? {}
        : { contextWindowTokens: model.contextWindowTokens }),
      ...(model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens }),
      locality: model.locality,
      source: 'DISCOVERED',
      availability: model.availability ?? 'AVAILABLE',
    })),
  });
}

export function reconcileModelCatalog(input: ModelCatalogReconcileInput): ModelCatalogSnapshotV1 {
  const providerId = requireId(input.providerId, 'providerId');
  const refreshedAt = requireTimestamp(input.refreshedAt, 'refreshedAt');
  validatePrevious(input.previous, providerId);

  const previousByModel = new Map(
    (input.previous?.records ?? []).map((record) => [record.modelId, record]),
  );
  const seen = new Set<string>();
  const records: ModelCatalogRecordV1[] = [];

  for (const candidate of input.discovered) {
    const normalized = normalizeRecord(candidate, providerId, refreshedAt);
    if (seen.has(normalized.modelId)) {
      throw new Error(`duplicate discovered model: ${normalized.modelId}`);
    }
    seen.add(normalized.modelId);

    const previous = previousByModel.get(normalized.modelId);
    records.push({
      ...normalized,
      discoveredAt: previous?.discoveredAt ?? refreshedAt,
      lastSeenAt: refreshedAt,
    });
  }

  for (const previous of input.previous?.records ?? []) {
    if (seen.has(previous.modelId)) continue;
    records.push({
      ...previous,
      availability: 'UNAVAILABLE',
      unavailableSince:
        previous.availability === 'UNAVAILABLE'
          ? (previous.unavailableSince ?? refreshedAt)
          : refreshedAt,
    });
  }

  records.sort((left, right) => left.modelId.localeCompare(right.modelId));
  const identity = {
    schemaVersion: 1,
    providerId,
    refreshedAt,
    records,
  } as const;

  return {
    ...identity,
    hash: sha256Canonical(identity),
    authority: 'NONE',
  };
}

export function checkCatalogBinding(
  snapshot: ModelCatalogSnapshotV1,
  modelId: string,
  effort?: string,
): ModelCatalogBindingCheck {
  const normalizedModelId = requireId(modelId, 'modelId');
  const record = snapshot.records.find((item) => item.modelId === normalizedModelId);

  if (!record) {
    return {
      status: 'UNKNOWN_MODEL',
      providerId: snapshot.providerId,
      modelId: normalizedModelId,
      supportedEffort: null,
      maySilentlyRewriteBinding: false,
      authority: 'NONE',
    };
  }

  const supportedEffort =
    effort === undefined || record.supportedEfforts.length === 0
      ? effort === undefined
        ? null
        : false
      : record.supportedEfforts.includes(effort);

  return {
    status: record.availability,
    providerId: snapshot.providerId,
    modelId: record.modelId,
    supportedEffort,
    maySilentlyRewriteBinding: false,
    authority: 'NONE',
  };
}

export function validateModelCatalogSnapshotV1(snapshot: ModelCatalogSnapshotV1): void {
  const providerId = requireId(snapshot.providerId, 'providerId');
  if (snapshot.schemaVersion !== 1) throw new Error('catalog schemaVersion must be 1');
  if (snapshot.authority !== 'NONE') throw new Error('catalog authority must be NONE');
  const refreshedAt = requireTimestamp(snapshot.refreshedAt, 'refreshedAt');
  const seen = new Set<string>();
  let previousModelId: string | undefined;

  for (const record of snapshot.records) {
    if (record.providerId !== providerId) throw new Error('catalog record providerId mismatch');
    const modelId = requireId(record.modelId, 'modelId');
    if (seen.has(modelId)) throw new Error(`duplicate catalog model: ${modelId}`);
    seen.add(modelId);
    if (previousModelId !== undefined && previousModelId.localeCompare(modelId) >= 0) {
      throw new Error('catalog records must be strictly sorted by modelId');
    }
    previousModelId = modelId;

    requireId(record.displayName, 'displayName');
    requireTimestamp(record.discoveredAt, 'discoveredAt');
    requireTimestamp(record.lastSeenAt, 'lastSeenAt');
    validateOptionalLimit(record.contextWindowTokens, 'contextWindowTokens');
    validateOptionalLimit(record.maxOutputTokens, 'maxOutputTokens');

    if (!['LOCAL', 'REMOTE'].includes(record.locality)) {
      throw new Error('catalog locality is invalid');
    }
    if (!['DISCOVERED', 'MANUAL'].includes(record.source)) {
      throw new Error('catalog source is invalid');
    }
    if (!['AVAILABLE', 'DEPRECATED', 'UNAVAILABLE'].includes(record.availability)) {
      throw new Error('catalog availability is invalid');
    }
    if (record.availability === 'UNAVAILABLE') {
      if (record.unavailableSince === undefined) {
        throw new Error('unavailable catalog record requires unavailableSince');
      }
      requireTimestamp(record.unavailableSince, 'unavailableSince');
    } else if (record.unavailableSince !== undefined) {
      throw new Error('available catalog record cannot retain unavailableSince');
    }

    if (record.capabilities.length !== uniqueSorted(record.capabilities).length) {
      throw new Error('catalog capabilities must be unique');
    }
    if (record.supportedEfforts.length !== uniqueSorted(record.supportedEfforts).length) {
      throw new Error('catalog supported efforts must be unique');
    }
    if (record.supportedEfforts.some((effort) => normalizeEffort(effort) !== effort)) {
      throw new Error('catalog supported efforts must be normalized');
    }
  }

  const identity = {
    schemaVersion: 1,
    providerId,
    refreshedAt,
    records: snapshot.records,
  } as const;
  if (sha256Canonical(identity) !== snapshot.hash) {
    throw new Error('catalog snapshot hash mismatch');
  }
}

export function modelCatalogRefreshCanRewriteBindings(): false {
  return false;
}

export function modelCatalogCanGrantAuthority(): false {
  return false;
}

function normalizeRecord(
  input: ModelCatalogRecordInput,
  providerId: string,
  refreshedAt: string,
): Omit<ModelCatalogRecordV1, 'discoveredAt' | 'lastSeenAt' | 'unavailableSince'> {
  if (requireId(input.providerId, 'record providerId') !== providerId) {
    throw new Error('catalog record providerId mismatch');
  }
  const modelId = requireId(input.modelId, 'modelId');
  const capabilities = uniqueSorted(input.capabilities ?? []);
  const supportedEfforts = uniqueSorted((input.supportedEfforts ?? []).map(normalizeEffort));
  validateOptionalLimit(input.contextWindowTokens, 'contextWindowTokens');
  validateOptionalLimit(input.maxOutputTokens, 'maxOutputTokens');

  return {
    providerId,
    modelId,
    displayName: input.displayName?.trim() || modelId,
    capabilities,
    supportedEfforts,
    ...(input.contextWindowTokens === undefined
      ? {}
      : { contextWindowTokens: input.contextWindowTokens }),
    ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
    locality: input.locality,
    source: input.source,
    availability: input.availability ?? 'AVAILABLE',
  };
}

function validatePrevious(previous: ModelCatalogSnapshotV1 | undefined, providerId: string): void {
  if (!previous) return;
  if (previous.schemaVersion !== 1) throw new Error('previous catalog schemaVersion must be 1');
  if (previous.providerId !== providerId) throw new Error('previous catalog providerId mismatch');
  if (previous.authority !== 'NONE') throw new Error('previous catalog authority must be NONE');
}

function validateOptionalLimit(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
    throw new Error(`${field} must be a positive integer when provided`);
  }
}

function normalizeEffort(value: string): string {
  return requireId(value, 'supported effort').toLowerCase();
}

function requireTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value.trim() || Number.isNaN(parsed)) throw new Error(`${field} must be an ISO timestamp`);
  return new Date(parsed).toISOString();
}

function requireId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
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
