import { createHash } from 'node:crypto';

export interface RunIntentIdentityInput {
  readonly repositoryIdentity: string;
  readonly taskIdentity: string;
  readonly exactRevision: string;
  readonly workflowHash: string;
  readonly runSnapshotHash: string;
  readonly bindingSnapshotHash: string;
}

export interface RunIntentIdentity extends RunIntentIdentityInput {
  readonly schemaVersion: 1;
  readonly intentKey: string;
  readonly authority: 'NONE';
}

export type RunLeaseState = 'ACTIVE' | 'RELEASED';

export interface RunLeaseV1 {
  readonly schemaVersion: 1;
  readonly intentKey: string;
  readonly runId: string;
  readonly leaseId: string;
  readonly generation: number;
  readonly acquiredAtMonoMs: number;
  readonly expiresAtMonoMs: number;
  readonly state: RunLeaseState;
  readonly authority: 'NONE';
}

export interface AcquireRunLeaseRequest {
  readonly runId: string;
  readonly leaseId: string;
  readonly nowMonoMs: number;
  readonly ttlMs: number;
}

export interface AcquireRunLeaseDecision {
  readonly status: 'ACQUIRED' | 'ATTACHED_EXISTING';
  readonly lease: RunLeaseV1;
  readonly reclaimedExpiredLease: boolean;
  readonly authority: 'NONE';
}

export interface BulkheadPolicy {
  readonly maxGlobalActive: number;
  readonly maxPerProviderActive: number;
  readonly maxQueued: number;
}

export interface BulkheadRequest {
  readonly requestId: string;
  readonly providerId: string;
  readonly enqueuedMonoMs: number;
}

export interface BulkheadPermit {
  readonly permitId: string;
  readonly requestId: string;
  readonly providerId: string;
  readonly acquiredMonoMs: number;
  readonly queueWaitMs: number;
}

export interface BulkheadSnapshot {
  readonly active: readonly BulkheadPermit[];
  readonly queued: readonly BulkheadRequest[];
}

export interface BulkheadRequestDecision {
  readonly status: 'ACQUIRED' | 'QUEUED' | 'REJECTED';
  readonly permit: BulkheadPermit | null;
  readonly snapshot: BulkheadSnapshot;
  readonly authority: 'NONE';
}

export interface BulkheadReleaseDecision {
  readonly releasedPermitId: string;
  readonly promotedPermit: BulkheadPermit | null;
  readonly snapshot: BulkheadSnapshot;
  readonly authority: 'NONE';
}

