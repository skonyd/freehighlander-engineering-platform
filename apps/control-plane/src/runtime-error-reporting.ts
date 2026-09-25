import { createHash, randomUUID } from 'node:crypto';

const SECRET_KEY_PATTERN =
  /(?:secret|token|password|passwd|authorization|api[_-]?key|private[_-]?key|cookie)/i;
const DEFAULT_MAX_DETAIL_ENTRIES = 16;
const DEFAULT_MAX_VALUE_CHARS = 512;

export type RuntimeErrorSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type RuntimeErrorCauseKind =
  | 'VALIDATION'
  | 'CONFIGURATION'
  | 'POLICY'
  | 'AUTHENTICATION'
  | 'SECRET_BINDING'
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TRANSPORT'
  | 'TIMEOUT'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'WORKSPACE_STATE'
  | 'REVISION_CONFLICT'
  | 'COMMAND_EXIT'
  | 'MALFORMED_OUTPUT'
  | 'INTERNAL_INVARIANT'
  | 'UNKNOWN';

export type RuntimeErrorCauseCertainty =
  | 'CONFIRMED_SIGNAL'
  | 'DETERMINISTIC_RULE'
  | 'UNRESOLVED';

export interface RuntimeErrorDiagnosisInput {
  readonly causeCode: string;
  readonly causeKind: RuntimeErrorCauseKind;
  readonly certainty: RuntimeErrorCauseCertainty;
  readonly headline: string;
  readonly sourceComponent: string;
  readonly sourceOperation: string;
  readonly failedStep: string;
  readonly rootCause: string;
  readonly observedSignal: string;
  readonly nextAction: string;
  readonly retryAt?: string;
  readonly redactionStatus: 'APPLIED' | 'NOT_REQUIRED';
}

export interface RuntimeErrorDiagnosisV1 extends RuntimeErrorDiagnosisInput {
  readonly retryAt?: string;
  readonly safeForUserDisplay: true;
}

export interface RuntimeErrorReportInput {
  readonly code: string;
  readonly userMessage: string;
  readonly severity?: RuntimeErrorSeverity;
  readonly operation?: string;
  readonly retryable?: boolean;
  readonly correlationId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
  readonly diagnosis?: RuntimeErrorDiagnosisInput;
  readonly maxDetailEntries?: number;
  readonly maxValueChars?: number;
}

export interface RuntimeErrorDetail {
  readonly key: string;
  readonly value: string;
}

export interface RuntimeErrorReportV1 {
  readonly schemaVersion: 1;
  readonly code: string;
  readonly userMessage: string;
  readonly severity: RuntimeErrorSeverity;
  readonly operation?: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly fingerprint: string;
  readonly details: readonly RuntimeErrorDetail[];
  readonly diagnosis?: RuntimeErrorDiagnosisV1;
  readonly authority: 'NONE';
}

export function createRuntimeErrorReport(input: RuntimeErrorReportInput): RuntimeErrorReportV1 {
  const code = normalizeCode(input.code);
  const userMessage = normalizeUserMessage(input.userMessage);
  const severity = input.severity ?? 'ERROR';
  const retryable = input.retryable ?? false;
  const correlationId = normalizeCorrelationId(input.correlationId ?? randomUUID());
  const maxDetailEntries = normalizePositiveInteger(
    input.maxDetailEntries ?? DEFAULT_MAX_DETAIL_ENTRIES,
    'maxDetailEntries',
  );
  const maxValueChars = normalizePositiveInteger(
    input.maxValueChars ?? DEFAULT_MAX_VALUE_CHARS,
    'maxValueChars',
  );

  const details = sanitizeDetails(input.details ?? {}, maxDetailEntries, maxValueChars);
  const diagnosis =
    input.diagnosis === undefined ? undefined : normalizeDiagnosis(input.diagnosis, maxValueChars);

  if (input.cause !== undefined) {
    const causeSummary = summarizeCause(input.cause, maxValueChars);
    if (causeSummary !== undefined && details.length < maxDetailEntries) {
      details.push({ key: 'cause', value: causeSummary });
    }
  }

  const fingerprint = sha256(
    canonicalJson({
      code,
      severity,
      operation: input.operation ?? null,
      retryable,
      details,
      diagnosis: diagnosis ?? null,
    }),
  );

  return {
    schemaVersion: 1,
    code,
    userMessage,
    severity,
    ...(input.operation ? { operation: normalizeOperation(input.operation) } : {}),
    retryable,
    correlationId,
    fingerprint,
    details,
    ...(diagnosis === undefined ? {} : { diagnosis }),
    authority: 'NONE',
  };
}

