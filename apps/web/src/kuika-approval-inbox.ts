import type { DashboardEvent, DashboardRun } from './read-model.js';

export type FhKuikaApprovalCurrentness = 'CURRENT' | 'RESOLVED' | 'STALE' | 'UNKNOWN';
export type FhKuikaApprovalBindingState =
  'EXACT_SCOPE_BOUND' | 'REVISION_BOUND' | 'PARTIAL' | 'UNKNOWN';

export interface FhKuikaApprovalInboxItemV1 {
  readonly approvalId: string;
  readonly runId: string;
  readonly taskId: string | null;
  readonly workflowId: string | null;
  readonly workflowVersion: string | null;
  readonly nodeId: string | null;
  readonly requestedAt: string;
  readonly decidedAt: string | null;
  readonly exactRevision: string | null;
  readonly eventRevision: string | null;
  readonly scopeHash: string | null;
  readonly reviewScopeHash: string | null;
  readonly runSnapshotHash: string | null;
  readonly currentness: FhKuikaApprovalCurrentness;
  readonly bindingState: FhKuikaApprovalBindingState;
  readonly decisionAuthority: 'CONTROL_PLANE_REQUIRED';
  readonly projectionAuthority: 'NONE';
}

export interface FhKuikaApprovalInboxV1 {
  readonly schemaVersion: 1;
  readonly pending: readonly FhKuikaApprovalInboxItemV1[];
  readonly stale: readonly FhKuikaApprovalInboxItemV1[];
  readonly resolvedRecent: readonly FhKuikaApprovalInboxItemV1[];
  readonly counts: {
    readonly pending: number;
    readonly stale: number;
    readonly resolved: number;
  };
  readonly projectionAuthority: 'NONE';
}

export interface FhKuikaApprovalInboxReadSource {
  listRuns(limit?: number): readonly DashboardRun[];
  listEvents(runId: string, limit?: number): readonly DashboardEvent[];
}

export function buildFhKuikaApprovalInboxV1(
  source: FhKuikaApprovalInboxReadSource,
  runLimit = 100,
  eventLimit = 1_000,
): FhKuikaApprovalInboxV1 {
  validateLimit(runLimit, 'runLimit');
  validateLimit(eventLimit, 'eventLimit');

  const pending: FhKuikaApprovalInboxItemV1[] = [];
  const stale: FhKuikaApprovalInboxItemV1[] = [];
  const resolvedRecent: FhKuikaApprovalInboxItemV1[] = [];

  for (const run of source.listRuns(runLimit)) {
    const events = [...source.listEvents(run.runId, eventLimit)].sort((left, right) => {
      const timestamp = left.timestamp.localeCompare(right.timestamp);
      if (timestamp !== 0) return timestamp;
      return left.type.localeCompare(right.type);
    });

    const requirements = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type === 'human.required');

    for (const requirement of requirements) {
      const decision = findDecision(events, requirement.event, requirement.index);
      const item = projectApproval(run, requirement.event, decision);
      if (item.currentness === 'CURRENT') pending.push(item);
      else if (item.currentness === 'STALE' || item.currentness === 'UNKNOWN') stale.push(item);
      else resolvedRecent.push(item);
    }
  }

  const sortNewest = (left: FhKuikaApprovalInboxItemV1, right: FhKuikaApprovalInboxItemV1) => {
    const timestamp = right.requestedAt.localeCompare(left.requestedAt);
    return timestamp !== 0 ? timestamp : left.approvalId.localeCompare(right.approvalId);
  };

  pending.sort(sortNewest);
  stale.sort(sortNewest);
  resolvedRecent.sort(sortNewest);

  return {
    schemaVersion: 1,
    pending,
    stale,
    resolvedRecent,
    counts: {
      pending: pending.length,
      stale: stale.length,
      resolved: resolvedRecent.length,
    },
    projectionAuthority: 'NONE',
  };
}

export function fhKuikaApprovalInboxCanInvokeModel(): false {
  return false;
}

