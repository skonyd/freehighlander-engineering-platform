import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityActivationService,
  AuthorityCapabilityApprovalCoordinator,
  capabilityApprovalCoordinatorAcceptsClientVerifiedFlag,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);

function createCoordinator() {
  const directory = mkdtempSync(join(tmpdir(), 'fh-capability-approval-'));
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

test('coordinator validates its trusted server-side identity', () => {
  const { activationService } = createCoordinator();

  assert.throws(
    () =>
      new AuthorityCapabilityApprovalCoordinator(activationService, {
        repository: '',
        revision: REVISION,
        approverId: 'operator',
      }),
    /repository is required/,
  );
  assert.throws(
    () =>
      new AuthorityCapabilityApprovalCoordinator(activationService, {
        repository: 'repo',
        revision: 'bad',
        approverId: 'operator',
      }),
    /revision must be a 40-character git SHA/,
  );
  assert.throws(
    () =>
      new AuthorityCapabilityApprovalCoordinator(activationService, {
        repository: 'repo',
        revision: REVISION,
        approverId: '',
      }),
    /approverId is required/,
  );
  assert.equal(capabilityApprovalCoordinatorAcceptsClientVerifiedFlag(), false);
});

test('human approval requires current requested capability state', () => {
  const { activationService, coordinator } = createCoordinator();

  const blocked = coordinator.approve('GIT_WRITE', 0);
  assert.equal(blocked.status, 'BLOCKED');
  assert.match(blocked.reasons.join(' '), /must be requested/);

  const requested = activationService.setRequested('GIT_WRITE', true, 0);
  const conflict = coordinator.approve('GIT_WRITE', 0);
  assert.equal(conflict.status, 'CONFLICT');
  assert.equal(conflict.generation, requested.generation);
});

test('approval is exact-bound and can activate only the approved current state', () => {
  const { activationService, coordinator } = createCoordinator();
  const requested = activationService.setRequested('GIT_WRITE', true, 0);

  assert.equal(coordinator.approval('GIT_WRITE'), null);

  const approved = coordinator.approve('GIT_WRITE', requested.generation);
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approval?.revision, REVISION);
  assert.equal(approved.approval?.generation, requested.generation);
  assert.match(approved.approval?.requestHash ?? '', /^[a-f0-9]{64}$/);
  assert.match(approved.approval?.decisionHash ?? '', /^[a-f0-9]{64}$/);
  assert.deepEqual(coordinator.approval('GIT_WRITE'), approved.approval);

  const activated = coordinator.activateApproved('GIT_WRITE', requested.generation);
  assert.equal(activated.status, 'APPLIED');
  assert.deepEqual(activated.state.activeCapabilities, ['GIT_WRITE']);
});

test('activation without approval or after state drift fails closed', () => {
  const { activationService, coordinator } = createCoordinator();
  const requested = activationService.setRequested('GIT_WRITE', true, 0);

  const withoutApproval = coordinator.activateApproved('GIT_WRITE', requested.generation);
  assert.equal(withoutApproval.status, 'BLOCKED');
  assert.match(withoutApproval.reasons.join(' '), /exact human approval/);

  const approved = coordinator.approve('GIT_WRITE', requested.generation);
  assert.equal(approved.status, 'APPROVED');

  const changed = activationService.setRequested('RELEASE_DEPLOY', true, requested.generation);
  const staleApproval = coordinator.activateApproved('GIT_WRITE', changed.generation);
  assert.equal(staleApproval.status, 'BLOCKED');
  assert.match(staleApproval.reasons.join(' '), /exact human approval/);
});

test('all four critical capabilities use the same explicit approval path independently', () => {
  const { activationService, coordinator } = createCoordinator();
  let generation = 0;

  for (const capability of [
    'GIT_WRITE',
    'RELEASE_DEPLOY',
    'INFRASTRUCTURE_MUTATION',
    'AUTOMATIC_REMEDIATION',
  ]) {
    const requested = activationService.setRequested(capability, true, generation);
    generation = requested.generation;

    const approved = coordinator.approve(capability, generation);
    assert.equal(approved.status, 'APPROVED');

    const activated = coordinator.activateApproved(capability, generation);
    assert.equal(activated.status, 'APPLIED');
    generation = activated.generation;
  }

  assert.deepEqual(activationService.snapshot().state.activeCapabilities, [
    'GIT_WRITE',
    'RELEASE_DEPLOY',
    'INFRASTRUCTURE_MUTATION',
    'AUTOMATIC_REMEDIATION',
  ]);
});
