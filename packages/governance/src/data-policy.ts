import YAML from 'yaml';

import type { DataClassification } from './policy-engine.js';
export type RetentionClass = 'EPHEMERAL' | 'SHORT' | 'PROJECT' | 'AUDIT';
export type RemoteAllowance = true | false | 'policy' | 'approved_bindings_only';

export interface DataPolicy {
  readonly schema_version: 1;
  readonly classification: {
    readonly levels: readonly DataClassification[];
  };
  readonly provider_egress: Readonly<
    Record<DataClassification, { readonly remote_allowed: RemoteAllowance }>
  >;
  readonly persistence: {
    readonly redact_before_store: true;
    readonly raw_prompt_response_default: false;
    readonly debug_raw_capture: {
      readonly allowed: 'opt_in';
      readonly retention_class: 'SHORT';
    };
  };
  readonly retention_classes: Readonly<Record<RetentionClass, { readonly purpose: string }>>;
  readonly redaction: {
    readonly categories: readonly string[];
  };
  readonly rules: {
    readonly secret_in_project_state: 'deny';
    readonly secret_in_prompt_artifact: 'deny';
    readonly secret_in_source_control: 'deny';
    readonly confidential_remote_egress_requires_policy: true;
  };
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface ProviderEgressRequest {
  readonly classification: DataClassification;
  readonly remote: boolean;
  readonly policyApproved?: boolean;
  readonly providerBindingApproved?: boolean;
}

export interface ProviderEgressDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly authority: 'NONE';
}

export interface RawCaptureRequest {
  readonly classification: DataClassification;
  readonly explicitOptIn: boolean;
}

export interface RawCaptureDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly retentionClass: 'SHORT' | null;
  readonly authority: 'NONE';
}

const CLASSIFICATIONS: readonly DataClassification[] = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'SECRET',
];

const RETENTION_CLASSES: readonly RetentionClass[] = ['EPHEMERAL', 'SHORT', 'PROJECT', 'AUDIT'];

const REQUIRED_REDACTION_CATEGORIES = [
  'api_keys',
  'bearer_tokens',
  'passwords',
  'private_keys',
  'connection_strings',
  'secret_environment_variables',
] as const;

const SECRET_FIELD_PATTERN =
  /(?:^|[_-])(api[_-]?key|access[_-]?token|refresh[_-]?token|bearer|password|passwd|pwd|private[_-]?key|client[_-]?secret|connection[_-]?string|secret)(?:$|[_-])/i;

const PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g;

const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

const INLINE_SECRET_PATTERN =
  /\b(password|passwd|pwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|connection[_-]?string)\s*[:=]\s*([^\s,;]+)/gi;

export function parseDataPolicyYaml(source: string): DataPolicy {
  const parsed: unknown = YAML.parse(source);
  const validation = validateDataPolicy(parsed);
  if (!validation.valid) {
    throw new Error(`invalid data policy: ${validation.errors.join('; ')}`);
  }
  return parsed as DataPolicy;
}

export function validateDataPolicy(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['data policy must be an object'] };

  if (value.schema_version !== 1) errors.push('data policy schema_version must be 1');

  const classification = recordValue(value, 'classification');
  const levels = arrayValue(classification, 'levels');
  assertExactStringSet(levels, CLASSIFICATIONS, 'classification levels', errors);

  const providerEgress = recordValue(value, 'provider_egress');
  expectRemoteAllowance(providerEgress, 'PUBLIC', true, errors);
  expectRemoteAllowance(providerEgress, 'INTERNAL', 'policy', errors);
  expectRemoteAllowance(providerEgress, 'CONFIDENTIAL', 'approved_bindings_only', errors);
  expectRemoteAllowance(providerEgress, 'SECRET', false, errors);

  const persistence = recordValue(value, 'persistence');
  if (persistence?.redact_before_store !== true) {
    errors.push('persistence redaction before store must remain enabled');
  }
  if (persistence?.raw_prompt_response_default !== false) {
    errors.push('raw prompt/response persistence must default to disabled');
  }
  const debugCapture = recordValue(persistence, 'debug_raw_capture');
  if (debugCapture?.allowed !== 'opt_in') {
    errors.push('debug raw capture must require opt-in');
  }
  if (debugCapture?.retention_class !== 'SHORT') {
    errors.push('debug raw capture retention must remain SHORT');
  }

  const retention = recordValue(value, 'retention_classes');
  assertExactStringSet(
    retention ? Object.keys(retention) : [],
    RETENTION_CLASSES,
    'retention classes',
    errors,
  );

  const redaction = recordValue(value, 'redaction');
  const categories = arrayValue(redaction, 'categories');
  for (const category of REQUIRED_REDACTION_CATEGORIES) {
    if (!categories.includes(category))
      errors.push(`missing required redaction category: ${category}`);
  }

  const rules = recordValue(value, 'rules');
  if (rules?.secret_in_project_state !== 'deny') {
    errors.push('SECRET project-state persistence must remain denied');
  }
  if (rules?.secret_in_prompt_artifact !== 'deny') {
    errors.push('SECRET prompt/artifact persistence must remain denied');
  }
  if (rules?.secret_in_source_control !== 'deny') {
    errors.push('SECRET source-control persistence must remain denied');
  }
  if (rules?.confidential_remote_egress_requires_policy !== true) {
    errors.push('CONFIDENTIAL remote egress must require policy approval');
  }

  return { valid: errors.length === 0, errors };
}