export function formatRuntimeErrorForUser(report: RuntimeErrorReportV1): string {
  if (report.diagnosis !== undefined) {
    const diagnosis = report.diagnosis;
    const lines = [
      `[${report.code}] ${diagnosis.headline}`,
      `Cause: ${diagnosis.rootCause}`,
      `Source: ${diagnosis.sourceComponent}/${diagnosis.sourceOperation}`,
      `Failed step: ${diagnosis.failedStep}`,
      `Signal: ${diagnosis.observedSignal}`,
      `Next: ${diagnosis.nextAction}`,
    ];
    if (diagnosis.retryAt !== undefined) {
      lines.push(`Retry at: ${diagnosis.retryAt}`);
    }
    lines.push(`Correlation ID: ${report.correlationId}`);
    return lines.join('\n');
  }

  const lines = [
    `[${report.code}] ${report.userMessage}`,
    `Correlation ID: ${report.correlationId}`,
  ];

  if (report.operation) {
    lines.push(`Operation: ${report.operation}`);
  }
  lines.push(`Retryable: ${report.retryable ? 'yes' : 'no'}`);

  if (report.details.length > 0) {
    lines.push('Details:');
    for (const detail of report.details) {
      lines.push(`- ${detail.key}: ${detail.value}`);
    }
  }

  return lines.join('\n');
}

export function runtimeErrorReportCanGrantAuthority(): false {
  return false;
}

export function runtimeErrorReportCanExposeSecrets(): false {
  return false;
}

const CAUSE_KINDS = new Set<RuntimeErrorCauseKind>([
  'VALIDATION',
  'CONFIGURATION',
  'POLICY',
  'AUTHENTICATION',
  'SECRET_BINDING',
  'QUOTA_EXHAUSTED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'TRANSPORT',
  'TIMEOUT',
  'DEPENDENCY_UNAVAILABLE',
  'WORKSPACE_STATE',
  'REVISION_CONFLICT',
  'COMMAND_EXIT',
  'MALFORMED_OUTPUT',
  'INTERNAL_INVARIANT',
  'UNKNOWN',
]);
const CAUSE_CERTAINTIES = new Set<RuntimeErrorCauseCertainty>([
  'CONFIRMED_SIGNAL',
  'DETERMINISTIC_RULE',
  'UNRESOLVED',
]);
const REDACTION_STATUSES = new Set<RuntimeErrorDiagnosisInput['redactionStatus']>([
  'APPLIED',
  'NOT_REQUIRED',
]);
const OBVIOUS_SECRET_VALUE_PATTERN =
  /(?:bearer\s+[A-Za-z0-9._~+/=-]{6,}|(?:api[_-]?key|password|passwd|secret|token)\s*[:=]\s*\S+)/i;

