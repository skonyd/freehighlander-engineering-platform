import type { AuthorityCapabilityId } from '@freehighlander/contracts';

import { buildPlanningSnapshot, type EngineeringPlan, validateEngineeringPlan } from './index.js';

export type PlanningTransitionKind = 'SET_STATUS' | 'SUPERSEDE';
export type PlanningExecutionIntentKind = 'IMPLEMENT' | 'RELEASE' | 'OPERATE' | 'REMEDIATE';

export interface PlanningAuthoritativeStateV1 {
  readonly schemaVersion: 1;
  readonly generation: number;
  readonly plan: EngineeringPlan;
  readonly planHash: string;
  readonly authority: 'NONE';
}

export interface PlanningTransitionRequestV1 {
  readonly schemaVersion: 1;
  readonly expectedGeneration: number;
  readonly expectedPlanHash: string;
  readonly kind: PlanningTransitionKind;
  readonly nextStatus?: 'DRAFT' | 'READY' | 'BLOCKED';
  readonly blockers?: EngineeringPlan['blockers'];
  readonly supersededByRevision?: number;
}

export interface PlanningTransitionResultV1 {
  readonly schemaVersion: 1;
  readonly status: 'APPLIED' | 'CONFLICT' | 'BLOCKED';
  readonly reasons: readonly string[];
  readonly state: PlanningAuthoritativeStateV1;
  readonly authority: 'NONE';
}

export interface PlanningExecutionIntentRequestV1 {
  readonly schemaVersion: 1;
  readonly expectedGeneration: number;
  readonly expectedPlanHash: string;
  readonly workItemId: string;
  readonly kind: PlanningExecutionIntentKind;
}

export interface PlanningExecutionIntentV1 {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly planRevision: number;
  readonly planHash: string;
  readonly workItemId: string;
  readonly repository: string;
  readonly baseRevision: string;
  readonly kind: PlanningExecutionIntentKind;
  readonly requiredCapability: AuthorityCapabilityId | null;
  readonly authority: 'NONE';
  readonly executionAuthorized: false;
}

const CAPABILITY_BY_INTENT: Readonly<
  Record<PlanningExecutionIntentKind, AuthorityCapabilityId | null>
> = {
  IMPLEMENT: 'GIT_WRITE',
  RELEASE: 'RELEASE_DEPLOY',
  OPERATE: 'INFRASTRUCTURE_MUTATION',
  REMEDIATE: 'AUTOMATIC_REMEDIATION',
};

export async function createPlanningAuthoritativeStateV1(
  plan: EngineeringPlan,
): Promise<PlanningAuthoritativeStateV1> {
  const snapshot = await buildPlanningSnapshot(plan);
  return {
    schemaVersion: 1,
    generation: 0,
    plan,
    planHash: snapshot.planHash,
    authority: 'NONE',
  };
}

export async function applyPlanningTransitionV1(
  state: PlanningAuthoritativeStateV1,
  request: PlanningTransitionRequestV1,
): Promise<PlanningTransitionResultV1> {
  validateState(state);
  validateTransitionRequest(request);

  const conflictReasons = currentnessReasons(state, request);
  if (conflictReasons.length > 0) {
    return transitionResult('CONFLICT', conflictReasons, state);
  }

  let nextPlan: EngineeringPlan;
  if (request.kind === 'SUPERSEDE') {
    if (
      request.supersededByRevision === undefined ||
      !Number.isInteger(request.supersededByRevision) ||
      request.supersededByRevision <= state.plan.revision
    ) {
      return transitionResult(
        'BLOCKED',
        ['supersededByRevision must be an integer greater than the current plan revision'],
        state,
      );
    }
    nextPlan = {
      ...state.plan,
      revision: request.supersededByRevision,
      status: 'SUPERSEDED',
      supersedes: {
        planId: state.plan.id,
        revision: state.plan.revision,
      },
    };
  } else {
    if (request.nextStatus === undefined) {
      return transitionResult('BLOCKED', ['SET_STATUS requires nextStatus'], state);
    }
    nextPlan = {
      ...state.plan,
      status: request.nextStatus,
      blockers: request.blockers ?? state.plan.blockers,
    };
  }

  const validation = validateEngineeringPlan(nextPlan);
  if (!validation.valid) {
    return transitionResult('BLOCKED', validation.errors, state);
  }

  const snapshot = await buildPlanningSnapshot(nextPlan);
  return transitionResult('APPLIED', [], {
    schemaVersion: 1,
    generation: state.generation + 1,
    plan: nextPlan,
    planHash: snapshot.planHash,
    authority: 'NONE',
  });
}

