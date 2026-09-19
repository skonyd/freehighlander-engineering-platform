import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const SQLITE_SCHEMA_VERSION = 1 as const;

export interface IndexedEngineeringEvent {
  readonly schemaVersion: 1;
  readonly type: string;
  readonly timestamp: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly revision?: {
    readonly repository?: string;
    readonly pullRequest?: number;
    readonly branch?: string;
    readonly baseSha?: string;
    readonly headSha?: string;
  };
  readonly workflow?: {
    readonly id?: string;
    readonly version?: string;
    readonly hash?: string;
  };
  readonly node?: {
    readonly id?: string;
    readonly type?: string;
  };
  readonly model?: {
    readonly logicalRole?: string;
    readonly bindingId?: string;
    readonly provider?: string;
    readonly model?: string;
    readonly effort?: string;
  };
  readonly execution?: {
    readonly status?: string;
    readonly result?: string;
    readonly durationMs?: number;
    readonly retryCount?: number;
    readonly fallbackCount?: number;
    readonly failureClass?: string;
  };
  readonly usage?: {
    readonly inputTokens?: number;
    readonly cachedInputTokens?: number;
    readonly cacheWriteTokens?: number;
    readonly outputTokens?: number;
    readonly reasoningTokens?: number;
    readonly totalTokens?: number;
    readonly estimatedCostUsd?: number;
    readonly actualCostUsd?: number;
  };
  readonly budget?: {
    readonly scope?: string;
    readonly action?: string;
    readonly limit?: number;
    readonly consumed?: number;
    readonly unit?: string;
  };
  readonly artifactIds?: readonly string[];
  readonly evidenceIds?: readonly string[];
  readonly payload: Record<string, unknown>;
}

export interface SqliteTelemetryStoreOptions {
  readonly timeoutMs?: number;
}

export interface ImportResult {
  readonly seen: number;
  readonly inserted: number;
  readonly duplicates: number;
}

export interface RunIndexRecord {
  readonly runId: string;
  readonly taskId: string | null;
  readonly firstTimestamp: string;
  readonly lastTimestamp: string;
  readonly status: string | null;
  readonly repository: string | null;
  readonly pullRequest: number | null;
  readonly branch: string | null;
  readonly baseSha: string | null;
  readonly headSha: string | null;
  readonly workflowId: string | null;
  readonly workflowVersion: string | null;
  readonly workflowHash: string | null;
  readonly humanRequired: boolean;
  readonly eventCount: number;
  readonly modelCallCount: number;
  readonly lastEventType: string;
}

export interface ModelCallIndexRecord {
  readonly eventHash: string;
  readonly runId: string;
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
  readonly cacheWriteTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly totalTokens: number | null;
  readonly estimatedCostUsd: number | null;
  readonly actualCostUsd: number | null;
}

export interface ArtifactIndexRecord {
  readonly artifactId: string;
  readonly runId: string;
  readonly firstSeenTimestamp: string;
  readonly lastSeenTimestamp: string;
  readonly state: 'OBSERVED' | 'CREATED' | 'INVALIDATED' | 'REUSED';
  readonly lastEventHash: string;
}

type SqlRow = Record<string, string | number | bigint | null>;

export class SqliteTelemetryStore {
  readonly #db: DatabaseSync;

