export type PlanningStatus = 'DRAFT' | 'READY' | 'BLOCKED' | 'SUPERSEDED';

export interface AcceptanceCriterion {
  readonly id: string;
  readonly text: string;
}

export interface PlanningWorkItem {
  readonly id: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export interface PlanningBlocker {
  readonly id: string;
  readonly reason: string;
}

export interface PlanSupersession {
  readonly planId: string;
  readonly revision: number;
}

export interface EngineeringPlan {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly title: string;
  readonly repository: string;
  readonly baseRevision: string;
  readonly status: PlanningStatus;
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly workItems: readonly PlanningWorkItem[];
  readonly blockers: readonly PlanningBlocker[];
  readonly supersedes?: PlanSupersession;
}

export interface PlanValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface PlanningProjection {
  readonly planId: string;
  readonly revision: number;
  readonly status: PlanningStatus;
  readonly repository: string;
  readonly baseRevision: string;
  readonly acceptanceCriteria: number;
  readonly workItems: number;
  readonly blockers: number;
  readonly readiness: 'READY' | 'NOT_READY';
  readonly authority: 'NONE';
  readonly executionAuthorized: false;
}

export interface PlanningSnapshot extends PlanningProjection {
  readonly schemaVersion: 1;
  readonly planHash: string;
}

export function validateEngineeringPlan(plan: EngineeringPlan): PlanValidationResult {
  const errors: string[] = [];

  if (plan.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  requireText(plan.id, 'id', errors);
  requireText(plan.title, 'title', errors);
  requireText(plan.repository, 'repository', errors);
  requireText(plan.baseRevision, 'baseRevision', errors);

  if (!Number.isInteger(plan.revision) || plan.revision < 1) {
    errors.push('revision must be a positive integer');
  }

  const criterionIds = uniqueIds(
    plan.acceptanceCriteria.map((criterion) => criterion.id),
    'acceptance criterion',
    errors,
  );
  for (const criterion of plan.acceptanceCriteria) {
    requireText(criterion.id, 'acceptance criterion id', errors);
    requireText(criterion.text, `acceptance criterion ${criterion.id || '<missing>'} text`, errors);
  }

  const workItemIds = uniqueIds(
    plan.workItems.map((item) => item.id),
    'work item',
    errors,
  );
  for (const item of plan.workItems) {
    requireText(item.id, 'work item id', errors);
    requireText(item.title, `work item ${item.id || '<missing>'} title`, errors);

    for (const dependency of item.dependsOn) {
      if (!workItemIds.has(dependency)) {
        errors.push(`work item ${item.id} has unknown dependency ${dependency}`);
      }
      if (dependency === item.id) {
        errors.push(`work item ${item.id} cannot depend on itself`);
      }
    }

    for (const criterionId of item.acceptanceCriteria) {
      if (!criterionIds.has(criterionId)) {
        errors.push(`work item ${item.id} references unknown acceptance criterion ${criterionId}`);
      }
    }
  }

  detectDependencyCycle(plan.workItems, workItemIds, errors);

  uniqueIds(
    plan.blockers.map((blocker) => blocker.id),
    'blocker',
    errors,
  );
  for (const blocker of plan.blockers) {
    requireText(blocker.id, 'blocker id', errors);
    requireText(blocker.reason, `blocker ${blocker.id || '<missing>'} reason`, errors);
  }

  if (plan.status === 'BLOCKED' && plan.blockers.length === 0) {
    errors.push('BLOCKED plan requires at least one blocker');
  }
  if (plan.status === 'READY' && plan.blockers.length > 0) {
    errors.push('READY plan cannot retain blockers');
  }
  if (plan.status === 'READY' && plan.acceptanceCriteria.length === 0) {
    errors.push('READY plan requires acceptance criteria');
  }
  if (plan.status === 'READY' && plan.workItems.length === 0) {
    errors.push('READY plan requires work items');
  }
  if (plan.status === 'SUPERSEDED' && plan.supersedes === undefined) {
    errors.push('SUPERSEDED plan requires supersedes metadata');
  }

  if (plan.supersedes) {
    requireText(plan.supersedes.planId, 'supersedes.planId', errors);
    if (!Number.isInteger(plan.supersedes.revision) || plan.supersedes.revision < 1) {
      errors.push('supersedes.revision must be a positive integer');
    }
    if (plan.supersedes.planId === plan.id && plan.supersedes.revision >= plan.revision) {
      errors.push('superseded revision must precede the current revision');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function planningProjection(plan: EngineeringPlan): PlanningProjection {
  const validation = validateEngineeringPlan(plan);
  if (!validation.valid) {
    throw new Error(`invalid engineering plan: ${validation.errors.join('; ')}`);
  }

  return {
    planId: plan.id,
    revision: plan.revision,
    status: plan.status,
    repository: plan.repository,
    baseRevision: plan.baseRevision,
    acceptanceCriteria: plan.acceptanceCriteria.length,
    workItems: plan.workItems.length,
    blockers: plan.blockers.length,
    readiness: plan.status === 'READY' ? 'READY' : 'NOT_READY',
    authority: 'NONE',
    executionAuthorized: false,
  };
}

export async function buildPlanningSnapshot(plan: EngineeringPlan): Promise<PlanningSnapshot> {
  const projection = planningProjection(plan);
  const planHash = await sha256Hex(canonicalJson(plan));
  return {
    schemaVersion: 1,
    planHash,
    ...projection,
  };
}

export function planningCanGrantAuthority(): false {
  return false;
}

export function planningCanAuthorizeExecution(): false {
  return false;
}

function uniqueIds(values: readonly string[], kind: string, errors: string[]): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.trim()) continue;
    if (seen.has(value)) errors.push(`duplicate ${kind} id: ${value}`);
    seen.add(value);
  }
  return seen;
}

function detectDependencyCycle(
  items: readonly PlanningWorkItem[],
  knownIds: ReadonlySet<string>,
  errors: string[],
): void {
  const byId = new Map(items.map((item) => [item.id, item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;

    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (knownIds.has(dependency) && visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const id of knownIds) {
    if (visit(id)) {
      errors.push('work item dependency graph must be acyclic');
      return;
    }
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
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