export function fhKuikaApprovalInboxCanMutateRuntime(): false {
  return false;
}

export function fhKuikaApprovalInboxCanGrantAuthority(): false {
  return false;
}

export function fhKuikaApprovalInboxCanApproveDirectly(): false {
  return false;
}

function findDecision(
  events: readonly DashboardEvent[],
  requirement: DashboardEvent,
  requirementIndex: number,
): DashboardEvent | null {
  const later = events
    .slice(requirementIndex + 1)
    .filter((event) => event.type === 'human.decision');
  const sameNode = later.find(
    (event) => requirement.nodeId !== null && event.nodeId === requirement.nodeId,
  );
  return sameNode ?? later[0] ?? null;
}

function projectApproval(
  run: DashboardRun,
  requirement: DashboardEvent,
  decision: DashboardEvent | null,
): FhKuikaApprovalInboxItemV1 {
  const revision = asRecord(requirement.event.revision);
  const payload = asRecord(requirement.event.payload);
  const eventRevision = safeText(revision?.headSha);
  const scopeHash = safeHash(payload?.scopeHash);
  const reviewScopeHash = safeHash(payload?.reviewScopeHash);
  const runSnapshotHash = safeHash(payload?.runSnapshotHash);
  const exactRevision = safeText(run.headSha);

  const currentness = resolveCurrentness(run, decision);
  const bindingState = resolveBindingState({
    exactRevision,
    eventRevision,
    scopeHash,
    reviewScopeHash,
  });

  return {
    approvalId: [run.runId, requirement.nodeId ?? 'human', requirement.timestamp].join(':'),
    runId: run.runId,
    taskId: run.taskId,
    workflowId: run.workflowId,
    workflowVersion: run.workflowVersion,
    nodeId: requirement.nodeId,
    requestedAt: requirement.timestamp,
    decidedAt: decision?.timestamp ?? null,
    exactRevision,
    eventRevision,
    scopeHash,
    reviewScopeHash,
    runSnapshotHash,
    currentness,
    bindingState,
    decisionAuthority: 'CONTROL_PLANE_REQUIRED',
    projectionAuthority: 'NONE',
  };
}

function resolveCurrentness(
  run: DashboardRun,
  decision: DashboardEvent | null,
): FhKuikaApprovalCurrentness {
  if (decision !== null) return 'RESOLVED';

  const status = run.status?.toUpperCase() ?? null;
  if (
    status === 'COMPLETED' ||
    status === 'SUCCEEDED' ||
    status === 'PASSED' ||
    status === 'FAILED' ||
    status === 'CANCELLED'
  ) {
    return 'STALE';
  }

  if (run.humanRequired || status === 'HUMAN_REQUIRED') return 'CURRENT';
  return 'UNKNOWN';
}

function resolveBindingState(input: {
  readonly exactRevision: string | null;
  readonly eventRevision: string | null;
  readonly scopeHash: string | null;
  readonly reviewScopeHash: string | null;
}): FhKuikaApprovalBindingState {
  const scopeBound = input.scopeHash !== null || input.reviewScopeHash !== null;

  if (
    input.exactRevision !== null &&
    input.eventRevision !== null &&
    input.exactRevision === input.eventRevision &&
    scopeBound
  ) {
    return 'EXACT_SCOPE_BOUND';
  }

  if (
    input.exactRevision !== null &&
    input.eventRevision !== null &&
    input.exactRevision === input.eventRevision
  ) {
    return 'REVISION_BOUND';
  }

  if (
    input.exactRevision !== null ||
    input.eventRevision !== null ||
    input.scopeHash !== null ||
    input.reviewScopeHash !== null
  ) {
    return 'PARTIAL';
  }

  return 'UNKNOWN';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 500 || /[\r\n\t]/.test(normalized)) return null;
  return normalized;
}

function safeHash(value: unknown): string | null {
  const normalized = safeText(value);
  return normalized !== null && /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function validateLimit(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new Error(`${field} must be an integer between 1 and 10000`);
  }
}
