import {
  evaluateAuthorityCapabilityPolicyV1,
  type AuthorityCapabilityPolicyCapability,
} from '@freehighlander/governance';
import {
  AUTHORITY_CAPABILITIES,
  type AuthorityCapability,
  AuthorityCapabilityStateStore,
} from '@freehighlander/persistence';

import type {
  ActivityExecutor,
  ActivityExecutorOutcome,
  ActivityRequest,
} from './execution-runtime.js';

export interface AuthorityCapabilityExecutionGateOptions {
  readonly stateStore: AuthorityCapabilityStateStore;
  readonly expectedRevision: string;
  readonly observeRevision: () => string;
}

export interface AuthorityCapabilityExecutionDecisionV1 {
  readonly schemaVersion: 1;
  readonly capability: AuthorityCapability;
  readonly allowed: boolean;
  readonly generation: number;
  readonly expectedRevision: string;
  readonly observedRevision: string;
  readonly policyHash: string;
  readonly reasons: readonly string[];
  readonly authority: 'CONTROL_PLANE_POLICY_GATED';
}

export class AuthorityCapabilityExecutionGate {
  constructor(readonly options: AuthorityCapabilityExecutionGateOptions) {
    requireRevision(options.expectedRevision, 'expectedRevision');
    if (typeof options.observeRevision !== 'function') {
      throw new Error('observeRevision must be a function');
    }
  }

  check(capability: AuthorityCapability): AuthorityCapabilityExecutionDecisionV1 {
    requireCapability(capability);
    const snapshot = this.options.stateStore.read();
    const observedRevision = this.options.observeRevision();
    requireRevision(observedRevision, 'observedRevision');
    const policy = evaluateAuthorityCapabilityPolicyV1(
      capability as AuthorityCapabilityPolicyCapability,
    );
    const reasons: string[] = [];

    if (!snapshot.state.activeCapabilities.includes(capability)) {
      reasons.push('capability is not active');
    }
    if (observedRevision !== this.options.expectedRevision) {
      reasons.push('exact revision drifted');
    }
    if (policy.systemDecision.effect !== 'ALLOW') {
      reasons.push('current SYSTEM_POLICY is not ALLOW');
    }

    return {
      schemaVersion: 1,
      capability,
      allowed: reasons.length === 0,
      generation: snapshot.generation,
      expectedRevision: this.options.expectedRevision,
      observedRevision,
      policyHash: policy.systemDecision.policyHash,
      reasons,
      authority: 'CONTROL_PLANE_POLICY_GATED',
    };
  }
}

export function createCapabilityGatedActivityExecutor(
  capability: AuthorityCapability,
  gate: AuthorityCapabilityExecutionGate,
  delegate: ActivityExecutor,
): ActivityExecutor {
  requireCapability(capability);
  requireExecutor(delegate);

  return {
    id: delegate.id + ':gate-' + capability.toLowerCase(),
    async execute(request: ActivityRequest): Promise<ActivityExecutorOutcome> {
      const decision = gate.check(capability);
      if (!decision.allowed) {
        return {
          status: 'FAILED',
          output: '',
          failureKind: 'CAPABILITY_GATE_DENIED',
        };
      }
      return delegate.execute(request);
    },
  };
}

export function createGitWriteGatedExecutor(
  gate: AuthorityCapabilityExecutionGate,
  delegate: ActivityExecutor,
): ActivityExecutor {
  return createCapabilityGatedActivityExecutor('GIT_WRITE', gate, delegate);
}

export function createReleaseDeployGatedExecutor(
  gate: AuthorityCapabilityExecutionGate,
  delegate: ActivityExecutor,
): ActivityExecutor {
  return createCapabilityGatedActivityExecutor('RELEASE_DEPLOY', gate, delegate);
}

export function createInfrastructureMutationGatedExecutor(
  gate: AuthorityCapabilityExecutionGate,
  delegate: ActivityExecutor,
): ActivityExecutor {
  return createCapabilityGatedActivityExecutor('INFRASTRUCTURE_MUTATION', gate, delegate);
}

export function createAutomaticRemediationGatedExecutor(
  gate: AuthorityCapabilityExecutionGate,
  delegate: ActivityExecutor,
): ActivityExecutor {
  return createCapabilityGatedActivityExecutor('AUTOMATIC_REMEDIATION', gate, delegate);
}

export function capabilityExecutionGateCanBypassActiveState(): false {
  return false;
}

export function capabilityExecutionGateCanBypassSystemPolicy(): false {
  return false;
}

function requireCapability(value: AuthorityCapability): void {
  if (!(AUTHORITY_CAPABILITIES as readonly string[]).includes(value)) {
    throw new Error('unknown authority capability');
  }
}

function requireExecutor(executor: ActivityExecutor): void {
  if (!executor || typeof executor.execute !== 'function') {
    throw new Error('delegate executor is required');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(executor.id)) {
    throw new Error('delegate executor id must be a bounded identifier');
  }
}

function requireRevision(value: string, field: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(field + ' must be a 40-character git SHA');
  }
}
