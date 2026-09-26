import { createHash } from 'node:crypto';

export type FhKuikaRoutineTriggerKind =
  | 'MANUAL'
  | 'CRON'
  | 'WEBHOOK'
  | 'GIT_EVENT'
  | 'CI_EVENT'
  | 'RELEASE_EVENT'
  | 'INCIDENT_EVENT'
  | 'SECURITY_EVENT';

export interface FhKuikaRoutineTriggerV1 {
  readonly kind: FhKuikaRoutineTriggerKind;
  readonly schedule?: string;
  readonly source?: string;
  readonly events?: readonly string[];
}

export interface FhKuikaRoutineRetryV1 {
  readonly maxAttempts: number;
  readonly backoffMs: number;
}

export interface FhKuikaRoutineDraftV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly trigger: FhKuikaRoutineTriggerV1;
  readonly workflowRef: string;
  readonly requiredConnectorRefs: readonly string[];
  readonly secretHandleRefs: readonly string[];
  readonly concurrency: number;
  readonly retry: FhKuikaRoutineRetryV1;
  readonly status: 'DRAFT';
  readonly authority: 'NONE';
  readonly activationAuthorized: false;
}

export interface FhKuikaNormalizedTriggerEventV1 {
  readonly schemaVersion: 1;
  readonly kind: Exclude<FhKuikaRoutineTriggerKind, 'MANUAL' | 'CRON'>;
  readonly source: string;
  readonly event: string;
  readonly occurredAt: string;
  readonly payloadDigest: string;
  readonly repository?: string;
  readonly exactRevision?: string;
  readonly authority: 'NONE';
}

export interface FhKuikaRoutineActivationPlanV1 {
  readonly schemaVersion: 1;
  readonly routineId: string;
  readonly routineVersion: string;
  readonly requiredConnectorRefs: readonly string[];
  readonly missingConnectorRefs: readonly string[];
  readonly requiresEnabledV3Authority: true;
  readonly requiresSystemPolicyAllow: true;
  readonly readyForAuthorityReview: boolean;
  readonly authority: 'NONE';
  readonly activationAuthorized: false;
}

export function createFhKuikaRoutineDraftV1(input: {
  readonly id: string;
  readonly version?: string;
  readonly name: string;
  readonly trigger: FhKuikaRoutineTriggerV1;
  readonly workflowRef: string;
  readonly requiredConnectorRefs?: readonly string[];
  readonly secretHandleRefs?: readonly string[];
  readonly concurrency?: number;
  readonly retry?: Partial<FhKuikaRoutineRetryV1>;
}): FhKuikaRoutineDraftV1 {
  const id = requireIdentifier(input.id, 'routine id');
  const version = input.version ?? '1.0.0';
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('routine version must be semantic version x.y.z');
  }

  const name = requireText(input.name, 'routine name');
  const workflowRef = requireVersionRef(input.workflowRef, 'workflowRef');
  const trigger = normalizeTrigger(input.trigger);
  const requiredConnectorRefs = normalizeIdentifiers(
    input.requiredConnectorRefs ?? [],
    'connector reference',
  );
  const secretHandleRefs = normalizeSecretHandles(input.secretHandleRefs ?? []);
  const concurrency = input.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) {
    throw new Error('routine concurrency must be an integer between 1 and 100');
  }

  const retry = {
    maxAttempts: input.retry?.maxAttempts ?? 0,
    backoffMs: input.retry?.backoffMs ?? 1_000,
  };
  if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 0 || retry.maxAttempts > 10) {
    throw new Error('routine retry maxAttempts must be an integer between 0 and 10');
  }
  if (!Number.isInteger(retry.backoffMs) || retry.backoffMs < 100 || retry.backoffMs > 3_600_000) {
    throw new Error('routine retry backoffMs must be an integer between 100 and 3600000');
  }

  return {
    schemaVersion: 1,
    id,
    version,
    name,
    trigger,
    workflowRef,
    requiredConnectorRefs,
    secretHandleRefs,
    concurrency,
    retry,
    status: 'DRAFT',
    authority: 'NONE',
    activationAuthorized: false,
  };
}

