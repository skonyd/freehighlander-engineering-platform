export type OperatorAuthorityCapability =
  | 'GIT_WRITE'
  | 'RELEASE_DEPLOY'
  | 'INFRASTRUCTURE_MUTATION'
  | 'AUTOMATIC_REMEDIATION';

export interface OperatorAuthoritySelectionInput {
  readonly gitWrite?: boolean;
  readonly releaseDeploy?: boolean;
  readonly infrastructureMutation?: boolean;
  readonly automaticRemediation?: boolean;
}

export interface OperatorAuthorityProfileV1 {
  readonly schemaVersion: 1;
  readonly mode: 'HUMAN_SELECTED_POLICY_GATED';
  readonly defaultDeny: true;
  readonly gitWrite: boolean;
  readonly releaseDeploy: boolean;
  readonly infrastructureMutation: boolean;
  readonly automaticRemediation: boolean;
  readonly requestedCapabilities: readonly OperatorAuthorityCapability[];
  readonly authority: 'NONE';
  readonly activation: 'CONTROL_PLANE_POLICY_GATED';
}

export interface OperatorAuthorityActivationGate {
  readonly v3AuthorityEnabled: boolean;
  readonly exactHumanApprovalVerified: boolean;
  readonly systemPolicyEffect: 'ALLOW' | 'MODEL_QUORUM_REQUIRED' | 'HUMAN_REQUIRED' | 'DENY';
}

export interface OperatorAuthorityCapabilityDecision {
  readonly capability: OperatorAuthorityCapability;
  readonly requested: boolean;
  readonly status: 'ACTIVE' | 'BLOCKED';
  readonly reasons: readonly string[];
}

const orderedCapabilities: readonly OperatorAuthorityCapability[] = [
  'GIT_WRITE',
  'RELEASE_DEPLOY',
  'INFRASTRUCTURE_MUTATION',
  'AUTOMATIC_REMEDIATION',
];

export function createOperatorAuthorityProfileV1(
  input: OperatorAuthoritySelectionInput = {},
): OperatorAuthorityProfileV1 {
  const gitWrite = input.gitWrite === true;
  const releaseDeploy = input.releaseDeploy === true;
  const infrastructureMutation = input.infrastructureMutation === true;
  const automaticRemediation = input.automaticRemediation === true;

  const selected = new Set<OperatorAuthorityCapability>();
  if (gitWrite) selected.add('GIT_WRITE');
  if (releaseDeploy) selected.add('RELEASE_DEPLOY');
  if (infrastructureMutation) selected.add('INFRASTRUCTURE_MUTATION');
  if (automaticRemediation) selected.add('AUTOMATIC_REMEDIATION');

  return {
    schemaVersion: 1,
    mode: 'HUMAN_SELECTED_POLICY_GATED',
    defaultDeny: true,
    gitWrite,
    releaseDeploy,
    infrastructureMutation,
    automaticRemediation,
    requestedCapabilities: orderedCapabilities.filter((capability) => selected.has(capability)),
    authority: 'NONE',
    activation: 'CONTROL_PLANE_POLICY_GATED',
  };
}

export function evaluateOperatorAuthorityCapabilityV1(
  profile: OperatorAuthorityProfileV1,
  capability: OperatorAuthorityCapability,
  gate: OperatorAuthorityActivationGate,
): OperatorAuthorityCapabilityDecision {
  const requested = profile.requestedCapabilities.includes(capability);
  const reasons: string[] = [];

  if (!requested) reasons.push('capability not selected by human operator');
  if (!gate.v3AuthorityEnabled) reasons.push('V3 authority is not enabled');
  if (!gate.exactHumanApprovalVerified) reasons.push('exact human approval is not verified');
  if (gate.systemPolicyEffect !== 'ALLOW') {
    reasons.push('SYSTEM_POLICY is not ALLOW');
  }

  return {
    capability,
    requested,
    status: reasons.length === 0 ? 'ACTIVE' : 'BLOCKED',
    reasons,
  };
}

export function operatorAuthorityProfileCanGrantAuthority(): false {
  return false;
}
