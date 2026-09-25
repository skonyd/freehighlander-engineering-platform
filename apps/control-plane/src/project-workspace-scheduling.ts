import {
  createExecutionWorkspaceDescriptor,
  type ExecutionWorkspaceDescriptor,
} from './execution-runtime.js';
import type { LocalGitWorktreeBackend, LocalWorkspaceHandle } from './local-worktree-backend.js';

export interface ProjectScheduleSelection {
  readonly selectedIds: readonly string[];
  readonly authority: 'NONE';
}

export type ProjectWorkspaceActivationMode = 'CREATE' | 'REATTACH';

export interface ProjectWorkspaceActivationRequest {
  readonly workItemId: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly repositoryIdentity: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly mode: ProjectWorkspaceActivationMode;
}

export type ProjectWorkspaceActivationStatus = 'STARTABLE' | 'BLOCKED_WORKSPACE';

export interface ProjectWorkspaceActivationResult {
  readonly workItemId: string;
  readonly workspaceId: string;
  readonly workspaceHash: string;
  readonly status: ProjectWorkspaceActivationStatus;
  readonly failureClass: 'WORKSPACE_ALLOCATION_FAILED' | null;
  readonly authority: 'NONE';
}

export interface ProjectWorkspaceActivationPlan {
  readonly results: readonly ProjectWorkspaceActivationResult[];
  readonly startableIds: readonly string[];
  readonly blockedWorkspaceIds: readonly string[];
  readonly allSelectedItemsHaveIsolatedWorkspace: boolean;
  readonly authority: 'NONE';
}

export async function materializeSelectedProjectWorkspaces(input: {
  readonly schedule: ProjectScheduleSelection;
  readonly requests: readonly ProjectWorkspaceActivationRequest[];
  readonly repositoryRoot: string;
  readonly backend: Pick<LocalGitWorktreeBackend, 'create' | 'reattach'>;
}): Promise<ProjectWorkspaceActivationPlan> {
  if (!input.schedule || input.schedule.authority !== 'NONE') {
    throw new Error('project schedule must be authority-neutral');
  }
  if (typeof input.repositoryRoot !== 'string' || !input.repositoryRoot.trim()) {
    throw new Error('repositoryRoot is required');
  }
  if (!Array.isArray(input.requests)) {
    throw new Error('workspace activation requests must be an array');
  }

  const requestByWorkItem = new Map<string, ProjectWorkspaceActivationRequest>();
  const workspaceIds = new Set<string>();

  for (const request of input.requests) {
    requireIdentifier(request.workItemId, 'workItemId');
    requireIdentifier(request.workspaceId, 'workspaceId');
    requireIdentifier(request.runId, 'runId');
    requireText(request.repositoryIdentity, 'repositoryIdentity');
    requireRevision(request.exactRevision, 'exactRevision');
    requireHash(request.runSnapshotHash, 'runSnapshotHash');
    if (request.mode !== 'CREATE' && request.mode !== 'REATTACH') {
      throw new Error('unsupported workspace activation mode');
    }
    if (requestByWorkItem.has(request.workItemId)) {
      throw new Error('duplicate workspace request workItemId');
    }
    if (workspaceIds.has(request.workspaceId)) {
      throw new Error('selected work items cannot share a mutable workspace id');
    }
    requestByWorkItem.set(request.workItemId, request);
    workspaceIds.add(request.workspaceId);
  }

  const selectedIds = [...input.schedule.selectedIds];
  for (const selectedId of selectedIds) {
    if (!requestByWorkItem.has(selectedId)) {
      throw new Error('selected work item is missing an isolated workspace request: ' + selectedId);
    }
  }
  for (const workItemId of requestByWorkItem.keys()) {
    if (!selectedIds.includes(workItemId)) {
      throw new Error('workspace request is not selected by the scheduler: ' + workItemId);
    }
  }

  const results: ProjectWorkspaceActivationResult[] = [];
  for (const workItemId of selectedIds) {
    const request = requestByWorkItem.get(workItemId) as ProjectWorkspaceActivationRequest;
    const descriptor = createProjectWorkspaceDescriptor(request);
    let handle: LocalWorkspaceHandle;
    try {
      handle =
        request.mode === 'CREATE'
          ? await input.backend.create(descriptor, input.repositoryRoot)
          : await input.backend.reattach(descriptor);
      assertWorkspaceHandleMatches(descriptor, handle);
      results.push({
        workItemId,
        workspaceId: descriptor.workspaceId,
        workspaceHash: descriptor.workspaceHash,
        status: 'STARTABLE',
        failureClass: null,
        authority: 'NONE',
      });
    } catch {
      results.push({
        workItemId,
        workspaceId: descriptor.workspaceId,
        workspaceHash: descriptor.workspaceHash,
        status: 'BLOCKED_WORKSPACE',
        failureClass: 'WORKSPACE_ALLOCATION_FAILED',
        authority: 'NONE',
      });
    }
  }

  const startableIds = results
    .filter((result) => result.status === 'STARTABLE')
    .map((result) => result.workItemId);
  const blockedWorkspaceIds = results
    .filter((result) => result.status === 'BLOCKED_WORKSPACE')
    .map((result) => result.workItemId);

  return {
    results,
    startableIds,
    blockedWorkspaceIds,
    allSelectedItemsHaveIsolatedWorkspace: blockedWorkspaceIds.length === 0,
    authority: 'NONE',
  };
}

export function projectSchedulerCanStartWithoutIsolatedWorkspace(): false {
  return false;
}

export function projectWorkspaceActivationCanGrantAuthority(): false {
  return false;
}

function createProjectWorkspaceDescriptor(
  request: ProjectWorkspaceActivationRequest,
): ExecutionWorkspaceDescriptor {
  return createExecutionWorkspaceDescriptor({
    workspaceId: request.workspaceId,
    runId: request.runId,
    repositoryIdentity: request.repositoryIdentity,
    exactRevision: request.exactRevision,
    runSnapshotHash: request.runSnapshotHash,
    backendId: 'local-git-worktree',
    accessMode: 'MUTABLE_IMPLEMENTATION',
  });
}

function assertWorkspaceHandleMatches(
  descriptor: ExecutionWorkspaceDescriptor,
  handle: LocalWorkspaceHandle,
): void {
  if (handle.authority !== 'NONE') throw new Error('workspace handle authority must remain NONE');
  if (handle.descriptor.workspaceHash !== descriptor.workspaceHash) {
    throw new Error('workspace handle descriptor hash mismatch');
  }
  if (handle.descriptor.workspaceId !== descriptor.workspaceId) {
    throw new Error('workspace handle identity mismatch');
  }
  if (handle.descriptor.accessMode !== 'MUTABLE_IMPLEMENTATION') {
    throw new Error('project execution requires a mutable implementation workspace');
  }
}

function requireIdentifier(value: string, name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value)) {
    throw new Error(name + ' must be a bounded identifier');
  }
}

function requireHash(value: string, name: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(name + ' must be a SHA-256 hex hash');
}

function requireRevision(value: string, name: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(name + ' must be a full Git SHA');
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(name + ' is required');
}
