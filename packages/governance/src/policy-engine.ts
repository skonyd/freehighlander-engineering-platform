import { createHash } from 'node:crypto';

import type { RiskTier } from '@freehighlander/contracts';

export type PolicyPrincipalKind = 'MODEL' | 'HUMAN' | 'SYSTEM';
export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'SECRET';
export type PolicyEffect = 'ALLOW' | 'DENY' | 'HUMAN_REQUIRED';

export interface PolicyRule {
  readonly id: string;
  readonly actions: readonly string[];
  readonly riskTiers?: readonly RiskTier[];
  readonly principalKinds?: readonly PolicyPrincipalKind[];
  readonly dataClassifications?: readonly DataClassification[];
  readonly effect: PolicyEffect;
}

export interface PolicyDefinition {
  readonly id: string;
  readonly version: string;
  readonly rules: readonly PolicyRule[];
}

export interface PublishedPolicy {
  readonly definition: PolicyDefinition;
  readonly policyHash: string;
}

export interface PolicyInput {
  readonly principalKind: PolicyPrincipalKind;
  readonly action: string;
  readonly riskTier: RiskTier;
  readonly dataClassification: DataClassification;
}

export interface PolicyDecision {
  readonly effect: PolicyEffect;
  readonly matchedRuleIds: readonly string[];
  readonly policyHash: string;
  readonly reason: string;
}

export interface HumanApprovalRequestInput {
  readonly policyDecision: PolicyDecision;
  readonly runSnapshotHash: string;
  readonly repository: string;
  readonly revision: string;
  readonly action: string;
  readonly riskTier: RiskTier;
  readonly evidenceHash: string;
}

export interface HumanApprovalRequest extends HumanApprovalRequestInput {
  readonly requestHash: string;
}

export type HumanDecisionValue = 'APPROVE' | 'DENY';

export interface HumanDecision {
  readonly requestHash: string;
  readonly approverId: string;
  readonly decision: HumanDecisionValue;
  readonly decisionHash: string;
}

const precedence: Readonly<Record<PolicyEffect, number>> = {
  ALLOW: 1,
  HUMAN_REQUIRED: 2,
  DENY: 3,
};

export function publishPolicy(definition: PolicyDefinition): PublishedPolicy {
  validatePolicyDefinition(definition);
  const normalized: PolicyDefinition = {
    id: definition.id,
    version: definition.version,
    rules: definition.rules
      .map((rule) => ({
        ...rule,
        actions: [...new Set(rule.actions)].sort(),
        ...(rule.riskTiers ? { riskTiers: [...new Set(rule.riskTiers)].sort() } : {}),
        ...(rule.principalKinds
          ? { principalKinds: [...new Set(rule.principalKinds)].sort() }
          : {}),
        ...(rule.dataClassifications
          ? { dataClassifications: [...new Set(rule.dataClassifications)].sort() }
          : {}),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };

  return {
    definition: normalized,
    policyHash: sha256(canonicalJson(normalized)),
  };
}

export function validatePolicyDefinition(definition: PolicyDefinition): void {
  requireText(definition.id, 'policy id');
  if (!/^\d+\.\d+\.\d+$/.test(definition.version)) {
    throw new Error('policy version must be semantic version x.y.z');
  }
  if (definition.rules.length === 0) throw new Error('policy must define at least one rule');

  const ids = new Set<string>();
  for (const rule of definition.rules) {
    requireText(rule.id, 'policy rule id');
    if (ids.has(rule.id)) throw new Error(`duplicate policy rule: ${rule.id}`);
    ids.add(rule.id);
    if (rule.actions.length === 0 || rule.actions.some((action) => !action.trim())) {
      throw new Error(`policy rule ${rule.id} requires non-empty actions`);
    }
  }
}

export function evaluatePolicy(policy: PublishedPolicy, input: PolicyInput): PolicyDecision {
  requireText(input.action, 'policy action');

  const matches = policy.definition.rules.filter((rule) => ruleMatches(rule, input));
  if (matches.length === 0) {
    return {
      effect: 'DENY',
      matchedRuleIds: [],
      policyHash: policy.policyHash,
      reason: 'no policy rule matched; default deny',
    };
  }

  const effect = matches.reduce<PolicyEffect>(
    (current, rule) => (precedence[rule.effect] > precedence[current] ? rule.effect : current),
    'ALLOW',
  );

  return {
    effect,
    matchedRuleIds: matches.map((rule) => rule.id).sort(),
    policyHash: policy.policyHash,
    reason: `matched policy rules resolve to ${effect}`,
  };
}

export function createHumanApprovalRequest(
  input: HumanApprovalRequestInput,
): HumanApprovalRequest {
  if (input.policyDecision.effect !== 'HUMAN_REQUIRED') {
    throw new Error('human approval request requires HUMAN_REQUIRED policy decision');
  }
  requireText(input.policyDecision.policyHash, 'policy hash');
  requireText(input.runSnapshotHash, 'run snapshot hash');
  requireText(input.repository, 'repository');
  requireText(input.revision, 'revision');
  requireText(input.action, 'action');
  requireText(input.evidenceHash, 'evidence hash');

  const identity = {
    policyHash: input.policyDecision.policyHash,
    matchedRuleIds: [...input.policyDecision.matchedRuleIds].sort(),
    runSnapshotHash: input.runSnapshotHash,
    repository: input.repository,
    revision: input.revision,
    action: input.action,
    riskTier: input.riskTier,
    evidenceHash: input.evidenceHash,
  };

  return {
    ...input,
    requestHash: sha256(canonicalJson(identity)),
  };
}

export function recordHumanDecision(
  request: HumanApprovalRequest,
  approverPrincipalKind: PolicyPrincipalKind,
  approverId: string,
  decision: HumanDecisionValue,
): HumanDecision {
  if (approverPrincipalKind !== 'HUMAN') {
    throw new Error('human approval decision requires HUMAN principal');
  }
  requireText(approverId, 'approver id');
  requireText(request.requestHash, 'request hash');

  const identity = {
    requestHash: request.requestHash,
    approverId,
    decision,
  };

  return {
    requestHash: request.requestHash,
    approverId,
    decision,
    decisionHash: sha256(canonicalJson(identity)),
  };
}

export function verifyHumanDecisionBinding(
  request: HumanApprovalRequest,
  decision: HumanDecision,
): boolean {
  if (decision.requestHash !== request.requestHash) return false;
  const expected = sha256(
    canonicalJson({
      requestHash: request.requestHash,
      approverId: decision.approverId,
      decision: decision.decision,
    }),
  );
  return decision.decisionHash === expected;
}

export function policyConfigurationCanSelfApprove(): false {
  return false;
}

export function modelCanActAsHumanApprover(): false {
  return false;
}

function ruleMatches(rule: PolicyRule, input: PolicyInput): boolean {
  if (!rule.actions.includes(input.action)) return false;
  if (rule.riskTiers && !rule.riskTiers.includes(input.riskTier)) return false;
  if (rule.principalKinds && !rule.principalKinds.includes(input.principalKind)) return false;
  if (
    rule.dataClassifications &&
    !rule.dataClassifications.includes(input.dataClassification)
  ) {
    return false;
  }
  return true;
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
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

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