export function normalizeFhKuikaTriggerEventV1(input: {
  readonly kind: Exclude<FhKuikaRoutineTriggerKind, 'MANUAL' | 'CRON'>;
  readonly source: string;
  readonly event: string;
  readonly occurredAt: string;
  readonly payload: string;
  readonly repository?: string;
  readonly exactRevision?: string;
}): FhKuikaNormalizedTriggerEventV1 {
  const source = requireSingleLine(input.source, 'trigger source');
  const event = requireIdentifier(input.event, 'trigger event');
  requireTimestamp(input.occurredAt, 'trigger occurredAt');

  if (input.payload.length > 1_000_000) {
    throw new Error('trigger payload must be at most 1000000 characters');
  }

  const repository =
    input.repository === undefined ? undefined : requireSingleLine(input.repository, 'repository');
  const exactRevision =
    input.exactRevision === undefined ? undefined : requireGitSha(input.exactRevision);

  return {
    schemaVersion: 1,
    kind: input.kind,
    source,
    event,
    occurredAt: input.occurredAt,
    payloadDigest: createHash('sha256').update(input.payload, 'utf8').digest('hex'),
    ...(repository === undefined ? {} : { repository }),
    ...(exactRevision === undefined ? {} : { exactRevision }),
    authority: 'NONE',
  };
}

export function buildFhKuikaRoutineActivationPlanV1(
  routine: FhKuikaRoutineDraftV1,
  availableConnectorRefs: readonly string[],
): FhKuikaRoutineActivationPlanV1 {
  const available = new Set(normalizeIdentifiers(availableConnectorRefs, 'connector reference'));
  const missingConnectorRefs = routine.requiredConnectorRefs
    .filter((connector) => !available.has(connector))
    .sort();

  return {
    schemaVersion: 1,
    routineId: routine.id,
    routineVersion: routine.version,
    requiredConnectorRefs: [...routine.requiredConnectorRefs],
    missingConnectorRefs,
    requiresEnabledV3Authority: true,
    requiresSystemPolicyAllow: true,
    readyForAuthorityReview: missingConnectorRefs.length === 0,
    authority: 'NONE',
    activationAuthorized: false,
  };
}

export function routineDraftCanActivate(): false {
  return false;
}

export function routineDraftCanGrantAuthority(): false {
  return false;
}

export function triggerNormalizationCanInvokeModel(): false {
  return false;
}

export function triggerNormalizationCanExecuteWorkflow(): false {
  return false;
}

function normalizeTrigger(input: FhKuikaRoutineTriggerV1): FhKuikaRoutineTriggerV1 {
  if (input.kind === 'MANUAL') {
    if (input.schedule !== undefined || input.source !== undefined || input.events !== undefined) {
      throw new Error('MANUAL trigger cannot define schedule, source or events');
    }
    return { kind: 'MANUAL' };
  }

  if (input.kind === 'CRON') {
    if (input.source !== undefined || input.events !== undefined) {
      throw new Error('CRON trigger cannot define source or events');
    }
    const schedule = requireSingleLine(input.schedule ?? '', 'cron schedule');
    if (schedule.split(/\s+/).length !== 5) {
      throw new Error('cron schedule must contain exactly five fields');
    }
    return { kind: 'CRON', schedule };
  }

  if (input.schedule !== undefined) {
    throw new Error(input.kind + ' trigger cannot define a cron schedule');
  }

  const source = requireSingleLine(input.source ?? '', 'trigger source');
  const events = normalizeIdentifiers(input.events ?? [], 'trigger event');
  if (events.length === 0) {
    throw new Error(input.kind + ' trigger requires at least one event');
  }

  return {
    kind: input.kind,
    source,
    events,
  };
}

function normalizeIdentifiers(values: readonly string[], field: string): readonly string[] {
  return [...new Set(values.map((value) => requireIdentifier(value, field)))].sort();
}

function normalizeSecretHandles(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => requireSingleLine(value, 'secret handle')))]
    .map((value) => {
      if (!/^secret:[a-zA-Z0-9._/-]+$/.test(value)) {
        throw new Error('secret handles must use secret:<reference>');
      }
      return value;
    })
    .sort();
}

function requireVersionRef(value: string, field: string): string {
  const normalized = requireSingleLine(value, field);
  if (!/^[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+$/.test(normalized)) {
    throw new Error(field + ' must use <id>@<semver>');
  }
  return normalized;
}

function requireIdentifier(value: string, field: string): string {
  const normalized = requireSingleLine(value, field);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new Error(field + ' must use a bounded lowercase identifier');
  }
  return normalized;
}

function requireSingleLine(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  if (normalized.length > 500 || /[\r\n\t]/.test(normalized)) {
    throw new Error(field + ' must be a bounded single-line value');
  }
  return normalized;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  return normalized;
}

function requireTimestamp(value: string, field: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(field + ' must be a valid timestamp');
  }
}

function requireGitSha(value: string): string {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)) {
    throw new Error('exactRevision must be a lowercase git sha');
  }
  return value;
}
