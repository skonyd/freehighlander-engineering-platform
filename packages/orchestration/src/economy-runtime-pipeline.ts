import {
  buildDeterministicContextReductionPlan,
  type ContextReductionPlan,
  type ContextReductionPlanItemInput,
} from './context-reduction-plan.js';
import {
  evaluateLocalOptimizerPass,
  type LocalOptimizerBindingEvidence,
  type LocalOptimizerDecision,
  type LocalOptimizerPassObservation,
  type LocalOptimizerPolicy,
} from './local-context-optimizer.js';
import {
  assertProtectedContextAnchors,
  verifyProtectedContextAnchors,
  type ProtectedAnchorVerification,
  type ProtectedContextAnchor,
} from './protected-anchor-verifier.js';
import {
  selectJitRepositoryContext,
  type JitRepositoryContextSelection,
  type RepositoryMapV1,
} from './repository-map.js';
import {
  buildEconomyLedger,
  evaluateRemoteCallNecessity,
  type EconomyLedger,
  type RemoteCallNecessityDecision,
  type RemoteCallNecessityInput,
} from './token-economy.js';
import {
  activateToolSchemas,
  buildLazyToolExposurePlan,
  type LazyToolExposurePlan,
  type ToolSchemaActivationResult,
  type ToolSchemaDescriptor,
} from './tool-catalog-economy.js';

export type TokenEconomyPipelineStatus =
  | 'READY_FOR_REMOTE'
  | 'REMOTE_SKIPPED'
  | 'DEFERRED_FOR_LOCAL_BATCH'
  | 'BLOCKED_INVALID_PACKET';

export type TokenEconomyPipelineStage =
  | 'DETERMINISTIC_REDUCTION'
  | 'REPOSITORY_JIT'
  | 'LAZY_TOOL_SCHEMA'
  | 'LOCAL_OPTIMIZER'
  | 'PROTECTED_ANCHOR_VERIFY'
  | 'REMOTE_NECESSITY'
  | 'ECONOMY_LEDGER';

export interface TokenEconomyRemoteNecessityInput
  extends Omit<RemoteCallNecessityInput, 'mode'> {}

export interface StandardRuntimePipelineInput {
  readonly mode: 'STANDARD';
  readonly candidateRemoteInputTokens: number;
  readonly remoteOutputTokens: number;
  readonly cachedInputTokens: number;
  readonly remoteNecessity: TokenEconomyRemoteNecessityInput;
}

export interface EconomyRepositorySelectionInput {
  readonly map: RepositoryMapV1;
  readonly query: string;
  readonly changedPaths: readonly string[];
  readonly requiredPaths: readonly string[];
  readonly targetTokens: number;
}

export interface EconomyToolSelectionInput {
  readonly tools: readonly ToolSchemaDescriptor[];
  readonly query: string;
  readonly maxActivated: number;
}

export interface EconomyProtectedContextInput {
  readonly sourceText: string;
  readonly optimizedText: string;
  readonly anchors: readonly ProtectedContextAnchor[];
}

export interface EconomyLocalOptimizerInput {
  readonly binding: LocalOptimizerBindingEvidence;
  readonly policy: LocalOptimizerPolicy;
  readonly observation: LocalOptimizerPassObservation;
}

export interface TokenEconomyRuntimePipelineInput {
  readonly mode: 'TOKEN_ECONOMY';
  readonly candidateRemoteInputTokens: number;
  readonly contextItems: readonly ContextReductionPlanItemInput[];
  readonly repository: EconomyRepositorySelectionInput;
  readonly toolSelection: EconomyToolSelectionInput;
  readonly protectedContext: EconomyProtectedContextInput;
  readonly remoteNecessity: TokenEconomyRemoteNecessityInput;
  readonly localOptimizer?: EconomyLocalOptimizerInput;
  readonly artifactizationTokens: number;
  readonly nodeResultReuseTokens: number;
  readonly remoteOutputTokens: number;
  readonly cachedInputTokens: number;
  readonly priorRemoteCallsAvoided: number;
  readonly priorLocalOnlyCalls: number;
  readonly extraLocalDurationMs: number;
}

export type IntegratedEconomyRuntimeInput =
  | StandardRuntimePipelineInput
  | TokenEconomyRuntimePipelineInput;

