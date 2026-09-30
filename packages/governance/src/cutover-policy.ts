import {
  evaluatePolicy,
  publishPolicy,
  type PolicyDecision,
  type PublishedPolicy,
} from './policy-engine.js';

export const V3_CUTOVER_ACTION = 'promote-v3-authority' as const;

export interface V3CutoverPolicyEvaluationV1 {
  readonly schemaVersion: 1;
  readonly policy: PublishedPolicy;
  readonly humanGateDecision: PolicyDecision;
  readonly systemPolicyDecision: PolicyDecision;
  readonly modelDecision: PolicyDecision;
}

export function publishV3CutoverPolicyV1(): PublishedPolicy {
  return publishPolicy({
    id: 'v3-cutover-governance',
    version: '1.0.0',
    rules: [
      {
        id: 'deny-model-v3-cutover',
        actions: [V3_CUTOVER_ACTION],
        riskTiers: ['CRITICAL'],
        principalKinds: ['MODEL'],
        dataClassifications: ['INTERNAL'],
        effect: 'DENY',
      },
      {
        id: 'require-human-v3-cutover',
        actions: [V3_CUTOVER_ACTION],
        riskTiers: ['CRITICAL'],
        principalKinds: ['HUMAN'],
        dataClassifications: ['INTERNAL'],
        effect: 'HUMAN_REQUIRED',
      },
      {
        id: 'allow-system-v3-cutover-gate',
        actions: [V3_CUTOVER_ACTION],
        riskTiers: ['CRITICAL'],
        principalKinds: ['SYSTEM'],
        dataClassifications: ['INTERNAL'],
        effect: 'ALLOW',
      },
    ],
  });
}

export function evaluateV3CutoverPolicyV1(): V3CutoverPolicyEvaluationV1 {
  const policy = publishV3CutoverPolicyV1();
  const input = {
    action: V3_CUTOVER_ACTION,
    riskTier: 'CRITICAL' as const,
    dataClassification: 'INTERNAL' as const,
  };

  const humanGateDecision = evaluatePolicy(policy, {
    ...input,
    principalKind: 'HUMAN',
  });
  const systemPolicyDecision = evaluatePolicy(policy, {
    ...input,
    principalKind: 'SYSTEM',
  });
  const modelDecision = evaluatePolicy(policy, {
    ...input,
    principalKind: 'MODEL',
  });

  if (humanGateDecision.effect !== 'HUMAN_REQUIRED') {
    throw new Error('canonical V3 cutover policy must require exact human approval');
  }
  if (systemPolicyDecision.effect !== 'ALLOW') {
    throw new Error('canonical V3 cutover SYSTEM_POLICY decision must be ALLOW');
  }
  if (modelDecision.effect !== 'DENY') {
    throw new Error('canonical V3 cutover policy must deny model authority');
  }
  if (
    humanGateDecision.policyHash !== systemPolicyDecision.policyHash ||
    humanGateDecision.policyHash !== modelDecision.policyHash
  ) {
    throw new Error('canonical V3 cutover policy decisions must share one exact policy snapshot');
  }

  return {
    schemaVersion: 1,
    policy,
    humanGateDecision,
    systemPolicyDecision,
    modelDecision,
  };
}

export function v3CutoverPolicyCanBypassHumanApproval(): false {
  return false;
}

export function v3CutoverPolicyCanGrantModelAuthority(): false {
  return false;
}