  constructor(
    readonly filePath: string,
    options: SqliteTelemetryStoreOptions = {},
  ) {
    if (!filePath.trim()) throw new Error('filePath is required');
    if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true });

    this.#db = new DatabaseSync(filePath, {
      timeout: options.timeoutMs ?? 5_000,
    });

    this.#db.exec('PRAGMA foreign_keys = ON;');
    if (filePath !== ':memory:') this.#db.exec('PRAGMA journal_mode = WAL;');
    this.#db.exec('PRAGMA synchronous = NORMAL;');
    this.#migrate();
  }

  close(): void {
    this.#db.close();
  }

  schemaVersion(): number {
    const statement = this.#db.prepare(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
    );
    try {
      const row = statement.get() as SqlRow | undefined;
      return toNumber(row?.version) ?? 0;
    } finally {
      statement.close();
    }
  }

  append(event: IndexedEngineeringEvent): Promise<void> {
    this.ingest(event);
    return Promise.resolve();
  }

  ingest(event: IndexedEngineeringEvent): boolean {
    assertIndexableEvent(event);
    return this.#transaction(() => this.#ingestUnsafe(event));
  }

  ingestMany(events: readonly IndexedEngineeringEvent[]): ImportResult {
    return this.#transaction(() => {
      let inserted = 0;
      for (const event of events) {
        assertIndexableEvent(event);
        if (this.#ingestUnsafe(event)) inserted += 1;
      }

      return {
        seen: events.length,
        inserted,
        duplicates: events.length - inserted,
      };
    });
  }

  importJsonl(filePath: string): ImportResult {
    const events = parseJsonlFile(filePath);
    return this.ingestMany(events);
  }

  listRuns(limit = 100): readonly RunIndexRecord[] {
    assertLimit(limit);
    const statement = this.#db.prepare(
      `SELECT *
       FROM runs
       ORDER BY last_timestamp DESC, run_id ASC
       LIMIT ?`,
    );

    try {
      return statement.all(limit).map((row) => mapRun(row as SqlRow));
    } finally {
      statement.close();
    }
  }

  getRun(runId: string): RunIndexRecord | null {
    const statement = this.#db.prepare('SELECT * FROM runs WHERE run_id = ?');
    try {
      const row = statement.get(runId) as SqlRow | undefined;
      return row ? mapRun(row) : null;
    } finally {
      statement.close();
    }
  }

  listEvents(runId: string, limit = 1_000): readonly IndexedEngineeringEvent[] {
    assertLimit(limit);
    const statement = this.#db.prepare(
      `SELECT event_json
       FROM events
       WHERE run_id = ?
       ORDER BY timestamp ASC, id ASC
       LIMIT ?`,
    );

    try {
      return statement
        .all(runId, limit)
        .map((row) => JSON.parse(String((row as SqlRow).event_json)) as IndexedEngineeringEvent);
    } finally {
      statement.close();
    }
  }

  listModelCalls(runId: string, limit = 1_000): readonly ModelCallIndexRecord[] {
    assertLimit(limit);
    const statement = this.#db.prepare(
      `SELECT *
       FROM model_calls
       WHERE run_id = ?
       ORDER BY timestamp ASC, event_hash ASC
       LIMIT ?`,
    );

    try {
      return statement.all(runId, limit).map((row) => mapModelCall(row as SqlRow));
    } finally {
      statement.close();
    }
  }

  listArtifacts(runId: string, limit = 1_000): readonly ArtifactIndexRecord[] {
    assertLimit(limit);
    const statement = this.#db.prepare(
      `SELECT *
       FROM artifacts
       WHERE run_id = ?
       ORDER BY last_seen_timestamp DESC, artifact_id ASC
       LIMIT ?`,
    );

    try {
      return statement.all(runId, limit).map((row) => mapArtifact(row as SqlRow));
    } finally {
      statement.close();
    }
  }

  #migrate(): void {
    this.#db.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version INTEGER PRIMARY KEY,
         applied_at TEXT NOT NULL
       ) STRICT;`,
    );

    const current = this.schemaVersion();
    if (current > SQLITE_SCHEMA_VERSION) {
      throw new Error(
        `database schema version ${current} is newer than supported ${SQLITE_SCHEMA_VERSION}`,
      );
    }
    if (current === SQLITE_SCHEMA_VERSION) return;

    this.#transaction(() => {
      this.#db.exec(
        `CREATE TABLE IF NOT EXISTS events (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           event_hash TEXT NOT NULL UNIQUE,
           schema_version INTEGER NOT NULL,
           type TEXT NOT NULL,
           timestamp TEXT NOT NULL,
           run_id TEXT NOT NULL,
           task_id TEXT,
           workflow_id TEXT,
           workflow_version TEXT,
           workflow_hash TEXT,
           node_id TEXT,
           node_type TEXT,
           logical_role TEXT,
           binding_id TEXT,
           provider TEXT,
           model TEXT,
           effort TEXT,
           status TEXT,
           result TEXT,
           duration_ms INTEGER,
           retry_count INTEGER,
           fallback_count INTEGER,
           failure_class TEXT,
           input_tokens INTEGER,
           cached_input_tokens INTEGER,
           cache_write_tokens INTEGER,
           output_tokens INTEGER,
           reasoning_tokens INTEGER,
           total_tokens INTEGER,
           estimated_cost_usd REAL,
           actual_cost_usd REAL,
           budget_scope TEXT,
           budget_action TEXT,
           event_json TEXT NOT NULL
         ) STRICT;

         CREATE INDEX IF NOT EXISTS idx_events_run_time
           ON events(run_id, timestamp, id);

         CREATE INDEX IF NOT EXISTS idx_events_type_time
           ON events(type, timestamp);

         CREATE TABLE IF NOT EXISTS runs (
           run_id TEXT PRIMARY KEY,
           task_id TEXT,
           first_timestamp TEXT NOT NULL,
           last_timestamp TEXT NOT NULL,
           status TEXT,
           repository TEXT,
           pull_request INTEGER,
           branch TEXT,
           base_sha TEXT,
           head_sha TEXT,
           workflow_id TEXT,
           workflow_version TEXT,
           workflow_hash TEXT,
           human_required INTEGER NOT NULL DEFAULT 0,
           event_count INTEGER NOT NULL DEFAULT 0,
           model_call_count INTEGER NOT NULL DEFAULT 0,
           last_event_type TEXT NOT NULL
         ) STRICT;

         CREATE INDEX IF NOT EXISTS idx_runs_last_timestamp
           ON runs(last_timestamp DESC);

         CREATE TABLE IF NOT EXISTS model_calls (
           event_hash TEXT PRIMARY KEY,
           run_id TEXT NOT NULL,
           timestamp TEXT NOT NULL,
           logical_role TEXT,
           binding_id TEXT,
           provider TEXT,
           model TEXT,
           effort TEXT,
           status TEXT,
           result TEXT,
           duration_ms INTEGER,
           retry_count INTEGER,
           fallback_count INTEGER,
           failure_class TEXT,
           input_tokens INTEGER,
           cached_input_tokens INTEGER,
           cache_write_tokens INTEGER,
           output_tokens INTEGER,
           reasoning_tokens INTEGER,
           total_tokens INTEGER,
           estimated_cost_usd REAL,
           actual_cost_usd REAL,
           FOREIGN KEY(event_hash) REFERENCES events(event_hash) ON DELETE CASCADE
         ) STRICT;

         CREATE INDEX IF NOT EXISTS idx_model_calls_run_time
           ON model_calls(run_id, timestamp);

         CREATE TABLE IF NOT EXISTS artifacts (
           artifact_id TEXT PRIMARY KEY,
           run_id TEXT NOT NULL,
           first_seen_timestamp TEXT NOT NULL,
           last_seen_timestamp TEXT NOT NULL,
           state TEXT NOT NULL CHECK(state IN ('OBSERVED','CREATED','INVALIDATED','REUSED')),
           last_event_hash TEXT NOT NULL,
           FOREIGN KEY(last_event_hash) REFERENCES events(event_hash)
         ) STRICT;

         CREATE INDEX IF NOT EXISTS idx_artifacts_run_time
           ON artifacts(run_id, last_seen_timestamp DESC);`,
      );

      const statement = this.#db.prepare(
        'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)',
      );
      try {
        statement.run(SQLITE_SCHEMA_VERSION, new Date().toISOString());
      } finally {
        statement.close();
      }
    });
  }

  #ingestUnsafe(event: IndexedEngineeringEvent): boolean {
    const eventJson = JSON.stringify(event);
    const eventHash = sha256(eventJson);

    const insert = this.#db.prepare(
      `INSERT OR IGNORE INTO events (
         event_hash, schema_version, type, timestamp, run_id, task_id,
         workflow_id, workflow_version, workflow_hash,
         node_id, node_type,
         logical_role, binding_id, provider, model, effort,
         status, result, duration_ms, retry_count, fallback_count, failure_class,
         input_tokens, cached_input_tokens, cache_write_tokens, output_tokens,
         reasoning_tokens, total_tokens, estimated_cost_usd, actual_cost_usd,
         budget_scope, budget_action, event_json
       ) VALUES (
         ?, ?, ?, ?, ?, ?,
         ?, ?, ?,
         ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?
       )`,
    );

    let changes: number;
    try {
      const result = insert.run(
        eventHash,
        event.schemaVersion,
        event.type,
        event.timestamp,
        event.runId,
        event.taskId ?? null,
        event.workflow?.id ?? null,
        event.workflow?.version ?? null,
        event.workflow?.hash ?? null,
        event.node?.id ?? null,
        event.node?.type ?? null,
        event.model?.logicalRole ?? null,
        event.model?.bindingId ?? null,
        event.model?.provider ?? null,
        event.model?.model ?? null,
        event.model?.effort ?? null,
        event.execution?.status ?? null,
        event.execution?.result ?? null,
        event.execution?.durationMs ?? null,
        event.execution?.retryCount ?? null,
        event.execution?.fallbackCount ?? null,
        event.execution?.failureClass ?? null,
        event.usage?.inputTokens ?? null,
        event.usage?.cachedInputTokens ?? null,
        event.usage?.cacheWriteTokens ?? null,
        event.usage?.outputTokens ?? null,
        event.usage?.reasoningTokens ?? null,
        event.usage?.totalTokens ?? null,
        event.usage?.estimatedCostUsd ?? null,
        event.usage?.actualCostUsd ?? null,
        event.budget?.scope ?? null,
        event.budget?.action ?? null,
        eventJson,
      );
      changes = Number(result.changes);
    } finally {
      insert.close();
    }

    if (changes === 0) return false;

    this.#projectRun(event);
    this.#projectModelCall(eventHash, event);
    this.#projectArtifacts(eventHash, event);
    return true;
  }

  #projectRun(event: IndexedEngineeringEvent): void {
    const statement = this.#db.prepare(
      `INSERT INTO runs (
         run_id, task_id, first_timestamp, last_timestamp, status,
         repository, pull_request, branch, base_sha, head_sha,
         workflow_id, workflow_version, workflow_hash,
         human_required, event_count, model_call_count, last_event_type
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET
         task_id = COALESCE(excluded.task_id, runs.task_id),
         first_timestamp = MIN(runs.first_timestamp, excluded.first_timestamp),
         status = CASE
           WHEN excluded.last_timestamp >= runs.last_timestamp AND excluded.status IS NOT NULL
             THEN excluded.status
           ELSE runs.status
         END,
         repository = COALESCE(excluded.repository, runs.repository),
         pull_request = COALESCE(excluded.pull_request, runs.pull_request),
         branch = COALESCE(excluded.branch, runs.branch),
         base_sha = COALESCE(excluded.base_sha, runs.base_sha),
         head_sha = COALESCE(excluded.head_sha, runs.head_sha),
         workflow_id = COALESCE(excluded.workflow_id, runs.workflow_id),
         workflow_version = COALESCE(excluded.workflow_version, runs.workflow_version),
         workflow_hash = COALESCE(excluded.workflow_hash, runs.workflow_hash),
         human_required = MAX(runs.human_required, excluded.human_required),
         event_count = runs.event_count + 1,
         model_call_count = runs.model_call_count + excluded.model_call_count,
         last_event_type = CASE
           WHEN excluded.last_timestamp >= runs.last_timestamp
             THEN excluded.last_event_type
           ELSE runs.last_event_type
         END,
         last_timestamp = MAX(runs.last_timestamp, excluded.last_timestamp)`,
    );

    try {
      statement.run(
        event.runId,
        event.taskId ?? null,
        event.timestamp,
        event.timestamp,
        runStatus(event),
        event.revision?.repository ?? null,
        event.revision?.pullRequest ?? null,
        event.revision?.branch ?? null,
        event.revision?.baseSha ?? null,
        event.revision?.headSha ?? null,
        event.workflow?.id ?? null,
        event.workflow?.version ?? null,
        event.workflow?.hash ?? null,
        event.type === 'human.required' ? 1 : 0,
        event.type === 'model.call.completed' ? 1 : 0,
        event.type,
      );
    } finally {
      statement.close();
    }
  }

  #projectModelCall(eventHash: string, event: IndexedEngineeringEvent): void {
    if (event.type !== 'model.call.completed') return;

    const statement = this.#db.prepare(
      `INSERT INTO model_calls (
         event_hash, run_id, timestamp, logical_role, binding_id, provider, model, effort,
         status, result, duration_ms, retry_count, fallback_count, failure_class,
         input_tokens, cached_input_tokens, cache_write_tokens, output_tokens,
         reasoning_tokens, total_tokens, estimated_cost_usd, actual_cost_usd
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    try {
      statement.run(
        eventHash,
        event.runId,
        event.timestamp,
        event.model?.logicalRole ?? null,
        event.model?.bindingId ?? null,
        event.model?.provider ?? null,
        event.model?.model ?? null,
        event.model?.effort ?? null,
        event.execution?.status ?? null,
        event.execution?.result ?? null,
        event.execution?.durationMs ?? null,
        event.execution?.retryCount ?? null,
        event.execution?.fallbackCount ?? null,
        event.execution?.failureClass ?? null,
        event.usage?.inputTokens ?? null,
        event.usage?.cachedInputTokens ?? null,
        event.usage?.cacheWriteTokens ?? null,
        event.usage?.outputTokens ?? null,
        event.usage?.reasoningTokens ?? null,
        event.usage?.totalTokens ?? null,
        event.usage?.estimatedCostUsd ?? null,
        event.usage?.actualCostUsd ?? null,
      );
    } finally {
      statement.close();
    }
  }

  #projectArtifacts(eventHash: string, event: IndexedEngineeringEvent): void {
    for (const artifactId of event.artifactIds ?? []) {
      if (!artifactId.trim()) continue;

      const statement = this.#db.prepare(
        `INSERT INTO artifacts (
           artifact_id, run_id, first_seen_timestamp, last_seen_timestamp, state, last_event_hash
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(artifact_id) DO UPDATE SET
           run_id = excluded.run_id,
           first_seen_timestamp = MIN(artifacts.first_seen_timestamp, excluded.first_seen_timestamp),
           last_seen_timestamp = MAX(artifacts.last_seen_timestamp, excluded.last_seen_timestamp),
           state = CASE
             WHEN excluded.state = 'OBSERVED' THEN artifacts.state
             WHEN excluded.last_seen_timestamp >= artifacts.last_seen_timestamp THEN excluded.state
             ELSE artifacts.state
           END,
           last_event_hash = CASE
             WHEN excluded.last_seen_timestamp >= artifacts.last_seen_timestamp
               THEN excluded.last_event_hash
             ELSE artifacts.last_event_hash
           END`,
      );

      try {
        statement.run(
          artifactId,
          event.runId,
          event.timestamp,
          event.timestamp,
          artifactState(event.type),
          eventHash,
        );
      } finally {
        statement.close();
      }
    }
  }

  #transaction<T>(operation: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.#db.exec('ROLLBACK');
      } catch {
        // Preserve the original error.
      }
      throw error;
    }
  }
}

