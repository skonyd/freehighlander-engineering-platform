export const AUTHORITY_CAPABILITY_REGISTRY_V1 = Object.freeze([
  Object.freeze({
    id: 'GIT_WRITE',
    action: 'authority:git-write',
    label: 'Code / Git',
    description: 'Automatic branch, commit, PR and policy-permitted merge workflows.',
    risk: 'Repository state can change without a separate manual Git action.',
    riskTier: 'CRITICAL',
    dataClassification: 'INTERNAL',
    dependencies: Object.freeze([]),
    defaultDeny: true,
    requiresHumanApproval: true,
    order: 10,
  }),
  Object.freeze({
    id: 'RELEASE_DEPLOY',
    action: 'authority:release-deploy',
    label: 'Release / Deploy',
    description: 'Release and deployment can proceed after required tests and gates pass.',
    risk: 'A bad release can affect a live environment; policy gates still apply.',
    riskTier: 'CRITICAL',
    dataClassification: 'INTERNAL',
    dependencies: Object.freeze([]),
    defaultDeny: true,
    requiresHumanApproval: true,
    order: 20,
  }),
  Object.freeze({
    id: 'INFRASTRUCTURE_MUTATION',
    action: 'authority:infrastructure-mutation',
    label: 'Infrastructure',
    description: 'Kubernetes, cloud and infrastructure mutations can be automated.',
    risk: 'Highest operational blast radius; enable only when needed.',
    riskTier: 'CRITICAL',
    dataClassification: 'INTERNAL',
    dependencies: Object.freeze([]),
    defaultDeny: true,
    requiresHumanApproval: true,
    order: 30,
  }),
  Object.freeze({
    id: 'AUTOMATIC_REMEDIATION',
    action: 'authority:automatic-remediation',
    label: 'Automatic remediation',
    description: 'Eligible failures can be repaired without waiting for another human action.',
    risk: 'An incorrect diagnosis can trigger an unwanted corrective action.',
    riskTier: 'CRITICAL',
    dataClassification: 'INTERNAL',
    dependencies: Object.freeze([]),
    defaultDeny: true,
    requiresHumanApproval: true,
    order: 40,
  }),
] as const);

export type AuthorityCapabilityDefinitionV1 = (typeof AUTHORITY_CAPABILITY_REGISTRY_V1)[number];
export type AuthorityCapabilityId = AuthorityCapabilityDefinitionV1['id'];
export type AuthorityCapabilityAction = AuthorityCapabilityDefinitionV1['action'];

export const AUTHORITY_CAPABILITY_IDS = Object.freeze(
  AUTHORITY_CAPABILITY_REGISTRY_V1.map((definition) => definition.id),
) as readonly AuthorityCapabilityId[];

export const AUTHORITY_CAPABILITY_ACTIONS = Object.freeze(
  Object.fromEntries(
    AUTHORITY_CAPABILITY_REGISTRY_V1.map((definition) => [definition.id, definition.action]),
  ),
) as Readonly<Record<AuthorityCapabilityId, AuthorityCapabilityAction>>;

export function getAuthorityCapabilityDefinitionV1(
  capability: AuthorityCapabilityId,
): AuthorityCapabilityDefinitionV1 {
  const definition = AUTHORITY_CAPABILITY_REGISTRY_V1.find((entry) => entry.id === capability);
  if (!definition) throw new Error('unknown authority capability');
  return definition;
}

export function authorityCapabilityRegistryDefaultsDeny(): true {
  return true;
}

export function authorityCapabilityRegistryCanGrantAuthority(): false {
  return false;
}
