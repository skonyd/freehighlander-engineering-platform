export interface RuntimeProgressMetadata {
  readonly phase: string;
  readonly completedUnits: number | null;
  readonly totalUnits: number | null;
  readonly detail: string | null;
}

export interface RuntimeHeartbeatV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly nodeId: string;
  readonly activityId: string;
  readonly sequence: number;
  readonly recordedAtMonoMs: number;
  readonly leaseExpiresAtMonoMs: number;
  readonly progress: RuntimeProgressMetadata;
  readonly authority: 'NONE';
}

export interface RuntimeHeartbeatIdentity {
  readonly runId: string;
  readonly nodeId: string;
  readonly activityId: string;
}

export type RuntimeLeaseLiveness = 'ACTIVE' | 'EXPIRED' | 'MISSING' | 'UNKNOWN';

export type RuntimeActivityLiveness =
  | 'ACTIVE_PROGRESSING'
  | 'STALLED'
  | 'INTERRUPTED'
  | 'RECOVERY_REQUIRED';

export interface RuntimeLivenessObservation {
  readonly identity: RuntimeHeartbeatIdentity;
  readonly lease: RuntimeLeaseLiveness;
  readonly heartbeat: RuntimeHeartbeatV1 | null;
  readonly nowMonoMs: number;
  readonly maxSilenceMs: number;
}

