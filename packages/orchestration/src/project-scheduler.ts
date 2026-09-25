import { createHash } from 'node:crypto';

export type ProjectWorkItemState = 'PENDING' | 'ACTIVE' | 'PARKED_HUMAN' | 'COMPLETE' | 'FAILED';

export type ProjectConflictClassification =
  'SAFE_TO_RUN_CONCURRENTLY' | 'SERIALIZE_WITH_ACTIVE_ITEM' | 'UNKNOWN';

export type WorkspaceIsolationState = 'ISOLATED' | 'SHARED' | 'UNKNOWN';

export type ProjectWorkItemDisposition =
  | 'READY'
  | 'ACTIVE'
  | 'PARKED_HUMAN'
  | 'COMPLETE'
  | 'FAILED'
  | 'WAITING_DEPENDENCY'
  | 'WAITING_CONFLICT'
  | 'WAITING_SECRET'
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
  readonly blockedSecretHandleIds?: readonly string[];
  readonly resourcesAvailable: boolean;
  readonly cutoverBlocked: boolean;
}

export interface ProjectSchedulePlan {
  readonly dispositions: Readonly<Record<string, ProjectWorkItemDisposition>>;
  readonly readyIds: readonly string[];
  readonly selectedIds: readonly string[];
  readonly activeIds: readonly string[];
  readonly parkedHumanIds: readonly string[];
  readonly secretBlockedIds: readonly string[];
  readonly shouldStop: boolean;
  readonly authority: 'NONE';
}

export interface HumanDecisionCurrentness {
  readonly workflowHash: string;
  readonly runSnapshotHash: string;
  readonly policyHash: string;
  readonly catalogSnapshotHash: string;
  readonly bindingSnapshotHash: string;
  readonly dependencyGraphHash: string;
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
  readonly currentness: HumanDecisionCurrentness;
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
const GIT_REVISION_PATTERN = /^[a-f0-9]{40,64}$/;
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
  const secretBlockedIds = Object.entries(dispositions)
    .filter(([, disposition]) => disposition === 'WAITING_SECRET')
    .map(([id]) => id)
    .sort();

