export {
  coreHomeSnapshotCanGrantAuthority,
  coreHomeSnapshotCanMutateRuntime,
  createCoreHomeSnapshotV1,
  dashboardRefreshCanInvokeModel,
  type CoreHomeAttentionItemV1,
  type CoreHomeAttentionKind,
  type CoreHomeAttentionSeverity,
  type CoreHomeAttentionSummaryViewV1,
  type CoreHomeAuthorityMode,
  type CoreHomeAuthoritySummaryViewV1,
  type CoreHomeBindingState,
  type CoreHomeContinuitySummaryViewV1,
  type CoreHomeFindingSummaryViewV1,
  type CoreHomeFreshnessV1,
  type CoreHomeCurrentWorkViewV1,
  type CoreHomeProjectContextViewV1,
  type CoreHomeRecentRunViewV1,
  type CoreHomeRoleBindingHealthViewV1,
  type CoreHomeSnapshotInputV1,
  type CoreHomeSnapshotV1,
  type CoreHomeSystemHealth,
  type CoreHomeSystemHealthViewV1,
  type CoreHomeUsageWindowViewV1,
  type CoreHomeWorkState,
} from './home-contract.js';

export {
  buildManagementSnapshot,
  createManagementIntent,
  parseManagementIntent,
  uiDisconnectCanChangeWorkflowExecution,
  webCanExecuteManagementIntent,
  type HumanApprovalView,
  type ManagementIntent,
  type ManagementIntentKind,
  type ManagementReadSource,
  type ManagementRunView,
  type ManagementSnapshot,
} from './management.js';

export {
  DashboardReadModel,
  MissingDashboardDatabaseError,
  type DashboardArtifact,
  type DashboardEvent,
  type DashboardModelAggregate,
  type DashboardModelCall,
  type DashboardRun,
  type DashboardRunDetail,
  type DashboardSummary,
} from './read-model.js';

export {
  createDashboardServer,
  startDashboardServer,
  type DashboardServerOptions,
  type StartedDashboardServer,
} from './server.js';

export interface WebFoundationInfo {
  readonly name: 'freehighlander-web';
  readonly mode: 'read-only-dashboard';
  readonly managementMode: 'client-only-management';
  readonly executionOwnership: 'control-plane';
  readonly mutationAuthority: 'none';
  readonly v3Authority: 'SHADOW_ONLY';
}

export function getWebFoundationInfo(): WebFoundationInfo {
  return {
    name: 'freehighlander-web',
    mode: 'read-only-dashboard',
    managementMode: 'client-only-management',
    executionOwnership: 'control-plane',
    mutationAuthority: 'none',
    v3Authority: 'SHADOW_ONLY',
  };
}
