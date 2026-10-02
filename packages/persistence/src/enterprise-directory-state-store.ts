import {
  approvalDelegationV1Schema,
  enterpriseActorV1Schema,
  enterpriseOrganizationV1Schema,
  enterpriseProjectMembershipV1Schema,
  enterpriseSessionV1Schema,
  oidcSubjectBindingV1Schema,
  type ApprovalDelegationV1,
  type EnterpriseActorV1,
  type EnterpriseOrganizationV1,
  type EnterpriseProjectMembershipV1,
  type EnterpriseSessionV1,
  type OidcSubjectBindingV1,
} from '@freehighlander/contracts';

import {
  AtomicJsonConfigStore,
  type AtomicConfigWriteStatus,
  type JsonValue,
} from './atomic-json-config-store.js';

export interface EnterpriseDirectoryStateV1 {
  readonly schemaVersion: 1;
  readonly organization: EnterpriseOrganizationV1;
  readonly actors: readonly EnterpriseActorV1[];
  readonly oidcBindings: readonly OidcSubjectBindingV1[];
  readonly projectMemberships: readonly EnterpriseProjectMembershipV1[];
  readonly sessions: readonly EnterpriseSessionV1[];
  readonly delegations: readonly ApprovalDelegationV1[];
}

export interface EnterpriseDirectorySnapshotV1 {
  readonly generation: number;
  readonly state: EnterpriseDirectoryStateV1;
  readonly snapshotHash: string | null;
}

export interface EnterpriseDirectoryWriteResultV1 {
  readonly status: AtomicConfigWriteStatus;
  readonly expectedGeneration: number;
  readonly actualGeneration: number | null;
  readonly snapshot: EnterpriseDirectorySnapshotV1 | null;
  readonly authority: 'NONE';
}

export class EnterpriseDirectoryStateStore {
  readonly #store: AtomicJsonConfigStore;

  constructor(
    readonly filePath: string,
    readonly organization: EnterpriseOrganizationV1,
  ) {
    const canonicalOrganization = enterpriseOrganizationV1Schema.parse(organization);
    this.organization = Object.freeze(canonicalOrganization);
    this.#store = new AtomicJsonConfigStore(filePath, validateEnterpriseDirectoryStateV1);
  }

  read(): EnterpriseDirectorySnapshotV1 {
    const snapshot = this.#store.read();
    if (snapshot === null) {
      return {
        generation: 0,
        state: createDefaultEnterpriseDirectoryStateV1(this.organization),
        snapshotHash: null,
      };
    }

    const state = snapshot.payload as unknown as EnterpriseDirectoryStateV1;
    if (state.organization.organizationId !== this.organization.organizationId) {
      throw new Error('enterprise directory organization does not match configured organization');
    }

    return {
      generation: snapshot.generation,
      state,
      snapshotHash: snapshot.snapshotHash,
    };
  }

  write(
    expectedGeneration: number,
    state: EnterpriseDirectoryStateV1,
  ): EnterpriseDirectoryWriteResultV1 {
    if (state.organization.organizationId !== this.organization.organizationId) {
      throw new Error('enterprise directory organization does not match configured organization');
    }

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
              state: result.snapshot.payload as unknown as EnterpriseDirectoryStateV1,
              snapshotHash: result.snapshot.snapshotHash,
            },
      authority: 'NONE',
    };
  }
}

export function createDefaultEnterpriseDirectoryStateV1(
  organization: EnterpriseOrganizationV1,
): EnterpriseDirectoryStateV1 {
  return Object.freeze({
    schemaVersion: 1,
    organization: Object.freeze(enterpriseOrganizationV1Schema.parse(organization)),
    actors: Object.freeze([]),
    oidcBindings: Object.freeze([]),
    projectMemberships: Object.freeze([]),
    sessions: Object.freeze([]),
    delegations: Object.freeze([]),
  });
}

