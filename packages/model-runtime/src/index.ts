export {
  createEmptyModelManagementStateV1,
  modelManagementStateCanContainSecretValues,
  modelManagementStateCanGrantAuthority,
  validateManagedProviderConfigV1,
  validateModelManagementStateV1,
  type ManagedCredentialReferenceV1,
  type ManagedProviderConfigV1,
  type ManagedProviderKind,
  type ModelManagementStateV1,
} from './model-management-state.js';

export {
  GeminiProviderAdapter,
  GeminiProviderInvocationError,
  type GeminiProviderOptions,
  type GeminiThinkingProfile,
} from './gemini.js';

export {
  canonicalEffortChoices,
  effortNormalizationCanGrantAuthority,
  normalizeEffortValue,
  resolveProviderEffort,
  type CanonicalEffort,
  type ProviderEffortResolution,
  type ProviderEffortResolutionOptions,
} from './effort-normalization.js';

export {
  buildFullAutoReviewerBindingSnapshot,
  fullAutoReviewerBindingSnapshotCanGrantAuthority,
  fullAutoReviewerFallbackMayBreakIndependence,
  validateFullAutoReviewerBindingSnapshot,
  type FullAutoReviewerBindingSnapshot,
  type FullAutoReviewerBindingSnapshotInput,
} from './full-auto-reviewer-bindings.js';

export {
  RoleBindingManagementService,
  roleBindingManagementCanGrantAuthority,
  validateRoleBindingPublicationV1,
  type RoleBindingManagementAuditEvent,
  type RoleBindingManagementAuditSink,
  type RoleBindingPreviewInput,
  type RoleBindingPublicationV1,
} from './role-binding-management.js';

export {
  ModelCatalogManagementService,
  modelCatalogManagementCanGrantAuthority,
  modelCatalogManagementCanRewriteBindings,
  type ModelCatalogManagementAuditEvent,
  type ModelCatalogManagementAuditSink,
  type ModelCatalogRefreshResult,
} from './model-catalog-management.js';

export {
  createDiscoveredQualification,
  grantModelEligibility,
  markQualificationDeprecated,
  markQualificationUnavailable,
  modelQualificationCanGrantAuthority,
  qualificationAllowsBinding,
  recordCapabilityProbe,
  recordRegressionVerification,
  recordShadowVerification,
  validateModelQualificationSnapshotV1,
  type CapabilityProbeEvidence,
  type EligibilityGrant,
  type ModelQualificationIdentity,
  type ModelQualificationSnapshotV1,
  type ModelQualificationStage,
  type QualificationRiskTier,
  type RegressionVerificationEvidence,
  type ShadowVerificationEvidence,
} from './model-qualification.js';

export {
  checkCatalogBinding,
  modelCatalogCanGrantAuthority,
  modelCatalogRefreshCanRewriteBindings,
  reconcileModelCatalog,
  refreshModelCatalogFromProvider,
  validateModelCatalogSnapshotV1,
  type ModelCatalogAvailability,
  type ModelCatalogBindingCheck,
  type ModelCatalogLocality,
  type ModelCatalogRecordInput,
  type ModelCatalogRecordV1,
  type ModelCatalogReconcileInput,
  type ModelCatalogSnapshotV1,
  type ModelCatalogSource,
} from './model-catalog.js';

export {
  BindingRegistry,
  ProviderRegistry,
  bindingRegistryCanGrantAuthority,
  resolveBindingPlan,
  selectBinding,
  validateBindingPlan,
  type BindingPlan,
  type BindingPlanRequest,
  type BindingRiskTier,
  type BindingSelection,
  type ModelBindingDefinition,
  type ProviderRegistration,
  type ResolvedBinding,
} from './binding-registry.js';

export {
  buildProviderHealthSnapshot,
  ProviderCircuitBreaker,
  providerCircuitCanChangeAuthority,
  providerCircuitCanTripOnSemanticFailure,
  type ProviderCircuitBreakerPolicy,
  type ProviderCircuitDecision,
  type ProviderCircuitSnapshot,
  type ProviderCircuitState,
  type ProviderCircuitTransition,
  type ProviderCircuitUpdate,
  type ProviderHealthSnapshot,
} from './circuit-breaker.js';

export { OpenAiCompatibleProviderAdapter, ProviderInvocationError } from './openai-compatible.js';
export {
  measureMonotonicDuration,
  monotonicDurationCanGrantAuthority,
  wallClockCanAffectMonotonicDuration,
  type MonotonicDurationMeasurement,
} from './monotonic-timing.js';
export {
  preflightInputTokenBudget,
  tokenBudgetCanAuthorizeEvidenceRemoval,
  type InputTokenBudget,
  type TokenBudgetPreflight,
  type TokenBudgetStatus,
  type TokenCountSource,
} from './token-budget.js';

export type ProviderCapability =
  | 'streaming'
  | 'structured_output'
  | 'tool_calling'
  | 'parallel_tool_calls'
  | 'prompt_caching'
  | 'token_counting'
  | 'reasoning_effort'
  | 'output_verbosity'
  | 'cancellation'
  | 'context_compaction'
  | 'usage_token_breakdown';

export type ProviderFailureKind =
  | 'quota_exhausted'
  | 'rate_limited'
  | 'auth_unavailable'
  | 'provider_unavailable'
  | 'transport_failure'
  | 'semantic_failure'
  | 'malformed_output';

export interface ProviderHealth {
  readonly available: boolean;
  readonly detail?: string;
}

export interface ProviderUsage {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly totalTokens?: number;
}

export interface ProviderRequest {
  readonly logicalRole: string;
  readonly input: string;
  readonly model: string;
  readonly effort?: string;
  readonly timeoutMs: number;
}

export interface ProviderResponse {
  readonly output: string;
  readonly model: string;
  readonly usage?: ProviderUsage;
  readonly latencyMs?: number;
}

export interface ProviderModelDiscovery {
  readonly modelId: string;
  readonly displayName?: string;
  readonly capabilities?: readonly ProviderCapability[];
  readonly supportedEfforts?: readonly string[];
  readonly contextWindowTokens?: number;
  readonly maxOutputTokens?: number;
  readonly locality: 'LOCAL' | 'REMOTE';
  readonly availability?: 'AVAILABLE' | 'DEPRECATED';
}

export interface ProviderAdapter {
  readonly id: string;
  capabilities(): ReadonlySet<ProviderCapability>;
  health(): Promise<ProviderHealth>;
  invoke(request: ProviderRequest): Promise<ProviderResponse>;
  listModels?(): Promise<readonly ProviderModelDiscovery[]>;
  countInputTokens?(input: string, model: string): Promise<number>;
  cancel?(requestId: string): Promise<void>;
}

const availabilityFailures = new Set<ProviderFailureKind>([
  'quota_exhausted',
  'rate_limited',
  'auth_unavailable',
  'provider_unavailable',
  'transport_failure',
]);

export function isAvailabilityFailure(kind: ProviderFailureKind): boolean {
  return availabilityFailures.has(kind);
}
