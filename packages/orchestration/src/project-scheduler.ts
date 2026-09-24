import { createHash } from 'node:crypto';

export type ProjectWorkItemState =
  | 'PENDING'
  | 'ACTIVE'
  | 'PARKED_HUMAN'
  | 'COMPLETE'
  | 'FAILED';

export type ProjectConflictClassification =
  | 'SAFE_TO_RUN_CONCURRENTLY'
  | 'SERIALIZE_WITH_ACTIVE_ITEM'
  | 'UNKNOWN';

export type WorkspaceIsolationState = 'ISOLATED' | 'SHARED' | 'UNKNOWN';

export type ProjectWorkItemDisposition =
  | 'READY'
  | 'ACTIVE'
  | 'PARKED_HUMAN'
  | 'COMPLETE'
  | 'FAILED'
  | 'WAITING_DEPENDENCY'
  | 'WAITING_CONFLICT'
  | 'WAITING_RESOURCE'
  | 'WAITING_BARRIER';

export interface ProjectWorkItem {
  readonly id: string;
  readonly state: ProjectWorkItemState;
  readonly dependencyIds: readonly string[];
  readonly priority: number;
  readonly roadmapOrder: number;
  readonly workspaceIsolation: WorkspaceIsolationState;
  readonly conflictWithActive: ProjectConflictClassification;
  readonly resourcesAvailable: boolean;
  readonly cutoverBlocked: boolean;
}

export interface ProjectSchedulePlan {
  readonly dispositions: Readonly<Record<string, ProjectWorkItemDisposition>>;
  readonly readyIds: readonly string[];
  readonly selectedIds: readonly string[];
  readonly activeIds: readonly string[];
  readonly parkedHumanIds: readonly string[];
  readonly shouldStop: boolean;
  readonly authority: 'NONE';
}

export interface HumanDecisionQueueEntryInput {
  readonly decisionId: string;
  readonly projectId: string;
  readonly repositoryIdentity: string;
  readonly workItemId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly exactRevision: string;
  readonly scopeHash: string;
  readonly decisionType: string;
  readonly reason: string;
  readonly choices: readonly string[];
  readonly consequences: readonly string[];
  readonly evidenceHashes: readonly string[];
  readonly createdAt: string;
  readonly blockedWorkItemIds: readonly string[];
  readonly otherWorkContinuing: boolean;
}

