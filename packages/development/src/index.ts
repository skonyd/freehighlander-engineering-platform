export type DevelopmentTaskStatus = 'PLANNED' | 'CANDIDATE' | 'BLOCKED' | 'SUPERSEDED';
export type ChangeKind = 'ADD' | 'MODIFY' | 'DELETE' | 'RENAME';
export type EvidenceKind = 'DIFF' | 'BUILD' | 'TEST' | 'REVIEW' | 'ANALYSIS';
export type EvidenceProvenance = 'TRUSTED' | 'UNTRUSTED';
export type ShadowIntentKind = 'EDIT' | 'BUILD' | 'TEST' | 'ANALYZE';

export interface DevelopmentScopePath {
  readonly path: string;
}

export interface DevelopmentTask {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly title: string;
  readonly repository: string;
  readonly baseRevision: string;
  readonly status: DevelopmentTaskStatus;
  readonly intent: string;
  readonly acceptanceCriteria: readonly string[];
  readonly scopePaths: readonly DevelopmentScopePath[];
  readonly blockers: readonly string[];
  readonly supersedes?: {
    readonly taskId: string;
    readonly revision: number;
  };
}

export interface AffectedPath {
  readonly path: string;
  readonly change: ChangeKind;
  readonly previousPath?: string;
}

export interface ImplementationEvidence {
  readonly id: string;
  readonly kind: EvidenceKind;
  readonly repository: string;
  readonly revision: string;
  readonly provenance: EvidenceProvenance;
  readonly digest: string;
}

export interface ShadowExecutionIntent {
  readonly id: string;
  readonly kind: ShadowIntentKind;
  readonly description: string;
  readonly affectedPaths: readonly string[];
  readonly sideEffects: 'FORBIDDEN';
  readonly authority: 'NONE';
}

