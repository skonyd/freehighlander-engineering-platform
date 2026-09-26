export {
  buildFhKuikaWorkflowSimulationPreviewV1,
  buildFhKuikaWorkflowValidationViewV1,
  createFhKuikaWorkflowNodeInspectorV1,
  workflowInspectorAnnotationsCanGrantAuthority,
  workflowSimulationPreviewCanExecute,
  workflowValidationViewCanPublishDirectly,
  type FhKuikaWorkflowInspectorRiskTier,
  type FhKuikaWorkflowNodeInspectorV1,
  type FhKuikaWorkflowSimulationPreviewNodeV1,
  type FhKuikaWorkflowSimulationPreviewV1,
  type FhKuikaWorkflowValidationIssueV1,
  type FhKuikaWorkflowValidationViewV1,
} from './kuika-workflow-studio-view.js';

export {
  FH_KUIKA_CONNECTOR_HUB_HTML,
  connectorHubPageCanActivate,
  connectorHubPageCanGrantAuthority,
  connectorHubPageCanInvokeModel,
} from './kuika-connector-ui.js';

export {
  connectorCatalogCanActivate,
  getFhKuikaConnectorCatalogItemV1,
  listFhKuikaConnectorCatalogV1,
} from './kuika-connector-catalog.js';

export {
  buildFhKuikaWorkflowVersionDiffV1,
  workflowVersionDiffCanGrantAuthority,
  workflowVersionDiffCanPublish,
  type FhKuikaWorkflowNodeChangeV1,
  type FhKuikaWorkflowVersionDiffV1,
} from './kuika-workflow-diff.js';

export {
  simulateFhKuikaWorkflowDraftV1,
  workflowStudioSimulationCanExecute,
  workflowStudioSimulationCanGrantAuthority,
  type FhKuikaWorkflowSimulationStepV1,
  type FhKuikaWorkflowSimulationV1,
} from './kuika-workflow-simulation.js';

export {
  buildFhKuikaConnectorInstallReviewV1,
  connectorInstallReviewCanGrantAuthority,
  connectorInstallReviewCanInstallDirectly,
  connectorInstallReviewCanRevealRawSecrets,
  type FhKuikaConnectorInstallReviewV1,
  type FhKuikaConnectorInstallWarning,
} from './kuika-connector-install-review.js';

export {
  buildFhKuikaMcpRegistryViewV1,
  mcpDiscoveryCanEnableConnector,
  mcpDiscoveryMetadataCanGrantAuthority,
  mcpSelfReportedReadOnlyHintsAreTrusted,
  normalizeFhKuikaMcpDiscoveryV1,
  type FhKuikaMcpNormalizedDiscoveryV1,
  type FhKuikaMcpResourceDiscoveryV1,
  type FhKuikaMcpServerDiscoveryV1,
  type FhKuikaMcpToolDiscoveryV1,
} from './kuika-mcp-normalization.js';

export {
  buildFhKuikaConnectorRegistryViewV1,
  connectorCatalogCacheCanBypassPermissionRevalidation,
  connectorExternalMetadataCanGrantAuthority,
  connectorRegistryCanGrantAuthority,
  createFhKuikaConnectorRegistryEntryV1,
  diffFhKuikaConnectorPermissionsV1,
  type FhKuikaConnectorCapabilityV1,
  type FhKuikaConnectorDataClassification,
  type FhKuikaConnectorPermissionDiffV1,
  type FhKuikaConnectorProtocol,
  type FhKuikaConnectorRegistryEntryV1,
  type FhKuikaConnectorRegistryViewV1,
  type FhKuikaConnectorTrustLevel,
} from './kuika-connector-registry.js';

export {
  createFhKuikaReviewRequestV1,
  fhKuikaReviewRequestCanAuthorizeExecution,
  fhKuikaReviewRequestCanGrantAuthority,
  validateFhKuikaReviewRequestV1,
  type FhKuikaReviewEvidenceRefV1,
  type FhKuikaReviewRequestV1,
  type FhKuikaReviewRequestValidationV1,
} from './kuika-review-request.js';

export {
  createFhKuikaPlanCandidateV1,
  fhKuikaPlanCandidateCanAuthorizeExecution,
  fhKuikaPlanCandidateCanGrantAuthority,
  validateFhKuikaPlanCandidateV1,
  type FhKuikaPlanAcceptanceCriterionV1,
  type FhKuikaPlanBlockerV1,
  type FhKuikaPlanBlueprintSuggestionV1,
  type FhKuikaPlanCandidateStatus,
  type FhKuikaPlanCandidateV1,
  type FhKuikaPlanCandidateValidationV1,
  type FhKuikaPlanWorkItemV1,
} from './kuika-plan-candidate.js';