export interface HumanDecisionQueueEntry extends HumanDecisionQueueEntryInput {
  readonly schemaVersion: 1;
  readonly evidenceHashes: readonly string[];
  readonly blockedWorkItemIds: readonly string[];
  readonly decisionHash: string;
  readonly authority: 'NONE';
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const WORK_ITEM_STATES = new Set<ProjectWorkItemState>([
  'PENDING',
  'ACTIVE',
  'PARKED_HUMAN',
  'COMPLETE',
  'FAILED',
]);
const ISOLATION_STATES = new Set<WorkspaceIsolationState>(['ISOLATED', 'SHARED', 'UNKNOWN']);
const CONFLICT_STATES = new Set<ProjectConflictClassification>([
  'SAFE_TO_RUN_CONCURRENTLY',
  'SERIALIZE_WITH_ACTIVE_ITEM',
  'UNKNOWN',
]);

export function buildProjectSchedulePlan(
  workItems: readonly ProjectWorkItem[],
  maxActiveWorkItems: number,
): ProjectSchedulePlan {
  requirePositiveInteger(maxActiveWorkItems, 'maxActiveWorkItems');
  const byId = validateWorkItems(workItems);
  assertAcyclicDependencies(workItems, byId);

  const activeIds = workItems
    .filter((item) => item.state === 'ACTIVE')
    .map((item) => item.id)
    .sort();
  if (activeIds.length > maxActiveWorkItems) {
    throw new Error('active work items exceed maxActiveWorkItems');
  }

  const parkedHumanIds = workItems
    .filter((item) => item.state === 'PARKED_HUMAN')
    .map((item) => item.id)
    .sort();

  const dispositions: Record<string, ProjectWorkItemDisposition> = {};
  const ready: ProjectWorkItem[] = [];

  for (const item of [...workItems].sort((left, right) => left.id.localeCompare(right.id))) {
    const disposition = classifyWorkItem(item, byId);
    dispositions[item.id] = disposition;
    if (disposition === 'READY') ready.push(item);
  }

  ready.sort(compareReadyItems);
  const capacity = maxActiveWorkItems - activeIds.length;
  const selectedIds = ready.slice(0, capacity).map((item) => item.id);
  const readyIds = ready.map((item) => item.id);

  return {
    dispositions,
    readyIds,
    selectedIds,
    activeIds,
    parkedHumanIds,
    shouldStop: activeIds.length === 0 && selectedIds.length === 0,
    authority: 'NONE',
  };
}

export function createHumanDecisionQueueEntry(
  input: HumanDecisionQueueEntryInput,
): HumanDecisionQueueEntry {
  for (const [name, value] of [
    ['decisionId', input.decisionId],
    ['projectId', input.projectId],
    ['workItemId', input.workItemId],
    ['runId', input.runId],
    ['nodeId', input.nodeId],
  ] as const) {
    requireIdentifier(value, name);
  }
  requireText(input.repositoryIdentity, 'repositoryIdentity');
  requireText(input.exactRevision, 'exactRevision');
  requireHash(input.scopeHash, 'scopeHash');
  requireText(input.decisionType, 'decisionType');
  requireText(input.reason, 'reason');
  requireTimestamp(input.createdAt, 'createdAt');
  if (typeof input.otherWorkContinuing !== 'boolean') {
    throw new Error('otherWorkContinuing must be boolean');
  }

  const choices = validatedTextList(input.choices, 'choice');
  const consequences = validatedTextList(input.consequences, 'consequence');
  const evidenceHashes = uniqueSortedHashes(input.evidenceHashes, 'evidence hash');
  const blockedWorkItemIds = uniqueSortedIdentifiers(
    input.blockedWorkItemIds,
    'blocked work item id',
  );

  const identity = {
    schemaVersion: 1,
    decisionId: input.decisionId,
    projectId: input.projectId,
    repositoryIdentity: input.repositoryIdentity,
    workItemId: input.workItemId,
    runId: input.runId,
    nodeId: input.nodeId,
    exactRevision: input.exactRevision,
    scopeHash: input.scopeHash,
    decisionType: input.decisionType,
    reason: input.reason,
    choices,
    consequences,
    evidenceHashes,
    createdAt: input.createdAt,
    blockedWorkItemIds,
    otherWorkContinuing: input.otherWorkContinuing,
  } as const;

  return {
    ...identity,
    decisionHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function parkedHumanRequiredCancelsProject(): false {
  return false;
}

export function modelCanResolveHumanDecision(): false {
  return false;
}

export function unknownConflictCanRun(): false {
  return false;
}

export function schedulerCanGrantAuthority(): false {
  return false;
}

function validateWorkItems(
  workItems: readonly ProjectWorkItem[],
): ReadonlyMap<string, ProjectWorkItem> {
  const byId = new Map<string, ProjectWorkItem>();
  for (const item of workItems) {
    requireIdentifier(item.id, 'work item id');
    if (byId.has(item.id)) throw new Error('duplicate work item id: ' + item.id);
    if (!WORK_ITEM_STATES.has(item.state)) throw new Error('unsupported work item state');
    if (!Number.isInteger(item.priority)) throw new Error('work item priority must be an integer');
    requireNonNegativeInteger(item.roadmapOrder, 'work item roadmapOrder');
    if (!ISOLATION_STATES.has(item.workspaceIsolation)) {
      throw new Error('unsupported workspace isolation state');
    }
    if (!CONFLICT_STATES.has(item.conflictWithActive)) {
      throw new Error('unsupported conflict classification');
    }
    if (typeof item.resourcesAvailable !== 'boolean') {
      throw new Error('resourcesAvailable must be boolean');
    }
    if (typeof item.cutoverBlocked !== 'boolean') {
      throw new Error('cutoverBlocked must be boolean');
    }

    const dependencies = new Set<string>();
    for (const dependencyId of item.dependencyIds) {
      requireIdentifier(dependencyId, 'dependency id');
      if (dependencyId === item.id) throw new Error('work item cannot depend on itself');
      if (dependencies.has(dependencyId)) {
        throw new Error('duplicate dependency id: ' + dependencyId);
      }
      dependencies.add(dependencyId);
    }
    byId.set(item.id, {
      ...item,
      dependencyIds: [...dependencies].sort(),
    });
  }

  for (const item of byId.values()) {
    for (const dependencyId of item.dependencyIds) {
      if (!byId.has(dependencyId)) {
        throw new Error('unknown work item dependency: ' + dependencyId);
      }
    }
  }
  return byId;
}

function assertAcyclicDependencies(
  workItems: readonly ProjectWorkItem[],
  byId: ReadonlyMap<string, ProjectWorkItem>,
): void {
  const indegree = new Map(workItems.map((item) => [item.id, item.dependencyIds.length]));
  const outgoing = new Map(workItems.map((item) => [item.id, [] as string[]]));

  for (const item of workItems) {
    for (const dependencyId of item.dependencyIds) {
      outgoing.get(dependencyId)?.push(item.id);
    }
  }

  const queue = [...byId.keys()].filter((id) => indegree.get(id) === 0).sort();
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift() as string;
    visited += 1;
    for (const dependentId of outgoing.get(id) ?? []) {
      const next = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, next);
      if (next === 0) {
        queue.push(dependentId);
        queue.sort();
      }
    }
  }
  if (visited !== workItems.length) throw new Error('project dependency graph must be acyclic');
}

function classifyWorkItem(
  item: ProjectWorkItem,
  byId: ReadonlyMap<string, ProjectWorkItem>,
): ProjectWorkItemDisposition {
  if (item.state === 'ACTIVE') return 'ACTIVE';
  if (item.state === 'PARKED_HUMAN') return 'PARKED_HUMAN';
  if (item.state === 'COMPLETE') return 'COMPLETE';
  if (item.state === 'FAILED') return 'FAILED';

  if (item.dependencyIds.some((dependencyId) => byId.get(dependencyId)?.state !== 'COMPLETE')) {
    return 'WAITING_DEPENDENCY';
  }
  if (item.cutoverBlocked) return 'WAITING_BARRIER';
  if (
    item.workspaceIsolation !== 'ISOLATED' ||
    item.conflictWithActive !== 'SAFE_TO_RUN_CONCURRENTLY'
  ) {
    return 'WAITING_CONFLICT';
  }
  if (!item.resourcesAvailable) return 'WAITING_RESOURCE';
  return 'READY';
}

function compareReadyItems(left: ProjectWorkItem, right: ProjectWorkItem): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  if (left.roadmapOrder !== right.roadmapOrder) return left.roadmapOrder - right.roadmapOrder;
  return left.id.localeCompare(right.id);
}

function validatedTextList(values: readonly string[], label: string): readonly string[] {
  return values.map((value) => {
    requireText(value, label);
    return value;
  });
}

function uniqueSortedHashes(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    requireHash(value, label);
    if (seen.has(value)) throw new Error('duplicate ' + label + ': ' + value);
    seen.add(value);
  }
  return [...seen].sort();
}

function uniqueSortedIdentifiers(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    requireIdentifier(value, label);
    if (seen.has(value)) throw new Error('duplicate ' + label + ': ' + value);
    seen.add(value);
  }
  return [...seen].sort();
}

function requireIdentifier(value: string, name: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) throw new Error(name + ' must be a bounded identifier');
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(name + ' is required');
}

function requireHash(value: string, name: string): void {
  if (!HASH_PATTERN.test(value)) throw new Error(name + ' must be a SHA-256 hex hash');
}

function requireTimestamp(value: string, name: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(name + ' must be an ISO timestamp');
  }
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(name + ' must be a positive integer');
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(name + ' must be a non-negative integer');
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(record)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key]))
      .join(',') +
    '}'
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
