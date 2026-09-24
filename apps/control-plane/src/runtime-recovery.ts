export type RuntimeObservedState =
  'RUNNING' | 'READY' | 'PASSED' | 'FAILED' | 'BLOCKED' | 'HUMAN_REQUIRED';

export type RuntimeLeaseObservation =
  'ACTIVE_OWNED' | 'ACTIVE_OTHER' | 'EXPIRED' | 'RELEASED' | 'MISSING' | 'UNKNOWN';

export type RuntimeRecoveryEvidenceStatus = 'VALID' | 'MISSING' | 'INVALID';
export type RuntimeActivityEffect = 'READ_ONLY' | 'SIDE_EFFECTING';
export type RuntimeIdempotencyEvidence = 'PROVEN' | 'ABSENT' | 'NOT_REQUIRED';

export interface RuntimeRecoveryObservation {
  readonly runId: string;
  readonly nodeId: string;
  readonly observedState: RuntimeObservedState;
  readonly lease: RuntimeLeaseObservation;
  readonly exactRevisionMatches: boolean;
  readonly replayManifest: RuntimeRecoveryEvidenceStatus;
  readonly checkpoint: RuntimeRecoveryEvidenceStatus;
  readonly checkpointResumeSafe: boolean | null;
  readonly activityEffect: RuntimeActivityEffect;
  readonly idempotencyEvidence: RuntimeIdempotencyEvidence;
}

export type RuntimeRecoveryStatus = 'UNCHANGED' | 'LIVE' | 'INTERRUPTED' | 'RECOVERY_REQUIRED';

export type RuntimeRecoveryNextAction =
  'NONE' | 'RESUME_FROM_CHECKPOINT' | 'RERUN_SAFE' | 'HUMAN_REVIEW';

