import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  createCoreHomeSnapshotV1,
  type CoreHomeAttentionItemV1,
  type CoreHomeAttentionSummaryView,
  type CoreHomeCurrentWorkView,
  type CoreHomeRecentRunView,
  type CoreHomeSnapshotV1,
  type CoreHomeUsageWindowKind,
  type CoreHomeUsageWindowView,
  type CoreHomeWorkState,
} from './home.js';

export class MissingDashboardDatabaseError extends Error {
  constructor(readonly filePath: string) {
    super(`dashboard database does not exist: ${filePath}`);
    this.name = 'MissingDashboardDatabaseError';
  }
}

type SqlRow = Record<string, string | number | bigint | null>;

export interface DashboardSummary {
  readonly runs: number;
  readonly humanRequiredRuns: number;
  readonly modelCalls: number;
  readonly totalTokens: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly estimatedCostUsd: number;
  readonly actualCostUsd: number;
  readonly averageModelLatencyMs: number | null;
}

export interface DashboardRun {
  readonly runId: string;
  readonly taskId: string | null;
  readonly firstTimestamp: string;
  readonly lastTimestamp: string;
  readonly status: string | null;
  readonly repository: string | null;
  readonly pullRequest: number | null;
  readonly branch: string | null;
  readonly headSha: string | null;
  readonly workflowId: string | null;
  readonly workflowVersion: string | null;
  readonly humanRequired: boolean;
  readonly eventCount: number;
  readonly modelCallCount: number;
}

export interface DashboardEvent {
  readonly type: string;
  readonly timestamp: string;
  readonly nodeId: string | null;
  readonly nodeType: string | null;
  readonly status: string | null;
  readonly result: string | null;
  readonly failureClass: string | null;
  readonly event: Record<string, unknown>;
}

export interface DashboardModelCall {
  readonly timestamp: string;
  readonly logicalRole: string | null;
  readonly bindingId: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly status: string | null;
  readonly result: string | null;
  readonly durationMs: number | null;
  readonly retryCount: number | null;
  readonly fallbackCount: number | null;
  readonly failureClass: string | null;
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly totalTokens: number | null;
  readonly estimatedCostUsd: number | null;
  readonly actualCostUsd: number | null;
}

export interface DashboardRuntimeError {
  readonly timestamp: string;
  readonly nodeId: string | null;
  readonly code: string;
  readonly severity: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly causeCode: string;
  readonly causeKind: string;
  readonly certainty: string;
  readonly headline: string;
  readonly sourceComponent: string;
  readonly sourceOperation: string;
  readonly failedStep: string;
  readonly rootCause: string;
  readonly observedSignal: string;
  readonly nextAction: string;
  readonly retryAt: string | null;
}

export interface DashboardArtifact {
  readonly artifactId: string;
  readonly firstSeenTimestamp: string;
  readonly lastSeenTimestamp: string;
  readonly state: string;
}

export interface DashboardModelAggregate {
  readonly logicalRole: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly calls: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  readonly actualCostUsd: number;
  readonly averageLatencyMs: number | null;
  readonly retries: number;
  readonly fallbacks: number;
}

export interface DashboardRunDetail {
  readonly run: DashboardRun;
  readonly events: readonly DashboardEvent[];
  readonly runtimeErrors: readonly DashboardRuntimeError[];
  readonly modelCalls: readonly DashboardModelCall[];
  readonly artifacts: readonly DashboardArtifact[];
}

export interface DashboardHomeOptions {
  readonly now?: string;
  readonly recentRunLimit?: number;
}

export interface DashboardUsageWindowOptions {
  readonly now?: string;
  readonly runId?: string;
  readonly repository?: string;
}

export class DashboardReadModel {
  constructor(readonly filePath: string) {
    if (!filePath.trim()) throw new Error('filePath is required');
  }

