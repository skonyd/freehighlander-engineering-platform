import type {
  DashboardArtifact,
  DashboardEvent,
  DashboardModelCall,
  DashboardRun,
  DashboardSummary,
} from './read-model.js';

export type ManagementIntentKind =
  'REQUEST_HUMAN_DECISION' | 'REQUEST_CHECKPOINT_RETRY' | 'REQUEST_RUN_CANCEL';

export interface ManagementIntent {
  readonly kind: ManagementIntentKind;
  readonly runId: string;
  readonly exactHeadSha?: string;
  readonly reason: string;
  readonly authority: 'CONTROL_PLANE_REQUIRED';
}

export interface HumanApprovalView {
  readonly runId: string;
  readonly timestamp: string;
  readonly nodeId: string | null;
  readonly status: 'HUMAN_REQUIRED';
  readonly detail: Record<string, unknown>;
}

export interface ManagementRunView {
  readonly run: DashboardRun;
  readonly humanApprovals: readonly HumanApprovalView[];
  readonly artifacts: readonly DashboardArtifact[];
  readonly modelCalls: readonly DashboardModelCall[];
}

export interface ManagementSnapshot {
  readonly mode: 'client-only-management';
  readonly executionOwner: 'control-plane';
  readonly mutationAuthority: 'none';
  readonly v3Authority: 'SHADOW_ONLY';
  readonly summary: DashboardSummary;
  readonly runs: readonly ManagementRunView[];
}

export interface ManagementReadSource {
  summary(): DashboardSummary;
  listRuns(limit?: number): readonly DashboardRun[];
  listEvents(runId: string, limit?: number): readonly DashboardEvent[];
  listArtifacts(runId: string, limit?: number): readonly DashboardArtifact[];
  listModelCalls(runId: string, limit?: number): readonly DashboardModelCall[];
}

export function buildManagementSnapshot(
  source: ManagementReadSource,
  runLimit = 50,
  detailLimit = 1_000,
): ManagementSnapshot {
  const runs = source.listRuns(runLimit).map((run) => ({
    run,
    humanApprovals: source
      .listEvents(run.runId, detailLimit)
      .filter((event) => event.type === 'human.required')
      .map((event) => ({
        runId: run.runId,
        timestamp: event.timestamp,
        nodeId: event.nodeId,
        status: 'HUMAN_REQUIRED' as const,
        detail: event.event,
      })),
    artifacts: source.listArtifacts(run.runId, detailLimit),
    modelCalls: source.listModelCalls(run.runId, detailLimit),
  }));

  return {
    mode: 'client-only-management',
    executionOwner: 'control-plane',
    mutationAuthority: 'none',
    v3Authority: 'SHADOW_ONLY',
    summary: source.summary(),
    runs,
  };
}

export function createManagementIntent(input: {
  readonly kind: ManagementIntentKind;
  readonly runId: string;
  readonly exactHeadSha?: string;
  readonly reason: string;
}): ManagementIntent {
  if (!input.runId.trim()) throw new Error('runId is required');
  if (!input.reason.trim()) throw new Error('management intent reason is required');
  if (input.exactHeadSha !== undefined && !input.exactHeadSha.trim()) {
    throw new Error('exactHeadSha cannot be empty');
  }

  return {
    ...input,
    authority: 'CONTROL_PLANE_REQUIRED',
  };
}

export function parseManagementIntent(value: unknown): ManagementIntent {
  if (!value || typeof value !== 'object') {
    throw new Error('management intent must be an object');
  }
  const record = value as Record<string, unknown>;
  if (
    record.kind !== 'REQUEST_HUMAN_DECISION' &&
    record.kind !== 'REQUEST_CHECKPOINT_RETRY' &&
    record.kind !== 'REQUEST_RUN_CANCEL'
  ) {
    throw new Error('unknown management intent kind');
  }
  if (typeof record.runId !== 'string' || typeof record.reason !== 'string') {
    throw new Error('management intent runId and reason must be strings');
  }
  if (record.exactHeadSha !== undefined && typeof record.exactHeadSha !== 'string') {
    throw new Error('management intent exactHeadSha must be a string when provided');
  }

  return createManagementIntent({
    kind: record.kind,
    runId: record.runId,
    reason: record.reason,
    ...(record.exactHeadSha === undefined ? {} : { exactHeadSha: record.exactHeadSha }),
  });
}

export function webCanExecuteManagementIntent(): false {
  return false;
}

export function uiDisconnectCanChangeWorkflowExecution(): false {
  return false;
}
