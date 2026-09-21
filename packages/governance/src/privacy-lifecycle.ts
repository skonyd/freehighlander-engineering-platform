import { createHash } from 'node:crypto';

import type { RetentionClass } from './data-policy.js';
import {
  buildRetentionPlan,
  validateRetentionRecords,
  type RetentionRecord,
} from './retention-policy.js';

export type PrivacyManifestKind = 'EXPORT' | 'DELETE';
export type PrivacyManifestDisposition =
  | 'EXPORT_CANDIDATE'
  | 'DELETE_CANDIDATE'
  | 'RETAIN'
  | 'PROTECTED_AUDIT';

export interface PrivacyLifecycleRecord extends RetentionRecord {
  readonly ownerKey?: string;
}

export interface PrivacyLifecycleRequest {
  readonly id: string;
  readonly kind: PrivacyManifestKind;
  readonly ownerKey: string;
  readonly requestedAt: string;
}

export interface PrivacyManifestEntry {
  readonly recordId: string;
  readonly retentionClass: RetentionClass;
  readonly disposition: PrivacyManifestDisposition;
  readonly reason: string;
  readonly executionAuthorized: false;
}

export interface PrivacyLifecycleManifest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly kind: PrivacyManifestKind;
  readonly requestedAt: string;
  readonly ownerScopeHash: string;
  readonly entries: readonly PrivacyManifestEntry[];
  readonly exportExecutionAuthorized: false;
  readonly deletionAuthorized: false;
  readonly auditDeletionAuthorized: false;
  readonly authority: 'NONE';
}

export interface PrivacyValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export function validatePrivacyLifecycleRecords(
  records: readonly PrivacyLifecycleRecord[],
): PrivacyValidationResult {
  const retentionValidation = validateRetentionRecords(records);
  const errors = [...retentionValidation.errors];

  for (const record of records) {
    if (record.ownerExists) {
      if (!record.ownerKey?.trim()) {
        errors.push(`privacy record ${record.id} requires ownerKey when ownerExists=true`);
      }
    } else if (record.ownerKey !== undefined) {
      errors.push(`privacy record ${record.id} must not retain ownerKey when ownerExists=false`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validatePrivacyLifecycleRequest(
  request: PrivacyLifecycleRequest,
): PrivacyValidationResult {
  const errors: string[] = [];

  if (!REQUEST_ID_PATTERN.test(request.id)) {
    errors.push('privacy request id must be bounded and identifier-safe');
  }
  if (request.kind !== 'EXPORT' && request.kind !== 'DELETE') {
    errors.push('privacy request kind is unsupported');
  }
  if (!request.ownerKey.trim()) {
    errors.push('privacy request ownerKey is required');
  }
  if (!isTimestamp(request.requestedAt)) {
    errors.push('privacy request requestedAt must be an ISO timestamp');
  }

  return { valid: errors.length === 0, errors };
}

export function buildPrivacyLifecycleManifest(
  records: readonly PrivacyLifecycleRecord[],
  request: PrivacyLifecycleRequest,
): PrivacyLifecycleManifest {
  const requestValidation = validatePrivacyLifecycleRequest(request);
  if (!requestValidation.valid) {
    throw new Error(`invalid privacy request: ${requestValidation.errors.join('; ')}`);
  }

  const recordValidation = validatePrivacyLifecycleRecords(records);
  if (!recordValidation.valid) {
    throw new Error(`invalid privacy records: ${recordValidation.errors.join('; ')}`);
  }

  const matching = records
    .filter((record) => record.ownerExists && record.ownerKey === request.ownerKey)
    .sort((left, right) => left.id.localeCompare(right.id));

  const entries =
    request.kind === 'EXPORT'
      ? matching.map(exportEntry)
      : buildDeleteEntries(matching, request.requestedAt);

  return {
    schemaVersion: 1,
    requestId: request.id,
    kind: request.kind,
    requestedAt: request.requestedAt,
    ownerScopeHash: hashOwnerScope(request.ownerKey),
    entries,
    exportExecutionAuthorized: false,
    deletionAuthorized: false,
    auditDeletionAuthorized: false,
    authority: 'NONE',
  };
}

export function privacyManifestCanExportData(): false {
  return false;
}

export function privacyManifestCanDeleteData(): false {
  return false;
}

export function privacyManifestCanDeleteAuditData(): false {
  return false;
}

function exportEntry(record: PrivacyLifecycleRecord): PrivacyManifestEntry {
  return {
    recordId: record.id,
    retentionClass: record.retentionClass,
    disposition: 'EXPORT_CANDIDATE',
    reason: 'owner-bound record reference; export execution requires separate authority',
    executionAuthorized: false,
  };
}

function buildDeleteEntries(
  records: readonly PrivacyLifecycleRecord[],
  evaluatedAt: string,
): PrivacyManifestEntry[] {
  const retentionPlan = buildRetentionPlan(records, evaluatedAt);
  const decisions = new Map(retentionPlan.decisions.map((decision) => [decision.id, decision]));

  return records.map((record) => {
    const decision = decisions.get(record.id);
    if (!decision) throw new Error(`missing retention decision for privacy record: ${record.id}`);

    if (record.retentionClass === 'AUDIT' || record.auditReferenced) {
      return {
        recordId: record.id,
        retentionClass: record.retentionClass,
        disposition: 'PROTECTED_AUDIT',
        reason: 'AUDIT retention/reference cannot be deleted by privacy manifest planning',
        executionAuthorized: false,
      };
    }

    if (decision.action === 'PURGE_CANDIDATE') {
      return {
        recordId: record.id,
        retentionClass: record.retentionClass,
        disposition: 'DELETE_CANDIDATE',
        reason: 'canonical retention plan marks record as purge candidate; deletion remains unauthorized',
        executionAuthorized: false,
      };
    }

    return {
      recordId: record.id,
      retentionClass: record.retentionClass,
      disposition: 'RETAIN',
      reason: decision.reason,
      executionAuthorized: false,
    };
  });
}

function hashOwnerScope(ownerKey: string): string {
  return createHash('sha256').update(ownerKey, 'utf8').digest('hex');
}

function isTimestamp(value: string): boolean {
  return !!value.trim() && !Number.isNaN(Date.parse(value));
}
