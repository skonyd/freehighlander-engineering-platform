import {
  AUTHORITY_CAPABILITIES,
  type AuthorityCapability,
  type AuthorityCapabilityStateSnapshotV1,
  type AuthorityCapabilityStateV1,
  AuthorityCapabilityStateStore,
} from '@freehighlander/persistence';

export type CapabilityActivationStatus = 'APPLIED' | 'UNCHANGED' | 'BLOCKED' | 'CONFLICT';

export interface CapabilityActivationEvidenceV1 {
  readonly v3AuthorityEnabled: boolean;
  readonly exactHumanApprovalVerified: boolean;
  readonly humanApprovalCapability: AuthorityCapability;
  readonly humanApprovalRevision: string;
  readonly observedRevision: string;
  readonly humanApprovalRequestHash: string;
  readonly humanDecisionHash: string;
  readonly systemPolicyEffect: 'ALLOW' | 'MODEL_QUORUM_REQUIRED' | 'HUMAN_REQUIRED' | 'DENY';
  readonly systemPolicyHash: string;
  readonly observedPolicyHash: string;
}

export interface CapabilityActivationResultV1 {
  readonly schemaVersion: 1;
  readonly capability: AuthorityCapability;
  readonly status: CapabilityActivationStatus;
  readonly reasons: readonly string[];
  readonly generation: number;
  readonly state: AuthorityCapabilityStateV1;
  readonly authority: 'CONTROL_PLANE_POLICY_GATED';
}

export class AuthorityCapabilityActivationService {
  constructor(readonly store: AuthorityCapabilityStateStore) {}

  snapshot(): AuthorityCapabilityStateSnapshotV1 {
    return this.store.read();
  }

  setRequested(
    capability: AuthorityCapability,
    requested: boolean,
    expectedGeneration: number,
  ): CapabilityActivationResultV1 {
    requireCapability(capability);
    const current = this.store.read();
    if (current.generation !== expectedGeneration) {
      return conflictResult(capability, current);
    }

    const requestedCapabilities = updateCapability(
      current.state.requestedCapabilities,
      capability,
      requested,
    );
    const activeCapabilities = requested
      ? current.state.activeCapabilities
      : updateCapability(current.state.activeCapabilities, capability, false);

    if (
      sameCapabilities(requestedCapabilities, current.state.requestedCapabilities) &&
      sameCapabilities(activeCapabilities, current.state.activeCapabilities)
    ) {
      return result(capability, 'UNCHANGED', [], current);
    }

    return writeState(
      this.store,
      capability,
      expectedGeneration,
      requestedCapabilities,
      activeCapabilities,
    );
  }

  activate(
    capability: AuthorityCapability,
    expectedGeneration: number,
    evidence: CapabilityActivationEvidenceV1,
  ): CapabilityActivationResultV1 {
    requireCapability(capability);
    validateActivationEvidence(evidence);
    const current = this.store.read();
    if (current.generation !== expectedGeneration) {
      return conflictResult(capability, current);
    }

    const reasons = activationBlockReasons(capability, current.state, evidence);
    if (reasons.length > 0) {
      return result(capability, 'BLOCKED', reasons, current);
    }

    if (current.state.activeCapabilities.includes(capability)) {
      return result(capability, 'UNCHANGED', [], current);
    }

    return writeState(
      this.store,
      capability,
      expectedGeneration,
      current.state.requestedCapabilities,
      updateCapability(current.state.activeCapabilities, capability, true),
    );
  }

  deactivate(
    capability: AuthorityCapability,
    expectedGeneration: number,
  ): CapabilityActivationResultV1 {
    requireCapability(capability);
    const current = this.store.read();
    if (current.generation !== expectedGeneration) {
      return conflictResult(capability, current);
    }

    if (!current.state.activeCapabilities.includes(capability)) {
      return result(capability, 'UNCHANGED', [], current);
    }

    return writeState(
      this.store,
      capability,
      expectedGeneration,
      current.state.requestedCapabilities,
      updateCapability(current.state.activeCapabilities, capability, false),
    );
  }
}

export function capabilityActivationServiceCanBypassPolicy(): false {
  return false;
}

export function capabilityActivationServiceCanImplicitlyActivate(): false {
  return false;
}