  health(): { readonly databaseExists: boolean; readonly schemaVersion: number | null } {
    if (!existsSync(this.filePath)) {
      return { databaseExists: false, schemaVersion: null };
    }

    return this.#withDatabase((db) => {
      const row = db
        .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
        .get() as SqlRow | undefined;
      return {
        databaseExists: true,
        schemaVersion: toNumber(row?.version),
      };
    });
  }

  summary(): DashboardSummary {
    return this.#withDatabase((db) => {
      const runRow = db
        .prepare(
          `SELECT
             COUNT(*) AS runs,
             COALESCE(SUM(human_required), 0) AS human_required_runs
           FROM runs`,
        )
        .get() as SqlRow | undefined;

      const modelRow = db
        .prepare(
          `SELECT
             COUNT(*) AS model_calls,
             COALESCE(SUM(total_tokens), 0) AS total_tokens,
             COALESCE(SUM(input_tokens), 0) AS input_tokens,
             COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
             COALESCE(SUM(output_tokens), 0) AS output_tokens,
             COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
             COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
             COALESCE(SUM(actual_cost_usd), 0) AS actual_cost_usd,
             AVG(duration_ms) AS average_model_latency_ms
           FROM model_calls`,
        )
        .get() as SqlRow | undefined;

      return {
        runs: toNumber(runRow?.runs) ?? 0,
        humanRequiredRuns: toNumber(runRow?.human_required_runs) ?? 0,
        modelCalls: toNumber(modelRow?.model_calls) ?? 0,
        totalTokens: toNumber(modelRow?.total_tokens) ?? 0,
        inputTokens: toNumber(modelRow?.input_tokens) ?? 0,
        cachedInputTokens: toNumber(modelRow?.cached_input_tokens) ?? 0,
        outputTokens: toNumber(modelRow?.output_tokens) ?? 0,
        reasoningTokens: toNumber(modelRow?.reasoning_tokens) ?? 0,
        estimatedCostUsd: toNumber(modelRow?.estimated_cost_usd) ?? 0,
        actualCostUsd: toNumber(modelRow?.actual_cost_usd) ?? 0,
        averageModelLatencyMs: toNumber(modelRow?.average_model_latency_ms),
      };
    });
  }

  listRuns(limit = 100): readonly DashboardRun[] {
    assertLimit(limit);
    return this.#withDatabase((db) => queryRuns(db, limit));
  }

  homeSnapshot(options: DashboardHomeOptions = {}): CoreHomeSnapshotV1 {
    const generatedAt = normalizeTimestamp(options.now ?? new Date().toISOString(), 'now');
    const recentRunLimit = options.recentRunLimit ?? 8;
    assertLimit(recentRunLimit);

    return this.#withDatabase((db) => {
      const runs = queryRuns(db, recentRunLimit);
      const latestRun = runs[0] ?? null;
      const usage = queryUsageWindow(db, 'TODAY', { now: generatedAt });
      const sqliteUpdatedAt = queryLatestTelemetryTimestamp(db) ?? generatedAt;
      const currentWork = queryCurrentWork(db);
      const approvalAttention = queryHumanApprovalAttention(db);

      return createCoreHomeSnapshotV1({
        generatedAt,
        sourceFreshness: {
          generatedAt,
          sqliteUpdatedAt,
          staleSources: ['continuity', 'findings', 'provider-state', 'runtime-attention'],
        },
        project: {
          repository: latestRun?.repository ?? null,
          projectId: null,
          branch: latestRun?.branch ?? null,
          headSha: latestRun?.headSha ?? null,
        },
        authority: {
          v3Authority: 'SHADOW_ONLY',
        },
        system: {
          state: 'UNKNOWN',
          database: 'HEALTHY',
          providers: 'UNKNOWN',
          continuity: 'UNKNOWN',
          criticalErrorCount: 0,
        },
        currentWork,
        attention: approvalAttention,
        usage,
        roleBindings: [],
        recentRuns: runs.map(mapRecentRun),
        continuity: {
          state: 'UNKNOWN',
          latestCheckpointAt: null,
          resumeReady: null,
          sourceRevision: null,
          warning: null,
        },
        findings: {
          state: 'UNKNOWN',
          critical: 0,
          high: 0,
          unresolved: 0,
          latestFindingAt: null,
        },
      });
    });
  }

  usageWindow(
    window: CoreHomeUsageWindowKind,
    options: DashboardUsageWindowOptions = {},
  ): CoreHomeUsageWindowView {
    const now = normalizeTimestamp(options.now ?? new Date().toISOString(), 'now');
    return this.#withDatabase((db) => queryUsageWindow(db, window, { ...options, now }));
  }

  getRun(runId: string): DashboardRun | null {
    if (!runId) throw new Error('runId is required');

    return this.#withDatabase((db) => {
      const row = db
        .prepare(
          `SELECT
             run_id, task_id, first_timestamp, last_timestamp, status,
             repository, pull_request, branch, head_sha,
             workflow_id, workflow_version, human_required,
             event_count, model_call_count
           FROM runs
           WHERE run_id = ?`,
        )
        .get(runId) as SqlRow | undefined;
      return row ? mapRun(row) : null;
    });
  }

  runDetail(runId: string, limit = 1_000): DashboardRunDetail | null {
    assertLimit(limit);
    const run = this.getRun(runId);
    if (!run) return null;

    const events = this.listEvents(runId, limit);
    return {
      run,
      events,
      runtimeErrors: projectDashboardRuntimeErrors(events),
      modelCalls: this.listModelCalls(runId, limit),
      artifacts: this.listArtifacts(runId, limit),
    };
  }

  listEvents(runId: string, limit = 1_000): readonly DashboardEvent[] {
    assertLimit(limit);

    return this.#withDatabase((db) =>
      db
        .prepare(
          `SELECT
             type, timestamp, node_id, node_type, status, result, failure_class, event_json
           FROM events
           WHERE run_id = ?
           ORDER BY timestamp ASC, id ASC
           LIMIT ?`,
        )
        .all(runId, limit)
        .map((row) => mapEvent(row as SqlRow)),
    );
  }

  listModelCalls(runId: string, limit = 1_000): readonly DashboardModelCall[] {
    assertLimit(limit);

    return this.#withDatabase((db) =>
      db
        .prepare(
          `SELECT *
           FROM model_calls
           WHERE run_id = ?
           ORDER BY timestamp ASC, event_hash ASC
           LIMIT ?`,
        )
        .all(runId, limit)
        .map((row) => mapModelCall(row as SqlRow)),
    );
  }

  listArtifacts(runId: string, limit = 1_000): readonly DashboardArtifact[] {
    assertLimit(limit);

    return this.#withDatabase((db) =>
      db
        .prepare(
          `SELECT artifact_id, first_seen_timestamp, last_seen_timestamp, state
           FROM artifacts
           WHERE run_id = ?
           ORDER BY last_seen_timestamp DESC, artifact_id ASC
           LIMIT ?`,
        )
        .all(runId, limit)
        .map((row) => ({
          artifactId: String((row as SqlRow).artifact_id),
          firstSeenTimestamp: String((row as SqlRow).first_seen_timestamp),
          lastSeenTimestamp: String((row as SqlRow).last_seen_timestamp),
          state: String((row as SqlRow).state),
        })),
    );
  }

  modelAggregates(limit = 100): readonly DashboardModelAggregate[] {
    assertLimit(limit);

    return this.#withDatabase((db) =>
      db
        .prepare(
          `SELECT
             logical_role, provider, model, effort,
             COUNT(*) AS calls,
             COALESCE(SUM(total_tokens), 0) AS total_tokens,
             COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
             COALESCE(SUM(actual_cost_usd), 0) AS actual_cost_usd,
             AVG(duration_ms) AS average_latency_ms,
             COALESCE(SUM(retry_count), 0) AS retries,
             COALESCE(SUM(fallback_count), 0) AS fallbacks
           FROM model_calls
           GROUP BY logical_role, provider, model, effort
           ORDER BY calls DESC, logical_role ASC, provider ASC, model ASC
           LIMIT ?`,
        )
        .all(limit)
        .map((row) => mapModelAggregate(row as SqlRow)),
    );
  }

  #withDatabase<T>(operation: (database: DatabaseSync) => T): T {
    if (!existsSync(this.filePath)) {
      throw new MissingDashboardDatabaseError(this.filePath);
    }

    const database = new DatabaseSync(this.filePath, {
      readOnly: true,
      timeout: 5_000,
    });

    try {
      return operation(database);
    } finally {
      database.close();
    }
  }
}

