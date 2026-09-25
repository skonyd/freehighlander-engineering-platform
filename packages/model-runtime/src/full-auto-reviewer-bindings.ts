import { createHash } from 'node:crypto';

import { validateBindingPlan, type BindingPlan } from './binding-registry.js';

export interface FullAutoReviewerBindingSnapshotInput {
  readonly reviewerA: BindingPlan;
  readonly reviewerB: BindingPlan;
  readonly producerIndependenceGroup: string;
}

export interface FullAutoReviewerBindingSnapshot {
  readonly schemaVersion: 1;
  readonly reviewerARole: string;
  readonly reviewerBRole: string;
  readonly reviewerAPlanHash: string;
  readonly reviewerBPlanHash: string;
  readonly reviewerAIndependenceGroups: readonly string[];
  readonly reviewerBIndependenceGroups: readonly string[];
  readonly producerIndependenceGroup: string;
  readonly riskTier: BindingPlan['riskTier'];
  readonly snapshotHash: string;
  readonly authority: 'NONE';
}

export function buildFullAutoReviewerBindingSnapshot(
  input: FullAutoReviewerBindingSnapshotInput,
): FullAutoReviewerBindingSnapshot {
  validateBindingPlan(input.reviewerA);
  validateBindingPlan(input.reviewerB);
  const producerIndependenceGroup = requireText(
    input.producerIndependenceGroup,
    'producerIndependenceGroup',
  );

  if (input.reviewerA.logicalRole === input.reviewerB.logicalRole) {
    throw new Error('Full Auto reviewers require distinct logical roles');
  }
  if (input.reviewerA.riskTier !== input.reviewerB.riskTier) {
    throw new Error('Full Auto reviewer binding plans must use the same risk tier');
  }

  const reviewerAIndependenceGroups = uniqueSorted(
    input.reviewerA.bindings.map((binding) => binding.independenceGroup),
  );
  const reviewerBIndependenceGroups = uniqueSorted(
    input.reviewerB.bindings.map((binding) => binding.independenceGroup),
  );

  if (reviewerAIndependenceGroups.includes(producerIndependenceGroup)) {
    throw new Error('Full Auto reviewer A fallback plan conflicts with producer independence');
  }
  if (reviewerBIndependenceGroups.includes(producerIndependenceGroup)) {
    throw new Error('Full Auto reviewer B fallback plan conflicts with producer independence');
  }

  const overlap = reviewerAIndependenceGroups.find((group) =>
    reviewerBIndependenceGroups.includes(group),
  );
  if (overlap !== undefined) {
    throw new Error(
      `Full Auto reviewer fallback independence is not preserved for group ${overlap}`,
    );
  }

  const identity = {
    schemaVersion: 1,
    reviewerARole: input.reviewerA.logicalRole,
    reviewerBRole: input.reviewerB.logicalRole,
    reviewerAPlanHash: input.reviewerA.hash,
    reviewerBPlanHash: input.reviewerB.hash,
    reviewerAIndependenceGroups,
    reviewerBIndependenceGroups,
    producerIndependenceGroup,
    riskTier: input.reviewerA.riskTier,
  } as const;

  return {
    ...identity,
    snapshotHash: sha256Canonical(identity),
    authority: 'NONE',
  };
}

export function validateFullAutoReviewerBindingSnapshot(
  snapshot: FullAutoReviewerBindingSnapshot,
  input: FullAutoReviewerBindingSnapshotInput,
): void {
  const rebuilt = buildFullAutoReviewerBindingSnapshot(input);

  if (snapshot.schemaVersion !== 1) {
    throw new Error('Full Auto reviewer binding snapshot schemaVersion must be 1');
  }
  if (snapshot.authority !== 'NONE') {
    throw new Error('Full Auto reviewer binding snapshot authority must be NONE');
  }
  if (canonicalJson(snapshotIdentity(snapshot)) !== canonicalJson(snapshotIdentity(rebuilt))) {
    throw new Error('Full Auto reviewer binding snapshot identity mismatch');
  }
  if (snapshot.snapshotHash !== rebuilt.snapshotHash) {
    throw new Error('Full Auto reviewer binding snapshot hash mismatch');
  }
}

export function fullAutoReviewerBindingSnapshotCanGrantAuthority(): false {
  return false;
}

export function fullAutoReviewerFallbackMayBreakIndependence(): false {
  return false;
}

function snapshotIdentity(snapshot: FullAutoReviewerBindingSnapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    reviewerARole: snapshot.reviewerARole,
    reviewerBRole: snapshot.reviewerBRole,
    reviewerAPlanHash: snapshot.reviewerAPlanHash,
    reviewerBPlanHash: snapshot.reviewerBPlanHash,
    reviewerAIndependenceGroups: snapshot.reviewerAIndependenceGroups,
    reviewerBIndependenceGroups: snapshot.reviewerBIndependenceGroups,
    producerIndependenceGroup: snapshot.producerIndependenceGroup,
    riskTier: snapshot.riskTier,
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => requireText(value, 'independenceGroup')))].sort();
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
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
