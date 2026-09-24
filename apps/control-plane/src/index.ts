export {
  ActivityRunner,
  activityRunnerCanExecuteDuringReplay,
  createExecutionWorkspaceDescriptor,
  createImmutableReviewSnapshot,
  evaluateChangeBudget,
  executionRuntimeCanGrantAuthority,
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