export interface IntegratedEconomyRuntimePlan {
  readonly schemaVersion: 1;
  readonly mode: IntegratedEconomyRuntimeInput['mode'];
  readonly status: TokenEconomyPipelineStatus;
  readonly stageOrder: readonly TokenEconomyPipelineStage[];
  readonly optimizationApplied: boolean;
  readonly reductionPlan?: ContextReductionPlan;
  readonly repositorySelection?: JitRepositoryContextSelection;
  readonly toolExposurePlan?: LazyToolExposurePlan;
  readonly toolActivation?: ToolSchemaActivationResult;
  readonly optimizerDecision?: LocalOptimizerDecision;
  readonly protectedAnchorVerification?: ProtectedAnchorVerification;
  readonly remoteCallDecision: RemoteCallNecessityDecision;
  readonly remoteInvocationAllowed: boolean;
  readonly ledger: EconomyLedger;
  readonly authority: 'NONE';
}

const ECONOMY_STAGE_ORDER = [
  'DETERMINISTIC_REDUCTION',
  'REPOSITORY_JIT',
  'LAZY_TOOL_SCHEMA',
  'LOCAL_OPTIMIZER',
  'PROTECTED_ANCHOR_VERIFY',
  'REMOTE_NECESSITY',
  'ECONOMY_LEDGER',
] as const satisfies readonly TokenEconomyPipelineStage[];

export function buildIntegratedEconomyRuntimePlan(
  input: IntegratedEconomyRuntimeInput,
): IntegratedEconomyRuntimePlan {
  validateNonNegativeInteger(input.candidateRemoteInputTokens, 'candidateRemoteInputTokens');
  validateNonNegativeInteger(input.remoteOutputTokens, 'remoteOutputTokens');
  validateNonNegativeInteger(input.cachedInputTokens, 'cachedInputTokens');

  if (input.mode === 'STANDARD') {
    const remoteCallDecision = evaluateRemoteCallNecessity({
      mode: 'STANDARD',
      ...input.remoteNecessity,
    });
    const ledger = buildEconomyLedger({
      candidateRemoteInputTokens: input.candidateRemoteInputTokens,
      reductions: zeroReductions(),
      finalRemoteInputTokens: input.candidateRemoteInputTokens,
      remoteOutputTokens: input.remoteOutputTokens,
      cachedInputTokens: input.cachedInputTokens,
      remoteCallsAvoided: 0,
      localOnlyCalls: 0,
      extraLocalDurationMs: 0,
    });

    return {
      schemaVersion: 1,
      mode: 'STANDARD',
      status: 'READY_FOR_REMOTE',
      stageOrder: [],
      optimizationApplied: false,
      remoteCallDecision,
      remoteInvocationAllowed: true,
      ledger,
      authority: 'NONE',
    };
  }

  const reductionPlan = buildDeterministicContextReductionPlan(input.contextItems);
  const repositorySelection = selectJitRepositoryContext(input.repository);
  const toolExposurePlan = buildLazyToolExposurePlan(input.toolSelection.tools);
  const toolActivation = activateToolSchemas(
    input.toolSelection.tools,
    toolExposurePlan,
    input.toolSelection.query,
    input.toolSelection.maxActivated,
  );

  const optimizerDecision =
    input.localOptimizer === undefined
      ? undefined
      : evaluateLocalOptimizerPass(
          input.localOptimizer.binding,
          input.localOptimizer.policy,
          input.localOptimizer.observation,
        );

  const effectiveOptimizedText =
    optimizerDecision?.nextAction === 'FALLBACK_UNCOMPRESSED'
      ? input.protectedContext.sourceText
      : input.protectedContext.optimizedText;
  const protectedAnchorVerification = verifyProtectedContextAnchors({
    sourceText: input.protectedContext.sourceText,
    optimizedText: effectiveOptimizedText,
    anchors: input.protectedContext.anchors,
  });

  const remoteCallDecision = evaluateRemoteCallNecessity({
    mode: 'TOKEN_ECONOMY',
    ...input.remoteNecessity,
  });

  const status = resolvePipelineStatus(remoteCallDecision, protectedAnchorVerification);
  if (status === 'READY_FOR_REMOTE') {
    assertProtectedContextAnchors(protectedAnchorVerification);
  }

  const exactDedupeTokens = sumPlanTokens(reductionPlan, 'DROP_EXACT_DUPLICATE');
  const staleSupersededTokens = sumPlanTokens(reductionPlan, 'DROP_STALE');
  const repositoryTokens = input.repository.map.entries.reduce(
    (total, entry) => total + entry.estimatedTokens,
    0,
  );
  const repoMapJitTokens = Math.max(0, repositoryTokens - repositorySelection.estimatedTokens);
  const lazyToolSchemaTokens = Math.max(
    0,
    toolExposurePlan.totalCatalogSchemaTokens - toolActivation.estimatedActivatedSchemaTokens,
  );
  const localCompressionTokens =
    optimizerDecision !== undefined &&
    optimizerDecision.nextAction !== 'FALLBACK_UNCOMPRESSED' &&
    protectedAnchorVerification.status === 'PASS'
      ? optimizerDecision.incrementalSavingTokens
      : 0;

  validateNonNegativeInteger(input.artifactizationTokens, 'artifactizationTokens');
  validateNonNegativeInteger(input.nodeResultReuseTokens, 'nodeResultReuseTokens');
  validateNonNegativeInteger(input.priorRemoteCallsAvoided, 'priorRemoteCallsAvoided');
  validateNonNegativeInteger(input.priorLocalOnlyCalls, 'priorLocalOnlyCalls');
  validateNonNegativeInteger(input.extraLocalDurationMs, 'extraLocalDurationMs');

  const reductions = {
    exactDedupeTokens,
    staleSupersededTokens,
    artifactizationTokens: input.artifactizationTokens,
    repoMapJitTokens,
    lazyToolSchemaTokens,
    localCompressionTokens,
    nodeResultReuseTokens: input.nodeResultReuseTokens,
  };
  const totalReducedTokens = Object.values(reductions).reduce((total, value) => total + value, 0);
  const finalRemoteInputTokens = input.candidateRemoteInputTokens - totalReducedTokens;
  if (finalRemoteInputTokens < 0) {
    throw new Error('integrated economy reductions exceed candidate remote input tokens');
  }

  const remoteCallsAvoided =
    input.priorRemoteCallsAvoided + (remoteCallDecision.status === 'SKIP_REMOTE' ? 1 : 0);
  const localOnlyCalls =
    input.priorLocalOnlyCalls +
    (remoteCallDecision.reason === 'ELIGIBLE_LOCAL_RESULT_AVAILABLE' ? 1 : 0);

  const ledger = buildEconomyLedger({
    candidateRemoteInputTokens: input.candidateRemoteInputTokens,
    reductions,
    finalRemoteInputTokens,
    remoteOutputTokens: input.remoteOutputTokens,
    cachedInputTokens: Math.min(input.cachedInputTokens, finalRemoteInputTokens),
    remoteCallsAvoided,
    localOnlyCalls,
    extraLocalDurationMs: input.extraLocalDurationMs,
  });

  return {
    schemaVersion: 1,
    mode: 'TOKEN_ECONOMY',
    status,
    stageOrder: ECONOMY_STAGE_ORDER,
    optimizationApplied: true,
    reductionPlan,
    repositorySelection,
    toolExposurePlan,
    toolActivation,
    ...(optimizerDecision === undefined ? {} : { optimizerDecision }),
    protectedAnchorVerification,
    remoteCallDecision,
    remoteInvocationAllowed:
      status === 'READY_FOR_REMOTE' && protectedAnchorVerification.remoteInvocationAllowed,
    ledger,
    authority: 'NONE',
  };
}

