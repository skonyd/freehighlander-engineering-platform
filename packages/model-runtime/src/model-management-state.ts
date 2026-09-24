import {
  validateModelCatalogSnapshotV1,
  type ModelCatalogSnapshotV1,
  type ModelCatalogLocality,
} from './model-catalog.js';
import {
  validateModelQualificationSnapshotV1,
  type ModelQualificationSnapshotV1,
} from './model-qualification.js';
import {
  validateRoleBindingPublicationV1,
  type RoleBindingPublicationV1,
} from './role-binding-management.js';

export type ManagedProviderKind = 'OPENAI_COMPATIBLE' | 'GEMINI';

export interface ManagedCredentialReferenceV1 {
  readonly resolverKind: 'LOCAL_ENV';
  readonly reference: string;
}

export interface ManagedProviderConfigV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly kind: ManagedProviderKind;
  readonly baseUrl: string;
  readonly locality: ModelCatalogLocality;
  readonly credential: ManagedCredentialReferenceV1 | null;
  readonly authority: 'NONE';
}

export interface ModelManagementStateV1 {
  readonly schemaVersion: 1;
  readonly providers: readonly ManagedProviderConfigV1[];
  readonly catalogs: readonly ModelCatalogSnapshotV1[];
  readonly qualifications: readonly ModelQualificationSnapshotV1[];
  readonly publications: readonly RoleBindingPublicationV1[];
  readonly authority: 'NONE';
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const ENV_REFERENCE_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export function createEmptyModelManagementStateV1(): ModelManagementStateV1 {
  return {
    schemaVersion: 1,
    providers: [],
    catalogs: [],
    qualifications: [],
    publications: [],
    authority: 'NONE',
  };
}

export function validateModelManagementStateV1(value: unknown): ModelManagementStateV1 {
  if (!isRecord(value)) throw new Error('model management state must be an object');
  assertExactKeys(value, [
    'schemaVersion',
    'providers',
    'catalogs',
    'qualifications',
    'publications',
    'authority',
  ]);
  if (value.schemaVersion !== 1) throw new Error('model management state schemaVersion must be 1');
  if (value.authority !== 'NONE') throw new Error('model management state authority must be NONE');
  if (!Array.isArray(value.providers)) throw new Error('model management providers must be an array');
  if (!Array.isArray(value.catalogs)) throw new Error('model management catalogs must be an array');
  if (!Array.isArray(value.qualifications)) {
    throw new Error('model management qualifications must be an array');
  }
  if (!Array.isArray(value.publications)) {
    throw new Error('model management publications must be an array');
  }

  const providers = value.providers.map((entry) => validateManagedProviderConfigV1(entry));
  assertSortedUnique(providers, (provider) => provider.id, 'provider');

  const providerIds = new Set(providers.map((provider) => provider.id));

  const catalogs = value.catalogs.map((entry) => {
    const snapshot = entry as ModelCatalogSnapshotV1;
    validateModelCatalogSnapshotV1(snapshot);
    if (!providerIds.has(snapshot.providerId)) {
      throw new Error(`catalog references unmanaged provider ${snapshot.providerId}`);
    }
    return snapshot;
  });
  assertSortedUnique(catalogs, (snapshot) => snapshot.providerId, 'catalog provider');

  const qualifications = value.qualifications.map((entry) => {
    const snapshot = entry as ModelQualificationSnapshotV1;
    validateModelQualificationSnapshotV1(snapshot);
    if (!providerIds.has(snapshot.providerId)) {
      throw new Error(`qualification references unmanaged provider ${snapshot.providerId}`);
    }
    return snapshot;
  });
  assertSortedUnique(qualifications, qualificationKey, 'qualification');

  const publications = value.publications.map((entry) => {
    const publication = entry as RoleBindingPublicationV1;
    validateRoleBindingPublicationV1(publication);
    for (const binding of publication.plan.bindings) {
      if (!providerIds.has(binding.providerId)) {
        throw new Error(`publication references unmanaged provider ${binding.providerId}`);
      }
    }
    return publication;
  });
  assertSortedUnique(
    publications,
    (publication) => `${publication.logicalRole}\u0000${publication.riskTier}`,
    'publication',
  );

  return freezeState({
    schemaVersion: 1,
    providers,
    catalogs,
    qualifications,
    publications,
    authority: 'NONE',
  });
}

export function validateManagedProviderConfigV1(value: unknown): ManagedProviderConfigV1 {
  if (!isRecord(value)) throw new Error('managed provider config must be an object');
  assertExactKeys(value, ['schemaVersion', 'id', 'kind', 'baseUrl', 'locality', 'credential', 'authority']);
  if (value.schemaVersion !== 1) throw new Error('managed provider schemaVersion must be 1');
  if (value.authority !== 'NONE') throw new Error('managed provider authority must be NONE');
  const id = requireId(value.id, 'managed provider id');
  if (value.kind !== 'OPENAI_COMPATIBLE' && value.kind !== 'GEMINI') {
    throw new Error('managed provider kind is invalid');
  }
  const baseUrl = requireBaseUrl(value.baseUrl);
  if (value.locality !== 'LOCAL' && value.locality !== 'REMOTE') {
    throw new Error('managed provider locality is invalid');
  }
  if (value.kind === 'GEMINI' && value.locality !== 'REMOTE') {
    throw new Error('Gemini managed provider must be REMOTE');
  }

  let credential: ManagedCredentialReferenceV1 | null;
  if (value.credential === null) {
    credential = null;
  } else {
    if (!isRecord(value.credential)) {
      throw new Error('managed provider credential must be a reference object or null');
    }
    assertExactKeys(value.credential, ['resolverKind', 'reference']);
    if (value.credential.resolverKind !== 'LOCAL_ENV') {
      throw new Error('managed provider credential resolverKind must be LOCAL_ENV');
    }
    if (
      typeof value.credential.reference !== 'string' ||
      !ENV_REFERENCE_PATTERN.test(value.credential.reference)
    ) {
      throw new Error('managed provider credential reference must be an environment variable name');
    }
    credential = {
      resolverKind: 'LOCAL_ENV',
      reference: value.credential.reference,
    };
  }

  return Object.freeze({
    schemaVersion: 1,
    id,
    kind: value.kind,
    baseUrl,
    locality: value.locality,
    credential,
    authority: 'NONE',
  });
}

export function modelManagementStateCanContainSecretValues(): false {
  return false;
}

export function modelManagementStateCanGrantAuthority(): false {
  return false;
}

function qualificationKey(snapshot: ModelQualificationSnapshotV1): string {
  const role = snapshot.eligibility?.role ?? snapshot.shadow?.role ?? '';
  const riskTier = snapshot.eligibility?.riskTier ?? snapshot.shadow?.riskTier ?? '';
  return `${snapshot.providerId}\u0000${snapshot.modelId}\u0000${role}\u0000${riskTier}`;
}

function assertSortedUnique<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  label: string,
): void {
  let previous: string | undefined;
  const seen = new Set<string>();
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) throw new Error(`duplicate model management ${label}: ${key}`);
    seen.add(key);
    if (previous !== undefined && previous.localeCompare(key) >= 0) {
      throw new Error(`model management ${label} entries must be strictly sorted`);
    }
    previous = key;
  }
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new Error(`${field} must be a bounded identifier`);
  }
  return value;
}

function requireBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('managed provider baseUrl is required');
  }
  if (value.length > 2048 || /[\r\n\0]/.test(value)) {
    throw new Error('managed provider baseUrl must be bounded single-line metadata');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('managed provider baseUrl must be an absolute URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('managed provider baseUrl must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('managed provider baseUrl cannot contain credentials');
  }
  return value.replace(/\/+$/, '');
}

function assertExactKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new Error(`model management field is not allowed: ${key}`);
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(`model management field is required: ${key}`);
    }
  }
}

function freezeState(state: ModelManagementStateV1): ModelManagementStateV1 {
  return Object.freeze({
    ...state,
    providers: Object.freeze([...state.providers]),
    catalogs: Object.freeze([...state.catalogs]),
    qualifications: Object.freeze([...state.qualifications]),
    publications: Object.freeze([...state.publications]),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
