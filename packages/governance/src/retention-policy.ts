import type { RetentionClass } from './data-policy.js';

export type RetentionAction = 'KEEP' | 'PURGE_CANDIDATE' | 'REVIEW_ORPHAN';

export interface RetentionRecord {
  readonly id: string;
  readonly retentionClass: RetentionClass;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly ownerExists: boolean;
  readonly auditReferenced: boolean;
  readonly projectLifecycle?: 'ACTIVE' | 'ENDED';
}

export interface RetentionDecision {
  readonly id: string;
  readonly retentionClass: RetentionClass;
  readonly action: RetentionAction;
  readonly reason: string;
  readonly deletionAuthorized: false;
}

export interface RetentionPlan {
  readonly schemaVersion: 1;
  readonly evaluatedAt: string;
  readonly decisions: readonly RetentionDecision[];
  readonly deletionAuthorized: false;
  readonly auditDeletionAuthorized: false;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const RETENTION_CLASSES = new Set<RetentionClass>(['EPHEMERAL', 'SHORT', 'PROJECT', 'AUDIT']);

export function validateRetentionRecords(records: readonly RetentionRecord[]): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const record of records) {
    if (!record.id.trim()) errors.push('retention record id is required');
    if (ids.has(record.id)) errors.push(`duplicate retention record id: ${record.id}`);
    ids.add(record.id);

    if (!RETENTION_CLASSES.has(record.retentionClass)) {
      errors.push(`unknown retention class: ${String(record.retentionClass)}`);
    }

    if (!isTimestamp(record.createdAt)) {
      errors.push(`retention record ${record.id} createdAt must be an ISO timestamp`);
    }

    if (record.expiresAt !== undefined) {
      if (!isTimestamp(record.expiresAt)) {
        errors.push(`retention record ${record.id} expiresAt must be an ISO timestamp`);
      } else if (isTimestamp(record.createdAt) && record.expiresAt < record.createdAt) {
        errors.push(`retention record ${record.id} expiresAt must not precede createdAt`);
      }
    }

    if (
      (record.retentionClass === 'EPHEMERAL' || record.retentionClass === 'SHORT') &&
      record.expiresAt === undefined
    ) {
      errors.push(`retention record ${record.id} requires explicit bounded expiresAt`);
    }

    if (record.retentionClass === 'PROJECT' && record.projectLifecycle === undefined) {
      errors.push(`PROJECT retention record ${record.id} requires projectLifecycle`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function buildRetentionPlan(
  records: readonly RetentionRecord[],
  evaluatedAt: string,
): RetentionPlan {
  if (!isTimestamp(evaluatedAt)) {
    throw new Error('retention evaluatedAt must be an ISO timestamp');
  }

  const validation = validateRetentionRecords(records);
  if (!validation.valid) {
    throw new Error(`invalid retention records: ${validation.errors.join('; ')}`);
  }

  const decisions = [...records]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((record) => decideRetention(record, evaluatedAt));

  return {
    schemaVersion: 1,
    evaluatedAt,
    decisions,
    deletionAuthorized: false,
    auditDeletionAuthorized: false,
  };
}

export function retentionPlanCanDeleteData(): false {
  return false;
}

export function retentionPlanCanDeleteAuditData(): false {
  return false;
}

function decideRetention(record: RetentionRecord, evaluatedAt: string): RetentionDecision {
  if (record.retentionClass === 'AUDIT') {
    return keep(record, 'AUDIT data is retained and never auto-purged');
  }

  if (record.auditReferenced) {
    return keep(record, 'record is protected by AUDIT lineage/reference');
  }

  if (!record.ownerExists) {
    return {
      id: record.id,
      retentionClass: record.retentionClass,
      action: 'REVIEW_ORPHAN',
      reason: 'owner is missing; orphan requires explicit review before any purge',
      deletionAuthorized: false,
    };
  }

  if (record.retentionClass === 'PROJECT' && record.projectLifecycle !== 'ENDED') {
    return keep(record, 'PROJECT data remains active until project lifecycle is ENDED');
  }

  if (record.expiresAt === undefined) {
    return keep(record, 'no explicit expiry is present; retention fails closed');
  }

  if (record.expiresAt > evaluatedAt) {
    return keep(record, 'retention deadline has not expired');
  }

  return {
    id: record.id,
    retentionClass: record.retentionClass,
    action: 'PURGE_CANDIDATE',
    reason: 'explicit retention deadline expired; deletion still requires separate authority',
    deletionAuthorized: false,
  };
}

function keep(record: RetentionRecord, reason: string): RetentionDecision {
  return {
    id: record.id,
    retentionClass: record.retentionClass,
    action: 'KEEP',
    reason,
    deletionAuthorized: false,
  };
}

function isTimestamp(value: string): boolean {
  return !!value.trim() && !Number.isNaN(Date.parse(value));
}
