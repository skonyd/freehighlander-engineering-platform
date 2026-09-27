import {
  adaptFhKuikaExternalRoutineEventV1,
  prepareFhKuikaRoutineDispatchV1,
  type FhKuikaRoutineDispatchCandidateV1,
} from './kuika-routine-dispatch.js';
import type {
  FhKuikaRoutineDraftV1,
  FhKuikaRoutineTriggerKind,
} from './kuika-routines.js';

export type FhKuikaRoutineTelemetryState =
  | 'READY_FOR_CONTROL_PLANE_REVIEW'
  | 'EVENT_NOT_MATCHED'
  | 'MISSING_CONNECTOR'
  | 'RETRY_SCHEDULED'
  | 'FAILED';

export interface FhKuikaRoutineTelemetryObservationV1 {
  readonly schemaVersion: 1;
  readonly routineId: string;
  readonly routineVersion: string;
  readonly workflowRef: string;
  readonly observedAt: string;
  readonly state: FhKuikaRoutineTelemetryState;
  readonly matched: boolean;
  readonly missingConnectorRefs: readonly string[];
  readonly retryAttempt: number;
  readonly maxRetryAttempts: number;
  readonly failureCode?: string;
  readonly nextRetryAt?: string;
  readonly authority: 'NONE';
  readonly persisted: false;
}

export interface FhKuikaRoutineTelemetrySummaryV1 {
  readonly schemaVersion: 1;
  readonly routineId: string;
  readonly observations: number;
  readonly readyForReview: number;
  readonly unmatched: number;
  readonly missingConnector: number;
  readonly retriesScheduled: number;
  readonly failures: number;
  readonly latestObservedAt: string | null;
  readonly latestFailureCode: string | null;
  readonly authority: 'NONE';
}

export function createFhKuikaRoutineTelemetryObservationV1(input: {
  readonly candidate: FhKuikaRoutineDispatchCandidateV1;
  readonly observedAt: string;
  readonly retryAttempt?: number;
  readonly failureCode?: string;
  readonly nextRetryAt?: string;
}): FhKuikaRoutineTelemetryObservationV1 {
  if (input.candidate.authority !== 'NONE') {
    throw new Error('routine telemetry source candidate must remain authority-neutral');
  }
  requireTimestamp(input.observedAt, 'routine telemetry observedAt');

  const retryAttempt = input.retryAttempt ?? 0;
  if (
    !Number.isInteger(retryAttempt) ||
    retryAttempt < 0 ||
    retryAttempt > input.candidate.retry.maxAttempts
  ) {
    throw new Error('routine telemetry retryAttempt exceeds declared retry policy');
  }

  const failureCode =
    input.failureCode === undefined
      ? undefined
      : requireIdentifier(input.failureCode, 'routine telemetry failureCode');

  const nextRetryAt =
    input.nextRetryAt === undefined
      ? undefined
      : normalizeTimestamp(input.nextRetryAt, 'routine telemetry nextRetryAt');

  const state = deriveState(input.candidate, retryAttempt, failureCode);

  if (state === 'RETRY_SCHEDULED' && nextRetryAt === undefined) {
    throw new Error('RETRY_SCHEDULED observation requires nextRetryAt');
  }
  if (state === 'FAILED' && failureCode === undefined) {
    throw new Error('FAILED observation requires failureCode');
  }

  return {
    schemaVersion: 1,
    routineId: input.candidate.routineId,
    routineVersion: input.candidate.routineVersion,
    workflowRef: input.candidate.workflowRef,
    observedAt: normalizeTimestamp(input.observedAt, 'routine telemetry observedAt'),
    state,
    matched: input.candidate.matched,
    missingConnectorRefs: [...input.candidate.missingConnectorRefs],
    retryAttempt,
    maxRetryAttempts: input.candidate.retry.maxAttempts,
    ...(failureCode === undefined ? {} : { failureCode }),
    ...(nextRetryAt === undefined ? {} : { nextRetryAt }),
    authority: 'NONE',
    persisted: false,
  };
}