export interface MonotonicDeadline {
  readonly schemaVersion: 1;
  readonly createdAtMonoMs: number;
  readonly deadlineMonoMs: number;
  readonly parentDeadlineMonoMs: number | null;
  readonly authority: 'NONE';
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export function buildRunIntentIdentity(input: RunIntentIdentityInput): RunIntentIdentity {
  requireText(input.repositoryIdentity, 'repositoryIdentity');
  requireIdentifier(input.taskIdentity, 'taskIdentity');
  requireText(input.exactRevision, 'exactRevision');
  requireHash(input.workflowHash, 'workflowHash');
  requireHash(input.runSnapshotHash, 'runSnapshotHash');
  requireHash(input.bindingSnapshotHash, 'bindingSnapshotHash');

  const identity = {
    schemaVersion: 1,
    repositoryIdentity: input.repositoryIdentity,
    taskIdentity: input.taskIdentity,
    exactRevision: input.exactRevision,
    workflowHash: input.workflowHash,
    runSnapshotHash: input.runSnapshotHash,
    bindingSnapshotHash: input.bindingSnapshotHash,
  } as const;

  return {
    ...identity,
    intentKey: sha256(JSON.stringify(identity)),
    authority: 'NONE',
  };
}

export function acquireRunLease(
  intent: RunIntentIdentity,
  request: AcquireRunLeaseRequest,
  existing: RunLeaseV1 | null,
): AcquireRunLeaseDecision {
  validateRunIntentIdentity(intent);
  validateLeaseRequest(request);

  if (existing !== null) {
    validateRunLease(existing);
    if (existing.intentKey !== intent.intentKey) {
      throw new Error('existing lease intentKey mismatch');
    }
    if (existing.state === 'ACTIVE' && request.nowMonoMs < existing.expiresAtMonoMs) {
      return {
        status: 'ATTACHED_EXISTING',
        lease: cloneLease(existing),
        reclaimedExpiredLease: false,
        authority: 'NONE',
      };
    }
  }

  const generation = existing === null ? 1 : existing.generation + 1;
  const lease: RunLeaseV1 = {
    schemaVersion: 1,
    intentKey: intent.intentKey,
    runId: request.runId,
    leaseId: request.leaseId,
    generation,
    acquiredAtMonoMs: request.nowMonoMs,
    expiresAtMonoMs: request.nowMonoMs + request.ttlMs,
    state: 'ACTIVE',
    authority: 'NONE',
  };

  return {
    status: 'ACQUIRED',
    lease,
    reclaimedExpiredLease: existing !== null && existing.state === 'ACTIVE',
    authority: 'NONE',
  };
}

export function renewRunLease(
  lease: RunLeaseV1,
  leaseId: string,
  generation: number,
  nowMonoMs: number,
  ttlMs: number,
): RunLeaseV1 {
  validateRunLease(lease);
  requireIdentifier(leaseId, 'leaseId');
  requirePositiveInteger(generation, 'generation');
  requireNonNegativeFinite(nowMonoMs, 'nowMonoMs');
  requirePositiveInteger(ttlMs, 'ttlMs');

  if (lease.leaseId !== leaseId || lease.generation !== generation) {
    throw new Error('lease ownership mismatch');
  }
  if (lease.state !== 'ACTIVE') throw new Error('released lease cannot be renewed');
  if (nowMonoMs >= lease.expiresAtMonoMs) throw new Error('expired lease cannot be renewed');

  return {
    ...cloneLease(lease),
    expiresAtMonoMs: nowMonoMs + ttlMs,
  };
}

export function releaseRunLease(
  lease: RunLeaseV1,
  leaseId: string,
  generation: number,
): RunLeaseV1 {
  validateRunLease(lease);
  requireIdentifier(leaseId, 'leaseId');
  requirePositiveInteger(generation, 'generation');

  if (lease.leaseId !== leaseId || lease.generation !== generation) {
    throw new Error('lease ownership mismatch');
  }
  if (lease.state !== 'ACTIVE') throw new Error('lease is already released');

  return {
    ...cloneLease(lease),
    state: 'RELEASED',
  };
}

export function runLeaseIsActive(lease: RunLeaseV1, nowMonoMs: number): boolean {
  validateRunLease(lease);
  requireNonNegativeFinite(nowMonoMs, 'nowMonoMs');
  return lease.state === 'ACTIVE' && nowMonoMs < lease.expiresAtMonoMs;
}

export function requestBulkheadPermit(
  snapshot: BulkheadSnapshot,
  policy: BulkheadPolicy,
  request: BulkheadRequest,
  nowMonoMs: number,
): BulkheadRequestDecision {
  validateBulkheadSnapshot(snapshot);
  validateBulkheadPolicy(policy);
  validateBulkheadRequest(request);
  requireNonNegativeFinite(nowMonoMs, 'nowMonoMs');
  if (nowMonoMs < request.enqueuedMonoMs) throw new Error('monotonic clock moved backwards');

  assertUniqueBulkheadRequest(snapshot, request.requestId);

  if (bulkheadHasCapacity(snapshot, policy, request.providerId)) {
    const permit = createPermit(request, nowMonoMs);
    return {
      status: 'ACQUIRED',
      permit,
      snapshot: {
        active: [...snapshot.active.map(clonePermit), permit],
        queued: snapshot.queued.map(cloneRequest),
      },
      authority: 'NONE',
    };
  }

  if (snapshot.queued.length >= policy.maxQueued) {
    return {
      status: 'REJECTED',
      permit: null,
      snapshot: cloneBulkheadSnapshot(snapshot),
      authority: 'NONE',
    };
  }

  return {
    status: 'QUEUED',
    permit: null,
    snapshot: {
      active: snapshot.active.map(clonePermit),
      queued: [...snapshot.queued.map(cloneRequest), cloneRequest(request)],
    },
    authority: 'NONE',
  };
}

export function releaseBulkheadPermit(
  snapshot: BulkheadSnapshot,
  policy: BulkheadPolicy,
  permitId: string,
  nowMonoMs: number,
): BulkheadReleaseDecision {
  validateBulkheadSnapshot(snapshot);
  validateBulkheadPolicy(policy);
  requireIdentifier(permitId, 'permitId');
  requireNonNegativeFinite(nowMonoMs, 'nowMonoMs');

  const permitIndex = snapshot.active.findIndex((permit) => permit.permitId === permitId);
  if (permitIndex < 0) throw new Error('unknown bulkhead permit');

  const active = snapshot.active
    .filter((_, index) => index !== permitIndex)
    .map(clonePermit);
  const queued = snapshot.queued.map(cloneRequest);
  let promotedPermit: BulkheadPermit | null = null;

  const candidateIndex = queued.findIndex((request) =>
    bulkheadHasCapacity({ active, queued }, policy, request.providerId),
  );
  if (candidateIndex >= 0) {
    const candidate = queued[candidateIndex] as BulkheadRequest;
    if (nowMonoMs < candidate.enqueuedMonoMs) throw new Error('monotonic clock moved backwards');
    promotedPermit = createPermit(candidate, nowMonoMs);
    active.push(promotedPermit);
    queued.splice(candidateIndex, 1);
  }

  return {
    releasedPermitId: permitId,
    promotedPermit,
    snapshot: { active, queued },
    authority: 'NONE',
  };
}

export function createMonotonicDeadline(
  nowMonoMs: number,
  timeoutMs: number,
  parentDeadlineMonoMs: number | null = null,
): MonotonicDeadline {
  requireNonNegativeFinite(nowMonoMs, 'nowMonoMs');
  requirePositiveInteger(timeoutMs, 'timeoutMs');
  if (parentDeadlineMonoMs !== null) {
    requireNonNegativeFinite(parentDeadlineMonoMs, 'parentDeadlineMonoMs');
    if (parentDeadlineMonoMs <= nowMonoMs) throw new Error('parent deadline is already expired');
  }

  const requestedDeadline = nowMonoMs + timeoutMs;
  const deadlineMonoMs =
    parentDeadlineMonoMs === null
      ? requestedDeadline
      : Math.min(requestedDeadline, parentDeadlineMonoMs);

  return {
    schemaVersion: 1,
    createdAtMonoMs: nowMonoMs,
    deadlineMonoMs,
    parentDeadlineMonoMs,
    authority: 'NONE',
  };
}

export function remainingMonotonicBudgetMs(
  deadline: MonotonicDeadline,
  nowMonoMs: number,
): number {
  validateMonotonicDeadline(deadline);
  requireNonNegativeFinite(nowMonoMs, 'nowMonoMs');
  return Math.max(0, deadline.deadlineMonoMs - nowMonoMs);
}

export function runtimeStabilityCanGrantAuthority(): false {
  return false;
}

export function waitingCountsAsSemanticRetry(): false {
  return false;
}

export function expiredLeaseCanRepeatSideEffects(): false {
  return false;
}

function validateRunIntentIdentity(intent: RunIntentIdentity): void {
  if (intent.schemaVersion !== 1) throw new Error('run intent schemaVersion must be 1');
  const rebuilt = buildRunIntentIdentity(intent);
  if (rebuilt.intentKey !== intent.intentKey) throw new Error('run intent identity hash mismatch');
  if (intent.authority !== 'NONE') throw new Error('run intent authority must remain NONE');
}

function validateLeaseRequest(request: AcquireRunLeaseRequest): void {
  requireIdentifier(request.runId, 'runId');
  requireIdentifier(request.leaseId, 'leaseId');
  requireNonNegativeFinite(request.nowMonoMs, 'nowMonoMs');
  requirePositiveInteger(request.ttlMs, 'ttlMs');
}

function validateRunLease(lease: RunLeaseV1): void {
  if (lease.schemaVersion !== 1) throw new Error('run lease schemaVersion must be 1');
  requireHash(lease.intentKey, 'intentKey');
  requireIdentifier(lease.runId, 'runId');
  requireIdentifier(lease.leaseId, 'leaseId');
  requirePositiveInteger(lease.generation, 'generation');
  requireNonNegativeFinite(lease.acquiredAtMonoMs, 'acquiredAtMonoMs');
  requireNonNegativeFinite(lease.expiresAtMonoMs, 'expiresAtMonoMs');
  if (lease.expiresAtMonoMs <= lease.acquiredAtMonoMs) {
    throw new Error('run lease expiry must follow acquisition');
  }
  if (lease.state !== 'ACTIVE' && lease.state !== 'RELEASED') {
    throw new Error('unsupported run lease state');
  }
  if (lease.authority !== 'NONE') throw new Error('run lease authority must remain NONE');
}

function validateBulkheadPolicy(policy: BulkheadPolicy): void {
  requirePositiveInteger(policy.maxGlobalActive, 'maxGlobalActive');
  requirePositiveInteger(policy.maxPerProviderActive, 'maxPerProviderActive');
  requireNonNegativeInteger(policy.maxQueued, 'maxQueued');
}

function validateBulkheadRequest(request: BulkheadRequest): void {
  requireIdentifier(request.requestId, 'requestId');
  requireIdentifier(request.providerId, 'providerId');
  requireNonNegativeFinite(request.enqueuedMonoMs, 'enqueuedMonoMs');
}

function validateBulkheadSnapshot(snapshot: BulkheadSnapshot): void {
  const ids = new Set<string>();
  for (const permit of snapshot.active) {
    requireIdentifier(permit.permitId, 'permitId');
    requireIdentifier(permit.requestId, 'requestId');
    requireIdentifier(permit.providerId, 'providerId');
    requireNonNegativeFinite(permit.acquiredMonoMs, 'acquiredMonoMs');
    requireNonNegativeFinite(permit.queueWaitMs, 'queueWaitMs');
    if (ids.has(permit.requestId)) throw new Error('duplicate bulkhead requestId');
    ids.add(permit.requestId);
  }
  for (const request of snapshot.queued) {
    validateBulkheadRequest(request);
    if (ids.has(request.requestId)) throw new Error('duplicate bulkhead requestId');
    ids.add(request.requestId);
  }
}

function assertUniqueBulkheadRequest(snapshot: BulkheadSnapshot, requestId: string): void {
  if (
    snapshot.active.some((permit) => permit.requestId === requestId) ||
    snapshot.queued.some((request) => request.requestId === requestId)
  ) {
    throw new Error('duplicate bulkhead requestId');
  }
}

function bulkheadHasCapacity(
  snapshot: BulkheadSnapshot,
  policy: BulkheadPolicy,
  providerId: string,
): boolean {
  if (snapshot.active.length >= policy.maxGlobalActive) return false;
  const providerActive = snapshot.active.filter(
    (permit) => permit.providerId === providerId,
  ).length;
  return providerActive < policy.maxPerProviderActive;
}

function createPermit(request: BulkheadRequest, nowMonoMs: number): BulkheadPermit {
  return {
    permitId: 'permit:' + request.requestId,
    requestId: request.requestId,
    providerId: request.providerId,
    acquiredMonoMs: nowMonoMs,
    queueWaitMs: nowMonoMs - request.enqueuedMonoMs,
  };
}

function validateMonotonicDeadline(deadline: MonotonicDeadline): void {
  if (deadline.schemaVersion !== 1) throw new Error('deadline schemaVersion must be 1');
  requireNonNegativeFinite(deadline.createdAtMonoMs, 'createdAtMonoMs');
  requireNonNegativeFinite(deadline.deadlineMonoMs, 'deadlineMonoMs');
  if (deadline.deadlineMonoMs <= deadline.createdAtMonoMs) {
    throw new Error('deadline must follow creation');
  }
  if (deadline.parentDeadlineMonoMs !== null) {
    requireNonNegativeFinite(deadline.parentDeadlineMonoMs, 'parentDeadlineMonoMs');
    if (deadline.deadlineMonoMs > deadline.parentDeadlineMonoMs) {
      throw new Error('child deadline cannot exceed parent deadline');
    }
  }
  if (deadline.authority !== 'NONE') throw new Error('deadline authority must remain NONE');
}

function cloneLease(lease: RunLeaseV1): RunLeaseV1 {
  return { ...lease };
}

function clonePermit(permit: BulkheadPermit): BulkheadPermit {
  return { ...permit };
}

function cloneRequest(request: BulkheadRequest): BulkheadRequest {
  return { ...request };
}

function cloneBulkheadSnapshot(snapshot: BulkheadSnapshot): BulkheadSnapshot {
  return {
    active: snapshot.active.map(clonePermit),
    queued: snapshot.queued.map(cloneRequest),
  };
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(name + ' is required');
}

function requireIdentifier(value: string, name: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) throw new Error(name + ' must be a bounded identifier');
}

function requireHash(value: string, name: string): void {
  if (!HASH_PATTERN.test(value)) throw new Error(name + ' must be a SHA-256 hex hash');
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(name + ' must be a positive integer');
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(name + ' must be a non-negative integer');
  }
}

function requireNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(name + ' must be a non-negative finite number');
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
