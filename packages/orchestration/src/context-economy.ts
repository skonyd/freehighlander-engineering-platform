export type ContextCompressionClass = 'PROTECTED' | 'LOSSLESS' | 'EXTRACTIVE' | 'SEMANTIC_ALLOWED';

export type ContextLifecycleState =
  'ACTIVE' | 'SUPERSEDED' | 'EXPIRED' | 'ARTIFACT_ONLY' | 'PROTECTED';

export interface ContextProtectionInput {
  readonly id: string;
  readonly compressionClass: ContextCompressionClass;
  readonly lifecycleState: ContextLifecycleState;
  readonly requiredByGate?: boolean;
}

export interface ContextReductionDecision {
  readonly id: string;
  readonly compressionClass: ContextCompressionClass;
  readonly lifecycleState: ContextLifecycleState;
  readonly mayDrop: boolean;
  readonly mayLosslesslyTransform: boolean;
  readonly mayExtract: boolean;
  readonly maySemanticallyCompress: boolean;
  readonly reason:
    | 'REQUIRED_BY_GATE'
    | 'PROTECTED_CLASS'
    | 'PROTECTED_LIFECYCLE'
    | 'LOSSLESS_ONLY'
    | 'EXTRACTIVE_ALLOWED'
    | 'SEMANTIC_ALLOWED';
  readonly authority: 'NONE';
}

export function evaluateContextReduction(input: ContextProtectionInput): ContextReductionDecision {
  const id = normalizeId(input.id);

  if (input.requiredByGate === true) {
    if (input.compressionClass !== 'PROTECTED') {
      throw new Error('requiredByGate context must be classified PROTECTED');
    }
    return protectedDecision(id, input, 'REQUIRED_BY_GATE');
  }

  if (input.compressionClass === 'PROTECTED') {
    return protectedDecision(id, input, 'PROTECTED_CLASS');
  }

  if (input.lifecycleState === 'PROTECTED') {
    return protectedDecision(id, input, 'PROTECTED_LIFECYCLE');
  }

  if (input.compressionClass === 'LOSSLESS') {
    return {
      id,
      compressionClass: input.compressionClass,
      lifecycleState: input.lifecycleState,
      mayDrop: false,
      mayLosslesslyTransform: true,
      mayExtract: false,
      maySemanticallyCompress: false,
      reason: 'LOSSLESS_ONLY',
      authority: 'NONE',
    };
  }

  if (input.compressionClass === 'EXTRACTIVE') {
    return {
      id,
      compressionClass: input.compressionClass,
      lifecycleState: input.lifecycleState,
      mayDrop: input.lifecycleState === 'SUPERSEDED' || input.lifecycleState === 'EXPIRED',
      mayLosslesslyTransform: true,
      mayExtract: true,
      maySemanticallyCompress: false,
      reason: 'EXTRACTIVE_ALLOWED',
      authority: 'NONE',
    };
  }

  return {
    id,
    compressionClass: input.compressionClass,
    lifecycleState: input.lifecycleState,
    mayDrop: input.lifecycleState === 'SUPERSEDED' || input.lifecycleState === 'EXPIRED',
    mayLosslesslyTransform: true,
    mayExtract: true,
    maySemanticallyCompress: true,
    reason: 'SEMANTIC_ALLOWED',
    authority: 'NONE',
  };
}

export function contextOptimizerCanReclassifyProtectedDownward(): false {
  return false;
}

export function contextEconomyCanDropRequiredEvidence(): false {
  return false;
}

export function contextEconomyCanGrantAuthority(): false {
  return false;
}

function protectedDecision(
  id: string,
  input: ContextProtectionInput,
  reason: 'REQUIRED_BY_GATE' | 'PROTECTED_CLASS' | 'PROTECTED_LIFECYCLE',
): ContextReductionDecision {
  return {
    id,
    compressionClass: input.compressionClass,
    lifecycleState: input.lifecycleState,
    mayDrop: false,
    mayLosslesslyTransform: false,
    mayExtract: false,
    maySemanticallyCompress: false,
    reason,
    authority: 'NONE',
  };
}

function normalizeId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new Error('context protection id must contain 1..200 characters');
  }
  return normalized;
}