function normalizeDiagnosis(
  input: RuntimeErrorDiagnosisInput,
  maxValueChars: number,
): RuntimeErrorDiagnosisV1 {
  if (!CAUSE_KINDS.has(input.causeKind)) {
    throw new Error('diagnosis causeKind is invalid');
  }
  if (!CAUSE_CERTAINTIES.has(input.certainty)) {
    throw new Error('diagnosis certainty is invalid');
  }
  if (input.causeKind === 'UNKNOWN' && input.certainty !== 'UNRESOLVED') {
    throw new Error('UNKNOWN diagnosis cause must remain UNRESOLVED');
  }
  if (input.certainty === 'UNRESOLVED' && input.causeKind !== 'UNKNOWN') {
    throw new Error('UNRESOLVED diagnosis must use UNKNOWN cause');
  }

  const diagnosis: RuntimeErrorDiagnosisV1 = {
    causeCode: normalizeCode(input.causeCode),
    causeKind: input.causeKind,
    certainty: input.certainty,
    headline: normalizeDiagnosisText(input.headline, 'headline', 120),
    sourceComponent: normalizeOperation(input.sourceComponent),
    sourceOperation: normalizeOperation(input.sourceOperation),
    failedStep: normalizeDiagnosisText(input.failedStep, 'failedStep', 160),
    rootCause: normalizeDiagnosisText(
      input.rootCause,
      'rootCause',
      Math.min(maxValueChars, 360),
    ),
    observedSignal: normalizeDiagnosisText(
      input.observedSignal,
      'observedSignal',
      Math.min(maxValueChars, 500),
    ),
    nextAction: normalizeDiagnosisText(
      input.nextAction,
      'nextAction',
      Math.min(maxValueChars, 500),
    ),
    ...(input.retryAt === undefined ? {} : { retryAt: normalizeTimestamp(input.retryAt) }),
    redactionStatus: input.redactionStatus,
    safeForUserDisplay: true,
  };

  if (!REDACTION_STATUSES.has(diagnosis.redactionStatus)) {
    throw new Error('diagnosis redactionStatus is invalid');
  }

  return diagnosis;
}

function normalizeDiagnosisText(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (normalized.length < 4 || normalized.length > maxLength) {
    throw new Error(`diagnosis ${field} length is invalid`);
  }
  if (OBVIOUS_SECRET_VALUE_PATTERN.test(normalized)) {
    throw new Error(`diagnosis ${field} contains secret-like material`);
  }
  return normalized;
}

function normalizeTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error('diagnosis retryAt must be an ISO timestamp');
  }
  return new Date(parsed).toISOString();
}

function sanitizeDetails(
  input: Readonly<Record<string, unknown>>,
  maxEntries: number,
  maxValueChars: number,
): RuntimeErrorDetail[] {
  const result: RuntimeErrorDetail[] = [];
  for (const key of Object.keys(input).sort()) {
    if (result.length >= maxEntries) break;
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;

    if (SECRET_KEY_PATTERN.test(normalizedKey)) {
      result.push({ key: normalizedKey, value: '[REDACTED]' });
      continue;
    }

    result.push({
      key: normalizedKey,
      value: normalizeDetailValue(input[key], maxValueChars),
    });
  }
  return result;
}

function normalizeDetailValue(value: unknown, maxValueChars: number): string {
  let rendered: string;
  if (typeof value === 'string') {
    rendered = value;
  } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    rendered = String(value);
  } else if (value === null || value === undefined) {
    rendered = String(value);
  } else if (value instanceof Error) {
    rendered = value.name;
  } else {
    rendered = '[structured-value-omitted]';
  }

  const normalized = rendered.replace(/[\r\n\t]+/g, ' ').trim();
  return normalized.length <= maxValueChars ? normalized : normalized.slice(0, maxValueChars) + '…';
}

function summarizeCause(cause: unknown, maxValueChars: number): string | undefined {
  if (cause instanceof Error) {
    return normalizeDetailValue(cause.name, maxValueChars);
  }
  if (typeof cause === 'string') {
    return '[cause-string-omitted]';
  }
  if (cause === null || cause === undefined) {
    return undefined;
  }
  return '[cause-omitted]';
}

function normalizeCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(normalized)) {
    throw new Error('error code must match ^[A-Z][A-Z0-9_]{2,63}$');
  }
  return normalized;
}

function normalizeUserMessage(value: string): string {
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (normalized.length < 4 || normalized.length > 500) {
    throw new Error('userMessage length must be between 4 and 500 characters');
  }
  return normalized;
}

function normalizeOperation(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:/-]{1,128}$/.test(normalized)) {
    throw new Error('operation contains unsupported characters');
  }
  return normalized;
}

function normalizeCorrelationId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(normalized)) {
    throw new Error('correlationId contains unsupported characters');
  }
  return normalized;
}

function normalizePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map((entry) => canonicalJson(entry)).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => JSON.stringify(key) + ':' + canonicalJson(entry));
    return '{' + entries.join(',') + '}';
  }
  return JSON.stringify(value);
}
