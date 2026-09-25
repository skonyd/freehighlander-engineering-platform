import { createHash } from 'node:crypto';

export type PortableOwnershipLeaseState = 'ACTIVE' | 'RELEASED';

export interface PortableOwnershipLeaseV1 {
  readonly schemaVersion: 1;
  readonly repositoryIdentity: string;
  readonly projectId: string;
  readonly workItemId: string;
  readonly runId: string;
  readonly leaseId: string;
  readonly generation: number;
  readonly machineInstanceId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly releasedAt: string | null;
  readonly lastCheckpointGeneration: number;
  readonly state: PortableOwnershipLeaseState;
  readonly leaseHash: string;
  readonly authority: 'NONE';
}

export interface AcquirePortableOwnershipRequest {
  readonly repositoryIdentity: string;
  readonly projectId: string;
  readonly workItemId: string;
  readonly runId: string;
  readonly leaseId: string;
  readonly machineInstanceId: string;
  readonly now: string;
  readonly ttlMs: number;
  readonly lastCheckpointGeneration: number;
}

export interface AcquirePortableOwnershipDecision {
  readonly status: 'ACQUIRED' | 'BLOCKED_ACTIVE';
  readonly lease: PortableOwnershipLeaseV1;
  readonly reclaimedExpiredLease: boolean;
  readonly authority: 'NONE';
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PORTABLE_LEASE_KEYS = [
  'schemaVersion',
  'repositoryIdentity',
  'projectId',
  'workItemId',
  'runId',
  'leaseId',
  'generation',
  'machineInstanceId',
  'acquiredAt',
  'expiresAt',
  'releasedAt',
  'lastCheckpointGeneration',
  'state',
  'leaseHash',
  'authority',
] as const;

export function acquirePortableOwnershipLease(
  request: AcquirePortableOwnershipRequest,
  existing: PortableOwnershipLeaseV1 | null,
): AcquirePortableOwnershipDecision {
  validateAcquireRequest(request);
  const nowMs = timestampMs(request.now, 'now');

  if (existing !== null) {
    validatePortableOwnershipLease(existing);
    assertSameScope(existing, request);

    if (request.lastCheckpointGeneration < existing.lastCheckpointGeneration) {
      throw new Error('portable ownership checkpoint generation cannot move backwards');
    }

    if (existing.state === 'ACTIVE' && nowMs < timestampMs(existing.expiresAt, 'expiresAt')) {
      return {
        status: 'BLOCKED_ACTIVE',
        lease: clonePortableOwnershipLease(existing),
        reclaimedExpiredLease: false,
        authority: 'NONE',
      };
    }
  }

  const generation = existing === null ? 1 : existing.generation + 1;
  const expiresAt = new Date(nowMs + request.ttlMs).toISOString();
  const lease = buildLease({
    repositoryIdentity: request.repositoryIdentity,
    projectId: request.projectId,
    workItemId: request.workItemId,
    runId: request.runId,
    leaseId: request.leaseId,
    generation,
    machineInstanceId: request.machineInstanceId,
    acquiredAt: request.now,
    expiresAt,
    releasedAt: null,
    lastCheckpointGeneration: request.lastCheckpointGeneration,
    state: 'ACTIVE',
  });

  return {
    status: 'ACQUIRED',
    lease,
    reclaimedExpiredLease:
      existing !== null &&
      existing.state === 'ACTIVE' &&
      nowMs >= timestampMs(existing.expiresAt, 'expiresAt'),
    authority: 'NONE',
  };
}

export function renewPortableOwnershipLease(
  lease: PortableOwnershipLeaseV1,
  leaseId: string,
  generation: number,
  now: string,
  ttlMs: number,
  lastCheckpointGeneration: number,
): PortableOwnershipLeaseV1 {
  validatePortableOwnershipLease(lease);
  requireIdentifier(leaseId, 'leaseId');
  requirePositiveInteger(generation, 'generation');
  requirePositiveInteger(ttlMs, 'ttlMs');
  requireNonNegativeInteger(lastCheckpointGeneration, 'lastCheckpointGeneration');

  if (lease.leaseId !== leaseId || lease.generation !== generation) {
    throw new Error('portable ownership lease ownership mismatch');
  }
  if (lease.state !== 'ACTIVE') throw new Error('released portable ownership lease cannot be renewed');

  const nowMs = timestampMs(now, 'now');
  const acquiredAtMs = timestampMs(lease.acquiredAt, 'acquiredAt');
  const currentExpiryMs = timestampMs(lease.expiresAt, 'expiresAt');
  if (nowMs < acquiredAtMs) throw new Error('portable ownership renewal predates acquisition');
  if (nowMs >= currentExpiryMs) throw new Error('expired portable ownership lease cannot be renewed');
  if (lastCheckpointGeneration < lease.lastCheckpointGeneration) {
    throw new Error('portable ownership checkpoint generation cannot move backwards');
  }

  const nextExpiryMs = nowMs + ttlMs;
  if (nextExpiryMs <= currentExpiryMs) {
    throw new Error('portable ownership renewal must extend expiry');
  }

  return buildLease({
    ...leaseMaterial(lease),
    expiresAt: new Date(nextExpiryMs).toISOString(),
    lastCheckpointGeneration,
  });
}

export function releasePortableOwnershipLease(
  lease: PortableOwnershipLeaseV1,
  leaseId: string,
  generation: number,
  releasedAt: string,
): PortableOwnershipLeaseV1 {
  validatePortableOwnershipLease(lease);
  requireIdentifier(leaseId, 'leaseId');
  requirePositiveInteger(generation, 'generation');

  if (lease.leaseId !== leaseId || lease.generation !== generation) {
    throw new Error('portable ownership lease ownership mismatch');
  }
  if (lease.state !== 'ACTIVE') throw new Error('portable ownership lease is already released');

  const releasedAtMs = timestampMs(releasedAt, 'releasedAt');
  if (releasedAtMs < timestampMs(lease.acquiredAt, 'acquiredAt')) {
    throw new Error('portable ownership release predates acquisition');
  }

  return buildLease({
    ...leaseMaterial(lease),
    state: 'RELEASED',
    releasedAt,
  });
}

export function portableOwnershipLeaseIsActive(
  lease: PortableOwnershipLeaseV1,
  now: string,
): boolean {
  validatePortableOwnershipLease(lease);
  const nowMs = timestampMs(now, 'now');
  return lease.state === 'ACTIVE' && nowMs < timestampMs(lease.expiresAt, 'expiresAt');
}

export function validatePortableOwnershipLease(lease: PortableOwnershipLeaseV1): void {
  requireExactKeys(lease, PORTABLE_LEASE_KEYS, 'portable ownership lease');
  if (lease.schemaVersion !== 1) throw new Error('portable ownership schemaVersion must be 1');
  requireText(lease.repositoryIdentity, 'repositoryIdentity');
  requireIdentifier(lease.projectId, 'projectId');
  requireIdentifier(lease.workItemId, 'workItemId');
  requireIdentifier(lease.runId, 'runId');
  requireIdentifier(lease.leaseId, 'leaseId');
  requirePositiveInteger(lease.generation, 'generation');
  requireIdentifier(lease.machineInstanceId, 'machineInstanceId');
  requireNonNegativeInteger(lease.lastCheckpointGeneration, 'lastCheckpointGeneration');

  const acquiredAtMs = timestampMs(lease.acquiredAt, 'acquiredAt');
  const expiresAtMs = timestampMs(lease.expiresAt, 'expiresAt');
  if (expiresAtMs <= acquiredAtMs) {
    throw new Error('portable ownership expiry must follow acquisition');
  }

  if (lease.state !== 'ACTIVE' && lease.state !== 'RELEASED') {
    throw new Error('unsupported portable ownership lease state');
  }
  if (lease.state === 'ACTIVE' && lease.releasedAt !== null) {
    throw new Error('active portable ownership lease cannot have releasedAt');
  }
  if (lease.state === 'RELEASED' && lease.releasedAt === null) {
    throw new Error('released portable ownership lease requires releasedAt');
  }
  if (lease.releasedAt !== null && timestampMs(lease.releasedAt, 'releasedAt') < acquiredAtMs) {
    throw new Error('portable ownership release predates acquisition');
  }
  if (!HASH_PATTERN.test(lease.leaseHash)) {
    throw new Error('leaseHash must be a SHA-256 hex hash');
  }
  if (lease.authority !== 'NONE') {
    throw new Error('portable ownership lease authority must remain NONE');
  }

  const expectedHash = hashLeaseMaterial(leaseMaterial(lease));
  if (lease.leaseHash !== expectedHash) {
    throw new Error('portable ownership lease hash mismatch');
  }
}

export function portableOwnershipCanTakeOverActiveLease(): false {
  return false;
}

export function portableMachineInstanceIdCanGrantOwnership(): false {
  return false;
}

export function portableOwnershipCanGrantAuthority(): false {
  return false;
}

function buildLease(
  material: Omit<PortableOwnershipLeaseV1, 'schemaVersion' | 'leaseHash' | 'authority'>,
): PortableOwnershipLeaseV1 {
  const normalized = {
    schemaVersion: 1,
    ...material,
    authority: 'NONE',
  } as const;

  return {
    ...normalized,
    leaseHash: hashLeaseMaterial(normalized),
  };
}

function leaseMaterial(
  lease: PortableOwnershipLeaseV1,
): Omit<PortableOwnershipLeaseV1, 'leaseHash'> {
  return {
    schemaVersion: 1,
    repositoryIdentity: lease.repositoryIdentity,
    projectId: lease.projectId,
    workItemId: lease.workItemId,
    runId: lease.runId,
    leaseId: lease.leaseId,
    generation: lease.generation,
    machineInstanceId: lease.machineInstanceId,
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt,
    releasedAt: lease.releasedAt,
    lastCheckpointGeneration: lease.lastCheckpointGeneration,
    state: lease.state,
    authority: 'NONE',
  };
}

function hashLeaseMaterial(material: Omit<PortableOwnershipLeaseV1, 'leaseHash'>): string {
  return createHash('sha256').update(JSON.stringify(material), 'utf8').digest('hex');
}

function validateAcquireRequest(request: AcquirePortableOwnershipRequest): void {
  requireText(request.repositoryIdentity, 'repositoryIdentity');
  requireIdentifier(request.projectId, 'projectId');
  requireIdentifier(request.workItemId, 'workItemId');
  requireIdentifier(request.runId, 'runId');
  requireIdentifier(request.leaseId, 'leaseId');
  requireIdentifier(request.machineInstanceId, 'machineInstanceId');
  timestampMs(request.now, 'now');
  requirePositiveInteger(request.ttlMs, 'ttlMs');
  requireNonNegativeInteger(request.lastCheckpointGeneration, 'lastCheckpointGeneration');
}

function assertSameScope(
  existing: PortableOwnershipLeaseV1,
  request: AcquirePortableOwnershipRequest,
): void {
  if (
    existing.repositoryIdentity !== request.repositoryIdentity ||
    existing.projectId !== request.projectId ||
    existing.workItemId !== request.workItemId ||
    existing.runId !== request.runId
  ) {
    throw new Error('portable ownership lease scope mismatch');
  }
}

function clonePortableOwnershipLease(
  lease: PortableOwnershipLeaseV1,
): PortableOwnershipLeaseV1 {
  return { ...lease };
}

function requireExactKeys(value: object, expectedKeys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(label + ' contains unsupported fields');
  }
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(name + ' is required');
}

function requireIdentifier(value: string, name: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) throw new Error(name + ' must be a bounded identifier');
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(name + ' must be a positive safe integer');
  }
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(name + ' must be a non-negative safe integer');
  }
}

function timestampMs(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!value.trim() || Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(name + ' must be a canonical ISO timestamp');
  }
  return parsed;
}