  return {
    dispositions,
    readyIds,
    selectedIds,
    activeIds,
    parkedHumanIds,
    secretBlockedIds,
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
  requireRevision(input.exactRevision, 'exactRevision');
  requireHash(input.scopeHash, 'scopeHash');
  const currentness = normalizeHumanDecisionCurrentness(input.currentness);
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
    currentness,
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

export function validateHumanDecisionQueueEntry(entry: HumanDecisionQueueEntry): void {
  if (entry.schemaVersion !== 1) throw new Error('human decision schemaVersion must be 1');
  if (entry.authority !== 'NONE') throw new Error('human decision queue authority must be NONE');

  const rebuilt = createHumanDecisionQueueEntry({
    decisionId: entry.decisionId,
    projectId: entry.projectId,
    repositoryIdentity: entry.repositoryIdentity,
    workItemId: entry.workItemId,
    runId: entry.runId,
    nodeId: entry.nodeId,
    exactRevision: entry.exactRevision,
    scopeHash: entry.scopeHash,
    currentness: entry.currentness,
    decisionType: entry.decisionType,
    reason: entry.reason,
    choices: entry.choices,
    consequences: entry.consequences,
    evidenceHashes: entry.evidenceHashes,
    createdAt: entry.createdAt,
    blockedWorkItemIds: entry.blockedWorkItemIds,
    otherWorkContinuing: entry.otherWorkContinuing,
  });
  if (rebuilt.decisionHash !== entry.decisionHash) {
    throw new Error('human decision queue entry hash mismatch');
  }
  if (canonicalJson(rebuilt) !== canonicalJson(entry)) {
    throw new Error('human decision queue entry is not canonical');
  }
}

export interface HumanDecisionResponseInput {
  readonly decisionId: string;
  readonly decisionHash: string;
  readonly principalId: string;
  readonly principalKind: 'HUMAN';
  readonly selectedChoice: string;
  readonly exactRevision: string;
  readonly scopeHash: string;
  readonly respondedAt: string;
}

export interface HumanDecisionResponseV1 extends HumanDecisionResponseInput {
  readonly schemaVersion: 1;
  readonly responseHash: string;
  readonly authority: 'NONE';
}

export type HumanDecisionResumeStatus =
  'RESUME_READY' | 'UNAUTHORIZED' | 'INVALID_RESPONSE' | 'STALE';

export interface HumanDecisionResumeContext {
  readonly authorityVerified: boolean;
  readonly exactRevision: string;
  readonly scopeHash: string;
  readonly currentness: HumanDecisionCurrentness;
}

export interface HumanDecisionResumeDecision {
  readonly status: HumanDecisionResumeStatus;
  readonly reasons: readonly string[];
  readonly staleDimensions: readonly string[];
  readonly authority: 'NONE';
}

export function createHumanDecisionResponseV1(
  input: HumanDecisionResponseInput,
): HumanDecisionResponseV1 {
  requireIdentifier(input.decisionId, 'decisionId');
  requireHash(input.decisionHash, 'decisionHash');
  requireIdentifier(input.principalId, 'principalId');
  if (input.principalKind !== 'HUMAN') {
    throw new Error('human decision response principalKind must be HUMAN');
  }
  requireText(input.selectedChoice, 'selectedChoice');
  requireRevision(input.exactRevision, 'exactRevision');
  requireHash(input.scopeHash, 'scopeHash');
  requireTimestamp(input.respondedAt, 'respondedAt');

  const identity = {
    schemaVersion: 1,
    decisionId: input.decisionId,
    decisionHash: input.decisionHash,
    principalId: input.principalId,
    principalKind: input.principalKind,
    selectedChoice: input.selectedChoice,
    exactRevision: input.exactRevision,
    scopeHash: input.scopeHash,
    respondedAt: input.respondedAt,
  } as const;

  return {
    ...identity,
    responseHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function validateHumanDecisionResponseV1(response: HumanDecisionResponseV1): void {
  if (response.schemaVersion !== 1) throw new Error('human response schemaVersion must be 1');
  if (response.authority !== 'NONE') throw new Error('human response authority must be NONE');
  const rebuilt = createHumanDecisionResponseV1({
    decisionId: response.decisionId,
    decisionHash: response.decisionHash,
    principalId: response.principalId,
    principalKind: response.principalKind,
    selectedChoice: response.selectedChoice,
    exactRevision: response.exactRevision,
    scopeHash: response.scopeHash,
    respondedAt: response.respondedAt,
  });
  if (rebuilt.responseHash !== response.responseHash) {
    throw new Error('human decision response hash mismatch');
  }
  if (canonicalJson(rebuilt) !== canonicalJson(response)) {
    throw new Error('human decision response is not canonical');
  }
}

export function evaluateHumanDecisionResume(
  entry: HumanDecisionQueueEntry,
  response: HumanDecisionResponseV1,
  context: HumanDecisionResumeContext,
): HumanDecisionResumeDecision {
  validateHumanDecisionQueueEntry(entry);
  validateHumanDecisionResponseV1(response);
  if (typeof context.authorityVerified !== 'boolean') {
    throw new Error('authorityVerified must be boolean');
  }
  requireRevision(context.exactRevision, 'current exactRevision');
  requireHash(context.scopeHash, 'current scopeHash');
  const currentness = normalizeHumanDecisionCurrentness(context.currentness);

  const reasons: string[] = [];
  if (response.decisionId !== entry.decisionId || response.decisionHash !== entry.decisionHash) {
    reasons.push('response is bound to a different decision identity');
  }
  if (!entry.choices.includes(response.selectedChoice)) {
    reasons.push('response selectedChoice is not allowed by the parked decision');
  }
  if (reasons.length > 0) {
    return {
      status: 'INVALID_RESPONSE',
      reasons,
      staleDimensions: [],
      authority: 'NONE',
    };
  }
  if (!context.authorityVerified) {
    return {
      status: 'UNAUTHORIZED',
      reasons: ['human principal authority is not verified'],
      staleDimensions: [],
      authority: 'NONE',
    };
  }

  const staleDimensions: string[] = [];
  if (
    response.exactRevision !== entry.exactRevision ||
    context.exactRevision !== entry.exactRevision
  ) {
    staleDimensions.push('revision');
  }
  if (response.scopeHash !== entry.scopeHash || context.scopeHash !== entry.scopeHash) {
    staleDimensions.push('scope');
  }
  for (const key of HUMAN_CURRENTNESS_KEYS) {
    if (currentness[key] !== entry.currentness[key]) staleDimensions.push(key);
  }
  if (staleDimensions.length > 0) {
    return {
      status: 'STALE',
      reasons: ['parked decision currentness changed before human response resume'],
      staleDimensions: [...new Set(staleDimensions)].sort(),
      authority: 'NONE',
    };
  }

  return {
    status: 'RESUME_READY',
    reasons: [],
    staleDimensions: [],
    authority: 'NONE',
  };
}

export function humanDecisionResponseCanGrantAuthority(): false {
  return false;
}

export function modelCanSubmitHumanDecisionResponse(): false {
  return false;
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
    if (item.blockedSecretHandleIds !== undefined && !Array.isArray(item.blockedSecretHandleIds)) {
      throw new Error('blockedSecretHandleIds must be an array');
    }
    const blockedSecretHandleIds = uniqueSortedIdentifiers(
      item.blockedSecretHandleIds ?? [],
      'blocked secret handle id',
    );
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
      blockedSecretHandleIds,
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
  if ((item.blockedSecretHandleIds?.length ?? 0) > 0) return 'WAITING_SECRET';
  if (!item.resourcesAvailable) return 'WAITING_RESOURCE';
  return 'READY';
}

function compareReadyItems(left: ProjectWorkItem, right: ProjectWorkItem): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  if (left.roadmapOrder !== right.roadmapOrder) return left.roadmapOrder - right.roadmapOrder;
  return left.id.localeCompare(right.id);
}

const HUMAN_CURRENTNESS_KEYS = [
  'workflowHash',
  'runSnapshotHash',
  'policyHash',
  'catalogSnapshotHash',
  'bindingSnapshotHash',
  'dependencyGraphHash',
] as const;

function normalizeHumanDecisionCurrentness(
  value: HumanDecisionCurrentness,
): HumanDecisionCurrentness {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('human decision currentness must be an object');
  }
  const normalized = {
    workflowHash: value.workflowHash,
    runSnapshotHash: value.runSnapshotHash,
    policyHash: value.policyHash,
    catalogSnapshotHash: value.catalogSnapshotHash,
    bindingSnapshotHash: value.bindingSnapshotHash,
    dependencyGraphHash: value.dependencyGraphHash,
  };
  for (const key of HUMAN_CURRENTNESS_KEYS) requireHash(normalized[key], key);
  return normalized;
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

function requireRevision(value: string, name: string): void {
  if (!GIT_REVISION_PATTERN.test(value)) throw new Error(name + ' must be a Git revision hash');
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
