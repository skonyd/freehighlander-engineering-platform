import { createHash } from 'node:crypto';

import type { FullAutoMergeIntentDecision } from './full-auto-policy.js';

export interface FullAutoPreMergeExpectation {
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly headRevision: string;
  readonly baseRevision: string;
  readonly runSnapshotHash: string;
  readonly reviewScopeHash: string;
  readonly policyHash: string;
  readonly quorumHash: string;
  readonly bindingSnapshotHash: string;
  readonly changeBudgetResultHash: string;
  readonly runtimeContainmentHash: string;
}

export interface FullAutoPreMergeObservedState {
  readonly pullRequestOpen: boolean;
  readonly mergeable: boolean;
  readonly headRevision: string;
  readonly baseRevision: string;
  readonly runSnapshotHash: string;
  readonly reviewScopeHash: string;
  readonly policyHash: string;
  readonly quorumHash: string;
  readonly bindingSnapshotHash: string;
  readonly changeBudgetResultHash: string;
  readonly runtimeContainmentHash: string;
  readonly requiredCiCurrent: boolean;
  readonly deterministicGatesPass: boolean;
  readonly newerRunInvalidated: boolean;
}

export interface FullAutoPreMergeRevalidationInput {
  readonly intent: FullAutoMergeIntentDecision;
  readonly expected: FullAutoPreMergeExpectation;
  readonly observed: FullAutoPreMergeObservedState;
}

export type FullAutoPreMergeReason =
  | 'CURRENT'
  | 'INTENT_NOT_READY'
  | 'PR_CLOSED'
  | 'PR_NOT_MERGEABLE'
  | 'HEAD_CHANGED'
  | 'BASE_CHANGED'
  | 'RUN_SNAPSHOT_CHANGED'
  | 'REVIEW_SCOPE_CHANGED'
  | 'POLICY_CHANGED'
  | 'QUORUM_CHANGED'
  | 'BINDING_SNAPSHOT_CHANGED'
  | 'CHANGE_BUDGET_CHANGED'
  | 'RUNTIME_CONTAINMENT_CHANGED'
  | 'CI_NOT_CURRENT'
  | 'DETERMINISTIC_GATE_FAILED'
  | 'NEWER_RUN_INVALIDATED';

export interface FullAutoPreMergeRevalidation {
  readonly schemaVersion: 1;
  readonly status: 'CURRENT' | 'BLOCKED';
  readonly reason: FullAutoPreMergeReason;
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly expectedHeadRevision: string;
  readonly observedHeadRevision: string;
  readonly revalidationHash: string;
  readonly executionAuthorized: false;
  readonly authority: 'SYSTEM_POLICY';
}

export function revalidateFullAutoPreMerge(
  input: FullAutoPreMergeRevalidationInput,
): FullAutoPreMergeRevalidation {
  const expected = normalizeExpectation(input.expected);
  const observed = normalizeObserved(input.observed);
  validateIntentBinding(input.intent, expected);

  const reason = evaluateReason(input.intent, expected, observed);
  const status = reason === 'CURRENT' ? 'CURRENT' : 'BLOCKED';

  const identity = {
    schemaVersion: 1,
    intentDecisionHash: requireSha256(input.intent.decisionHash, 'intent decisionHash'),
    status,
    reason,
    expected,
    observed,
  } as const;

  return {
    schemaVersion: 1,
    status,
    reason,
    repository: expected.repository,
    pullRequestNumber: expected.pullRequestNumber,
    expectedHeadRevision: expected.headRevision,
    observedHeadRevision: observed.headRevision,
    revalidationHash: sha256(canonicalJson(identity)),
    executionAuthorized: false,
    authority: 'SYSTEM_POLICY',
  };
}

export function fullAutoPreMergeRevalidationCanExecuteInShadowMode(): false {
  return false;
}

