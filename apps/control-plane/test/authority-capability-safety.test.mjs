import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityActivationService,
  AuthorityCapabilityApprovalCoordinator,
  authoritySafetyLifecycleCanReactivateOnAuditFailure,
  compensateAuthorityAuditFailure,
  reconcileAuthorityStateOnStartup,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'fh-authority-safety-'));
  const activationService = new AuthorityCapabilityActivationService(
    new AuthorityCapabilityStateStore(join(directory, 'authority.json')),
  );
  const coordinator = new AuthorityCapabilityApprovalCoordinator(activationService, {
    repository: 'skonyd/freehighlander-engineering-platform',
    revision: REVISION,
    approverId: 'local-operator',
  });
  return { activationService, coordinator };
}

function requestAndActivate(activationService, coordinator, capability = 'GIT_WRITE') {
  const requested = activationService.setRequested(capability, true, 0);
  const approved = coordinator.approve(capability, requested.generation);
  assert.equal(approved.status, 'APPROVED');
  const activated = coordinator.activateApproved(capability, requested.generation);
  assert.equal(activated.status, 'APPLIED');
  return activated;
}

test('startup reconciliation removes persisted active authority while preserving request intent', () => {
  const { activationService, coordinator } = fixture();
  requestAndActivate(activationService, coordinator);

  const reconciled = reconcileAuthorityStateOnStartup(activationService);
  assert.equal(reconciled.status, 'DEACTIVATED');
  assert.deepEqual(reconciled.deactivatedCapabilities, ['GIT_WRITE']);
  assert.deepEqual(reconciled.snapshot.state.requestedCapabilities, ['GIT_WRITE']);
  assert.deepEqual(reconciled.snapshot.state.activeCapabilities, []);

  const repeated = reconcileAuthorityStateOnStartup(activationService);
  assert.equal(repeated.status, 'UNCHANGED');
  assert.deepEqual(repeated.deactivatedCapabilities, []);
});

test('approval audit failure discards the in-memory approval', () => {
  const { activationService, coordinator } = fixture();
  const requested = activationService.setRequested('GIT_WRITE', true, 0);
  coordinator.approve('GIT_WRITE', requested.generation);
  assert.ok(coordinator.approval('GIT_WRITE'));

  const compensated = compensateAuthorityAuditFailure(activationService, coordinator, {
    pathname: '/v1/authority/approve',
    capability: 'GIT_WRITE',
    previousSnapshot: activationService.snapshot(),
  });
  assert.equal(compensated.action, 'DISCARD_APPROVAL');
  assert.equal(coordinator.approval('GIT_WRITE'), null);
  assert.equal(coordinator.discardApproval('GIT_WRITE'), false);
});

test('activation audit failure deactivates before returning control', () => {
  const { activationService, coordinator } = fixture();
  requestAndActivate(activationService, coordinator);
  const previousSnapshot = activationService.snapshot();

  const compensated = compensateAuthorityAuditFailure(activationService, coordinator, {
    pathname: '/v1/authority/activate',
    capability: 'GIT_WRITE',
    previousSnapshot,
  });
  assert.equal(compensated.action, 'DEACTIVATE');
  assert.deepEqual(activationService.snapshot().state.activeCapabilities, []);
});

test('deactivation audit failure never reactivates authority', () => {
  const { activationService, coordinator } = fixture();
  const activated = requestAndActivate(activationService, coordinator);
  const previousSnapshot = activationService.snapshot();
  const deactivated = activationService.deactivate('GIT_WRITE', activated.generation);
  assert.equal(deactivated.status, 'APPLIED');

  const compensated = compensateAuthorityAuditFailure(activationService, coordinator, {
    pathname: '/v1/authority/deactivate',
    capability: 'GIT_WRITE',
    previousSnapshot,
  });
  assert.equal(compensated.action, 'KEEP_DEACTIVATED');
  assert.deepEqual(activationService.snapshot().state.activeCapabilities, []);
});

test('request audit failure restores prior request intent without restoring active authority', () => {
  const { activationService, coordinator } = fixture();
  const before = activationService.snapshot();
  activationService.setRequested('GIT_WRITE', true, before.generation);

  const compensated = compensateAuthorityAuditFailure(activationService, coordinator, {
    pathname: '/v1/authority/request',
    capability: 'GIT_WRITE',
    requested: true,
    previousSnapshot: before,
  });
  assert.equal(compensated.action, 'RESTORE_REQUEST');
  assert.deepEqual(activationService.snapshot().state.requestedCapabilities, []);

  const requested = activationService.setRequested(
    'GIT_WRITE',
    true,
    activationService.snapshot().generation,
  );
  coordinator.approve('GIT_WRITE', requested.generation);
  const active = coordinator.activateApproved('GIT_WRITE', requested.generation);
  assert.equal(active.status, 'APPLIED');
  const activeBefore = activationService.snapshot();
  activationService.setRequested('GIT_WRITE', false, active.generation);

  compensateAuthorityAuditFailure(activationService, coordinator, {
    pathname: '/v1/authority/request',
    capability: 'GIT_WRITE',
    requested: false,
    previousSnapshot: activeBefore,
  });
  const restored = activationService.snapshot();
  assert.deepEqual(restored.state.requestedCapabilities, ['GIT_WRITE']);
  assert.deepEqual(restored.state.activeCapabilities, []);
  assert.equal(authoritySafetyLifecycleCanReactivateOnAuditFailure(), false);
});