export interface RuntimeRecoveryDecision {
  readonly runId: string;
  readonly nodeId: string;
  readonly status: RuntimeRecoveryStatus;
  readonly nextAction: RuntimeRecoveryNextAction;
  readonly reason: string;
  readonly authority: 'NONE';
  readonly autoExecute: false;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export function reconcileStuckRun(
  observation: RuntimeRecoveryObservation,
): RuntimeRecoveryDecision {
  validateObservation(observation);

  if (observation.observedState !== 'RUNNING') {
    return decision(observation, 'UNCHANGED', 'NONE', 'node is not RUNNING');
  }

  if (observation.lease === 'ACTIVE_OWNED') {
    return decision(observation, 'LIVE', 'NONE', 'RUNNING node has a valid owned active lease');
  }

  if (observation.lease === 'ACTIVE_OTHER') {
    return decision(
      observation,
      'RECOVERY_REQUIRED',
      'HUMAN_REVIEW',
      'RUNNING node is owned by another active lease',
    );
  }

  if (observation.lease === 'UNKNOWN') {
    return decision(
      observation,
      'RECOVERY_REQUIRED',
      'HUMAN_REVIEW',
      'lease ownership is unverifiable',
    );
  }

  if (!observation.exactRevisionMatches) {
    return decision(
      observation,
      'RECOVERY_REQUIRED',
      'HUMAN_REVIEW',
      'exact revision changed since the interrupted run',
    );
  }

  if (observation.replayManifest !== 'VALID') {
    return decision(
      observation,
      'RECOVERY_REQUIRED',
      'HUMAN_REVIEW',
      'FH-17 replay evidence is missing or invalid',
    );
  }

  if (observation.checkpoint === 'INVALID') {
    return decision(
      observation,
      'RECOVERY_REQUIRED',
      'HUMAN_REVIEW',
      'recovery checkpoint exists but is invalid',
    );
  }

  if (observation.checkpoint === 'VALID') {
    if (observation.checkpointResumeSafe !== true) {
      return decision(
        observation,
        'RECOVERY_REQUIRED',
        'HUMAN_REVIEW',
        'checkpoint cannot prove a safe resume boundary',
      );
    }
    return decision(
      observation,
      'INTERRUPTED',
      'RESUME_FROM_CHECKPOINT',
      'inactive RUNNING node has valid exact-bound replay and safe checkpoint evidence',
    );
  }

  if (observation.activityEffect === 'READ_ONLY') {
    return decision(
      observation,
      'INTERRUPTED',
      'RERUN_SAFE',
      'read-only interrupted activity may be rerun under valid replay evidence',
    );
  }

  if (observation.idempotencyEvidence === 'PROVEN') {
    return decision(
      observation,
      'INTERRUPTED',
      'RERUN_SAFE',
      'side-effecting interrupted activity has explicit idempotency evidence',
    );
  }

  return decision(
    observation,
    'RECOVERY_REQUIRED',
    'HUMAN_REVIEW',
    'side-effecting interrupted activity lacks idempotency evidence',
  );
}

export function staleRunningCanRemainRunning(): false {
  return false;
}

export function recoveryCanRepeatSideEffectWithoutIdempotency(): false {
  return false;
}

export function recoveryCanAutoExecute(): false {
  return false;
}

export function runtimeRecoveryCanGrantAuthority(): false {
  return false;
}

function validateObservation(observation: RuntimeRecoveryObservation): void {
  requireId(observation.runId, 'runId');
  requireId(observation.nodeId, 'nodeId');

  if (
    observation.observedState !== 'RUNNING' &&
    observation.observedState !== 'READY' &&
    observation.observedState !== 'PASSED' &&
    observation.observedState !== 'FAILED' &&
    observation.observedState !== 'BLOCKED' &&
    observation.observedState !== 'HUMAN_REQUIRED'
  ) {
    throw new Error('unsupported observedState');
  }

  if (
    observation.lease !== 'ACTIVE_OWNED' &&
    observation.lease !== 'ACTIVE_OTHER' &&
    observation.lease !== 'EXPIRED' &&
    observation.lease !== 'RELEASED' &&
    observation.lease !== 'MISSING' &&
    observation.lease !== 'UNKNOWN'
  ) {
    throw new Error('unsupported lease observation');
  }

  validateEvidenceStatus(observation.replayManifest, 'replayManifest');
  validateEvidenceStatus(observation.checkpoint, 'checkpoint');

  if (observation.checkpoint === 'VALID' && observation.checkpointResumeSafe === null) {
    throw new Error('valid checkpoint requires checkpointResumeSafe');
  }
  if (observation.checkpoint !== 'VALID' && observation.checkpointResumeSafe !== null) {
    throw new Error('checkpointResumeSafe is only valid for a valid checkpoint');
  }

  if (
    observation.activityEffect !== 'READ_ONLY' &&
    observation.activityEffect !== 'SIDE_EFFECTING'
  ) {
    throw new Error('unsupported activityEffect');
  }

  if (
    observation.idempotencyEvidence !== 'PROVEN' &&
    observation.idempotencyEvidence !== 'ABSENT' &&
    observation.idempotencyEvidence !== 'NOT_REQUIRED'
  ) {
    throw new Error('unsupported idempotencyEvidence');
  }

  if (
    observation.activityEffect === 'READ_ONLY' &&
    observation.idempotencyEvidence !== 'NOT_REQUIRED'
  ) {
    throw new Error('read-only activity requires idempotencyEvidence=NOT_REQUIRED');
  }

  if (
    observation.activityEffect === 'SIDE_EFFECTING' &&
    observation.idempotencyEvidence === 'NOT_REQUIRED'
  ) {
    throw new Error('side-effecting activity cannot use idempotencyEvidence=NOT_REQUIRED');
  }
}

function validateEvidenceStatus(value: RuntimeRecoveryEvidenceStatus, name: string): void {
  if (value !== 'VALID' && value !== 'MISSING' && value !== 'INVALID') {
    throw new Error('unsupported ' + name + ' status');
  }
}

function decision(
  observation: RuntimeRecoveryObservation,
  status: RuntimeRecoveryStatus,
  nextAction: RuntimeRecoveryNextAction,
  reason: string,
): RuntimeRecoveryDecision {
  return {
    runId: observation.runId,
    nodeId: observation.nodeId,
    status,
    nextAction,
    reason,
    authority: 'NONE',
    autoExecute: false,
  };
}

function requireId(value: string, name: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(name + ' must be a bounded identifier');
}
