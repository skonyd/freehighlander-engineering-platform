export {
  SQLITE_SCHEMA_VERSION,
  inspectSqliteTelemetryFile,
  restoreSqliteTelemetryBackupToNewFile,
  SqliteTelemetryStore,
  type ArtifactIndexRecord,
  type ImportResult,
  type IndexedEngineeringEvent,
  type ModelCallIndexRecord,
  type RunIndexRecord,
  type SqliteBackupResult,
  type SqliteIntegrityResult,
  type SqliteRestoreResult,
  type SqliteTelemetryStoreOptions,
  type WalCheckpointMode,
  type WalCheckpointResult,
} from './sqlite-telemetry-store.js';

export interface StoredRunState {
  readonly runId: string;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly status: string;
  readonly updatedAt: string;
}

export interface RunStateStore {
  get(runId: string): Promise<StoredRunState | null>;
  put(state: StoredRunState): Promise<void>;
}

export interface TransactionBoundary {
  run<T>(operation: () => Promise<T>): Promise<T>;
}
