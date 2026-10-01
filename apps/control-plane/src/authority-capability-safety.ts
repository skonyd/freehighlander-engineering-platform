import type {
  AuthorityCapability,
  AuthorityCapabilityStateSnapshotV1,
} from '@freehighlander/persistence';

import { AuthorityCapabilityActivationService } from './authority-capability-activation.js';
import { AuthorityCapabilityApprovalCoordinator } from './authority-capability-approval.js';

export type AuthorityStartupReconciliationStatus = 'UNCHANGED' | 'DEACTIVATED';

export interface AuthorityStartupReconciliationResultV1 {
  readonly schemaVersion: 1;
  readonly status: AuthorityStartupReconciliationStatus;
  readonly deactivatedCapabilities: readonly AuthorityCapability[];
  readonly snapshot: AuthorityCapabilityStateSnapshotV1;
  readonly authority: 'NONE';
}

export interface AuthorityAuditFailureCompensationInput {
  readonly pathname:
    | '/v1/authority/request'
    | '/v1/authority/approve'
    | '/v1/authority/activate'
    | '/v1/authority/deactivate';
  readonly capability: AuthorityCapability;
  readonly requested?: boolean;
  readonly previousSnapshot: AuthorityCapabilityStateSnapshotV1;
}

export interface AuthorityAuditFailureCompensationResultV1 {
  readonly schemaVersion: 1;
  readonly action: 'RESTORE_REQUEST' | 'DISCARD_APPROVAL' | 'DEACTIVATE' | 'KEEP_DEACTIVATED';
  readonly capability: AuthorityCapability;
  readonly generation: number;
  readonly safe: true;
  readonly authority: 'NONE';
}

export function reconcileAuthorityStateOnStartup(
  activationService: AuthorityCapabilityActivationService,
): AuthorityStartupReconciliationResultV1 {
  let snapshot = activationService.snapshot();
  const active = [...snapshot.state.activeCapabilities];

  if (active.length === 0) {
    return {
      schemaVersion: 1,
      status: 'UNCHANGED',
      deactivatedCapabilities: [],
      snapshot,
      authority: 'NONE',
    };
  }

  for (const capability of active) {
    const result = activationService.deactivate(capability, snapshot.generation);
    if (result.status !== 'APPLIED' && result.status !== 'UNCHANGED') {
      throw new Error('startup authority deactivation failed closed');
    }
    snapshot = activationService.snapshot();
  }

  return {
    schemaVersion: 1,
    status: 'DEACTIVATED',
    deactivatedCapabilities: active,
    snapshot,
    authority: 'NONE',
  };
}

export function compensateAuthorityAuditFailure(
  activationService: AuthorityCapabilityActivationService,
  coordinator: AuthorityCapabilityApprovalCoordinator,
  input: AuthorityAuditFailureCompensationInput,
): AuthorityAuditFailureCompensationResultV1 {
  if (input.pathname === '/v1/authority/approve') {
    coordinator.discardApproval(input.capability);
    return result('DISCARD_APPROVAL', input.capability, activationService.snapshot().generation);
  }

  if (input.pathname === '/v1/authority/activate') {
    const current = activationService.snapshot();
    const deactivated = activationService.deactivate(input.capability, current.generation);
    if (deactivated.status !== 'APPLIED' && deactivated.status !== 'UNCHANGED') {
      throw new Error('audit failure compensation could not deactivate capability');
    }
    return result('DEACTIVATE', input.capability, deactivated.generation);
  }

  if (input.pathname === '/v1/authority/deactivate') {
    return result('KEEP_DEACTIVATED', input.capability, activationService.snapshot().generation);
  }

  const previouslyRequested =
    input.previousSnapshot.state.requestedCapabilities.includes(input.capability);
  const current = activationService.snapshot();
  const restored = activationService.setRequested(
    input.capability,
    previouslyRequested,
    current.generation,
  );
  if (restored.status !== 'APPLIED' && restored.status !== 'UNCHANGED') {
    throw new Error('audit failure compensation could not restore requested state');
  }
  return result('RESTORE_REQUEST', input.capability, restored.generation);
}

export function authoritySafetyLifecycleCanReactivateOnAuditFailure(): false {
  return false;
}

function result(
  action: AuthorityAuditFailureCompensationResultV1['action'],
  capability: AuthorityCapability,
  generation: number,
): AuthorityAuditFailureCompensationResultV1 {
  return {
    schemaVersion: 1,
    action,
    capability,
    generation,
    safe: true,
    authority: 'NONE',
  };
}
