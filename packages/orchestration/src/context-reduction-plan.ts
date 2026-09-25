import { createHash } from 'node:crypto';

import {
  evaluateContextReduction,
  type ContextCompressionClass,
  type ContextLifecycleState,
} from './context-economy.js';

export type ContextReductionAction =
  | 'KEEP'
  | 'DROP_EXACT_DUPLICATE'
  | 'DROP_STALE'
  | 'LOSSLESS_TRANSFORM'
  | 'EXTRACT'
  | 'SEMANTIC_CANDIDATE';

export interface ContextReductionPlanItemInput {
  readonly id: string;
  readonly contentHash: string;
  readonly estimatedTokens: number;
  readonly compressionClass: ContextCompressionClass;
  readonly lifecycleState: ContextLifecycleState;
  readonly requiredByGate?: boolean;
}

export interface ContextReductionPlanItem extends ContextReductionPlanItemInput {
  readonly action: ContextReductionAction;
  readonly duplicateOf?: string;
  readonly authority: 'NONE';
}

export interface ContextReductionPlan {
  readonly schemaVersion: 1;
  readonly items: readonly ContextReductionPlanItem[];
  readonly candidateTokens: number;
  readonly protectedTokens: number;
  readonly plannedDroppableTokens: number;
  readonly planHash: string;
  readonly authority: 'NONE';
}

export function buildDeterministicContextReductionPlan(
  inputs: readonly ContextReductionPlanItemInput[],
): ContextReductionPlan {
  const normalized = inputs
    .map(normalizeInput)
    .sort((left, right) => left.id.localeCompare(right.id));
  assertUniqueIds(normalized);

  const keeperByHash = selectDuplicateKeepers(normalized);
  const items = normalized.map((input) => {
    const decision = evaluateContextReduction(input);
    const duplicateOf = keeperByHash.get(input.contentHash);

    if (
      duplicateOf !== undefined &&
      duplicateOf !== input.id &&
      decision.mayLosslesslyTransform &&
      input.requiredByGate !== true
    ) {
      return {
        ...input,
        action: 'DROP_EXACT_DUPLICATE',
        duplicateOf,
        authority: 'NONE',
      } satisfies ContextReductionPlanItem;
    }

    if (decision.mayDrop) {
      return {
        ...input,
        action: 'DROP_STALE',
        authority: 'NONE',
      } satisfies ContextReductionPlanItem;
    }

    if (!decision.mayLosslesslyTransform) {
      return {
        ...input,
        action: 'KEEP',
        authority: 'NONE',
      } satisfies ContextReductionPlanItem;
    }

    if (decision.maySemanticallyCompress) {
      return {
        ...input,
        action: 'SEMANTIC_CANDIDATE',
        authority: 'NONE',
      } satisfies ContextReductionPlanItem;
    }

    if (decision.mayExtract) {
      return {
        ...input,
        action: 'EXTRACT',
        authority: 'NONE',
      } satisfies ContextReductionPlanItem;
    }

    return {
      ...input,
      action: 'LOSSLESS_TRANSFORM',
      authority: 'NONE',
    } satisfies ContextReductionPlanItem;
  });

  const candidateTokens = items.reduce((total, item) => total + item.estimatedTokens, 0);
  const protectedTokens = items
    .filter((item) => item.compressionClass === 'PROTECTED' || item.requiredByGate === true)
    .reduce((total, item) => total + item.estimatedTokens, 0);
  const plannedDroppableTokens = items
    .filter((item) => item.action === 'DROP_EXACT_DUPLICATE' || item.action === 'DROP_STALE')
    .reduce((total, item) => total + item.estimatedTokens, 0);

  const identity = {
    schemaVersion: 1,
    items,
    candidateTokens,
    protectedTokens,
    plannedDroppableTokens,
  } as const;

  return {
    ...identity,
    planHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function validateDeterministicContextReductionPlan(plan: ContextReductionPlan): void {
  if (plan.schemaVersion !== 1) {
    throw new Error('context reduction plan schemaVersion must be 1');
  }
  if (plan.authority !== 'NONE') {
    throw new Error('context reduction plan authority must be NONE');
  }

  const rebuilt = buildDeterministicContextReductionPlan(
    plan.items.map((item) => ({
      id: item.id,
      contentHash: item.contentHash,
      estimatedTokens: item.estimatedTokens,
      compressionClass: item.compressionClass,
      lifecycleState: item.lifecycleState,
      ...(item.requiredByGate === undefined ? {} : { requiredByGate: item.requiredByGate }),
    })),
  );

  if (rebuilt.planHash !== plan.planHash) {
    throw new Error('context reduction plan hash mismatch');
  }
  if (
    rebuilt.candidateTokens !== plan.candidateTokens ||
    rebuilt.protectedTokens !== plan.protectedTokens ||
    rebuilt.plannedDroppableTokens !== plan.plannedDroppableTokens
  ) {
    throw new Error('context reduction plan token accounting mismatch');
  }
  if (canonicalJson(rebuilt.items) !== canonicalJson(plan.items)) {
    throw new Error('context reduction plan item decision mismatch');
  }
}

export function deterministicReductionPlanCanGrantAuthority(): false {
  return false;
}

export function deterministicReductionPlanCanDropProtectedEvidence(): false {
  return false;
}

function selectDuplicateKeepers(
  inputs: readonly ContextReductionPlanItemInput[],
): ReadonlyMap<string, string> {
  const grouped = new Map<string, ContextReductionPlanItemInput[]>();

  for (const input of inputs) {
    const group = grouped.get(input.contentHash) ?? [];
    group.push(input);
    grouped.set(input.contentHash, group);
  }

  const keepers = new Map<string, string>();
  for (const [contentHash, group] of grouped) {
    const protectedItem = group.find(
      (item) =>
        item.requiredByGate === true ||
        item.compressionClass === 'PROTECTED' ||
        item.lifecycleState === 'PROTECTED',
    );
    keepers.set(contentHash, (protectedItem ?? group[0])!.id);
  }

  return keepers;
}

function normalizeInput(input: ContextReductionPlanItemInput): ContextReductionPlanItemInput {
  const id = input.id.trim();
  if (!id || id.length > 200) {
    throw new Error('context reduction item id must contain 1..200 characters');
  }
  if (!/^[a-f0-9]{64}$/.test(input.contentHash)) {
    throw new Error(`context reduction item ${id} contentHash must be lowercase sha256`);
  }
  if (!Number.isInteger(input.estimatedTokens) || input.estimatedTokens < 0) {
    throw new Error(`context reduction item ${id} estimatedTokens must be a non-negative integer`);
  }

  return {
    id,
    contentHash: input.contentHash,
    estimatedTokens: input.estimatedTokens,
    compressionClass: input.compressionClass,
    lifecycleState: input.lifecycleState,
    ...(input.requiredByGate === undefined ? {} : { requiredByGate: input.requiredByGate }),
  };
}

function assertUniqueIds(inputs: readonly ContextReductionPlanItemInput[]): void {
  const seen = new Set<string>();
  for (const input of inputs) {
    if (seen.has(input.id)) {
      throw new Error(`duplicate context reduction item id: ${input.id}`);
    }
    seen.add(input.id);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