function evaluateReason(
  intent: FullAutoMergeIntentDecision,
  expected: FullAutoPreMergeExpectation,
  observed: FullAutoPreMergeObservedState,
): FullAutoPreMergeReason {
  if (intent.status !== 'SHADOW_INTENT_READY' || intent.reason !== 'READY') {
    return 'INTENT_NOT_READY';
  }
  if (!observed.pullRequestOpen) return 'PR_CLOSED';
  if (!observed.mergeable) return 'PR_NOT_MERGEABLE';
  if (observed.headRevision !== expected.headRevision) return 'HEAD_CHANGED';
  if (observed.baseRevision !== expected.baseRevision) return 'BASE_CHANGED';
  if (observed.runSnapshotHash !== expected.runSnapshotHash) return 'RUN_SNAPSHOT_CHANGED';
  if (observed.reviewScopeHash !== expected.reviewScopeHash) return 'REVIEW_SCOPE_CHANGED';
  if (observed.policyHash !== expected.policyHash) return 'POLICY_CHANGED';
  if (observed.quorumHash !== expected.quorumHash) return 'QUORUM_CHANGED';
  if (observed.bindingSnapshotHash !== expected.bindingSnapshotHash) {
    return 'BINDING_SNAPSHOT_CHANGED';
  }
  if (observed.changeBudgetResultHash !== expected.changeBudgetResultHash) {
    return 'CHANGE_BUDGET_CHANGED';
  }
  if (observed.runtimeContainmentHash !== expected.runtimeContainmentHash) {
    return 'RUNTIME_CONTAINMENT_CHANGED';
  }
  if (!observed.requiredCiCurrent) return 'CI_NOT_CURRENT';
  if (!observed.deterministicGatesPass) return 'DETERMINISTIC_GATE_FAILED';
  if (observed.newerRunInvalidated) return 'NEWER_RUN_INVALIDATED';
  return 'CURRENT';
}

function validateIntentBinding(
  intent: FullAutoMergeIntentDecision,
  expected: FullAutoPreMergeExpectation,
): void {
  requireSha256(intent.decisionHash, 'intent decisionHash');
  if (intent.executionAuthorized !== false) {
    throw new Error('Full Auto shadow intent cannot carry execution authority');
  }
  if (intent.policyHash !== expected.policyHash) {
    throw new Error('Full Auto intent policy hash does not match pre-merge expectation');
  }
  if (intent.quorumHash !== expected.quorumHash) {
    throw new Error('Full Auto intent quorum hash does not match pre-merge expectation');
  }
  if (intent.runSnapshotHash !== expected.runSnapshotHash) {
    throw new Error('Full Auto intent run snapshot does not match pre-merge expectation');
  }
  if (intent.reviewScopeHash !== expected.reviewScopeHash) {
    throw new Error('Full Auto intent review scope does not match pre-merge expectation');
  }
}

function normalizeExpectation(input: FullAutoPreMergeExpectation): FullAutoPreMergeExpectation {
  return {
    repository: requireText(input.repository, 'repository'),
    pullRequestNumber: requirePositiveInteger(input.pullRequestNumber, 'pullRequestNumber'),
    headRevision: requireText(input.headRevision, 'headRevision'),
    baseRevision: requireText(input.baseRevision, 'baseRevision'),
    runSnapshotHash: requireSha256(input.runSnapshotHash, 'runSnapshotHash'),
    reviewScopeHash: requireSha256(input.reviewScopeHash, 'reviewScopeHash'),
    policyHash: requireSha256(input.policyHash, 'policyHash'),
    quorumHash: requireSha256(input.quorumHash, 'quorumHash'),
    bindingSnapshotHash: requireSha256(input.bindingSnapshotHash, 'bindingSnapshotHash'),
    changeBudgetResultHash: requireSha256(input.changeBudgetResultHash, 'changeBudgetResultHash'),
    runtimeContainmentHash: requireSha256(input.runtimeContainmentHash, 'runtimeContainmentHash'),
  };
}

function normalizeObserved(input: FullAutoPreMergeObservedState): FullAutoPreMergeObservedState {
  return {
    ...input,
    headRevision: requireText(input.headRevision, 'observed headRevision'),
    baseRevision: requireText(input.baseRevision, 'observed baseRevision'),
    runSnapshotHash: requireSha256(input.runSnapshotHash, 'observed runSnapshotHash'),
    reviewScopeHash: requireSha256(input.reviewScopeHash, 'observed reviewScopeHash'),
    policyHash: requireSha256(input.policyHash, 'observed policyHash'),
    quorumHash: requireSha256(input.quorumHash, 'observed quorumHash'),
    bindingSnapshotHash: requireSha256(input.bindingSnapshotHash, 'observed bindingSnapshotHash'),
    changeBudgetResultHash: requireSha256(
      input.changeBudgetResultHash,
      'observed changeBudgetResultHash',
    ),
    runtimeContainmentHash: requireSha256(
      input.runtimeContainmentHash,
      'observed runtimeContainmentHash',
    ),
  };
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireSha256(value: string, field: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${field} must be lowercase sha256`);
  }
  return value;
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
