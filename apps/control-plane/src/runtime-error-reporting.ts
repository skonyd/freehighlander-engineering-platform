import { createHash, randomUUID } from 'node:crypto';

const SECRET_KEY_PATTERN =
  /(?:secret|token|password|passwd|authorization|api[_-]?key|private[_-]?key|cookie)/i;
const DEFAULT_MAX_DETAIL_ENTRIES = 16;
const DEFAULT_MAX_VALUE_CHARS = 512;

export type RuntimeErrorSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface RuntimeErrorReportInput {
  readonly code: string;
  readonly userMessage: string;
  readonly severity?: RuntimeErrorSeverity;
  readonly operation?: string;
  readonly retryable?: boolean;
  readonly correlationId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
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
    authority: 'NONE',
  };
}

export function formatRuntimeErrorForUser(report: RuntimeErrorReportV1): string {
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
