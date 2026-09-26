export {
  createFhKuikaStudioWorkflowDraftV1,
  fhKuikaWorkflowStudioDraftCanGrantAuthority,
  fhKuikaWorkflowStudioDraftCanInvokeModel,
  fhKuikaWorkflowStudioDraftCanMutateRuntime,
  fhKuikaWorkflowStudioDraftCanPublish,
  parseFhKuikaStudioWorkflowDraftV1,
  roundTripFhKuikaStudioWorkflowDraftV1,
  serializeFhKuikaStudioWorkflowDraftV1,
  validateFhKuikaStudioWorkflowDefinitionV1,
  type FhKuikaStudioWorkflowDefinitionV1,
  type FhKuikaStudioWorkflowDraftV1,
  type FhKuikaStudioWorkflowEdgeV1,
  type FhKuikaStudioWorkflowNodeKind,
  type FhKuikaStudioWorkflowNodeV1,
} from './kuika-workflow-studio-draft.js';

export {
  aggregateFhKuikaBlueprintUsageV1,
  fhKuikaBlueprintMetricsCanGrantAuthority,
  fhKuikaBlueprintMetricsCanInvokeModel,
  fhKuikaBlueprintMetricsCanMutateRuntime,
  measureFhKuikaBlueprintCatalogV1,
  type FhKuikaBlueprintCatalogQualityV1,
  type FhKuikaBlueprintUsageAction,
  type FhKuikaBlueprintUsageByBlueprintV1,
  type FhKuikaBlueprintUsageEventV1,
  type FhKuikaBlueprintUsageSummaryV1,
} from './kuika-blueprint-metrics.js';

export {
  fhKuikaBlueprintCatalogUiCanGrantAuthority,
  fhKuikaBlueprintCatalogUiCanInvokeModel,
  fhKuikaBlueprintCatalogUiCanMutateRuntime,
  renderFhKuikaBlueprintCatalogHtml,
  renderFhKuikaBlueprintDetailHtml,
} from './kuika-blueprint-ui.js';

export {
  createFhKuikaWorkflowDraftV1,
  fhKuikaBlueprintWorkflowDraftCanGrantAuthority,
  fhKuikaBlueprintWorkflowDraftCanInvokeModel,
  fhKuikaBlueprintWorkflowDraftCanMutateRuntime,
  simulateFhKuikaBlueprintDraftV1,
  type CreateFhKuikaWorkflowDraftInputV1,
  type FhKuikaBlueprintSimulationResultV1,
  type FhKuikaWorkflowDraftEdgeV1,
  type FhKuikaWorkflowDraftNodeV1,
  type FhKuikaWorkflowDraftSpecV1,
  type FhKuikaWorkflowDraftV1,
  type FhKuikaWorkflowNodeKind,
} from './kuika-blueprint-workflow.js';

export {
  fhKuikaAreaPageCanGrantAuthority,
  fhKuikaAreaPageCanInvokeModel,
  fhKuikaAreaPageCanMutateRuntime,
  isFhKuikaPreparationArea,
  renderFhKuikaAreaHtml,
} from './kuika-area-ui.js';

export {
  fhKuikaNavigationCanGrantAuthority,
  fhKuikaNavigationCanInvokeModel,
  fhKuikaNavigationCanMutateRuntime,
  getFhKuikaNavigationItem,
  listFhKuikaNavigation,
  type FhKuikaArea,
  type FhKuikaNavigationItem,
} from './kuika-navigation.js';

export {
  curatedBlueprintPackCanGrantAuthority,
  getFhKuikaCuratedBlueprintV1,
  getFhKuikaCuratedBlueprintsV1,
} from './kuika-blueprint-catalog.js';

export {
  GithubExternalStatusProvider,
  createGithubExternalStatusProviderFromEnv,
  externalStatusCanGrantAuthority,
  externalStatusCanInvokeModel,
  type ExternalCiState,
  type ExternalCiStatusV1,
  type ExternalPullRequestStatusV1,
  type ExternalStatusContext,
  type ExternalStatusProvider,
  type ExternalStatusSnapshotV1,
  type ExternalStatusState,
  type GithubExternalStatusProviderOptions,
} from './external-status.js';

export {
  blueprintMatcherCanGrantAuthority,
  blueprintMatcherCanLowerRisk,
  matchFhKuikaBlueprintsV1,
  type FhKuikaBlueprintMatchCandidateV1,
  type FhKuikaBlueprintMatchEvidenceV1,
  type FhKuikaBlueprintMatchRequestV1,
} from './kuika-blueprint-matcher.js';

