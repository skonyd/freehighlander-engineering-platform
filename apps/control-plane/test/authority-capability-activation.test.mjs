import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityActivationService,
  capabilityActivationServiceCanBypassPolicy,
  capabilityActivationServiceCanImplicitlyActivate,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const OTHER_REVISION = 'b'.repeat(40);
const POLICY_HASH = 'c'.repeat(64);
const OTHER_POLICY_HASH = 'd'.repeat(64);
const REQUEST_HASH = 'e'.repeat(64);
const DECISION_HASH = 'f'.repeat(64);

function createService() {
  const directory = mkdtempSync(join(tmpdir(), 'fh-capability-activation-'));
  return new AuthorityCapabilityActivationService(
    new AuthorityCapabilityStateStore(join(directory, 'authority.json')),
  );
}

function allowedEvidence(overrides = {}) {
  return {
    v3AuthorityEnabled: true,
    exactHumanApprovalVerified: true,
    humanApprovalCapability: 'GIT_WRITE',
    humanApprovalRevision: REVISION,
    observedRevision: REVISION,
    humanApprovalRequestHash: REQUEST_HASH,
    humanDecisionHash: DECISION_HASH,
    systemPolicyEffect: 'ALLOW',
    systemPolicyHash: POLICY_HASH,
    observedPolicyHash: POLICY_HASH,
    ...overrides,
  };
}

test('requesting a capability never activates it implicitly', () => {
  const service = createService();
  const requested = service.setRequested('GIT_WRITE', true, 0);

  assert.equal(requested.status, 'APPLIED');
  assert.deepEqual(requested.state.requestedCapabilities, ['GIT_WRITE']);
  assert.deepEqual(requested.state.activeCapabilities, []);
  assert.equal(capabilityActivationServiceCanImplicitlyActivate(), false);
  assert.equal(capabilityActivationServiceCanBypassPolicy(), false);
});

test('activation requires a requested capability and every exact gate', () => {
  const service = createService();

  const notRequested = service.activate('GIT_WRITE', 0, allowedEvidence());
  assert.equal(notRequested.status, 'BLOCKED');
  assert.match(notRequested.reasons.join(' '), /not requested/);

  const requested = service.setRequested('GIT_WRITE', true, 0);
  const staleRevision = service.activate(
    'GIT_WRITE',
    requested.generation,
    allowedEvidence({ humanApprovalRevision: OTHER_REVISION }),
  );
  assert.equal(staleRevision.status, 'BLOCKED');
  assert.match(staleRevision.reasons.join(' '), /revision is stale/);

  const stalePolicy = service.activate(
    'GIT_WRITE',
    requested.generation,
    allowedEvidence({ observedPolicyHash: OTHER_POLICY_HASH }),
  );
  assert.equal(stalePolicy.status, 'BLOCKED');
  assert.match(stalePolicy.reasons.join(' '), /POLICY snapshot is stale/);

  const deniedPolicy = service.activate(
    'GIT_WRITE',
    requested.generation,
    allowedEvidence({ systemPolicyEffect: 'DENY' }),
  );
  assert.equal(deniedPolicy.status, 'BLOCKED');
  assert.match(deniedPolicy.reasons.join(' '), /not ALLOW/);
});

test('activation persists only after all gates pass and is idempotent', () => {
  const service = createService();
  const requested = service.setRequested('GIT_WRITE', true, 0);

  const activated = service.activate('GIT_WRITE', requested.generation, allowedEvidence());
  assert.equal(activated.status, 'APPLIED');
  assert.deepEqual(activated.state.activeCapabilities, ['GIT_WRITE']);

  const repeated = service.activate('GIT_WRITE', activated.generation, allowedEvidence());
  assert.equal(repeated.status, 'UNCHANGED');
  assert.equal(repeated.generation, activated.generation);
});

test('deactivation is fail-safe, immediate and does not need an activation gate', () => {
  const service = createService();
  const requested = service.setRequested('GIT_WRITE', true, 0);
  const activated = service.activate('GIT_WRITE', requested.generation, allowedEvidence());

  const deactivated = service.deactivate('GIT_WRITE', activated.generation);
  assert.equal(deactivated.status, 'APPLIED');
  assert.deepEqual(deactivated.state.requestedCapabilities, ['GIT_WRITE']);
  assert.deepEqual(deactivated.state.activeCapabilities, []);
});

test('unrequesting an active capability also removes it from active state', () => {
  const service = createService();
  const requested = service.setRequested('GIT_WRITE', true, 0);
  const activated = service.activate('GIT_WRITE', requested.generation, allowedEvidence());

  const removed = service.setRequested('GIT_WRITE', false, activated.generation);
  assert.equal(removed.status, 'APPLIED');
  assert.deepEqual(removed.state.requestedCapabilities, []);
  assert.deepEqual(removed.state.activeCapabilities, []);
});

test('stale generation fails closed without overwriting newer state', () => {
  const service = createService();
  const requested = service.setRequested('GIT_WRITE', true, 0);

  const conflict = service.setRequested('RELEASE_DEPLOY', true, 0);
  assert.equal(conflict.status, 'CONFLICT');
  assert.equal(conflict.generation, requested.generation);
  assert.deepEqual(conflict.state.requestedCapabilities, ['GIT_WRITE']);
});
