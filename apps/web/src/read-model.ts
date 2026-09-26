import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

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

export interface DashboardArtifact {
  readonly artifactId: string;
  readonly firstSeenTimestamp: string;
  readonly lastSeenTimestamp: string;
  readonly state: string;
}

export interface DashboardUsageAggregate {
  readonly modelCalls: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  readonly actualCostUsd: number;
  readonly retries: number;
  readonly fallbacks: number;
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
  readonly modelCalls: readonly DashboardModelCall[];
  readonly artifacts: readonly DashboardArtifact[];
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

    return this.#withDatabase((db) =>
      db
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
        .map((row) => mapRun(row as SqlRow)),
    );
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

    return {
      run,
      events: this.listEvents(runId, limit),
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

  usageSince(since: string): DashboardUsageAggregate {
    if (!since.trim() || Number.isNaN(Date.parse(since))) {
      throw new Error('since must be a valid timestamp');
    }

    return this.#withDatabase((db) => {
      const row = db
        .prepare(
          `SELECT
             COUNT(*) AS model_calls,
             COALESCE(SUM(input_tokens), 0) AS input_tokens,
             COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
             COALESCE(SUM(output_tokens), 0) AS output_tokens,
             COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
             COALESCE(SUM(total_tokens), 0) AS total_tokens,
             COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
             COALESCE(SUM(actual_cost_usd), 0) AS actual_cost_usd,
             COALESCE(SUM(retry_count), 0) AS retries,
             COALESCE(SUM(fallback_count), 0) AS fallbacks
           FROM model_calls
           WHERE timestamp >= ?`,
        )
        .get(since) as SqlRow | undefined;

      return {
        modelCalls: toNumber(row?.model_calls) ?? 0,
        inputTokens: toNumber(row?.input_tokens) ?? 0,
        cachedInputTokens: toNumber(row?.cached_input_tokens) ?? 0,
        outputTokens: toNumber(row?.output_tokens) ?? 0,
        reasoningTokens: toNumber(row?.reasoning_tokens) ?? 0,
        totalTokens: toNumber(row?.total_tokens) ?? 0,
        estimatedCostUsd: toNumber(row?.estimated_cost_usd) ?? 0,
        actualCostUsd: toNumber(row?.actual_cost_usd) ?? 0,
        retries: toNumber(row?.retries) ?? 0,
        fallbacks: toNumber(row?.fallbacks) ?? 0,
      };
    });
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