export {
  blueprintPublicationCanGrantAuthority,
  blueprintSuggestionCanModifyPublishedBlueprint,
  publishFhKuikaBlueprintV1,
  validateFhKuikaBlueprintDraftV1,
  type FhKuikaBlueprintDraftV1,
  type FhKuikaBlueprintIndependenceV1,
  type FhKuikaBlueprintIntent,
  type FhKuikaBlueprintParameterV1,
  type FhKuikaBlueprintRiskTier,
  type FhKuikaBlueprintSimulationFixtureV1,
  type FhKuikaPublishedBlueprintV1,
} from './kuika-blueprint.js';

export {
  getFhKuikaWorkbenchModeView,
  listFhKuikaWorkbenchModes,
  workbenchModeSelectionCanGrantAuthority,
  workbenchModeSelectionCanInvokeModel,
  type FhKuikaWorkbenchMode,
  type FhKuikaWorkbenchModeView,
} from './kuika-workbench.js';

export { FH_KUIKA_WORKBENCH_HTML } from './kuika-workbench-ui.js';

export {
  buildFhKuikaRunDetailV1,
  fhKuikaRunDetailCanExposeRawPayload,
  fhKuikaRunDetailCanGrantAuthority,
  fhKuikaRunDetailCanInvokeModel,
  fhKuikaRunDetailCanMutateRuntime,
  type FhKuikaRunDetailReadSource,
  type FhKuikaRunDetailV1,
  type FhKuikaRunEvidenceV1,
  type FhKuikaRunModelCallV1,
  type FhKuikaRunTimelineItemV1,
  type FhKuikaRunTimelineKind,
} from './kuika-run-detail.js';

export { FH_KUIKA_OPERATIONS_HTML } from './kuika-operations-ui.js';

export { FH_KUIKA_MODULE_HTML } from './kuika-module-ui.js';

export {
  coreHomeSnapshotCanGrantAuthority,
  coreHomeSnapshotCanMutateState,
  createCoreHomeSnapshotV1,
  dashboardRefreshCanInvokeModel,
  type CoreHomeAttentionItemV1,
  type CoreHomeAttentionKind,
  type CoreHomeAttentionSeverity,
  type CoreHomeAttentionSummaryView,
  type CoreHomeAuthoritySummaryView,
  type CoreHomeBindingState,
  type CoreHomeContinuitySummaryView,
  type CoreHomeCurrentWorkView,
  type CoreHomeEconomyRoleEligibilityView,
  type CoreHomeEconomyView,
  type CoreHomeFindingSummaryView,
  type CoreHomeFreshness,
  type CoreHomeProjectContextView,
  type CoreHomeRecentRunView,
  type CoreHomeRoleBindingHealthView,
  type CoreHomeSnapshotInput,
  type CoreHomeSnapshotV1,
  type CoreHomeSystemHealthView,
  type CoreHomeSystemState,
  type CoreHomeUsageWindowKind,
  type CoreHomeUsageWindowView,
  type CoreHomeWorkState,
} from './home.js';

export {
  DEFAULT_CORE_HOME_UI_PREFERENCES,
  coreHomeAttentionSeverityVisible,
  coreHomeTimestampInWindow,
  coreHomeUiPreferencesCanGrantAuthority,
  coreHomeUiPreferencesCanInvokeModel,
  parseCoreHomeUiPreferences,
  serializeCoreHomeUiPreferences,
  type CoreHomeAttentionFilter,
  type CoreHomeTimeWindow,
  type CoreHomeUiPreferencesV1,
} from './home-preferences.js';

export {
  buildOperationsConsoleSnapshot,
  operationsConsoleCanExposeRawCause,
  operationsConsoleCanGrantAuthority,
  operationsConsoleCanInvokeModel,
  type OperationsConsoleErrorView,
  type OperationsConsoleOptions,
  type OperationsConsoleReadSource,
  type OperationsConsoleRoleUsageView,
  type OperationsConsoleRoutingView,
  type OperationsConsoleSnapshotV1,
} from './operations-console.js';

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
  type DashboardHomeOptions,
  type DashboardArtifact,
  type DashboardEvent,
  type DashboardModelAggregate,
  type DashboardModelCall,
  type DashboardRun,
  projectDashboardRuntimeErrors,
  type DashboardRunDetail,
  type DashboardRuntimeError,
  type DashboardSummary,
  type DashboardUsageWindowOptions,
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
