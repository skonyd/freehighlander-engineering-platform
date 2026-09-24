import { createHash } from 'node:crypto';

export type WorkspaceAccessMode = 'MUTABLE_IMPLEMENTATION' | 'IMMUTABLE_REVIEW';

export interface ExecutionWorkspaceDescriptorInput {
  readonly workspaceId: string;
  readonly runId: string;
  readonly repositoryIdentity: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly backendId: string;
  readonly accessMode: WorkspaceAccessMode;
}

export interface ExecutionWorkspaceDescriptor extends ExecutionWorkspaceDescriptorInput {
  readonly schemaVersion: 1;
  readonly workspaceHash: string;
  readonly authority: 'NONE';
}

export interface WorkspaceReattachRequest {
  readonly runId: string;
  readonly repositoryIdentity: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly backendId: string;
}

export interface RuntimeValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface ImmutableReviewSnapshotInput {
  readonly workspaceHash: string;
  readonly exactRevision: string;
  readonly diffHash: string;
  readonly scopeHash: string;
  readonly evidenceHashes: readonly string[];
}

export interface ImmutableReviewSnapshot {
  readonly schemaVersion: 1;
  readonly workspaceHash: string;
  readonly exactRevision: string;
  readonly diffHash: string;
  readonly scopeHash: string;
  readonly evidenceHashes: readonly string[];
  readonly snapshotHash: string;
  readonly readOnly: true;
  readonly authority: 'NONE';
}

export type ActivityKind = 'MODEL' | 'COMMAND' | 'FILESYSTEM' | 'GIT' | 'NETWORK_TOOL';
export type ActivityExecutionMode = 'LIVE' | 'REPLAY';
export type ActivityRunStatus = 'SUCCEEDED' | 'FAILED' | 'DENIED';

export interface ActivityRequest {
  readonly schemaVersion: 1;
  readonly activityId: string;
  readonly runId: string;
  readonly workspaceHash: string;
  readonly kind: ActivityKind;
  readonly input: string;
  readonly timeoutMs: number;
  readonly attempt: number;
  readonly executionMode: ActivityExecutionMode;
}

export interface ActivityPolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly authority: 'NONE';
}

export interface ActivityAuthorizer {
  authorize(request: ActivityRequest): ActivityPolicyDecision;
}

export interface ActivityExecutorOutcome {
  readonly status: 'SUCCEEDED' | 'FAILED';
  readonly output: string;
  readonly failureKind?: string;
}

export interface ActivityExecutor {
  readonly id: string;
  execute(request: ActivityRequest): Promise<ActivityExecutorOutcome>;
}

export interface ActivityRunResult {
  readonly schemaVersion: 1;
  readonly activityId: string;
  readonly runId: string;
  readonly workspaceHash: string;
  readonly kind: ActivityKind;
  readonly attempt: number;
  readonly status: ActivityRunStatus;
  readonly inputHash: string;
  readonly outputHash: string | null;
  readonly executorId: string | null;
  readonly reason: string;
  readonly failureKind: string | null;
  readonly authority: 'NONE';
}

export interface ChangeManifestEntry {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
  readonly binary: boolean;
  readonly generated: boolean;
}

export interface ChangeBudget {
  readonly allowedPathPrefixes: readonly string[];
  readonly forbiddenPathPrefixes: readonly string[];
  readonly maxChangedFiles: number;
  readonly maxAddedLines: number;
  readonly maxDeletedLines: number;
  readonly allowBinary: boolean;
  readonly allowGenerated: boolean;
}

export type ChangeBudgetReasonCode =
  | 'PATH_OUTSIDE_ALLOWED_SCOPE'
  | 'FORBIDDEN_PATH'
  | 'CHANGED_FILE_LIMIT'
  | 'ADDED_LINE_LIMIT'
  | 'DELETED_LINE_LIMIT'
  | 'BINARY_CHANGE_FORBIDDEN'
  | 'GENERATED_CHANGE_FORBIDDEN';

