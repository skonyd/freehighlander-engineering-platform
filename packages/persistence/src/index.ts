export {
  GitResumeStore,
  SpawnGitResumeCommandRunner,
  gitResumeStoreCanContainSecretValues,
  gitResumeStoreCanGrantAuthority,
  portableEventArtifactId,
  resumeStateBranchCanMergeIntoProductBranches,
  resumeStateRef,
  type GitResumeCommandResult,
  type GitResumeCommandRunner,
  type GitResumeStoreOptions,
} from './git-resume-store.js';

export {
  AtomicJsonConfigStore,
  atomicConfigCanBypassGenerationCas,
  atomicConfigCanGrantAuthority,
  inFlightConfigSnapshotCanMutate,
  type AtomicConfigSnapshot,
  type AtomicConfigValidator,
  type AtomicConfigWriteResult,
  type AtomicConfigWriteStatus,
  type JsonScalar,
  type JsonValue,
} from './atomic-json-config-store.js';

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
  createPortableCanonicalEventBundleV1,
  portableCanonicalEventsCanContainSecretValues,
  portableCanonicalEventsCanRequireSourceMachinePath,
  portableSqliteWalCanBeHandoffProtocol,
  rebuildSqliteReadModelFromPortableEventBundle,
  validatePortableCanonicalEventBundleV1,
  type PortableCanonicalEventBundleV1,
  type PortableCanonicalEventBundleV1Input,
  type PortableCanonicalEventRecordV1,
  type PortableReadModelRebuildResult,
} from './portable-event-bundle.js';

export {
  SQLITE_SCHEMA_VERSION,
  indexedEngineeringEventHash,
  inspectSqliteTelemetryFile,
  inspectTelemetryJsonlFile,
  jsonlTornTailCanBecomeEvent,
  restoreSqliteTelemetryBackupToNewFile,
  SqliteTelemetryStore,
  validateIndexedEngineeringEvent,
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