export { FH_KUIKA_WORKFLOW_STUDIO_HTML } from './kuika-workflow-ui.js';

export {
  createFhKuikaWorkflowDraftV1,
  parseFhKuikaWorkflowDraftV1,
  serializeFhKuikaWorkflowDraftV1,
  validateFhKuikaWorkflowDraftDefinitionV1,
  workflowStudioDraftCanExecute,
  workflowStudioDraftCanGrantAuthority,
  workflowStudioDraftCanPublishDirectly,
  type FhKuikaCanonicalWorkflowDefinitionV1,
  type FhKuikaCanonicalWorkflowEdgeV1,
  type FhKuikaCanonicalWorkflowNodeV1,
  type FhKuikaWorkflowDraftV1,
  type FhKuikaWorkflowDraftValidationV1,
  type FhKuikaWorkflowValidationCategory,
  type FhKuikaWorkflowValidationIssueV1,
  type FhKuikaWorkflowNodeKind,
  type FhKuikaWorkflowRiskTier,
  type FhKuikaWorkflowApprovalPolicy,
} from './kuika-workflow-draft.js';

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
  blueprintSimulationPreviewCanExecute,
  blueprintWorkflowDraftCanExecute,
  blueprintWorkflowDraftCanGrantAuthority,
  blueprintWorkflowDraftCanPublish,
  createFhKuikaBlueprintWorkflowDraftV1,
  simulateFhKuikaBlueprintV1,
  type FhKuikaBlueprintSimulationFixtureResultV1,
  type FhKuikaBlueprintSimulationPreviewV1,
  type FhKuikaBlueprintWorkflowDraftV1,
} from './kuika-blueprint-draft.js';

export {
  blueprintCatalogViewCanGrantAuthority,
  blueprintCatalogViewCanInvokeModel,
  blueprintCatalogViewCanMutateBlueprint,
  buildFhKuikaBlueprintCatalogViewV1,
  buildFhKuikaBlueprintDetailViewV1,
  type FhKuikaBlueprintCardViewV1,
  type FhKuikaBlueprintCatalogViewV1,
  type FhKuikaBlueprintDetailViewV1,
} from './kuika-blueprint-view.js';

export { FH_KUIKA_BLUEPRINTS_HTML } from './kuika-blueprint-ui.js';

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
  buildFhKuikaWorkbenchSnapshotV1,
  getFhKuikaWorkbenchModeView,
  listFhKuikaWorkbenchModes,
  workbenchModeSelectionCanGrantAuthority,
  workbenchModeSelectionCanInvokeModel,
  workbenchSnapshotCanMutateRuntime,
  type FhKuikaWorkbenchContextChipV1,
  type FhKuikaWorkbenchContextKind,
  type FhKuikaWorkbenchMode,
  type FhKuikaWorkbenchModeView,
  type FhKuikaWorkbenchPreflightV1,
  type FhKuikaWorkbenchSnapshotOptionsV1,
  type FhKuikaWorkbenchSnapshotV1,
} from './kuika-workbench.js';

export { FH_KUIKA_WORKBENCH_HTML } from './kuika-workbench-ui.js';

export {
  createFhKuikaWorkbenchIntentV1,
  workbenchIntentPreparationCanGrantAuthority,
  workbenchIntentPreparationCanInvokeModel,
  type FhKuikaWorkbenchIntentContextV1,
  type FhKuikaWorkbenchIntentDisposition,
  type FhKuikaWorkbenchIntentMode,
  type FhKuikaWorkbenchIntentV1,
} from './kuika-workbench-intent.js';

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

export {
  buildFhKuikaApprovalInboxV1,
  fhKuikaApprovalInboxCanApproveDirectly,
  fhKuikaApprovalInboxCanGrantAuthority,
  fhKuikaApprovalInboxCanInvokeModel,
  fhKuikaApprovalInboxCanMutateRuntime,
  type FhKuikaApprovalBindingState,
  type FhKuikaApprovalCurrentness,
  type FhKuikaApprovalInboxItemV1,
  type FhKuikaApprovalInboxReadSource,
  type FhKuikaApprovalInboxV1,
} from './kuika-approval-inbox.js';

export { FH_KUIKA_APPROVALS_HTML } from './kuika-approval-ui.js';

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