export interface ChangeCandidate {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly taskId: string;
  readonly repository: string;
  readonly baseRevision: string;
  readonly headRevision: string;
  readonly intent: string;
  readonly affectedPaths: readonly AffectedPath[];
  readonly resultEvidence: readonly ImplementationEvidence[];
  readonly shadowPlan: readonly ShadowExecutionIntent[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface DevelopmentProjection {
  readonly candidateId: string;
  readonly taskId: string;
  readonly repository: string;
  readonly baseRevision: string;
  readonly headRevision: string;
  readonly affectedPaths: number;
  readonly evidenceItems: number;
  readonly shadowIntents: number;
  readonly reviewReadiness: 'READY_FOR_REVIEW' | 'NOT_READY';
  readonly authority: 'NONE';
  readonly executionAuthorized: false;
  readonly gitMutationAuthorized: false;
  readonly mergeAuthorized: false;
}

export interface DevelopmentSnapshot extends DevelopmentProjection {
  readonly schemaVersion: 1;
  readonly candidateHash: string;
}

export function validateDevelopmentTask(task: DevelopmentTask): ValidationResult {
  const errors: string[] = [];

  if (task.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  requireText(task.id, 'id', errors);
  requireText(task.title, 'title', errors);
  requireText(task.repository, 'repository', errors);
  requireText(task.baseRevision, 'baseRevision', errors);
  requireText(task.intent, 'intent', errors);

  if (!Number.isInteger(task.revision) || task.revision < 1) {
    errors.push('revision must be a positive integer');
  }

  uniqueNonEmpty(task.acceptanceCriteria, 'acceptance criterion', errors);
  const scope = uniqueNonEmpty(
    task.scopePaths.map((entry) => entry.path),
    'scope path',
    errors,
  );
  for (const path of scope) validateRepositoryPath(path, 'scope path', errors);

  uniqueNonEmpty(task.blockers, 'blocker', errors);

  if (task.status === 'CANDIDATE' && task.scopePaths.length === 0) {
    errors.push('CANDIDATE task requires at least one scope path');
  }
  if (task.status === 'CANDIDATE' && task.acceptanceCriteria.length === 0) {
    errors.push('CANDIDATE task requires acceptance criteria');
  }
  if (task.status === 'CANDIDATE' && task.blockers.length > 0) {
    errors.push('CANDIDATE task cannot retain blockers');
  }
  if (task.status === 'BLOCKED' && task.blockers.length === 0) {
    errors.push('BLOCKED task requires at least one blocker');
  }
  if (task.status === 'SUPERSEDED' && task.supersedes === undefined) {
    errors.push('SUPERSEDED task requires supersedes metadata');
  }

  if (task.supersedes) {
    requireText(task.supersedes.taskId, 'supersedes.taskId', errors);
    if (!Number.isInteger(task.supersedes.revision) || task.supersedes.revision < 1) {
      errors.push('supersedes.revision must be a positive integer');
    }
    if (task.supersedes.taskId === task.id && task.supersedes.revision >= task.revision) {
      errors.push('superseded revision must precede the current revision');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateChangeCandidate(candidate: ChangeCandidate): ValidationResult {
  const errors: string[] = [];

  if (candidate.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  requireText(candidate.id, 'id', errors);
  requireText(candidate.taskId, 'taskId', errors);
  requireText(candidate.repository, 'repository', errors);
  requireText(candidate.baseRevision, 'baseRevision', errors);
  requireText(candidate.headRevision, 'headRevision', errors);
  requireText(candidate.intent, 'intent', errors);

  if (candidate.baseRevision && candidate.baseRevision === candidate.headRevision) {
    errors.push('headRevision must differ from baseRevision');
  }

  const affected = uniqueNonEmpty(
    candidate.affectedPaths.map((entry) => entry.path),
    'affected path',
    errors,
  );
  if (candidate.affectedPaths.length === 0) {
    errors.push('change candidate requires at least one affected path');
  }
  for (const entry of candidate.affectedPaths) {
    validateRepositoryPath(entry.path, 'affected path', errors);
    if (entry.change === 'RENAME') {
      if (!entry.previousPath) {
        errors.push(`rename target ${entry.path} requires previousPath`);
      } else {
        validateRepositoryPath(entry.previousPath, 'previous path', errors);
        if (entry.previousPath === entry.path) {
          errors.push(`rename target ${entry.path} must differ from previousPath`);
        }
      }
    } else if (entry.previousPath !== undefined) {
      errors.push(`${entry.change} path ${entry.path} must not set previousPath`);
    }
  }

  uniqueNonEmpty(
    candidate.resultEvidence.map((entry) => entry.id),
    'evidence id',
    errors,
  );
  for (const evidence of candidate.resultEvidence) {
    requireText(evidence.id, 'evidence id', errors);
    requireText(evidence.repository, `evidence ${evidence.id || '<missing>'} repository`, errors);
    requireText(evidence.revision, `evidence ${evidence.id || '<missing>'} revision`, errors);
    if (evidence.repository !== candidate.repository) {
      errors.push(`evidence ${evidence.id} repository must match candidate repository`);
    }
    if (evidence.revision !== candidate.headRevision) {
      errors.push(`evidence ${evidence.id} revision must match candidate headRevision`);
    }
    if (!/^[a-f0-9]{64}$/.test(evidence.digest)) {
      errors.push(`evidence ${evidence.id} digest must be lowercase sha256`);
    }
  }

  uniqueNonEmpty(
    candidate.shadowPlan.map((entry) => entry.id),
    'shadow intent id',
    errors,
  );
  for (const intent of candidate.shadowPlan) {
    requireText(intent.id, 'shadow intent id', errors);
    requireText(intent.description, `shadow intent ${intent.id || '<missing>'} description`, errors);
    if (intent.sideEffects !== 'FORBIDDEN') {
      errors.push(`shadow intent ${intent.id} sideEffects must be FORBIDDEN`);
    }
    if (intent.authority !== 'NONE') {
      errors.push(`shadow intent ${intent.id} authority must be NONE`);
    }
    for (const path of intent.affectedPaths) {
      if (!affected.has(path)) {
        errors.push(`shadow intent ${intent.id} references unknown affected path ${path}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateTaskCandidateBinding(
  task: DevelopmentTask,
  candidate: ChangeCandidate,
): ValidationResult {
  const taskResult = validateDevelopmentTask(task);
  const candidateResult = validateChangeCandidate(candidate);
  const errors = [...taskResult.errors, ...candidateResult.errors];

  if (candidate.taskId !== task.id) errors.push('candidate taskId must match task id');
  if (candidate.repository !== task.repository) {
    errors.push('candidate repository must match task repository');
  }
  if (candidate.baseRevision !== task.baseRevision) {
    errors.push('candidate baseRevision must match task baseRevision');
  }

  const allowed = new Set(task.scopePaths.map((entry) => entry.path));
  for (const entry of candidate.affectedPaths) {
    if (!allowed.has(entry.path)) {
      errors.push(`candidate affected path ${entry.path} is outside task scope`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function developmentProjection(candidate: ChangeCandidate): DevelopmentProjection {
  const validation = validateChangeCandidate(candidate);
  if (!validation.valid) {
    throw new Error(`invalid change candidate: ${validation.errors.join('; ')}`);
  }

  return {
    candidateId: candidate.id,
    taskId: candidate.taskId,
    repository: candidate.repository,
    baseRevision: candidate.baseRevision,
    headRevision: candidate.headRevision,
    affectedPaths: candidate.affectedPaths.length,
    evidenceItems: candidate.resultEvidence.length,
    shadowIntents: candidate.shadowPlan.length,
    reviewReadiness: candidate.resultEvidence.length > 0 ? 'READY_FOR_REVIEW' : 'NOT_READY',
    authority: 'NONE',
    executionAuthorized: false,
    gitMutationAuthorized: false,
    mergeAuthorized: false,
  };
}

export async function buildDevelopmentSnapshot(
  candidate: ChangeCandidate,
): Promise<DevelopmentSnapshot> {
  const projection = developmentProjection(candidate);
  const candidateHash = await sha256Hex(canonicalJson(candidate));
  return {
    schemaVersion: 1,
    candidateHash,
    ...projection,
  };
}

export function developmentCanGrantAuthority(): false {
  return false;
}

export function developmentCanExecuteCommands(): false {
  return false;
}

export function developmentCanMutateGit(): false {
  return false;
}

export function developmentCanMergePullRequests(): false {
  return false;
}

function uniqueNonEmpty(values: readonly string[], kind: string, errors: string[]): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.trim()) {
      errors.push(`${kind} must not be empty`);
      continue;
    }
    if (seen.has(value)) errors.push(`duplicate ${kind}: ${value}`);
    seen.add(value);
  }
  return seen;
}

function validateRepositoryPath(value: string, kind: string, errors: string[]): void {
  if (!value.trim()) {
    errors.push(`${kind} is required`);
    return;
  }
  if (value.startsWith('/') || value.startsWith('\\')) {
    errors.push(`${kind} must be repository-relative: ${value}`);
  }
  const segments = value.replaceAll('\\', '/').split('/');
  if (segments.includes('..') || segments.includes('.')) {
    errors.push(`${kind} must not contain traversal segments: ${value}`);
  }
}

function requireText(value: string, name: string, errors: string[]): void {
  if (!value.trim()) errors.push(`${name} is required`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
