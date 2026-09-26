export {
  materializeSelectedProjectWorkspaces,
  projectSchedulerCanStartWithoutIsolatedWorkspace,
  projectWorkspaceActivationCanGrantAuthority,
  type ProjectScheduleSelection,
  type ProjectWorkspaceActivationMode,
  type ProjectWorkspaceActivationPlan,
  type ProjectWorkspaceActivationRequest,
  type ProjectWorkspaceActivationResult,
  type ProjectWorkspaceActivationStatus,
} from './project-workspace-scheduling.js';

export {
  advanceRuntimeHeartbeat,
  classifyRuntimeActivityLiveness,
  createRuntimeHeartbeat,
  heartbeatCanAuthorizeReplay,
  heartbeatCanCarrySecretValue,
  heartbeatCanDeclareSemanticSuccess,
  heartbeatCanGrantAuthority,
  validateRuntimeHeartbeat,
  type RuntimeActivityLiveness,
  type RuntimeHeartbeatIdentity,
  type RuntimeHeartbeatV1,
  type RuntimeLeaseLiveness,
  type RuntimeLivenessDecision,
  type RuntimeLivenessObservation,
  type RuntimeProgressMetadata,
} from './runtime-heartbeat.js';

export {
  cancellationCanSkipResourceRelease,
  cancellationCanTriggerModelShopping,
  cancellationCountsAsSemanticFailure,
  gracefulDrainCanGrantAuthority,
  planRuntimeCancellation,
  queuedWaitCountsAsExecutionTime,
  runtimeDrainAcceptsNewWork,
  transitionRuntimeDrain,
  type RuntimeActivityLifecycleState,
  type RuntimeCancellationAction,
  type RuntimeCancellationActionKind,
  type RuntimeCancellationActivity,
  type RuntimeCancellationPlan,
  type RuntimeCancellationReason,
  type RuntimeDrainEvidence,
  type RuntimeDrainState,
  type RuntimeDrainTransition,
} from './runtime-lifecycle.js';

export {
  reconcileStuckRun,
  recoveryCanAutoExecute,
  recoveryCanRepeatSideEffectWithoutIdempotency,
  runtimeRecoveryCanGrantAuthority,
  staleRunningCanRemainRunning,
  type RuntimeActivityEffect,
  type RuntimeIdempotencyEvidence,
  type RuntimeLeaseObservation,
  type RuntimeObservedState,
  type RuntimeRecoveryDecision,
  type RuntimeRecoveryEvidenceStatus,
  type RuntimeRecoveryNextAction,
  type RuntimeRecoveryObservation,
  type RuntimeRecoveryStatus,
} from './runtime-recovery.js';

export {
  evaluateRuntimePreflight,
  runtimePreflightCanGrantAuthority,
  runtimePreflightCanInvokeProvider,
  runtimePreflightCanResolveSecretValue,
  type RuntimePreflightBindingInput,
  type RuntimePreflightCircuitState,
  type RuntimePreflightFailure,
  type RuntimePreflightFailureCode,
  type RuntimePreflightInput,
  type RuntimePreflightResult,
  type RuntimePreflightStatus,
} from './runtime-preflight.js';

export {
  acquireRunLease,
  buildRunIntentIdentity,
  createMonotonicDeadline,
  bulkheadTerminalOutcomeCanSkipPermitRelease,
  bulkheadTerminalOutcomeCountsAsSemanticRetry,
  expiredLeaseCanRepeatSideEffects,
  releaseBulkheadPermit,
  releaseBulkheadPermitAfterOutcome,
  releaseRunLease,
  remainingMonotonicBudgetMs,
  renewRunLease,
  requestBulkheadPermit,
  runLeaseIsActive,
  runtimeStabilityCanGrantAuthority,
  waitingCountsAsSemanticRetry,
  type AcquireRunLeaseDecision,
  type AcquireRunLeaseRequest,
  type BulkheadPermit,
  type BulkheadPolicy,
  type BulkheadReleaseDecision,
  type BulkheadRequest,
  type BulkheadTerminalOutcome,
  type BulkheadTerminalReleaseDecision,
  type BulkheadRequestDecision,
  type BulkheadSnapshot,
  type MonotonicDeadline,
  type RunIntentIdentity,
  type RunIntentIdentityInput,
  type RunLeaseState,
  type RunLeaseV1,
} from './runtime-stability.js';

export {
  LocalGitWorktreeBackend,
  createLocalCommandActivityExecutor,
  createLocalFilesystemActivityExecutor,
  createLocalGitActivityExecutor,
  localCommandExecutorUsesShell,
  localWorkspaceDestroyRequiresLeaseGuard,
  localWorktreeBackendCanGrantAuthority,
  type LocalCommandExecutorOptions,
  type RegisteredLocalCommandV1,
  type LocalGitWorktreeBackendOptions,
  type LocalWorkspaceHandle,
  type WorkspaceSnapshotV1,
  type WorkspaceUntrackedEntry,
} from './local-worktree-backend.js';

export {
  createKnownRuntimeFailureReport,
  knownRuntimeFailureCatalogCanGrantAuthority,
  type KnownRuntimeFailureInput,
  type KnownRuntimeFailureKind,
} from './runtime-error-diagnosis-catalog.js';

export {
  createRuntimeErrorReport,
  formatRuntimeErrorForUser,
  runtimeErrorReportCanExposeSecrets,
  runtimeErrorReportCanGrantAuthority,
  runtimeErrorReportToTelemetryInput,
  type RuntimeErrorCauseCertainty,
  type RuntimeErrorCauseKind,
  type RuntimeErrorDetail,
  type RuntimeErrorDiagnosisInput,
  type RuntimeErrorDiagnosisV1,
  type RuntimeErrorReportInput,
  type RuntimeErrorReportV1,
  type RuntimeErrorSeverity,
  type RuntimeErrorTelemetryProjectionInput,
} from './runtime-error-reporting.js';

export {
  ActivityRunner,
  activityRunnerCanExecuteDuringReplay,
  createExecutionWorkspaceDescriptor,
  createImmutableReviewSnapshot,
  evaluateChangeBudget,
  executionRuntimeCanGrantAuthority,
  runParallelActivityWave,
  validateWorkspaceReattach,
  type ActivityAuthorizer,
  type ActivityExecutionMode,
  type ActivityExecutor,
  type ActivityExecutorOutcome,
  type ActivityKind,
  type ActivityPolicyDecision,
  type ActivityRequest,
  type ActivityRunResult,
  type ActivityRunStatus,
  type ChangeBudget,
  type ChangeBudgetDecision,
  type ChangeBudgetReasonCode,
  type ChangeManifestEntry,
  type ExecutionWorkspaceDescriptor,
  type ExecutionWorkspaceDescriptorInput,
  type ImmutableReviewSnapshot,
  type ImmutableReviewSnapshotInput,
  type ParallelActivityWaveResult,
  type RuntimeValidation,
  type WorkspaceAccessMode,
  type WorkspaceReattachRequest,
} from './execution-runtime.js';

export interface ControlPlaneFoundationInfo {
  readonly name: 'freehighlander-control-plane';
  readonly phase: 'FH-01A';
  readonly workflowAuthority: 'disabled-until-fh-01b';
  readonly uiCoupling: 'independent';
}

export function getControlPlaneFoundationInfo(): ControlPlaneFoundationInfo {
  return {
    name: 'freehighlander-control-plane',
    phase: 'FH-01A',
    workflowAuthority: 'disabled-until-fh-01b',
    uiCoupling: 'independent',
  };
}