function parseJsonlFile(filePath: string): IndexedEngineeringEvent[] {
  const content = readFileSync(filePath, 'utf8');
  const events: IndexedEngineeringEvent[] = [];

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    try {
      const event = JSON.parse(line) as unknown;
      assertIndexableEvent(event);
      events.push(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown parse failure';
      throw new Error(`invalid telemetry JSONL at line ${index + 1}: ${message}`);
    }
  }

  return events;
}

function assertIndexableEvent(event: unknown): asserts event is IndexedEngineeringEvent {
  if (!event || typeof event !== 'object') throw new Error('event must be an object');

  const record = event as Record<string, unknown>;
  if (record.schemaVersion !== 1) throw new Error('unsupported telemetry schemaVersion');
  if (typeof record.type !== 'string' || !record.type) throw new Error('event type is required');
  if (typeof record.runId !== 'string' || !record.runId) throw new Error('runId is required');
  if (typeof record.timestamp !== 'string' || Number.isNaN(Date.parse(record.timestamp))) {
    throw new Error('valid timestamp is required');
  }
  if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) {
    throw new Error('payload object is required');
  }
}

function runStatus(event: IndexedEngineeringEvent): string | null {
  if (event.type === 'human.required') return 'HUMAN_REQUIRED';
  if (event.type === 'run.started') return 'RUNNING';

  if (event.type === 'run.completed') {
    return (
      event.execution?.status ??
      event.execution?.result ??
      stringPayloadValue(event.payload, 'status') ??
      stringPayloadValue(event.payload, 'result') ??
      'COMPLETED'
    );
  }

  return null;
}

function stringPayloadValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value ? value : null;
}

function artifactState(type: string): ArtifactIndexRecord['state'] {
  if (type === 'artifact.created') return 'CREATED';
  if (type === 'artifact.invalidated') return 'INVALIDATED';
  if (type === 'artifact.reused') return 'REUSED';
  return 'OBSERVED';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

function mapRun(row: SqlRow): RunIndexRecord {
  return {
    runId: String(row.run_id),
    taskId: toStringOrNull(row.task_id),
    firstTimestamp: String(row.first_timestamp),
    lastTimestamp: String(row.last_timestamp),
    status: toStringOrNull(row.status),
    repository: toStringOrNull(row.repository),
    pullRequest: toNumber(row.pull_request),
    branch: toStringOrNull(row.branch),
    baseSha: toStringOrNull(row.base_sha),
    headSha: toStringOrNull(row.head_sha),
    workflowId: toStringOrNull(row.workflow_id),
    workflowVersion: toStringOrNull(row.workflow_version),
    workflowHash: toStringOrNull(row.workflow_hash),
    humanRequired: toNumber(row.human_required) === 1,
    eventCount: toNumber(row.event_count) ?? 0,
    modelCallCount: toNumber(row.model_call_count) ?? 0,
    lastEventType: String(row.last_event_type),
  };
}

function mapModelCall(row: SqlRow): ModelCallIndexRecord {
  return {
    eventHash: String(row.event_hash),
    runId: String(row.run_id),
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
    cacheWriteTokens: toNumber(row.cache_write_tokens),
    outputTokens: toNumber(row.output_tokens),
    reasoningTokens: toNumber(row.reasoning_tokens),
    totalTokens: toNumber(row.total_tokens),
    estimatedCostUsd: toNumber(row.estimated_cost_usd),
    actualCostUsd: toNumber(row.actual_cost_usd),
  };
}

function mapArtifact(row: SqlRow): ArtifactIndexRecord {
  return {
    artifactId: String(row.artifact_id),
    runId: String(row.run_id),
    firstSeenTimestamp: String(row.first_seen_timestamp),
    lastSeenTimestamp: String(row.last_seen_timestamp),
    state: String(row.state) as ArtifactIndexRecord['state'],
    lastEventHash: String(row.last_event_hash),
  };
}