export function evaluateProviderEgress(
  policy: DataPolicy,
  request: ProviderEgressRequest,
): ProviderEgressDecision {
  assertValidPolicy(policy);

  if (!request.remote) {
    return {
      allowed: true,
      reason: 'local processing does not cross the remote-provider egress boundary',
      authority: 'NONE',
    };
  }

  switch (request.classification) {
    case 'PUBLIC':
      return {
        allowed: true,
        reason: 'PUBLIC data permits remote provider egress',
        authority: 'NONE',
      };

    case 'INTERNAL':
      return request.policyApproved === true
        ? {
            allowed: true,
            reason: 'INTERNAL remote egress explicitly approved by policy',
            authority: 'NONE',
          }
        : {
            allowed: false,
            reason: 'INTERNAL remote egress requires explicit policy approval',
            authority: 'NONE',
          };

    case 'CONFIDENTIAL':
      return request.policyApproved === true && request.providerBindingApproved === true
        ? {
            allowed: true,
            reason: 'CONFIDENTIAL remote egress approved by policy and provider binding',
            authority: 'NONE',
          }
        : {
            allowed: false,
            reason: 'CONFIDENTIAL remote egress requires policy and approved provider binding',
            authority: 'NONE',
          };

    case 'SECRET':
      return {
        allowed: false,
        reason: 'SECRET data must never be sent to remote model providers',
        authority: 'NONE',
      };
  }
}

export function evaluateRawCapture(
  policy: DataPolicy,
  request: RawCaptureRequest,
): RawCaptureDecision {
  assertValidPolicy(policy);

  if (request.classification === 'SECRET') {
    return {
      allowed: false,
      reason: 'SECRET data cannot be persisted as raw prompt/response capture',
      retentionClass: null,
      authority: 'NONE',
    };
  }

  if (!request.explicitOptIn) {
    return {
      allowed: false,
      reason: 'raw prompt/response capture is disabled by default and requires explicit opt-in',
      retentionClass: null,
      authority: 'NONE',
    };
  }

  return {
    allowed: true,
    reason: 'debug raw capture explicitly opted in with bounded SHORT retention',
    retentionClass: 'SHORT',
    authority: 'NONE',
  };
}

export function sanitizeForPersistence(policy: DataPolicy, value: unknown): unknown {
  assertValidPolicy(policy);
  return redactSensitive(value);
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = isSecretFieldName(key) ? '[REDACTED]' : redactSensitive(nestedValue);
    }
    return output;
  }

  if (typeof value === 'string') return redactString(value);
  return value;
}

export function dataPolicyCanGrantAuthority(): false {
  return false;
}

export function dataPolicyCanAllowSecretRemoteEgress(): false {
  return false;
}

function redactString(value: string): string {
  return value
    .replace(PRIVATE_KEY_PATTERN, '[REDACTED PRIVATE KEY]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(INLINE_SECRET_PATTERN, (_match, key: string) => `${key}=[REDACTED]`);
}

function isSecretFieldName(key: string): boolean {
  const normalized = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  if (SECRET_FIELD_PATTERN.test(normalized)) return true;
  return (
    normalized === 'authorization' ||
    normalized === 'cookie' ||
    normalized === 'set_cookie' ||
    normalized === 'secret'
  );
}

function assertValidPolicy(policy: DataPolicy): void {
  const validation = validateDataPolicy(policy);
  if (!validation.valid) {
    throw new Error(`invalid data policy: ${validation.errors.join('; ')}`);
  }
}

function expectRemoteAllowance(
  providerEgress: Record<string, unknown> | null,
  classification: DataClassification,
  expected: RemoteAllowance,
  errors: string[],
): void {
  const rule = recordValue(providerEgress, classification);
  if (rule?.remote_allowed !== expected) {
    errors.push(`${classification} remote egress rule must remain ${String(expected)}`);
  }
}

function assertExactStringSet(
  actual: readonly unknown[],
  expected: readonly string[],
  label: string,
  errors: string[],
): void {
  const values = actual.filter((item): item is string => typeof item === 'string');
  const sortedActual = [...values].sort();
  const sortedExpected = [...expected].sort();
  if (
    sortedActual.length !== actual.length ||
    sortedActual.length !== sortedExpected.length ||
    sortedActual.some((value, index) => value !== sortedExpected[index])
  ) {
    errors.push(`${label} do not match accepted policy`);
  }
}

function recordValue(
  record: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (!record) return null;
  const value = record[key];
  return isRecord(value) ? value : null;
}

function arrayValue(record: Record<string, unknown> | null, key: string): readonly unknown[] {
  if (!record) return [];
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
