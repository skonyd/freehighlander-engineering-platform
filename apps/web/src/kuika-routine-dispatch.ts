import {
  normalizeFhKuikaTriggerEventV1,
  type FhKuikaNormalizedTriggerEventV1,
  type FhKuikaRoutineDraftV1,
  type FhKuikaRoutineTriggerKind,
} from './kuika-routines.js';

export type FhKuikaRoutineDispatchState =
  'READY_FOR_CONTROL_PLANE_REVIEW' | 'EVENT_NOT_MATCHED' | 'MISSING_CONNECTOR';

export interface FhKuikaRoutineDispatchCandidateV1 {
  readonly schemaVersion: 1;
  readonly routineId: string;
  readonly routineVersion: string;
  readonly workflowRef: string;
  readonly triggerEvent: FhKuikaNormalizedTriggerEventV1;
  readonly matched: boolean;
  readonly missingConnectorRefs: readonly string[];
  readonly state: FhKuikaRoutineDispatchState;
  readonly concurrency: number;
  readonly retry: {
    readonly maxAttempts: number;
    readonly backoffMs: number;
  };
  readonly secretHandleRefs: readonly string[];
  readonly schedulerSubmissionPrepared: boolean;
  readonly dispatchAuthorized: false;
  readonly executionAuthorized: false;
  readonly authority: 'NONE';
}

export interface FhKuikaExternalRoutineEventInputV1 {
  readonly source: string;
  readonly event: string;
  readonly occurredAt: string;
  readonly payload: string;
  readonly repository?: string;
  readonly exactRevision?: string;
}

export function adaptFhKuikaExternalRoutineEventV1(
  kind: Exclude<FhKuikaRoutineTriggerKind, 'MANUAL' | 'CRON'>,
  input: FhKuikaExternalRoutineEventInputV1,
): FhKuikaNormalizedTriggerEventV1 {
  return normalizeFhKuikaTriggerEventV1({
    kind,
    source: input.source,
    event: input.event,
    occurredAt: input.occurredAt,
    payload: input.payload,
    ...(input.repository === undefined ? {} : { repository: input.repository }),
    ...(input.exactRevision === undefined ? {} : { exactRevision: input.exactRevision }),
  });
}

export function prepareFhKuikaRoutineDispatchV1(
  routine: FhKuikaRoutineDraftV1,
  triggerEvent: FhKuikaNormalizedTriggerEventV1,
  availableConnectorRefs: readonly string[],
): FhKuikaRoutineDispatchCandidateV1 {
  if (routine.authority !== 'NONE' || routine.activationAuthorized !== false) {
    throw new Error('routine draft must remain authority-neutral and inactive');
  }

  const matched = routineMatchesEvent(routine, triggerEvent);
  const available = new Set(availableConnectorRefs.map(normalizeConnectorRef));
  const missingConnectorRefs = routine.requiredConnectorRefs
    .filter((ref) => !available.has(ref))
    .sort();

  const state: FhKuikaRoutineDispatchState = !matched
    ? 'EVENT_NOT_MATCHED'
    : missingConnectorRefs.length > 0
      ? 'MISSING_CONNECTOR'
      : 'READY_FOR_CONTROL_PLANE_REVIEW';

  return {
    schemaVersion: 1,
    routineId: routine.id,
    routineVersion: routine.version,
    workflowRef: routine.workflowRef,
    triggerEvent,
    matched,
    missingConnectorRefs,
    state,
    concurrency: routine.concurrency,
    retry: { ...routine.retry },
    secretHandleRefs: [...routine.secretHandleRefs],
    schedulerSubmissionPrepared: state === 'READY_FOR_CONTROL_PLANE_REVIEW',
    dispatchAuthorized: false,
    executionAuthorized: false,
    authority: 'NONE',
  };
}

export function routineDispatchCandidateCanSubmitToScheduler(): false {
  return false;
}

export function routineDispatchCandidateCanExecuteWorkflow(): false {
  return false;
}

export function routineDispatchCandidateCanGrantAuthority(): false {
  return false;
}

export function externalRoutineEventAdapterCanInvokeModel(): false {
  return false;
}

function routineMatchesEvent(
  routine: FhKuikaRoutineDraftV1,
  triggerEvent: FhKuikaNormalizedTriggerEventV1,
): boolean {
  const trigger = routine.trigger;
  if (trigger.kind === 'MANUAL' || trigger.kind === 'CRON') return false;
  if (trigger.kind !== triggerEvent.kind) return false;
  if (trigger.source !== triggerEvent.source) return false;
  return (trigger.events ?? []).includes(triggerEvent.event);
}

function normalizeConnectorRef(value: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new Error('connector reference must use a bounded lowercase identifier');
  }
  return normalized;
}