export function projectDashboardRuntimeErrors(
  events: readonly DashboardEvent[],
): readonly DashboardRuntimeError[] {
  const projected: DashboardRuntimeError[] = [];

  for (const event of events) {
    if (event.type !== 'runtime.error.reported') continue;
    const payload = asRecord(event.event.payload);
    if (payload?.safeForUserDisplay !== true) continue;

    const code = safeProjectionText(payload.code);
    const severity = safeProjectionText(payload.severity);
    const correlationId = safeProjectionText(payload.correlationId);
    const causeCode = safeProjectionText(payload.causeCode);
    const causeKind = safeProjectionText(payload.causeKind);
    const certainty = safeProjectionText(payload.certainty);
    const headline = safeProjectionText(payload.headline);
    const sourceComponent = safeProjectionText(payload.sourceComponent);
    const sourceOperation = safeProjectionText(payload.sourceOperation);
    const failedStep = safeProjectionText(payload.failedStep);
    const rootCause = safeProjectionText(payload.rootCause);
    const observedSignal = safeProjectionText(payload.observedSignal);
    const nextAction = safeProjectionText(payload.nextAction);

    if (
      !code ||
      !severity ||
      typeof payload.retryable !== 'boolean' ||
      !correlationId ||
      !causeCode ||
      !causeKind ||
      !certainty ||
      !headline ||
      !sourceComponent ||
      !sourceOperation ||
      !failedStep ||
      !rootCause ||
      !observedSignal ||
      !nextAction
    ) {
      continue;
    }

    const retryAt = payload.retryAt === undefined ? null : safeProjectionTimestamp(payload.retryAt);
    if (payload.retryAt !== undefined && retryAt === null) continue;

    projected.push({
      timestamp: event.timestamp,
      nodeId: event.nodeId,
      code,
      severity,
      retryable: payload.retryable,
      correlationId,
      causeCode,
      causeKind,
      certainty,
      headline,
      sourceComponent,
      sourceOperation,
      failedStep,
      rootCause,
      observedSignal,
      nextAction,
      retryAt,
    });
  }

  return projected;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function safeProjectionText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 500 || /[\r\n\t]/.test(normalized)) return null;
  return normalized;
}

function safeProjectionTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function queryRuns(db: DatabaseSync, limit: number): readonly DashboardRun[] {
  return db
    .prepare(
      `SELECT
         run_id, task_id, first_timestamp, last_timestamp, status,
         repository, pull_request, branch, head_sha,
         workflow_id, workflow_version, human_required,
         event_count, model_call_count
       FROM runs
       ORDER BY last_timestamp DESC, run_id ASC
       LIMIT ?`,
    )
    .all(limit)
    .map((row) => mapRun(row as SqlRow));
}

function queryCurrentWork(db: DatabaseSync): CoreHomeCurrentWorkView | null {
  const run = db
    .prepare(
      `SELECT
         run_id, task_id, last_timestamp, status, workflow_id, workflow_version, last_event_type
       FROM runs
       WHERE last_event_type <> 'run.completed'
       ORDER BY last_timestamp DESC, run_id ASC
       LIMIT 1`,
    )
    .get() as SqlRow | undefined;

  if (!run) return null;

  const runId = String(run.run_id);
  const event = db
    .prepare(
      `SELECT type, timestamp, node_id, node_type, status, result
       FROM events
       WHERE run_id = ?
       ORDER BY timestamp DESC, id DESC
       LIMIT 1`,
    )
    .get(runId) as SqlRow | undefined;

  const latestEventType = toStringOrNull(event?.type);
  const runEventType = toStringOrNull(run.last_event_type);
  const eventType = latestEventType ?? runEventType ?? 'unknown';
  const status = toStringOrNull(event?.status) ?? toStringOrNull(run.status);
  const result = toStringOrNull(event?.result);
  const nodeId = toStringOrNull(event?.node_id);
  const nodeType = toStringOrNull(event?.node_type);
  const workflowId = toStringOrNull(run.workflow_id);
  const state = mapCurrentWorkState(eventType, status, result);

  return {
    runId,
    workItemId: toStringOrNull(run.task_id),
    workflowId,
    workflowVersion: toStringOrNull(run.workflow_version),
    nodeId,
    state,
    label: currentWorkLabel(nodeId, nodeType, workflowId, runId),
    humanRequired: state === 'WAITING_HUMAN',
    updatedAt: String(event?.timestamp ?? run.last_timestamp),
  };
}

