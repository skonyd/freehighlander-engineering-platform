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

test('snapshot and repeated request paths are deterministic and authority-neutral', () => {
  const service = createService();

  const initial = service.snapshot();
  assert.equal(initial.generation, 0);
  assert.deepEqual(initial.state.requestedCapabilities, []);

  const requested = service.setRequested('GIT_WRITE', true, initial.generation);
  const repeated = service.setRequested('GIT_WRITE', true, requested.generation);
  assert.equal(repeated.status, 'UNCHANGED');
  assert.equal(repeated.generation, requested.generation);

  const absentRemoval = service.setRequested('RELEASE_DEPLOY', false, repeated.generation);
  assert.equal(absentRemoval.status, 'UNCHANGED');
  assert.deepEqual(absentRemoval.state.requestedCapabilities, ['GIT_WRITE']);
});

test('activation reports every independent authority gate failure', () => {
  const service = createService();
  const requested = service.setRequested('GIT_WRITE', true, 0);

  const blocked = service.activate(
    'GIT_WRITE',
    requested.generation,
    allowedEvidence({
      v3AuthorityEnabled: false,
      exactHumanApprovalVerified: false,
      humanApprovalCapability: 'RELEASE_DEPLOY',
      systemPolicyEffect: 'HUMAN_REQUIRED',
    }),
  );

  assert.equal(blocked.status, 'BLOCKED');
  assert.match(blocked.reasons.join(' '), /V3 authority is not enabled/);
  assert.match(blocked.reasons.join(' '), /exact human approval is not verified/);
  assert.match(blocked.reasons.join(' '), /different capability/);
  assert.match(blocked.reasons.join(' '), /SYSTEM_POLICY is not ALLOW/);
});

test('activation and deactivation reject stale generations without state mutation', () => {
  const service = createService();
  const requested = service.setRequested('GIT_WRITE', true, 0);

  const staleActivation = service.activate('GIT_WRITE', 0, allowedEvidence());
  assert.equal(staleActivation.status, 'CONFLICT');
  assert.deepEqual(staleActivation.state.activeCapabilities, []);

  const activated = service.activate('GIT_WRITE', requested.generation, allowedEvidence());
  const staleDeactivation = service.deactivate('GIT_WRITE', requested.generation);
  assert.equal(staleDeactivation.status, 'CONFLICT');
  assert.deepEqual(staleDeactivation.state.activeCapabilities, ['GIT_WRITE']);

  const deactivated = service.deactivate('GIT_WRITE', activated.generation);
  const repeated = service.deactivate('GIT_WRITE', deactivated.generation);
  assert.equal(repeated.status, 'UNCHANGED');
  assert.equal(repeated.generation, deactivated.generation);
});

test('activation evidence validation fails closed on malformed capability revision and hashes', () => {
  const service = createService();

  assert.throws(
    () => service.setRequested('UNKNOWN_CAPABILITY', true, 0),
    /unknown authority capability/,
  );
  assert.throws(
    () =>
      service.activate(
        'GIT_WRITE',
        0,
        allowedEvidence({ humanApprovalCapability: 'UNKNOWN_CAPABILITY' }),
      ),
    /unknown authority capability/,
  );
  assert.throws(
    () => service.activate('GIT_WRITE', 0, allowedEvidence({ humanApprovalRevision: 'bad' })),
    /humanApprovalRevision must be a 40-character git SHA/,
  );
  assert.throws(
    () => service.activate('GIT_WRITE', 0, allowedEvidence({ observedRevision: 'bad' })),
    /observedRevision must be a 40-character git SHA/,
  );
  assert.throws(
    () => service.activate('GIT_WRITE', 0, allowedEvidence({ humanApprovalRequestHash: 'bad' })),
    /humanApprovalRequestHash must be lowercase sha256/,
  );
  assert.throws(
    () => service.activate('GIT_WRITE', 0, allowedEvidence({ humanDecisionHash: 'bad' })),
    /humanDecisionHash must be lowercase sha256/,
  );
  assert.throws(
    () => service.activate('GIT_WRITE', 0, allowedEvidence({ systemPolicyHash: 'bad' })),
    /systemPolicyHash must be lowercase sha256/,
  );
  assert.throws(
    () => service.activate('GIT_WRITE', 0, allowedEvidence({ observedPolicyHash: 'bad' })),
    /observedPolicyHash must be lowercase sha256/,
  );
});

test('concurrent write failures remain fail-closed even when the store returns partial conflict state', () => {
  const baseState = {
    schemaVersion: 1,
    requestedCapabilities: ['GIT_WRITE'],
    activeCapabilities: [],
  };

  const writerConflictStore = {
    read() {
      return { generation: 0, state: baseState, snapshotHash: null };
    },
    write(expectedGeneration) {
      return {
        status: 'WRITER_CONFLICT',
        expectedGeneration,
        actualGeneration: null,
        snapshot: null,
        authority: 'NONE',
      };
    },
  };
  const writerConflictService = new AuthorityCapabilityActivationService(writerConflictStore);
  const writerConflict = writerConflictService.activate('GIT_WRITE', 0, allowedEvidence());
  assert.equal(writerConflict.status, 'CONFLICT');
  assert.equal(writerConflict.generation, 0);
  assert.deepEqual(writerConflict.state, baseState);

  const newerState = {
    schemaVersion: 1,
    requestedCapabilities: ['GIT_WRITE'],
    activeCapabilities: [],
  };
  const generationConflictStore = {
    read() {
      return { generation: 0, state: baseState, snapshotHash: null };
    },
    write(expectedGeneration) {
      return {
        status: 'GENERATION_CONFLICT',
        expectedGeneration,
        actualGeneration: 1,
        snapshot: { generation: 1, state: newerState, snapshotHash: 'a'.repeat(64) },
        authority: 'NONE',
      };
    },
  };
  const generationConflictService = new AuthorityCapabilityActivationService(
    generationConflictStore,
  );
  const generationConflict = generationConflictService.activate(
    'GIT_WRITE',
    0,
    allowedEvidence(),
  );
  assert.equal(generationConflict.status, 'CONFLICT');
  assert.equal(generationConflict.generation, 1);
  assert.deepEqual(generationConflict.state, newerState);

  const invalidWrittenStore = {
    read() {
      return { generation: 0, state: baseState, snapshotHash: null };
    },
    write(expectedGeneration) {
      return {
        status: 'WRITTEN',
        expectedGeneration,
        actualGeneration: 1,
        snapshot: null,
        authority: 'NONE',
      };
    },
  };
  const invalidWrittenService = new AuthorityCapabilityActivationService(invalidWrittenStore);
  const invalidWritten = invalidWrittenService.activate('GIT_WRITE', 0, allowedEvidence());
  assert.equal(invalidWritten.status, 'CONFLICT');
  assert.equal(invalidWritten.generation, 1);
});