export function createPlanningExecutionIntentV1(
  state: PlanningAuthoritativeStateV1,
  request: PlanningExecutionIntentRequestV1,
): PlanningExecutionIntentV1 {
  validateState(state);
  validateExecutionIntentRequest(request);

  const reasons = currentnessReasons(state, request);
  if (reasons.length > 0) throw new Error(reasons.join('; '));
  if (state.plan.status !== 'READY') {
    throw new Error('execution intent requires a READY plan');
  }

  const workItem = state.plan.workItems.find((item) => item.id === request.workItemId);
  if (!workItem) throw new Error('execution intent references unknown work item');

  return {
    schemaVersion: 1,
    planId: state.plan.id,
    planRevision: state.plan.revision,
    planHash: state.planHash,
    workItemId: workItem.id,
    repository: state.plan.repository,
    baseRevision: state.plan.baseRevision,
    kind: request.kind,
    requiredCapability: CAPABILITY_BY_INTENT[request.kind],
    authority: 'NONE',
    executionAuthorized: false,
  };
}

export function planningTransitionCanGrantAuthority(): false {
  return false;
}

export function planningExecutionIntentCanBypassCapabilityGate(): false {
  return false;
}

function validateState(state: PlanningAuthoritativeStateV1): void {
  if (state.schemaVersion !== 1 || state.authority !== 'NONE') {
    throw new Error('invalid planning authoritative state envelope');
  }
  if (!Number.isInteger(state.generation) || state.generation < 0) {
    throw new Error('planning state generation must be a non-negative integer');
  }
  if (!/^[a-f0-9]{64}$/.test(state.planHash)) {
    throw new Error('planning state planHash must be lowercase sha256');
  }
  const validation = validateEngineeringPlan(state.plan);
  if (!validation.valid) {
    throw new Error('planning state contains invalid engineering plan');
  }
}

function validateTransitionRequest(request: PlanningTransitionRequestV1): void {
  if (request.schemaVersion !== 1) throw new Error('transition schemaVersion must be 1');
  if (request.kind !== 'SET_STATUS' && request.kind !== 'SUPERSEDE') {
    throw new Error('unsupported planning transition kind');
  }
  validateExpectedBinding(request.expectedGeneration, request.expectedPlanHash);
}

function validateExecutionIntentRequest(request: PlanningExecutionIntentRequestV1): void {
  if (request.schemaVersion !== 1) throw new Error('execution intent schemaVersion must be 1');
  if (!Object.hasOwn(CAPABILITY_BY_INTENT, request.kind)) {
    throw new Error('unsupported planning execution intent kind');
  }
  if (!request.workItemId.trim()) throw new Error('workItemId is required');
  validateExpectedBinding(request.expectedGeneration, request.expectedPlanHash);
}

function validateExpectedBinding(generation: number, planHash: string): void {
  if (!Number.isInteger(generation) || generation < 0) {
    throw new Error('expectedGeneration must be a non-negative integer');
  }
  if (!/^[a-f0-9]{64}$/.test(planHash)) {
    throw new Error('expectedPlanHash must be lowercase sha256');
  }
}

function currentnessReasons(
  state: PlanningAuthoritativeStateV1,
  request: { readonly expectedGeneration: number; readonly expectedPlanHash: string },
): readonly string[] {
  const reasons: string[] = [];
  if (request.expectedGeneration !== state.generation) {
    reasons.push('planning state generation is stale');
  }
  if (request.expectedPlanHash !== state.planHash) {
    reasons.push('planning planHash is stale');
  }
  return reasons;
}

function transitionResult(
  status: PlanningTransitionResultV1['status'],
  reasons: readonly string[],
  state: PlanningAuthoritativeStateV1,
): PlanningTransitionResultV1 {
  return {
    schemaVersion: 1,
    status,
    reasons,
    state,
    authority: 'NONE',
  };
}
