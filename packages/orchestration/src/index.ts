export {
  buildParallelBenchmarkReport,
  parallelBenchmarkCanGrantAuthority,
  representativeParallelBenchmarkFixtures,
  type BenchmarkRiskTier,
  type ParallelBenchmarkReportV1,
  type ParallelBenchmarkSampleInput,
  type ParallelBenchmarkSampleResult,
} from './parallel-benchmark.js';

export {
  applyRepairEvent,
  createRepairAccountingState,
  repairAccountingCanGrantAuthority,
  staleArtifactCanAdvanceRepairRound,
  transportFailureConsumesSemanticRepairBudget,
  validateRepairAccountingState,
  type RepairAccountingDecision,
  type RepairAccountingStateV1,
  type RepairBudgetPolicy,
  type RepairEvent,
  type RepairNextAction,
} from './repair-accounting.js';

export {
  buildCausalRunSummary,
  causalTracingCanGrantAuthority,
  causalTracingCanPersistHiddenReasoning,
  createCausalSpan,
  type CausalRunSummary,
  type CausalSpan,
  type CausalSpanInput,
  type CausalSpanKind,
  type CausalSpanStatus,
} from './causal-trace.js';

export {
  buildProjectSchedulePlan,
  createHumanDecisionQueueEntry,
  createHumanDecisionResponseV1,
  evaluateHumanDecisionResume,
  humanDecisionResponseCanGrantAuthority,
  modelCanResolveHumanDecision,
  modelCanSubmitHumanDecisionResponse,
  parkedHumanRequiredCancelsProject,
  schedulerCanGrantAuthority,
  unknownConflictCanRun,
  validateHumanDecisionQueueEntry,
  validateHumanDecisionResponseV1,
  type HumanDecisionCurrentness,
  type HumanDecisionQueueEntry,
  type HumanDecisionQueueEntryInput,
  type HumanDecisionResponseInput,
  type HumanDecisionResponseV1,
  type HumanDecisionResumeContext,
  type HumanDecisionResumeDecision,
  type HumanDecisionResumeStatus,
  type ProjectConflictClassification,
  type ProjectSchedulePlan,
  type ProjectWorkItem,
  type ProjectWorkItemDisposition,
  type ProjectWorkItemState,
  type WorkspaceIsolationState,
} from './project-scheduler.js';

export {
  acquirePortableOwnershipLease,
  portableMachineInstanceIdCanGrantOwnership,
  portableOwnershipCanGrantAuthority,
  portableOwnershipCanTakeOverActiveLease,
  portableOwnershipLeaseIsActive,
  releasePortableOwnershipLease,
  renewPortableOwnershipLease,
  validatePortableOwnershipLease,
  type AcquirePortableOwnershipDecision,
  type AcquirePortableOwnershipRequest,
  type PortableOwnershipLeaseState,
  type PortableOwnershipLeaseV1,
} from './portable-ownership.js';

export {
  buildCanonicalExecutionScope,
  buildNodeExecutionIdentity,
  createNodeResultV1,
  evaluateMandatoryJoin,
  evaluateNodeResultReuse,
  nodeResultReuseCanGrantAuthority,
  semanticNegativeCanTriggerModelShopping,
  validateNodeResultV1,
  type CanonicalExecutionScope,
  type CanonicalExecutionScopeInput,
  type MandatoryJoinRequirement,
  type MandatoryJoinResult,
  type NodeExecutionIdentity,
  type NodeExecutionIdentityInput,
  type NodeResultStatus,
  type NodeResultV1,
  type NodeResultV1Input,
  type NodeReuseContext,
  type NodeReuseDecision,
  type NodeReuseStatus,
} from './node-result.js';

export {
  buildRecoveryCheckpoint,
  buildReplayManifest,
  nextReplaySequence,
  replayOrSimulationCanGrantAuthority,
  replayStep,
  validateRecoveryCheckpoint,
  validateReplayContext,
  type RecordedNodeOutcome,
  type RecoveryCheckpoint,
  type RecoveryCheckpointInput,
  type ReplayContext,
  type ReplayManifest,
  type ReplayManifestInput,
  type ReplayMode,
  type ReplayStepResult,
  type ReplayValidation,
} from './replay-engine.js';