export interface ChangeBudgetDecision {
  readonly allowed: boolean;
  readonly reasonCodes: readonly ChangeBudgetReasonCode[];
  readonly changedFiles: number;
  readonly addedLines: number;
  readonly deletedLines: number;
  readonly authority: 'NONE';
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ACTIVITY_KINDS = new Set<ActivityKind>([
  'MODEL',
  'COMMAND',
  'FILESYSTEM',
  'GIT',
  'NETWORK_TOOL',
]);
const ACCESS_MODES = new Set<WorkspaceAccessMode>(['MUTABLE_IMPLEMENTATION', 'IMMUTABLE_REVIEW']);

export function createExecutionWorkspaceDescriptor(
  input: ExecutionWorkspaceDescriptorInput,
): ExecutionWorkspaceDescriptor {
  requireIdentifier(input.workspaceId, 'workspaceId');
  requireIdentifier(input.runId, 'runId');
  requireText(input.repositoryIdentity, 'repositoryIdentity');
  requireText(input.exactRevision, 'exactRevision');
  requireHash(input.runSnapshotHash, 'runSnapshotHash');
  requireIdentifier(input.backendId, 'backendId');
  if (!ACCESS_MODES.has(input.accessMode)) {
    throw new Error('unsupported workspace access mode');
  }

  const identity = {
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    runId: input.runId,
    repositoryIdentity: input.repositoryIdentity,
    exactRevision: input.exactRevision,
    runSnapshotHash: input.runSnapshotHash,
    backendId: input.backendId,
    accessMode: input.accessMode,
  } as const;

  return {
    ...identity,
    workspaceHash: sha256(JSON.stringify(identity)),
    authority: 'NONE',
  };
}

export function validateWorkspaceReattach(
  workspace: ExecutionWorkspaceDescriptor,
  request: WorkspaceReattachRequest,
): RuntimeValidation {
  const errors: string[] = [];
  if (workspace.runId !== request.runId) errors.push('workspace run identity mismatch');
  if (workspace.repositoryIdentity !== request.repositoryIdentity) {
    errors.push('workspace repository identity mismatch');
  }
  if (workspace.exactRevision !== request.exactRevision) {
    errors.push('workspace exact revision mismatch');
  }
  if (workspace.runSnapshotHash !== request.runSnapshotHash) {
    errors.push('workspace run snapshot mismatch');
  }
  if (workspace.backendId !== request.backendId) errors.push('workspace backend identity mismatch');
  return { valid: errors.length === 0, errors };
}

export function createImmutableReviewSnapshot(
  input: ImmutableReviewSnapshotInput,
): ImmutableReviewSnapshot {
  requireHash(input.workspaceHash, 'workspaceHash');
  requireText(input.exactRevision, 'exactRevision');
  requireHash(input.diffHash, 'diffHash');
  requireHash(input.scopeHash, 'scopeHash');

  const evidenceHashes = uniqueSortedHashes(input.evidenceHashes, 'evidenceHashes');
  const identity = {
    schemaVersion: 1,
    workspaceHash: input.workspaceHash,
    exactRevision: input.exactRevision,
    diffHash: input.diffHash,
    scopeHash: input.scopeHash,
    evidenceHashes,
  } as const;

  return {
    ...identity,
    snapshotHash: sha256(JSON.stringify(identity)),
    readOnly: true,
    authority: 'NONE',
  };
}

export class ActivityRunner {
  readonly #authorizer: ActivityAuthorizer;
  readonly #executors: Readonly<Partial<Record<ActivityKind, ActivityExecutor>>>;

  constructor(
    authorizer: ActivityAuthorizer,
    executors: Readonly<Partial<Record<ActivityKind, ActivityExecutor>>>,
  ) {
    this.#authorizer = authorizer;
    this.#executors = executors;
  }

