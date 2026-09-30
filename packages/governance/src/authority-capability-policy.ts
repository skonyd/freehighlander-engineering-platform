import {
  evaluatePolicy,
  publishPolicy,
  type PolicyDecision,
  type PublishedPolicy,
} from './policy-engine.js';

export const AUTHORITY_CAPABILITY_ACTIONS = {
  GIT_WRITE: 'authority:git-write',
  RELEASE_DEPLOY: 'authority:release-deploy',
  INFRASTRUCTURE_MUTATION: 'authority:infrastructure-mutation',
  AUTOMATIC_REMEDIATION: 'authority:automatic-remediation',
} as const;

export type AuthorityCapabilityPolicyCapability = keyof typeof AUTHORITY_CAPABILITY_ACTIONS;
export type AuthorityCapabilityPolicyAction =
  (typeof AUTHORITY_CAPABILITY_ACTIONS)[AuthorityCapabilityPolicyCapability];

export interface AuthorityCapabilityPolicyEvaluationV1 {
  readonly schemaVersion: 1;
  readonly capability: AuthorityCapabilityPolicyCapability;
  readonly action: AuthorityCapabilityPolicyAction;
  readonly policy: PublishedPolicy;
  readonly humanDecision: PolicyDecision;
  readonly systemDecision: PolicyDecision;
  readonly modelDecision: PolicyDecision;
}

const ACTIONS = Object.values(AUTHORITY_CAPABILITY_ACTIONS);

export function publishAuthorityCapabilityPolicyV1(): PublishedPolicy {
  return publishPolicy({
    id: 'v3-authority-capabilities',
    version: '1.0.0',
    rules: [
      {
        id: 'deny-model-critical-capabilities',
        actions: ACTIONS,
        riskTiers: ['CRITICAL'],
        principalKinds: ['MODEL'],
        dataClassifications: ['INTERNAL'],
        effect: 'DENY',
      },
      {
        id: 'require-human-critical-capabilities',
        actions: ACTIONS,
        riskTiers: ['CRITICAL'],
        principalKinds: ['HUMAN'],
        dataClassifications: ['INTERNAL'],
        effect: 'HUMAN_REQUIRED',
      },
      {
        id: 'allow-system-critical-capability-gate',
        actions: ACTIONS,
        riskTiers: ['CRITICAL'],
        principalKinds: ['SYSTEM'],
        dataClassifications: ['INTERNAL'],
        effect: 'ALLOW',
      },
    ],
  });
}

export function evaluateAuthorityCapabilityPolicyV1(
  capability: AuthorityCapabilityPolicyCapability,
): AuthorityCapabilityPolicyEvaluationV1 {
  const action = AUTHORITY_CAPABILITY_ACTIONS[capability];
  if (!action) throw new Error('unknown authority capability policy capability');

  const policy = publishAuthorityCapabilityPolicyV1();
  const base = {
    action,
    riskTier: 'CRITICAL' as const,
    dataClassification: 'INTERNAL' as const,
  };
  const humanDecision = evaluatePolicy(policy, { ...base, principalKind: 'HUMAN' });
  const systemDecision = evaluatePolicy(policy, { ...base, principalKind: 'SYSTEM' });
  const modelDecision = evaluatePolicy(policy, { ...base, principalKind: 'MODEL' });

  if (humanDecision.effect !== 'HUMAN_REQUIRED') {
    throw new Error('critical capability policy must require human approval');
  }
  if (systemDecision.effect !== 'ALLOW') {
    throw new Error('critical capability SYSTEM_POLICY must be ALLOW');
  }
  if (modelDecision.effect !== 'DENY') {
    throw new Error('critical capability policy must deny model authority');
  }
  if (
    humanDecision.policyHash !== systemDecision.policyHash ||
    humanDecision.policyHash !== modelDecision.policyHash
  ) {
    throw new Error('critical capability decisions must share one policy snapshot');
  }

  return {
    schemaVersion: 1,
    capability,
    action,
    policy,
    humanDecision,
    systemDecision,
    modelDecision,
  };
}

export function authorityCapabilityPolicyCanSelfApprove(): false {
  return false;
}
