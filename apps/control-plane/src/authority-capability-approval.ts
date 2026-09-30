import { createHash } from 'node:crypto';

import {
  AUTHORITY_CAPABILITY_ACTIONS,
  createHumanApprovalRequest,
  evaluateAuthorityCapabilityPolicyV1,
  recordHumanDecision,
  verifyHumanDecisionBinding,
  type HumanApprovalRequest,
  type HumanDecision,
} from '@freehighlander/governance';
import type { AuthorityCapability } from '@freehighlander/persistence';

import {
  AuthorityCapabilityActivationService,
  type CapabilityActivationResultV1,
} from './authority-capability-activation.js';

export type CapabilityApprovalStatus = 'APPROVED' | 'BLOCKED' | 'CONFLICT';

export interface CapabilityApprovalSummaryV1 {
  readonly schemaVersion: 1;
  readonly capability: AuthorityCapability;
  readonly generation: number;
  readonly repository: string;
  readonly revision: string;
  readonly policyHash: string;
  readonly requestHash: string;
  readonly decisionHash: string;
  readonly approverId: string;
}

export interface CapabilityApprovalResultV1 {
  readonly schemaVersion: 1;
  readonly capability: AuthorityCapability;
  readonly status: CapabilityApprovalStatus;
  readonly generation: number;
  readonly reasons: readonly string[];
  readonly approval: CapabilityApprovalSummaryV1 | null;
  readonly authority: 'CONTROL_PLANE_HUMAN_APPROVAL';
}

interface StoredCapabilityApproval {
  readonly generation: number;
  readonly request: HumanApprovalRequest;
  readonly decision: HumanDecision;
  readonly summary: CapabilityApprovalSummaryV1;
}

export interface AuthorityCapabilityApprovalCoordinatorOptions {
  readonly repository: string;
  readonly revision: string;
  readonly approverId: string;
}

export class AuthorityCapabilityApprovalCoordinator {
  readonly #approvals = new Map<AuthorityCapability, StoredCapabilityApproval>();

  constructor(
    readonly activationService: AuthorityCapabilityActivationService,
    readonly options: AuthorityCapabilityApprovalCoordinatorOptions,
  ) {
    requireText(options.repository, 'repository');
    requireRevision(options.revision);
    requireText(options.approverId, 'approverId');
  }

  approval(capability: AuthorityCapability): CapabilityApprovalSummaryV1 | null {
    return this.#approvals.get(capability)?.summary ?? null;
  }

  approve(capability: AuthorityCapability, expectedGeneration: number): CapabilityApprovalResultV1 {
    const snapshot = this.activationService.snapshot();
    if (snapshot.generation !== expectedGeneration) {
      return approvalResult(
        capability,
        'CONFLICT',
        snapshot.generation,
        ['authority capability state generation is stale'],
        null,
      );
    }
    if (!snapshot.state.requestedCapabilities.includes(capability)) {
      return approvalResult(
        capability,
        'BLOCKED',
        snapshot.generation,
        ['capability must be requested before human approval'],
        null,
      );
    }

    const policy = evaluateAuthorityCapabilityPolicyV1(capability);
    const runSnapshotHash = sha256(
      JSON.stringify([
        this.options.repository,
        this.options.revision,
        capability,
        snapshot.generation,
        snapshot.snapshotHash,
      ]),
    );
    const evidenceHash = sha256(
      JSON.stringify([capability, true, snapshot.generation, policy.policy.policyHash]),
    );
    const request = Object.freeze(
      createHumanApprovalRequest({
        policyDecision: policy.humanDecision,
        runSnapshotHash,
        repository: this.options.repository,
        revision: this.options.revision,
        action: AUTHORITY_CAPABILITY_ACTIONS[capability],
        riskTier: 'CRITICAL',
        evidenceHash,
      }),
    );
    const decision = Object.freeze(
      recordHumanDecision(request, 'HUMAN', this.options.approverId, 'APPROVE'),
    );
    const summary = Object.freeze({
      schemaVersion: 1 as const,
      capability,
      generation: snapshot.generation,
      repository: this.options.repository,
      revision: this.options.revision,
      policyHash: policy.policy.policyHash,
      requestHash: request.requestHash,
      decisionHash: decision.decisionHash,
      approverId: decision.approverId,
    });

    this.#approvals.set(
      capability,
      Object.freeze({
        generation: snapshot.generation,
        request,
        decision,
        summary,
      }),
    );

    return approvalResult(capability, 'APPROVED', snapshot.generation, [], summary);
  }

  activateApproved(
    capability: AuthorityCapability,
    expectedGeneration: number,
  ): CapabilityActivationResultV1 {
    const snapshot = this.activationService.snapshot();
    const policy = evaluateAuthorityCapabilityPolicyV1(capability);
    const approval = this.#approvals.get(capability);
    const bindingVerified =
      approval !== undefined && verifyHumanDecisionBinding(approval.request, approval.decision);
    const exactHumanApprovalVerified =
      bindingVerified &&
      approval.generation === snapshot.generation &&
      approval.request.revision === this.options.revision &&
      approval.request.action === AUTHORITY_CAPABILITY_ACTIONS[capability] &&
      approval.request.policyDecision.policyHash === policy.policy.policyHash &&
      approval.decision.decision === 'APPROVE';

    return this.activationService.activate(capability, expectedGeneration, {
      v3AuthorityEnabled: true,
      exactHumanApprovalVerified,
      humanApprovalCapability: capability,
      humanApprovalRevision: approval?.request.revision ?? this.options.revision,
      observedRevision: this.options.revision,
      humanApprovalRequestHash: approval?.request.requestHash ?? ZERO_HASH,
      humanDecisionHash: approval?.decision.decisionHash ?? ZERO_HASH,
      systemPolicyEffect: policy.systemDecision.effect,
      systemPolicyHash: policy.systemDecision.policyHash,
      observedPolicyHash: policy.policy.policyHash,
    });
  }
}

export function capabilityApprovalCoordinatorAcceptsClientVerifiedFlag(): false {
  return false;
}

const ZERO_HASH = '0'.repeat(64);

function approvalResult(
  capability: AuthorityCapability,
  status: CapabilityApprovalStatus,
  generation: number,
  reasons: readonly string[],
  approval: CapabilityApprovalSummaryV1 | null,
): CapabilityApprovalResultV1 {
  return {
    schemaVersion: 1,
    capability,
    status,
    generation,
    reasons,
    approval,
    authority: 'CONTROL_PLANE_HUMAN_APPROVAL',
  };
}

function requireText(value: string, field: string): void {
  if (!value.trim()) throw new Error(field + ' is required');
}

function requireRevision(value: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new Error('revision must be a 40-character git SHA');
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