export {
  createFullAutoReviewCouncil,
  createFullAutoReviewSession,
  evaluateFullAutoReviewCouncil,
  fullAutoBoundedDisagreementCanGrantAuthority,
  fullAutoNonApproveConsensusCanMerge,
  recordFullAutoReviewerOpinion,
  type FullAutoCouncilOutcome,
  type FullAutoCouncilStatus,
  type FullAutoReviewCouncil,
  type FullAutoReviewCouncilInput,
  type FullAutoReviewerOpinionInput,
  type FullAutoReviewerParticipant,
  type FullAutoReviewSession,
  type FullAutoReviewVerdict,
} from './full-auto-disagreement.js';

export {
  buildFullAutoQuorumArtifact,
  fullAutoQuorumCanGrantAuthority,
  fullAutoQuorumIsMergeEvidenceComplete,
  validateFullAutoQuorumArtifact,
  type FullAutoQuorumArtifact,
  type FullAutoQuorumInput,
  type FullAutoQuorumScope,
  type FullAutoQuorumStatus,
  type FullAutoReviewerEvidence,
  type FullAutoReviewerVerdict,
} from './full-auto-quorum.js';

export {
  buildDebateSnapshot,
  createDebateSession,
  debateConfigurationCanGrantAuthority,
  debateConsensusCanGrantAuthority,
  evaluateDebate,
  publishDebate,
  recordDebateOpinion,
  validateDebateDefinition,
  type DebateDefinition,
  type DebateOpinion,
  type DebateOutcome,
  type DebateOutcomeStatus,
  type DebateParticipant,
  type DebateSession,
  type DebateSnapshot,
  type PublishedDebate,
} from './debate-engine.js';

export {
  buildRunSnapshot,
  createInitialNodeStates,
  propagateWorkflowStates,
  publishWorkflow,
  transitionNodeState,
  validateWorkflow,
  workflowConfigurationCanGrantAuthority,
  type PublishedWorkflow,
  type RunSnapshot,
  type RunSnapshotInput,
  type WorkflowDefinition,
  type WorkflowDefinitionNode,
  type WorkflowEdge,
  type WorkflowNodeKind,
  type WorkflowNodeState,
} from './workflow-engine.js';

export {
  buildContextPacket,
  buildContractFingerprint,
  buildSemanticReuseKey,
  sha256Text,
  tokenOptimizationCanChangeAuthority,
  trimStaleContextItems,
  type ContextItemKind,
  type ContextPacket,
  type ContextPacketItemInput,
  type ContextPacketManifestItem,
  type ContractFingerprintInput,
  type SemanticReuseKeyInput,
} from './context-packet.js';

export {
  buildDeterministicContextReductionPlan,
  deterministicReductionPlanCanDropProtectedEvidence,
  deterministicReductionPlanCanGrantAuthority,
  validateDeterministicContextReductionPlan,
  type ContextReductionAction,
  type ContextReductionPlan,
  type ContextReductionPlanItem,
  type ContextReductionPlanItemInput,
} from './context-reduction-plan.js';

export {
  assertProtectedContextAnchors,
  protectedAnchorVerifierCanGrantAuthority,
  tokenEconomyCanInvokeRemoteWithMissingProtectedAnchor,
  validateProtectedAnchorVerification,
  verifyProtectedContextAnchors,
  type ProtectedAnchorCheck,
  type ProtectedAnchorVerification,
  type ProtectedAnchorVerificationInput,
  type ProtectedAnchorVerificationStatus,
  type ProtectedContextAnchor,
} from './protected-anchor-verifier.js';

export {
  evaluateLocalOptimizerPass,
  localOptimizerCanDropRequiredEvidenceForTarget,
  localOptimizerCanGrantAuthority,
  localOptimizerCanRunRemoteBinding,
  type LocalOptimizerBindingEvidence,
  type LocalOptimizerDecision,
  type LocalOptimizerNextAction,
  type LocalOptimizerPassObservation,
  type LocalOptimizerPolicy,
  type LocalOptimizerStopReason,
} from './local-context-optimizer.js';

export {
  buildRepositoryMap,
  jitSelectionCanDropRequiredPathsForBudget,
  repositoryMapCanGrantAuthority,
  selectJitRepositoryContext,
  validateRepositoryMap,
  type JitRepositoryContextInput,
  type JitRepositoryContextSelection,
  type RepositoryMapEntry,
  type RepositoryMapEntryInput,
  type RepositoryMapV1,
} from './repository-map.js';