export function validateEnterpriseDirectoryStateV1(value: unknown): JsonValue {
  if (!isRecord(value)) throw new Error('enterprise directory state must be an object');
  if (value.schemaVersion !== 1) {
    throw new Error('enterprise directory state schemaVersion must be 1');
  }

  const organization = enterpriseOrganizationV1Schema.parse(value.organization);
  const actors = normalizeArray(value.actors, enterpriseActorV1Schema.parse, 'actors', actorKey);
  const oidcBindings = normalizeArray(
    value.oidcBindings,
    oidcSubjectBindingV1Schema.parse,
    'oidcBindings',
    oidcBindingKey,
  );
  const projectMemberships = normalizeArray(
    value.projectMemberships,
    enterpriseProjectMembershipV1Schema.parse,
    'projectMemberships',
    projectMembershipKey,
  );
  const sessions = normalizeArray(
    value.sessions,
    enterpriseSessionV1Schema.parse,
    'sessions',
    (session) => session.sessionId,
  );
  const delegations = normalizeArray(
    value.delegations,
    approvalDelegationV1Schema.parse,
    'delegations',
    (delegation) => delegation.delegationId,
  );

  const actorsById = new Map(actors.map((actor) => [actor.actorId, actor]));
  const oidcSubjects = new Set<string>();

  for (const binding of oidcBindings) {
    requireActor(actorsById, binding.actorId, 'OIDC binding');
    const identity = [binding.issuer, binding.subject, binding.audience].join('|');
    if (oidcSubjects.has(identity)) throw new Error('duplicate OIDC subject binding');
    oidcSubjects.add(identity);
  }

  for (const membership of projectMemberships) {
    requireOrganization(organization.organizationId, membership.organizationId, 'project membership');
    requireActor(actorsById, membership.actorId, 'project membership');
  }

  for (const session of sessions) {
    requireOrganization(organization.organizationId, session.organizationId, 'session');
    requireActor(actorsById, session.actorId, 'session');
  }

  for (const delegation of delegations) {
    requireOrganization(organization.organizationId, delegation.organizationId, 'delegation');
    requireActor(actorsById, delegation.delegatorActorId, 'delegation delegator');
    requireActor(actorsById, delegation.delegateActorId, 'delegation delegate');
    if (delegation.delegatorActorId === delegation.delegateActorId) {
      throw new Error('delegation requires distinct human actors');
    }
  }

  return {
    schemaVersion: 1,
    organization,
    actors,
    oidcBindings,
    projectMemberships,
    sessions,
    delegations,
  } as unknown as JsonValue;
}

export function enterpriseDirectoryStoreCanPersistRawTokens(): false {
  return false;
}

export function enterpriseDirectoryStoreCanGrantAuthority(): false {
  return false;
}

export function enterpriseDirectoryStoreSupportsMultiTenantPersistence(): false {
  return false;
}

function normalizeArray<T>(
  value: unknown,
  parse: (entry: unknown) => T,
  name: string,
  keyOf: (entry: T) => string,
): readonly T[] {
  if (!Array.isArray(value)) throw new Error(name + ' must be an array');
  const normalized = value.map((entry) => parse(entry));
  const keys = normalized.map(keyOf);
  if (new Set(keys).size !== keys.length) throw new Error(name + ' contains duplicate identity');
  return normalized.toSorted((left, right) => keyOf(left).localeCompare(keyOf(right)));
}

function requireActor(
  actorsById: ReadonlyMap<string, EnterpriseActorV1>,
  actorId: string,
  context: string,
): void {
  if (!actorsById.has(actorId)) throw new Error(context + ' references unknown actor: ' + actorId);
}

function requireOrganization(expected: string, actual: string, context: string): void {
  if (actual !== expected) throw new Error(context + ' organization mismatch');
}

function actorKey(actor: EnterpriseActorV1): string {
  return actor.actorId;
}

function oidcBindingKey(binding: OidcSubjectBindingV1): string {
  return [binding.actorId, binding.issuer, binding.subject, binding.audience].join('|');
}

function projectMembershipKey(membership: EnterpriseProjectMembershipV1): string {
  return [membership.organizationId, membership.projectId, membership.actorId].join('|');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
