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
  readonly executionOwnership: 'control-plane';
  readonly mutationAuthority: 'none';
}

export function getWebFoundationInfo(): WebFoundationInfo {
  return {
    name: 'freehighlander-web',
    mode: 'read-only-dashboard',
    executionOwnership: 'control-plane',
    mutationAuthority: 'none',
  };
}