export {
  buildFreshContextReset,
  createSemanticCheckpoint,
  freshContextResetCarriesPreviousTrajectory,
  semanticCheckpointCanGrantAuthority,
  semanticCheckpointCanReplaceRequiredRawEvidence,
  validateSemanticCheckpoint,
  type FreshContextReset,
  type FreshContextResetInput,
  type SemanticCheckpoint,
  type SemanticCheckpointBoundary,
  type SemanticCheckpointInput,
} from './semantic-checkpoint.js';

export {
  activateToolSchemas,
  buildLazyToolExposurePlan,
  lazyToolSchemaLoadingCanGrantAuthority,
  lazyToolSchemaLoadingCanHideRequiredCoreTools,
  type LazyToolExposurePlan,
  type ToolCatalogEconomyProfile,
  type ToolSchemaActivationResult,
  type ToolSchemaDescriptor,
} from './tool-catalog-economy.js';

export {
  buildEconomyLedger,
  economyLedgerCanGrantAuthority,
  evaluateRemoteCallNecessity,
  tokenEconomyCanEscalateSemanticNegativeForShopping,
  tokenEconomyCanSuppressPolicyRequiredRemoteCall,
  type EconomyLedger,
  type EconomyLedgerInput,
  type EconomyLedgerReduction,
  type EconomyMode,
  type RemoteCallDecisionReason,
  type RemoteCallDecisionStatus,
  type RemoteCallNecessityDecision,
  type RemoteCallNecessityInput,
} from './token-economy.js';

export {
  buildIntegratedEconomyRuntimePlan,
  economyPipelineCanInvokeRemoteWithInvalidProtectedAnchors,
  economyPipelineUsesLossyOptimizationBeforeDeterministicStages,
  integratedEconomyRuntimeCanGrantAuthority,
  type EconomyLocalOptimizerInput,
  type EconomyProtectedContextInput,
  type EconomyRepositorySelectionInput,
  type EconomyToolSelectionInput,
  type IntegratedEconomyRuntimeInput,
  type IntegratedEconomyRuntimePlan,
  type StandardRuntimePipelineInput,
  type TokenEconomyPipelineStage,
  type TokenEconomyPipelineStatus,
  type TokenEconomyRemoteNecessityInput,
  type TokenEconomyRuntimePipelineInput,
} from './economy-runtime-pipeline.js';

export {
  contextEconomyCanDropRequiredEvidence,
  contextEconomyCanGrantAuthority,
  contextOptimizerCanReclassifyProtectedDownward,
  evaluateContextReduction,
  type ContextCompressionClass,
  type ContextLifecycleState,
  type ContextProtectionInput,
  type ContextReductionDecision,
} from './context-economy.js';

export {
  buildStablePrompt,
  type PromptAssembly,
  type PromptCacheHint,
  type PromptSection,
  type StablePromptInput,
} from './prompt-layout.js';

export type RunStatus =
  'PENDING' | 'RUNNING' | 'WAITING' | 'PASSED' | 'FAILED' | 'BLOCKED' | 'HUMAN_REQUIRED';

export interface WorkflowNode {
  readonly id: string;
  readonly kind:
    | 'MODEL'
    | 'COMMAND'
    | 'GATE'
    | 'CONDITION'
    | 'PARALLEL'
    | 'AGGREGATE'
    | 'DEBATE'
    | 'LOOP'
    | 'HUMAN'
    | 'SUBWORKFLOW';
  readonly maxIterations?: number;
}

export interface WorkflowSnapshot {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
  readonly nodes: readonly WorkflowNode[];
}

export function validateBoundedExecution(snapshot: WorkflowSnapshot): readonly string[] {
  const errors: string[] = [];

  for (const node of snapshot.nodes) {
    const missingBound = node.kind === 'LOOP' && node.maxIterations === undefined;
    const invalidBound = node.kind === 'LOOP' && (node.maxIterations ?? 0) < 1;

    if (missingBound || invalidBound) {
      errors.push(`LOOP node ${node.id} must define maxIterations >= 1`);
    }
  }

  return errors;
}