function currentWorkLabel(
  nodeId: string | null,
  nodeType: string | null,
  workflowId: string | null,
  runId: string,
): string {
  if (nodeId && nodeType) return nodeType + ' · ' + nodeId;
  if (nodeId) return nodeId;
  return workflowId ?? runId;
}

interface PendingHumanApproval {
  readonly decisionId: string | null;
  readonly runId: string;
  readonly nodeId: string | null;
  readonly item: CoreHomeAttentionItemV1;
}

function queryHumanApprovalAttention(db: DatabaseSync): CoreHomeAttentionSummaryView {
  const rows = db
    .prepare(
      `SELECT type, timestamp, run_id, task_id, node_id, status, result, event_json
       FROM (
         SELECT id, type, timestamp, run_id, task_id, node_id, status, result, event_json
         FROM events
         WHERE type IN ('human.required', 'human.decision')
         ORDER BY timestamp DESC, id DESC
         LIMIT 5000
       )
       ORDER BY timestamp ASC`,
    )
    .all() as SqlRow[];

  const pending = new Map<string, PendingHumanApproval>();

  for (const row of rows) {
    const type = String(row.type);
    const runId = String(row.run_id);
    const nodeId = toStringOrNull(row.node_id);
    const event = parseEventRecord(row.event_json);
    const payload = asRecord(event?.payload);
    const decisionId = safeProjectionIdentifier(payload?.decisionId);
    const key = decisionId ? 'decision:' + decisionId : approvalFallbackKey(runId, nodeId);

    if (type === 'human.required') {
      const reason = safeProjectionText(payload?.reason);
      pending.set(key, {
        decisionId,
        runId,
        nodeId,
        item: {
          id: 'human-approval:' + key,
          kind: 'HUMAN_APPROVAL',
          severity: 'WARNING',
          headline: 'Human approval required',
          source: 'human-decision-queue',
          occurredAt: String(row.timestamp),
          runId,
          ...(toStringOrNull(row.task_id) ? { workItemId: String(row.task_id) } : {}),
          nextAction: reason ?? 'Review the pending human decision.',
          authority: 'NONE',
        },
      });
      continue;
    }

    const stale = humanDecisionIsStale(row, payload);
    const matching =
      decisionId === null ? findPendingApproval(pending, runId, nodeId) : pending.get(key);

    if (!matching) continue;
    const matchingKey = approvalMapKey(pending, matching);
    if (!matchingKey) continue;

    if (stale) {
      pending.set(matchingKey, {
        ...matching,
        item: {
          ...matching.item,
          headline: 'Human approval response is stale',
          nextAction: 'Review the current decision before resuming work.',
        },
      });
    } else {
      pending.delete(matchingKey);
    }
  }

  const items = [...pending.values()]
    .map((entry) => entry.item)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  return {
    total: items.length,
    critical: 0,
    errors: 0,
    warnings: items.length,
    items,
  };
}

function mapCurrentWorkState(
  eventType: string,
  status: string | null,
  result: string | null,
): CoreHomeWorkState {
  const normalized = (status ?? result ?? '').trim().toUpperCase();
  if (
    eventType === 'human.required' ||
    normalized === 'HUMAN_REQUIRED' ||
    (eventType === 'human.decision' && normalized === 'STALE')
  ) {
    return 'WAITING_HUMAN';
  }
  if (normalized === 'BLOCKED') return 'BLOCKED';
  if (normalized === 'FAILED' || normalized === 'FAIL') return 'FAILED';
  return 'UNKNOWN';
}

function humanDecisionIsStale(row: SqlRow, payload: Record<string, unknown> | null): boolean {
  for (const value of [row.status, row.result, payload?.status, payload?.result]) {
    if (typeof value === 'string' && value.trim().toUpperCase() === 'STALE') return true;
  }
  return false;
}

