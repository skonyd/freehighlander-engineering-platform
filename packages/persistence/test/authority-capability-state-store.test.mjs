import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  AuthorityCapabilityStateStore,
  authorityCapabilityStateDefaultsDeny,
  authorityCapabilityStateStoreCanGrantAuthority,
  createDefaultAuthorityCapabilityStateV1,
} from '../dist/index.js';

test('authority capability state defaults every critical capability to DENY', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fh-authority-state-'));
  const store = new AuthorityCapabilityStateStore(join(directory, 'authority.json'));

  const snapshot = store.read();

  assert.equal(snapshot.generation, 0);
  assert.equal(snapshot.snapshotHash, null);
  assert.deepEqual(snapshot.state, createDefaultAuthorityCapabilityStateV1());
  assert.deepEqual(snapshot.state.requestedCapabilities, []);
  assert.deepEqual(snapshot.state.activeCapabilities, []);
  assert.equal(authorityCapabilityStateDefaultsDeny(), true);
  assert.equal(authorityCapabilityStateStoreCanGrantAuthority(), false);
});

test('authority capability state persists requested and active capabilities across restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fh-authority-state-'));
  const filePath = join(directory, 'authority.json');

  const first = new AuthorityCapabilityStateStore(filePath);
  const write = first.write(0, {
    schemaVersion: 1,
    requestedCapabilities: ['GIT_WRITE', 'AUTOMATIC_REMEDIATION'],
    activeCapabilities: ['GIT_WRITE'],
  });

  assert.equal(write.status, 'WRITTEN');
  assert.equal(write.snapshot?.generation, 1);

  const restarted = new AuthorityCapabilityStateStore(filePath);
  const snapshot = restarted.read();

  assert.equal(snapshot.generation, 1);
  assert.deepEqual(snapshot.state.requestedCapabilities, ['GIT_WRITE', 'AUTOMATIC_REMEDIATION']);
  assert.deepEqual(snapshot.state.activeCapabilities, ['GIT_WRITE']);
});

test('authority capability state uses generation CAS', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fh-authority-state-'));
  const store = new AuthorityCapabilityStateStore(join(directory, 'authority.json'));

  assert.equal(
    store.write(0, {
      schemaVersion: 1,
      requestedCapabilities: ['RELEASE_DEPLOY'],
      activeCapabilities: [],
    }).status,
    'WRITTEN',
  );

  const conflict = store.write(0, {
    schemaVersion: 1,
    requestedCapabilities: ['INFRASTRUCTURE_MUTATION'],
    activeCapabilities: [],
  });

  assert.equal(conflict.status, 'GENERATION_CONFLICT');
  assert.equal(conflict.actualGeneration, 1);
  assert.deepEqual(conflict.snapshot?.state.requestedCapabilities, ['RELEASE_DEPLOY']);
});

test('active capabilities must be requested and unknown capabilities fail closed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fh-authority-state-'));
  const store = new AuthorityCapabilityStateStore(join(directory, 'authority.json'));

  assert.throws(
    () =>
      store.write(0, {
        schemaVersion: 1,
        requestedCapabilities: [],
        activeCapabilities: ['GIT_WRITE'],
      }),
    /must also be requested/,
  );

  assert.throws(
    () =>
      store.write(0, {
        schemaVersion: 1,
        requestedCapabilities: ['NOT_A_CAPABILITY'],
        activeCapabilities: [],
      }),
    /unknown capability/,
  );
});
