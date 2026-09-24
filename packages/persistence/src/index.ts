export {
  createResumeManifestV1,
  evaluateResumeManifestCas,
  localResumeCacheRequiredForCorrectness,
  resumeArtifactCanBeReconstructed,
  resumeArtifactMustTransfer,
  resumeManifestCanContainSecretValues,
  resumeManifestCanGrantAuthority,
  validateResumeManifestV1,
  type ResumeArtifactClassification,
  type ResumeArtifactManifestEntry,
  type ResumeManifestCasDecision,
  type ResumeManifestCasStatus,
  type ResumeManifestV1,
  type ResumeManifestV1Input,
  type ResumeNodeResultIdentity,
  type ResumeStore,
  type ResumeWorkflowIdentity,
} from './resume-manifest.js';

export {
  SQLITE_SCHEMA_VERSION,
  inspectSqliteTelemetryFile,
  inspectTelemetryJsonlFile,
  jsonlTornTailCanBecomeEvent,
  restoreSqliteTelemetryBackupToNewFile,
  SqliteTelemetryStore,
  type ArtifactIndexRecord,
  type ImportResult,
  type JsonlRecoveryImportResult,
  type JsonlRecoveryInspection,
  type JsonlTornTailReport,
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
