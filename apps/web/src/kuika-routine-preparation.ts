import {
  normalizeFhKuikaTriggerEventV1,
  type FhKuikaNormalizedTriggerEventV1,
  type FhKuikaRoutineDraftV1,
  type FhKuikaRoutineTriggerKind,
} from './kuika-routines.js';

export interface FhKuikaRoutineSchedulePlanV1 {
  readonly schemaVersion: 1;
  readonly routineRef: string;
  readonly triggerKind: FhKuikaRoutineTriggerKind;
  readonly schedule: string | null;
  readonly source: string | null;
  readonly events: readonly string[];
  readonly concurrency: number;
  readonly retry: {
    readonly maxAttempts: number;
    readonly backoffMs: number;
  };
  readonly schedulerState: 'PREPARED';
  readonly schedulingAuthorized: false;
  readonly executionAuthorized: false;
  readonly authority: 'NONE';
}

export interface FhKuikaRoutineEventMatchV1 {
  readonly schemaVersion: 1;
  readonly routineRef: string;
  readonly eventDigest: string;
  readonly matched: boolean;
  readonly reason:
    | 'MATCHED'
    | 'TRIGGER_KIND_MISMATCH'
    | 'SOURCE_MISMATCH'
    | 'EVENT_NOT_SUBSCRIBED'
    | 'NON_EVENT_TRIGGER';
  readonly executionAuthorized: false;
  readonly authority: 'NONE';
}

export interface FhKuikaWebhookEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly provider: string;
  readonly deliveryId: string;
  readonly event: FhKuikaNormalizedTriggerEventV1;
  readonly rawPayloadRetained: false;
  readonly modelInvocationRequired: false;
  readonly executionAuthorized: false;
  readonly authority: 'NONE';
}

export function prepareFhKuikaRoutineScheduleV1(
  routine: FhKuikaRoutineDraftV1,
): FhKuikaRoutineSchedulePlanV1 {
  return {
    schemaVersion: 1,
    routineRef: routine.id + '@' + routine.version,
    triggerKind: routine.trigger.kind,
    schedule: routine.trigger.schedule ?? null,
    source: routine.trigger.source ?? null,
    events: [...(routine.trigger.events ?? [])],
    concurrency: routine.concurrency,
    retry: { ...routine.retry },
    schedulerState: 'PREPARED',
    schedulingAuthorized: false,
    executionAuthorized: false,
    authority: 'NONE',
  };
}

export function matchFhKuikaRoutineEventV1(
  routine: FhKuikaRoutineDraftV1,
  event: FhKuikaNormalizedTriggerEventV1,
): FhKuikaRoutineEventMatchV1 {
  const eventKinds = new Set<FhKuikaRoutineTriggerKind>([
    'WEBHOOK',
    'GIT_EVENT',
    'CI_EVENT',
    'RELEASE_EVENT',
    'INCIDENT_EVENT',
    'SECURITY_EVENT',
  ]);

  let reason: FhKuikaRoutineEventMatchV1['reason'] = 'MATCHED';
  let matched = true;

  if (!eventKinds.has(routine.trigger.kind)) {
    matched = false;
    reason = 'NON_EVENT_TRIGGER';
  } else if (routine.trigger.kind !== event.kind) {
    matched = false;
    reason = 'TRIGGER_KIND_MISMATCH';
  } else if ((routine.trigger.source ?? '') !== event.source) {
    matched = false;
    reason = 'SOURCE_MISMATCH';
  } else if (!(routine.trigger.events ?? []).includes(event.event)) {
    matched = false;
    reason = 'EVENT_NOT_SUBSCRIBED';
  }

  return {
    schemaVersion: 1,
    routineRef: routine.id + '@' + routine.version,
    eventDigest: event.payloadDigest,
    matched,
    reason,
    executionAuthorized: false,
    authority: 'NONE',
  };
}

export function normalizeFhKuikaWebhookEnvelopeV1(input: {
  readonly provider: string;
  readonly deliveryId: string;
  readonly kind: Exclude<FhKuikaRoutineTriggerKind, 'MANUAL' | 'CRON'>;
  readonly event: string;
  readonly occurredAt: string;
  readonly payload: string;
  readonly repository?: string;
  readonly exactRevision?: string;
}): FhKuikaWebhookEnvelopeV1 {
  const provider = requireSingleLine(input.provider, 'webhook provider');
  const deliveryId = requireSingleLine(input.deliveryId, 'webhook deliveryId');
  const event = normalizeFhKuikaTriggerEventV1({
    kind: input.kind,
    source: provider,
    event: input.event,
    occurredAt: input.occurredAt,
    payload: input.payload,
    ...(input.repository === undefined ? {} : { repository: input.repository }),
    ...(input.exactRevision === undefined ? {} : { exactRevision: input.exactRevision }),
  });

  return {
    schemaVersion: 1,
    provider,
    deliveryId,
    event,
    rawPayloadRetained: false,
    modelInvocationRequired: false,
    executionAuthorized: false,
    authority: 'NONE',
  };
}

export function routineSchedulerPreparationCanSchedule(): false {
  return false;
}

export function routineSchedulerPreparationCanExecute(): false {
  return false;
}

export function routineEventAdapterCanInvokeModel(): false {
  return false;
}

export function routineEventAdapterCanExecute(): false {
  return false;
}

function requireSingleLine(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  if (/[
	]/.test(normalized) || normalized.length > 500) {
    throw new Error(field + ' must be a bounded single-line value');
  }
  return normalized;
}
