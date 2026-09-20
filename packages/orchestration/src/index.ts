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