export interface RuntimeLivenessDecision {
  readonly status: RuntimeActivityLiveness;
  readonly reason: string;
  readonly heartbeatAgeMs: number | null;
  readonly authority: 'NONE';
  readonly semanticSuccess: false;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const MAX_DETAIL_LENGTH = 160;

export function createRuntimeHeartbeat(
  identity: RuntimeHeartbeatIdentity,
  sequence: number,
  recordedAtMonoMs: number,
  leaseExpiresAtMonoMs: number,
  progress: RuntimeProgressMetadata,
): RuntimeHeartbeatV1 {
  validateIdentity(identity);
  requireNonNegativeInteger(sequence, 'sequence');
  requireNonNegativeFinite(recordedAtMonoMs, 'recordedAtMonoMs');
  requireNonNegativeFinite(leaseExpiresAtMonoMs, 'leaseExpiresAtMonoMs');
  if (leaseExpiresAtMonoMs <= recordedAtMonoMs) {
    throw new Error('heartbeat lease expiry must follow recorded time');
  }
  const normalizedProgress = validateProgress(progress);

  return {
    schemaVersion: 1,
    ...identity,
    sequence,
    recordedAtMonoMs,
    leaseExpiresAtMonoMs,
    progress: normalizedProgress,
    authority: 'NONE',
  };
}

export function advanceRuntimeHeartbeat(
  previous: RuntimeHeartbeatV1,
  recordedAtMonoMs: number,
  leaseExpiresAtMonoMs: number,
  progress: RuntimeProgressMetadata,
): RuntimeHeartbeatV1 {
  validateRuntimeHeartbeat(previous);
  requireNonNegativeFinite(recordedAtMonoMs, 'recordedAtMonoMs');
  if (recordedAtMonoMs < previous.recordedAtMonoMs) {
    throw new Error('heartbeat monotonic time cannot move backwards');
  }

  return createRuntimeHeartbeat(
    {
      runId: previous.runId,
      nodeId: previous.nodeId,
      activityId: previous.activityId,
    },
    previous.sequence + 1,
    recordedAtMonoMs,
    leaseExpiresAtMonoMs,
    progress,
  );
}

export function validateRuntimeHeartbeat(heartbeat: RuntimeHeartbeatV1): void {
  if (heartbeat.schemaVersion !== 1) throw new Error('heartbeat schemaVersion must be 1');
  if (heartbeat.authority !== 'NONE') throw new Error('heartbeat authority must remain NONE');

  const rebuilt = createRuntimeHeartbeat(
    {
      runId: heartbeat.runId,
      nodeId: heartbeat.nodeId,
      activityId: heartbeat.activityId,
    },
    heartbeat.sequence,
    heartbeat.recordedAtMonoMs,
    heartbeat.leaseExpiresAtMonoMs,
    heartbeat.progress,
  );

  if (JSON.stringify(rebuilt) !== JSON.stringify(heartbeat)) {
    throw new Error('heartbeat is not canonically normalized');
  }
}

export function classifyRuntimeActivityLiveness(
  observation: RuntimeLivenessObservation,
): RuntimeLivenessDecision {
  validateIdentity(observation.identity);
  requireLeaseLiveness(observation.lease);
  requireNonNegativeFinite(observation.nowMonoMs, 'nowMonoMs');
  requirePositiveInteger(observation.maxSilenceMs, 'maxSilenceMs');

  if (observation.lease === 'UNKNOWN') {
    return decision('RECOVERY_REQUIRED', 'lease liveness is unverifiable', null);
  }

  if (observation.lease === 'EXPIRED' || observation.lease === 'MISSING') {
    return decision(
      'INTERRUPTED',
      observation.lease === 'EXPIRED'
        ? 'runtime lease expired'
        : 'runtime lease is missing',
      heartbeatAge(observation.heartbeat, observation.nowMonoMs),
    );
  }

  if (observation.heartbeat === null) {
    return decision(
      'RECOVERY_REQUIRED',
      'active lease has no heartbeat evidence',
      null,
    );
  }

  validateRuntimeHeartbeat(observation.heartbeat);
  assertHeartbeatIdentity(observation.identity, observation.heartbeat);

  if (observation.nowMonoMs < observation.heartbeat.recordedAtMonoMs) {
    throw new Error('heartbeat monotonic time is in the future');
  }

  const age = observation.nowMonoMs - observation.heartbeat.recordedAtMonoMs;

  if (observation.nowMonoMs >= observation.heartbeat.leaseExpiresAtMonoMs) {
    return decision(
      'RECOVERY_REQUIRED',
      'lease observation conflicts with heartbeat lease expiry',
      age,
    );
  }

  if (age > observation.maxSilenceMs) {
    return decision('STALLED', 'heartbeat exceeded max silence budget', age);
  }

  return decision('ACTIVE_PROGRESSING', 'heartbeat is within liveness budget', age);
}

export function heartbeatCanGrantAuthority(): false {
  return false;
}

export function heartbeatCanDeclareSemanticSuccess(): false {
  return false;
}

export function heartbeatCanAuthorizeReplay(): false {
  return false;
}

export function heartbeatCanCarrySecretValue(): false {
  return false;
}

function validateIdentity(identity: RuntimeHeartbeatIdentity): void {
  requireId(identity.runId, 'runId');
  requireId(identity.nodeId, 'nodeId');
  requireId(identity.activityId, 'activityId');
}

function validateProgress(progress: RuntimeProgressMetadata): RuntimeProgressMetadata {
  requireId(progress.phase, 'progress phase');

  if (progress.completedUnits !== null) {
    requireNonNegativeInteger(progress.completedUnits, 'completedUnits');
  }
  if (progress.totalUnits !== null) {
    requireNonNegativeInteger(progress.totalUnits, 'totalUnits');
  }
  if (
    progress.completedUnits !== null &&
    progress.totalUnits !== null &&
    progress.completedUnits > progress.totalUnits
  ) {
    throw new Error('completedUnits cannot exceed totalUnits');
  }

  if (progress.detail !== null) {
    if (
      progress.detail.length === 0 ||
      progress.detail.length > MAX_DETAIL_LENGTH ||
      /[\r\n\0]/.test(progress.detail)
    ) {
      throw new Error('progress detail must be bounded single-line metadata');
    }
  }

  return {
    phase: progress.phase,
    completedUnits: progress.completedUnits,
    totalUnits: progress.totalUnits,
    detail: progress.detail,
  };
}

function assertHeartbeatIdentity(
  expected: RuntimeHeartbeatIdentity,
  heartbeat: RuntimeHeartbeatV1,
): void {
  if (
    expected.runId !== heartbeat.runId ||
    expected.nodeId !== heartbeat.nodeId ||
    expected.activityId !== heartbeat.activityId
  ) {
    throw new Error('heartbeat identity mismatch');
  }
}

function heartbeatAge(heartbeat: RuntimeHeartbeatV1 | null, nowMonoMs: number): number | null {
  if (heartbeat === null) return null;
  validateRuntimeHeartbeat(heartbeat);
  if (nowMonoMs < heartbeat.recordedAtMonoMs) {
    throw new Error('heartbeat monotonic time is in the future');
  }
  return nowMonoMs - heartbeat.recordedAtMonoMs;
}

function decision(
  status: RuntimeActivityLiveness,
  reason: string,
  heartbeatAgeMs: number | null,
): RuntimeLivenessDecision {
  return {
    status,
    reason,
    heartbeatAgeMs,
    authority: 'NONE',
    semanticSuccess: false,
  };
}

function requireLeaseLiveness(value: RuntimeLeaseLiveness): void {
  if (value !== 'ACTIVE' && value !== 'EXPIRED' && value !== 'MISSING' && value !== 'UNKNOWN') {
    throw new Error('unsupported runtime lease liveness');
  }
}

function requireId(value: string, name: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(name + ' must be a bounded identifier');
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(name + ' must be a positive integer');
  }
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