function approvalFallbackKey(runId: string, nodeId: string | null): string {
  return 'run:' + runId + ':node:' + (nodeId ?? 'unknown');
}

function findPendingApproval(
  pending: ReadonlyMap<string, PendingHumanApproval>,
  runId: string,
  nodeId: string | null,
): PendingHumanApproval | null {
  for (const entry of pending.values()) {
    if (entry.runId === runId && entry.nodeId === nodeId) return entry;
  }
  return null;
}

function approvalMapKey(
  pending: ReadonlyMap<string, PendingHumanApproval>,
  target: PendingHumanApproval,
): string | null {
  for (const [key, entry] of pending) {
    if (entry === target) return key;
  }
  return null;
}

function parseEventRecord(value: string | number | bigint | null): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function safeProjectionIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(normalized)) return null;
  return normalized;
}

function queryUsageWindow(
  db: DatabaseSync,
  window: CoreHomeUsageWindowKind,
  options: DashboardUsageWindowOptions & { readonly now: string },
): CoreHomeUsageWindowView {
  const clauses: string[] = [];
  const params: string[] = [];

  if (window === 'TODAY') {
    clauses.push('mc.timestamp >= ?', 'mc.timestamp <= ?');
    params.push(startOfUtcDay(options.now), options.now);
  } else if (window === 'LAST_24H') {
    clauses.push('mc.timestamp >= ?', 'mc.timestamp <= ?');
    params.push(offsetIso(options.now, -24 * 60 * 60 * 1000), options.now);
  } else if (window === 'LAST_7D') {
    clauses.push('mc.timestamp >= ?', 'mc.timestamp <= ?');
    params.push(offsetIso(options.now, -7 * 24 * 60 * 60 * 1000), options.now);
  } else if (window === 'CURRENT_RUN') {
    if (!options.runId?.trim()) throw new Error('CURRENT_RUN usage requires runId');
    clauses.push('mc.run_id = ?');
    params.push(options.runId);
  } else if (window === 'CURRENT_PROJECT') {
    if (!options.repository?.trim()) {
      throw new Error('CURRENT_PROJECT usage requires repository');
    }
    clauses.push('r.repository = ?');
    params.push(options.repository);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS model_calls,
         COALESCE(SUM(mc.total_tokens), 0) AS total_tokens,
         COALESCE(SUM(mc.input_tokens), 0) AS input_tokens,
         COALESCE(SUM(mc.cached_input_tokens), 0) AS cached_input_tokens,
         COALESCE(SUM(mc.output_tokens), 0) AS output_tokens,
         COALESCE(SUM(mc.reasoning_tokens), 0) AS reasoning_tokens,
         COALESCE(SUM(mc.estimated_cost_usd), 0) AS estimated_cost_usd,
         COALESCE(SUM(mc.actual_cost_usd), 0) AS actual_cost_usd,
         COALESCE(SUM(mc.retry_count), 0) AS retries,
         COALESCE(SUM(mc.fallback_count), 0) AS fallbacks
       FROM model_calls mc
       LEFT JOIN runs r ON r.run_id = mc.run_id
       ${where}`,
    )
    .get(...params) as SqlRow | undefined;

  return {
    window,
    modelCalls: toNumber(row?.model_calls) ?? 0,
    totalTokens: toNumber(row?.total_tokens) ?? 0,
    inputTokens: toNumber(row?.input_tokens) ?? 0,
    cachedInputTokens: toNumber(row?.cached_input_tokens) ?? 0,
    outputTokens: toNumber(row?.output_tokens) ?? 0,
    reasoningTokens: toNumber(row?.reasoning_tokens) ?? 0,
    estimatedCostUsd: toNumber(row?.estimated_cost_usd) ?? 0,
    actualCostUsd: toNumber(row?.actual_cost_usd) ?? 0,
    retries: toNumber(row?.retries) ?? 0,
    fallbacks: toNumber(row?.fallbacks) ?? 0,
  };
}

function queryLatestTelemetryTimestamp(db: DatabaseSync): string | null {
  const row = db
    .prepare(
      `SELECT MAX(timestamp) AS timestamp
       FROM (
         SELECT MAX(last_timestamp) AS timestamp FROM runs
         UNION ALL
         SELECT MAX(timestamp) AS timestamp FROM model_calls
       )`,
    )
    .get() as SqlRow | undefined;
  return toStringOrNull(row?.timestamp);
}

function mapRecentRun(run: DashboardRun): CoreHomeRecentRunView {
  return {
    runId: run.runId,
    status: run.status,
    workflowId: run.workflowId,
    workflowVersion: run.workflowVersion,
    branch: run.branch,
    headSha: run.headSha,
    humanRequired: run.humanRequired,
    lastTimestamp: run.lastTimestamp,
  };
}

function startOfUtcDay(timestamp: string): string {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function offsetIso(timestamp: string, offsetMs: number): string {
  return new Date(Date.parse(timestamp) + offsetMs).toISOString();
}

function normalizeTimestamp(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${name} must be a valid timestamp`);
  }
  return new Date(normalized).toISOString();
}

