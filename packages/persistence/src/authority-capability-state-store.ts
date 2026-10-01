import {
  AUTHORITY_CAPABILITY_IDS,
  type AuthorityCapabilityId,
} from '@freehighlander/contracts';

import {
  AtomicJsonConfigStore,
  type AtomicConfigWriteStatus,
  type JsonValue,
} from './atomic-json-config-store.js';

export const AUTHORITY_CAPABILITIES = AUTHORITY_CAPABILITY_IDS;
export type AuthorityCapability = AuthorityCapabilityId;

export interface AuthorityCapabilityStateV1 {
  readonly schemaVersion: 1;
  readonly requestedCapabilities: readonly AuthorityCapability[];
  readonly activeCapabilities: readonly AuthorityCapability[];
}

export interface AuthorityCapabilityStateSnapshotV1 {
  readonly generation: number;
  readonly state: AuthorityCapabilityStateV1;
  readonly snapshotHash: string | null;
}

export interface AuthorityCapabilityStateWriteResultV1 {
  readonly status: AtomicConfigWriteStatus;
  readonly expectedGeneration: number;
  readonly actualGeneration: number | null;
  readonly snapshot: AuthorityCapabilityStateSnapshotV1 | null;
  readonly authority: 'NONE';
}

export class AuthorityCapabilityStateStore {
  readonly #store: AtomicJsonConfigStore;

  constructor(readonly filePath: string) {
    this.#store = new AtomicJsonConfigStore(filePath, validateAuthorityCapabilityStateV1);
  }

  read(): AuthorityCapabilityStateSnapshotV1 {
    const snapshot = this.#store.read();
    if (!snapshot) {
      return {
        generation: 0,
        state: createDefaultAuthorityCapabilityStateV1(),
        snapshotHash: null,
      };
    }

    return {
      generation: snapshot.generation,
      state: snapshot.payload as unknown as AuthorityCapabilityStateV1,
      snapshotHash: snapshot.snapshotHash,
    };
  }

  write(
    expectedGeneration: number,
    state: AuthorityCapabilityStateV1,
  ): AuthorityCapabilityStateWriteResultV1 {
    const result = this.#store.write(expectedGeneration, state);
    return {
      status: result.status,
      expectedGeneration: result.expectedGeneration,
      actualGeneration: result.actualGeneration,
      snapshot:
        result.snapshot === null
          ? null
          : {
              generation: result.snapshot.generation,
              state: result.snapshot.payload as unknown as AuthorityCapabilityStateV1,
              snapshotHash: result.snapshot.snapshotHash,
            },
      authority: 'NONE',
    };
  }
}

export function createDefaultAuthorityCapabilityStateV1(): AuthorityCapabilityStateV1 {
  return Object.freeze({
    schemaVersion: 1,
    requestedCapabilities: Object.freeze([]),
    activeCapabilities: Object.freeze([]),
  });
}

export function validateAuthorityCapabilityStateV1(value: unknown): JsonValue {
  if (!isRecord(value)) throw new Error('authority capability state must be an object');
  if (value.schemaVersion !== 1) {
    throw new Error('authority capability state schemaVersion must be 1');
  }

  const requestedCapabilities = normalizeCapabilities(
    value.requestedCapabilities,
    'requestedCapabilities',
  );
  const activeCapabilities = normalizeCapabilities(value.activeCapabilities, 'activeCapabilities');

  const requested = new Set(requestedCapabilities);
  for (const capability of activeCapabilities) {
    if (!requested.has(capability)) {
      throw new Error('active capability must also be requested: ' + capability);
    }
  }

  return {
    schemaVersion: 1,
    requestedCapabilities,
    activeCapabilities,
  };
}

export function authorityCapabilityStateStoreCanGrantAuthority(): false {
  return false;
}

export function authorityCapabilityStateDefaultsDeny(): true {
  return true;
}

function normalizeCapabilities(value: unknown, name: string): readonly AuthorityCapability[] {
  if (!Array.isArray(value)) throw new Error(name + ' must be an array');

  const selected = new Set<AuthorityCapability>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !isAuthorityCapability(entry)) {
      throw new Error(name + ' contains unknown capability: ' + String(entry));
    }
    selected.add(entry);
  }

  return AUTHORITY_CAPABILITIES.filter((capability) => selected.has(capability));
}

function isAuthorityCapability(value: string): value is AuthorityCapability {
  return (AUTHORITY_CAPABILITIES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
