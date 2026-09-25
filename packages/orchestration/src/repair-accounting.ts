export interface RepairBudgetPolicy {
  readonly maxSemanticRepairs: number;
  readonly maxTransportRetries: number;
}

export interface RepairAccountingStateV1 {
  readonly schemaVersion: 1;
  readonly maxSemanticRepairs: number;
  readonly maxTransportRetries: number;
  readonly semanticRepairs: number;
  readonly transportRetries: number;
  readonly lastAcceptedRepairRevision: string | null;
  readonly exhausted: boolean;
  readonly authority: 'NONE';
}

export type RepairEvent =
  | {
      readonly kind: 'TRANSPORT_FAILURE';
    }
  | {
      readonly kind: 'SEMANTIC_REPAIR_ACCEPTED';
      readonly repairedRevision: string;
      readonly artifactCurrent: boolean;
      readonly reviewScopeMatches: boolean;
    }
  | {
      readonly kind: 'STALE_OR_MISMATCHED_ARTIFACT';
    }
  | {
      readonly kind: 'SUCCESS';
    };

export type RepairNextAction =
  | 'RETRY_TRANSPORT'
  | 'REVIEW_REPAIRED_REVISION'
  | 'IGNORE_STALE'
  | 'COMPLETE'
  | 'HUMAN_REQUIRED'
  | 'OPERATOR_REQUIRED';

export interface RepairAccountingDecision {
  readonly state: RepairAccountingStateV1;
  readonly nextAction: RepairNextAction;
  readonly semanticBudgetConsumed: boolean;
  readonly reason: string;
  readonly authority: 'NONE';
}

const REVISION_PATTERN = /^[a-f0-9]{40,64}$/;

export function createRepairAccountingState(
  policy: RepairBudgetPolicy,
): RepairAccountingStateV1 {
  validatePolicy(policy);
  return {
    schemaVersion: 1,
    maxSemanticRepairs: policy.maxSemanticRepairs,
    maxTransportRetries: policy.maxTransportRetries,
    semanticRepairs: 0,
    transportRetries: 0,
    lastAcceptedRepairRevision: null,
    exhausted: false,
    authority: 'NONE',
  };
}

export function applyRepairEvent(
  state: RepairAccountingStateV1,
  event: RepairEvent,
): RepairAccountingDecision {
  validateRepairAccountingState(state);

  if (event.kind === 'TRANSPORT_FAILURE') {
    const transportRetries = state.transportRetries + 1;
    const nextState = {
      ...state,
      transportRetries,
    };
    if (transportRetries > state.maxTransportRetries) {
      return {
        state: nextState,
        nextAction: 'OPERATOR_REQUIRED',
        semanticBudgetConsumed: false,
        reason: 'transport retry budget exhausted without consuming semantic repair budget',
        authority: 'NONE',
      };
    }
    return {
      state: nextState,
      nextAction: 'RETRY_TRANSPORT',
      semanticBudgetConsumed: false,
      reason: 'transport/provider failure may retry without semantic repair accounting',
      authority: 'NONE',
    };
  }

  if (event.kind === 'STALE_OR_MISMATCHED_ARTIFACT') {
    return {
      state,
      nextAction: 'IGNORE_STALE',
      semanticBudgetConsumed: false,
      reason: 'stale or mismatched evidence cannot advance semantic repair state',
      authority: 'NONE',
    };
  }

  if (event.kind === 'SUCCESS') {
    return {
      state,
      nextAction: 'COMPLETE',
      semanticBudgetConsumed: false,
      reason: 'successful review completes repair accounting',
      authority: 'NONE',
    };
  }

  requireRevision(event.repairedRevision);
  if (!event.artifactCurrent || !event.reviewScopeMatches) {
    return {
      state,
      nextAction: 'IGNORE_STALE',
      semanticBudgetConsumed: false,
      reason: 'semantic repair evidence is stale or bound to another review scope',
      authority: 'NONE',
    };
  }
  if (state.lastAcceptedRepairRevision === event.repairedRevision) {
    return {
      state,
      nextAction: 'IGNORE_STALE',
      semanticBudgetConsumed: false,
      reason: 'the same repaired revision cannot consume semantic budget twice',
      authority: 'NONE',
    };
  }

  if (state.semanticRepairs >= state.maxSemanticRepairs) {
    return {
      state,
      nextAction: 'HUMAN_REQUIRED',
      semanticBudgetConsumed: false,
      reason: 'semantic repair budget is exhausted before another repaired revision',
      authority: 'NONE',
    };
  }

  const semanticRepairs = state.semanticRepairs + 1;
  const exhausted = semanticRepairs >= state.maxSemanticRepairs;
  const nextState: RepairAccountingStateV1 = {
    ...state,
    semanticRepairs,
    lastAcceptedRepairRevision: event.repairedRevision,
    exhausted,
  };

  return {
    state: nextState,
    nextAction: 'REVIEW_REPAIRED_REVISION',
    semanticBudgetConsumed: true,
    reason: exhausted
      ? 'current repaired revision consumed the final allowed semantic repair round'
      : 'current new repaired revision consumed one semantic repair round',
    authority: 'NONE',
  };
}

export function validateRepairAccountingState(state: RepairAccountingStateV1): void {
  if (state.schemaVersion !== 1) throw new Error('repair accounting schemaVersion must be 1');
  if (state.authority !== 'NONE') throw new Error('repair accounting authority must be NONE');
  validatePolicy(state);

  requireNonNegativeInteger(state.semanticRepairs, 'semanticRepairs');
  requireNonNegativeInteger(state.transportRetries, 'transportRetries');
  if (state.semanticRepairs > state.maxSemanticRepairs) {
    throw new Error('semanticRepairs cannot exceed maxSemanticRepairs');
  }
  if (state.lastAcceptedRepairRevision !== null) {
    requireRevision(state.lastAcceptedRepairRevision);
    if (state.semanticRepairs === 0) {
      throw new Error('lastAcceptedRepairRevision requires a semantic repair');
    }
  }
  if (state.semanticRepairs > 0 && state.lastAcceptedRepairRevision === null) {
    throw new Error('semantic repair state requires lastAcceptedRepairRevision');
  }
  if (state.exhausted !== (state.semanticRepairs >= state.maxSemanticRepairs)) {
    throw new Error('repair accounting exhausted flag is inconsistent');
  }
}

export function transportFailureConsumesSemanticRepairBudget(): false {
  return false;
}

export function staleArtifactCanAdvanceRepairRound(): false {
  return false;
}

export function repairAccountingCanGrantAuthority(): false {
  return false;
}

function validatePolicy(policy: RepairBudgetPolicy): void {
  if (!Number.isInteger(policy.maxSemanticRepairs) || policy.maxSemanticRepairs < 1) {
    throw new Error('maxSemanticRepairs must be an integer >= 1');
  }
  requireNonNegativeInteger(policy.maxTransportRetries, 'maxTransportRetries');
}

function requireRevision(value: string): void {
  if (!REVISION_PATTERN.test(value)) {
    throw new Error('repairedRevision must be a Git revision hash');
  }
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(name + ' must be a non-negative integer');
  }
}
