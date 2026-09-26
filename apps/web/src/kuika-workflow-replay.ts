import type { DashboardEvent, DashboardRun } from './read-model.js';

export interface FhKuikaWorkflowReplayStepV1 {
  readonly index: number;
  readonly timestamp: string;
  readonly nodeId: string | null;
  readonly nodeType: string | null;
  readonly eventType: string;
  readonly status: string | null;
  readonly result: string | null;
}

export interface FhKuikaWorkflowReplayPreviewV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly repository: string | null;
  readonly branch: string | null;
  readonly exactRevision: string | null;
  readonly workflowId: string | null;
  readonly workflowVersion: string | null;
  readonly recordedSteps: readonly FhKuikaWorkflowReplayStepV1[];
  readonly source: 'RECORDED_EVENTS';
  readonly replayPerformed: false;
  readonly executionAuthorized: false;
  readonly authority: 'NONE';
}

export interface FhKuikaWorkflowReplayReadSource {
  getRun(runId: string): DashboardRun | null;
  listEvents(runId: string, limit?: number): readonly DashboardEvent[];
}

export function buildFhKuikaWorkflowReplayPreviewV1(
  source: FhKuikaWorkflowReplayReadSource,
  runId: string,
  eventLimit = 5_000,
): FhKuikaWorkflowReplayPreviewV1 | null {
  if (!runId.trim()) throw new Error('runId is required');
  if (!Number.isInteger(eventLimit) || eventLimit < 1 || eventLimit > 20_000) {
    throw new Error('eventLimit must be an integer between 1 and 20000');
  }

  const run = source.getRun(runId);
  if (!run) return null;

  const recordedSteps = source.listEvents(runId, eventLimit).map((event, index) => ({
    index: index + 1,
    timestamp: event.timestamp,
    nodeId: event.nodeId,
    nodeType: event.nodeType,
    eventType: event.type,
    status: event.status,
    result: event.result,
  }));

  return {
    schemaVersion: 1,
    runId: run.runId,
    repository: run.repository,
    branch: run.branch,
    exactRevision: run.headSha,
    workflowId: run.workflowId,
    workflowVersion: run.workflowVersion,
    recordedSteps,
    source: 'RECORDED_EVENTS',
    replayPerformed: false,
    executionAuthorized: false,
    authority: 'NONE',
  };
}

export function workflowReplayPreviewCanExecute(): false {
  return false;
}

export function workflowReplayPreviewCanInvokeModel(): false {
  return false;
}

export function workflowReplayPreviewCanGrantAuthority(): false {
  return false;
}