export function summarizeFhKuikaRoutineTelemetryV1(
  routineId: string,
  observations: readonly FhKuikaRoutineTelemetryObservationV1[],
): FhKuikaRoutineTelemetrySummaryV1 {
  const normalizedRoutineId = requireIdentifier(routineId, 'routineId');
  const relevant = observations
    .filter((item) => item.routineId === normalizedRoutineId)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

  for (const item of relevant) {
    if (item.authority !== 'NONE' || item.persisted !== false) {
      throw new Error('routine telemetry observations must remain read-only metadata');
    }
  }

  const latestFailure = [...relevant]
    .reverse()
    .find((item) => item.state === 'FAILED' || item.failureCode !== undefined);

  return {
    schemaVersion: 1,
    routineId: normalizedRoutineId,
    observations: relevant.length,
    readyForReview: count(relevant, 'READY_FOR_CONTROL_PLANE_REVIEW'),
    unmatched: count(relevant, 'EVENT_NOT_MATCHED'),
    missingConnector: count(relevant, 'MISSING_CONNECTOR'),
    retriesScheduled: count(relevant, 'RETRY_SCHEDULED'),
    failures: count(relevant, 'FAILED'),
    latestObservedAt: relevant.at(-1)?.observedAt ?? null,
    latestFailureCode: latestFailure?.failureCode ?? null,
    authority: 'NONE',
  };
}

export interface FhKuikaRoutineTelemetryPreviewV1 {
  readonly observation: FhKuikaRoutineTelemetryObservationV1;
  readonly summary: FhKuikaRoutineTelemetrySummaryV1;
}

export function buildFhKuikaRoutineTelemetryPreviewV1(
  routine: FhKuikaRoutineDraftV1,
  input: {
    readonly kind: string;
    readonly source: string;
    readonly event: string;
    readonly occurredAt: string;
    readonly payload: string;
    readonly connectorRefs: readonly string[];
    readonly retryAttempt?: number;
    readonly failureCode?: string;
    readonly nextRetryAt?: string;
  },
): FhKuikaRoutineTelemetryPreviewV1 {
  const kind = normalizeExternalTriggerKind(input.kind);
  const triggerEvent = adaptFhKuikaExternalRoutineEventV1(kind, {
    source: input.source,
    event: input.event,
    occurredAt: input.occurredAt,
    payload: input.payload,
  });
  const candidate = prepareFhKuikaRoutineDispatchV1(
    routine,
    triggerEvent,
    input.connectorRefs,
  );
  const observation = createFhKuikaRoutineTelemetryObservationV1({
    candidate,
    observedAt: triggerEvent.occurredAt,
    ...(input.retryAttempt === undefined ? {} : { retryAttempt: input.retryAttempt }),
    ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode }),
    ...(input.nextRetryAt === undefined ? {} : { nextRetryAt: input.nextRetryAt }),
  });

  return {
    observation,
    summary: summarizeFhKuikaRoutineTelemetryV1(routine.id, [observation]),
  };
}

export function routineTelemetryCanInvokeModel(): false {
  return false;
}

export function routineTelemetryCanPersistFromPreview(): false {
  return false;
}

export function routineTelemetryCanActivateRoutine(): false {
  return false;
}

export function routineTelemetryCanSubmitToScheduler(): false {
  return false;
}

function deriveState(
  candidate: FhKuikaRoutineDispatchCandidateV1,
  retryAttempt: number,
  failureCode: string | undefined,
): FhKuikaRoutineTelemetryState {
  if (failureCode !== undefined) {
    return retryAttempt < candidate.retry.maxAttempts ? 'RETRY_SCHEDULED' : 'FAILED';
  }
  return candidate.state;
}

function count(
  observations: readonly FhKuikaRoutineTelemetryObservationV1[],
  state: FhKuikaRoutineTelemetryState,
): number {
  return observations.filter((item) => item.state === state).length;
}

function requireIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new Error(field + ' must use a bounded lowercase identifier');
  }
  return normalized;
}

function requireTimestamp(value: string, field: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(field + ' must be a valid timestamp');
  }
}

function normalizeTimestamp(value: string, field: string): string {
  requireTimestamp(value, field);
  return new Date(value).toISOString();
}

function normalizeExternalTriggerKind(
  value: string,
): Exclude<FhKuikaRoutineTriggerKind, 'MANUAL' | 'CRON'> {
  const normalized = value.toUpperCase();
  switch (normalized) {
    case 'WEBHOOK':
    case 'GIT_EVENT':
    case 'CI_EVENT':
    case 'RELEASE_EVENT':
    case 'INCIDENT_EVENT':
    case 'SECURITY_EVENT':
      return normalized;
    default:
      throw new Error('invalid routine event kind: ' + normalized);
  }
}