export function integratedEconomyRuntimeCanGrantAuthority(): false {
  return false;
}

export function economyPipelineCanInvokeRemoteWithInvalidProtectedAnchors(): false {
  return false;
}

export function economyPipelineUsesLossyOptimizationBeforeDeterministicStages(): false {
  return false;
}

function resolvePipelineStatus(
  decision: RemoteCallNecessityDecision,
  anchors: ProtectedAnchorVerification,
): TokenEconomyPipelineStatus {
  if (decision.status === 'SKIP_REMOTE') return 'REMOTE_SKIPPED';
  if (decision.status === 'DEFER_FOR_LOCAL_BATCH') return 'DEFERRED_FOR_LOCAL_BATCH';
  if (anchors.status !== 'PASS') return 'BLOCKED_INVALID_PACKET';
  return 'READY_FOR_REMOTE';
}

function sumPlanTokens(
  plan: ContextReductionPlan,
  action: ContextReductionPlan['items'][number]['action'],
): number {
  return plan.items
    .filter((item) => item.action === action)
    .reduce((total, item) => total + item.estimatedTokens, 0);
}

function zeroReductions() {
  return {
    exactDedupeTokens: 0,
    staleSupersededTokens: 0,
    artifactizationTokens: 0,
    repoMapJitTokens: 0,
    lazyToolSchemaTokens: 0,
    localCompressionTokens: 0,
    nodeResultReuseTokens: 0,
  };
}

function validateNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}