function mapRun(row: SqlRow): DashboardRun {
  return {
    runId: String(row.run_id),
    taskId: toStringOrNull(row.task_id),
    firstTimestamp: String(row.first_timestamp),
    lastTimestamp: String(row.last_timestamp),
    status: toStringOrNull(row.status),
    repository: toStringOrNull(row.repository),
    pullRequest: toNumber(row.pull_request),
    branch: toStringOrNull(row.branch),
    headSha: toStringOrNull(row.head_sha),
    workflowId: toStringOrNull(row.workflow_id),
    workflowVersion: toStringOrNull(row.workflow_version),
    humanRequired: toNumber(row.human_required) === 1,
    eventCount: toNumber(row.event_count) ?? 0,
    modelCallCount: toNumber(row.model_call_count) ?? 0,
  };
}

function mapEvent(row: SqlRow): DashboardEvent {
  return {
    type: String(row.type),
    timestamp: String(row.timestamp),
    nodeId: toStringOrNull(row.node_id),
    nodeType: toStringOrNull(row.node_type),
    status: toStringOrNull(row.status),
    result: toStringOrNull(row.result),
    failureClass: toStringOrNull(row.failure_class),
    event: JSON.parse(String(row.event_json)) as Record<string, unknown>,
  };
}

function mapModelCall(row: SqlRow): DashboardModelCall {
  return {
    timestamp: String(row.timestamp),
    logicalRole: toStringOrNull(row.logical_role),
    bindingId: toStringOrNull(row.binding_id),
    provider: toStringOrNull(row.provider),
    model: toStringOrNull(row.model),
    effort: toStringOrNull(row.effort),
    status: toStringOrNull(row.status),
    result: toStringOrNull(row.result),
    durationMs: toNumber(row.duration_ms),
    retryCount: toNumber(row.retry_count),
    fallbackCount: toNumber(row.fallback_count),
    failureClass: toStringOrNull(row.failure_class),
    inputTokens: toNumber(row.input_tokens),
    cachedInputTokens: toNumber(row.cached_input_tokens),
    outputTokens: toNumber(row.output_tokens),
    reasoningTokens: toNumber(row.reasoning_tokens),
    totalTokens: toNumber(row.total_tokens),
    estimatedCostUsd: toNumber(row.estimated_cost_usd),
    actualCostUsd: toNumber(row.actual_cost_usd),
  };
}

function mapModelAggregate(row: SqlRow): DashboardModelAggregate {
  return {
    logicalRole: toStringOrNull(row.logical_role),
    provider: toStringOrNull(row.provider),
    model: toStringOrNull(row.model),
    effort: toStringOrNull(row.effort),
    calls: toNumber(row.calls) ?? 0,
    totalTokens: toNumber(row.total_tokens) ?? 0,
    estimatedCostUsd: toNumber(row.estimated_cost_usd) ?? 0,
    actualCostUsd: toNumber(row.actual_cost_usd) ?? 0,
    averageLatencyMs: toNumber(row.average_latency_ms),
    retries: toNumber(row.retries) ?? 0,
    fallbacks: toNumber(row.fallbacks) ?? 0,
  };
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error('limit must be an integer between 1 and 10000');
  }
}

function toNumber(value: string | number | bigint | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toStringOrNull(value: string | number | bigint | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}