function activationBlockReasons(
  capability: AuthorityCapability,
  state: AuthorityCapabilityStateV1,
  evidence: CapabilityActivationEvidenceV1,
): readonly string[] {
  const reasons: string[] = [];

  if (!state.requestedCapabilities.includes(capability)) {
    reasons.push('capability is not requested by the human operator');
  }
  if (!evidence.v3AuthorityEnabled) {
    reasons.push('V3 authority is not enabled');
  }
  if (!evidence.exactHumanApprovalVerified) {
    reasons.push('exact human approval is not verified');
  }
  if (evidence.humanApprovalCapability !== capability) {
    reasons.push('human approval is bound to a different capability');
  }
  if (evidence.humanApprovalRevision !== evidence.observedRevision) {
    reasons.push('human approval revision is stale');
  }
  if (evidence.systemPolicyHash !== evidence.observedPolicyHash) {
    reasons.push('SYSTEM_POLICY snapshot is stale');
  }
  if (evidence.systemPolicyEffect !== 'ALLOW') {
    reasons.push('SYSTEM_POLICY is not ALLOW');
  }

  return reasons;
}

function writeState(
  store: AuthorityCapabilityStateStore,
  capability: AuthorityCapability,
  expectedGeneration: number,
  requestedCapabilities: readonly AuthorityCapability[],
  activeCapabilities: readonly AuthorityCapability[],
): CapabilityActivationResultV1 {
  const write = store.write(expectedGeneration, {
    schemaVersion: 1,
    requestedCapabilities,
    activeCapabilities,
  });

  if (write.status !== 'WRITTEN' || write.snapshot === null) {
    return {
      schemaVersion: 1,
      capability,
      status: 'CONFLICT',
      reasons: ['authority capability state changed concurrently'],
      generation: write.snapshot?.generation ?? write.actualGeneration ?? expectedGeneration,
      state: write.snapshot?.state ?? store.read().state,
      authority: 'CONTROL_PLANE_POLICY_GATED',
    };
  }

  return result(capability, 'APPLIED', [], write.snapshot);
}

function conflictResult(
  capability: AuthorityCapability,
  snapshot: AuthorityCapabilityStateSnapshotV1,
): CapabilityActivationResultV1 {
  return result(
    capability,
    'CONFLICT',
    ['authority capability state generation is stale'],
    snapshot,
  );
}

function result(
  capability: AuthorityCapability,
  status: CapabilityActivationStatus,
  reasons: readonly string[],
  snapshot: AuthorityCapabilityStateSnapshotV1,
): CapabilityActivationResultV1 {
  return {
    schemaVersion: 1,
    capability,
    status,
    reasons,
    generation: snapshot.generation,
    state: snapshot.state,
    authority: 'CONTROL_PLANE_POLICY_GATED',
  };
}

function updateCapability(
  current: readonly AuthorityCapability[],
  capability: AuthorityCapability,
  enabled: boolean,
): readonly AuthorityCapability[] {
  const selected = new Set(current);
  if (enabled) selected.add(capability);
  else selected.delete(capability);
  return AUTHORITY_CAPABILITIES.filter((candidate) => selected.has(candidate));
}

function sameCapabilities(
  left: readonly AuthorityCapability[],
  right: readonly AuthorityCapability[],
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateActivationEvidence(evidence: CapabilityActivationEvidenceV1): void {
  requireCapability(evidence.humanApprovalCapability);
  requireGitSha(evidence.humanApprovalRevision, 'humanApprovalRevision');
  requireGitSha(evidence.observedRevision, 'observedRevision');
  requireSha256(evidence.humanApprovalRequestHash, 'humanApprovalRequestHash');
  requireSha256(evidence.humanDecisionHash, 'humanDecisionHash');
  requireSha256(evidence.systemPolicyHash, 'systemPolicyHash');
  requireSha256(evidence.observedPolicyHash, 'observedPolicyHash');
}

function requireCapability(value: AuthorityCapability): void {
  if (!(AUTHORITY_CAPABILITIES as readonly string[]).includes(value)) {
    throw new Error('unknown authority capability');
  }
}

function requireGitSha(value: string, field: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(field + ' must be a 40-character git SHA');
}

function requireSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(field + ' must be lowercase sha256');
}