  async run(request: ActivityRequest): Promise<ActivityRunResult> {
    validateActivityRequest(request);
    const inputHash = sha256(request.input);

    if (request.executionMode === 'REPLAY') {
      return deniedActivity(request, inputHash, 'replay cannot execute side effects');
    }

    const decision = this.#authorizer.authorize(request);
    if (decision.authority !== 'NONE') {
      throw new Error('activity authorizer must remain authority-neutral');
    }
    if (!decision.allowed) {
      return deniedActivity(request, inputHash, decision.reason);
    }

    const executor = this.#executors[request.kind];
    if (!executor) {
      return deniedActivity(request, inputHash, 'activity executor is unavailable');
    }
    requireIdentifier(executor.id, 'executor id');

    const outcome = await executor.execute(request);
    if (outcome.status !== 'SUCCEEDED' && outcome.status !== 'FAILED') {
      throw new Error('activity executor returned unsupported status');
    }
    if (typeof outcome.output !== 'string') {
      throw new Error('activity executor output must be a string');
    }

    return {
      schemaVersion: 1,
      activityId: request.activityId,
      runId: request.runId,
      workspaceHash: request.workspaceHash,
      kind: request.kind,
      attempt: request.attempt,
      status: outcome.status,
      inputHash,
      outputHash: sha256(outcome.output),
      executorId: executor.id,
      reason: decision.reason,
      failureKind: outcome.failureKind ?? null,
      authority: 'NONE',
    };
  }
}

export function evaluateChangeBudget(
  manifest: readonly ChangeManifestEntry[],
  budget: ChangeBudget,
): ChangeBudgetDecision {
  validateChangeBudget(budget);

  const reasonCodes = new Set<ChangeBudgetReasonCode>();
  let addedLines = 0;
  let deletedLines = 0;

  for (const entry of manifest) {
    validateChangeManifestEntry(entry);
    addedLines += entry.additions;
    deletedLines += entry.deletions;

    if (
      budget.allowedPathPrefixes.length > 0 &&
      !budget.allowedPathPrefixes.some((prefix) => pathMatchesPrefix(entry.path, prefix))
    ) {
      reasonCodes.add('PATH_OUTSIDE_ALLOWED_SCOPE');
    }
    if (budget.forbiddenPathPrefixes.some((prefix) => pathMatchesPrefix(entry.path, prefix))) {
      reasonCodes.add('FORBIDDEN_PATH');
    }
    if (entry.binary && !budget.allowBinary) reasonCodes.add('BINARY_CHANGE_FORBIDDEN');
    if (entry.generated && !budget.allowGenerated) reasonCodes.add('GENERATED_CHANGE_FORBIDDEN');
  }

  if (manifest.length > budget.maxChangedFiles) reasonCodes.add('CHANGED_FILE_LIMIT');
  if (addedLines > budget.maxAddedLines) reasonCodes.add('ADDED_LINE_LIMIT');
  if (deletedLines > budget.maxDeletedLines) reasonCodes.add('DELETED_LINE_LIMIT');

  const normalizedReasons = [...reasonCodes].sort();
  return {
    allowed: normalizedReasons.length === 0,
    reasonCodes: normalizedReasons,
    changedFiles: manifest.length,
    addedLines,
    deletedLines,
    authority: 'NONE',
  };
}

export function executionRuntimeCanGrantAuthority(): false {
  return false;
}

export function activityRunnerCanExecuteDuringReplay(): false {
  return false;
}

function validateActivityRequest(request: ActivityRequest): void {
  if (request.schemaVersion !== 1) throw new Error('activity schemaVersion must be 1');
  requireIdentifier(request.activityId, 'activityId');
  requireIdentifier(request.runId, 'runId');
  requireHash(request.workspaceHash, 'workspaceHash');
  if (!ACTIVITY_KINDS.has(request.kind)) throw new Error('unsupported activity kind');
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs <= 0) {
    throw new Error('activity timeoutMs must be a positive integer');
  }
  if (!Number.isInteger(request.attempt) || request.attempt < 1) {
    throw new Error('activity attempt must be an integer >= 1');
  }
  if (request.executionMode !== 'LIVE' && request.executionMode !== 'REPLAY') {
    throw new Error('unsupported activity execution mode');
  }
  if (typeof request.input !== 'string') throw new Error('activity input must be a string');
}

function deniedActivity(
  request: ActivityRequest,
  inputHash: string,
  reason: string,
): ActivityRunResult {
  return {
    schemaVersion: 1,
    activityId: request.activityId,
    runId: request.runId,
    workspaceHash: request.workspaceHash,
    kind: request.kind,
    attempt: request.attempt,
    status: 'DENIED',
    inputHash,
    outputHash: null,
    executorId: null,
    reason,
    failureKind: null,
    authority: 'NONE',
  };
}

function validateChangeBudget(budget: ChangeBudget): void {
  for (const [name, value] of [
    ['maxChangedFiles', budget.maxChangedFiles],
    ['maxAddedLines', budget.maxAddedLines],
    ['maxDeletedLines', budget.maxDeletedLines],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer`);
    }
  }
  for (const prefix of [...budget.allowedPathPrefixes, ...budget.forbiddenPathPrefixes]) {
    validateRepositoryRelativePath(prefix, 'change budget path prefix');
  }
}

function validateChangeManifestEntry(entry: ChangeManifestEntry): void {
  validateRepositoryRelativePath(entry.path, 'change path');
  if (!Number.isInteger(entry.additions) || entry.additions < 0) {
    throw new Error('change additions must be a non-negative integer');
  }
  if (!Number.isInteger(entry.deletions) || entry.deletions < 0) {
    throw new Error('change deletions must be a non-negative integer');
  }
}

function validateRepositoryRelativePath(value: string, label: string): void {
  requireText(value, label);
  if (
    value.startsWith('/') ||
    value.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.split(/[\\/]+/).includes('..')
  ) {
    throw new Error(`${label} must stay repository-relative`);
  }
}

function pathMatchesPrefix(candidate: string, prefix: string): boolean {
  const normalizedCandidate = candidate.replaceAll('\\', '/').replace(/^\.\//, '');
  const normalizedPrefix = prefix.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  return (
    normalizedCandidate === normalizedPrefix ||
    normalizedCandidate.startsWith(normalizedPrefix + '/')
  );
}

function uniqueSortedHashes(values: readonly string[], label: string): readonly string[] {
  const unique = new Set<string>();
  for (const value of values) {
    requireHash(value, label);
    if (unique.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    unique.add(value);
  }
  return [...unique].sort();
}

function requireIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value)) {
    throw new Error(`${label} must be a bounded identifier`);
  }
}

function requireText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

function requireHash(value: string, label: string): void {
  if (!HASH_PATTERN.test(value)) throw new Error(`${label} must be a SHA-256 hex hash`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
