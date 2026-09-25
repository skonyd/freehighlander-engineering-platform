export interface RuntimeErrorTelemetryDiagnosisInput {
  readonly causeCode: string;
  readonly causeKind: string;
  readonly certainty: string;
  readonly headline: string;
  readonly sourceComponent: string;
  readonly sourceOperation: string;
  readonly failedStep: string;
  readonly rootCause: string;
  readonly observedSignal: string;
  readonly nextAction: string;
  readonly retryAt?: string;
  readonly redactionStatus: 'APPLIED' | 'NOT_REQUIRED';
  readonly safeForUserDisplay: true;
}

export interface RuntimeErrorTelemetryInput {
  readonly code: string;
  readonly severity: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly diagnosis: RuntimeErrorTelemetryDiagnosisInput;
}

export interface RuntimeErrorTelemetryPayload {
  readonly code: string;
  readonly severity: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly causeCode: string;
  readonly causeKind: string;
  readonly certainty: string;
  readonly headline: string;
  readonly sourceComponent: string;
  readonly sourceOperation: string;
  readonly failedStep: string;
  readonly rootCause: string;
  readonly observedSignal: string;
  readonly nextAction: string;
  readonly retryAt?: string;
  readonly redactionStatus: 'APPLIED' | 'NOT_REQUIRED';
  readonly safeForUserDisplay: true;
}

const SAFE_TEXT = /^[^\r\n\t]{1,500}$/;

export function buildRuntimeErrorTelemetryPayload(
  input: RuntimeErrorTelemetryInput,
): RuntimeErrorTelemetryPayload {
  if (input.diagnosis.safeForUserDisplay !== true) {
    throw new Error('runtime error telemetry requires safeForUserDisplay diagnosis');
  }

  const diagnosis = input.diagnosis;
  const payload: RuntimeErrorTelemetryPayload = {
    code: requireToken(input.code, 'code'),
    severity: requireToken(input.severity, 'severity'),
    retryable: input.retryable,
    correlationId: requireToken(input.correlationId, 'correlationId'),
    causeCode: requireToken(diagnosis.causeCode, 'causeCode'),
    causeKind: requireToken(diagnosis.causeKind, 'causeKind'),
    certainty: requireToken(diagnosis.certainty, 'certainty'),
    headline: requireSafeText(diagnosis.headline, 'headline'),
    sourceComponent: requireToken(diagnosis.sourceComponent, 'sourceComponent'),
    sourceOperation: requireToken(diagnosis.sourceOperation, 'sourceOperation'),
    failedStep: requireSafeText(diagnosis.failedStep, 'failedStep'),
    rootCause: requireSafeText(diagnosis.rootCause, 'rootCause'),
    observedSignal: requireSafeText(diagnosis.observedSignal, 'observedSignal'),
    nextAction: requireSafeText(diagnosis.nextAction, 'nextAction'),
    ...(diagnosis.retryAt === undefined ? {} : { retryAt: normalizeTimestamp(diagnosis.retryAt) }),
    redactionStatus: diagnosis.redactionStatus,
    safeForUserDisplay: true,
  };

  if (payload.redactionStatus !== 'APPLIED' && payload.redactionStatus !== 'NOT_REQUIRED') {
    throw new Error('runtime error telemetry redactionStatus is invalid');
  }

  return payload;
}

export function runtimeErrorTelemetryCanExposeRawCause(): false {
  return false;
}

export function runtimeErrorTelemetryCanGrantAuthority(): false {
  return false;
}

function requireToken(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:/-]{2,128}$/.test(normalized)) {
    throw new Error(`runtime error telemetry ${field} is invalid`);
  }
  return normalized;
}

function requireSafeText(value: string, field: string): string {
  const normalized = value.trim();
  if (!SAFE_TEXT.test(normalized)) {
    throw new Error(`runtime error telemetry ${field} is invalid`);
  }
  return normalized;
}

function normalizeTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error('runtime error telemetry retryAt must be an ISO timestamp');
  }
  return new Date(parsed).toISOString();
}
