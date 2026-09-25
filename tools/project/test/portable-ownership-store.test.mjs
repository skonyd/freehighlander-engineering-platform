import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  acquirePortableOwnershipLease,
  releasePortableOwnershipLease,
  renewPortableOwnershipLease,
} from '../../../packages/orchestration/dist/index.js';
import {
  GitPortableOwnershipStore,
  portableOwnershipStateCanMergeIntoProductBranches,
  portableOwnershipStateRef,
  portableOwnershipStoreCanGrantAuthority,
} from '../lib/portable-ownership-store.mjs';

function request(overrides = {}) {
  return {
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project:151',
    workItemId: 'issue:151',
    runId: 'run-151',
    leaseId: 'lease-machine-a',
    machineInstanceId: 'machine-a',
    now: '2026-09-25T07:00:00.000Z',
    ttlMs: 60_000,
    lastCheckpointGeneration: 3,
    ...overrides,
  };
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('Git portable ownership store publishes reads renews and releases with exact CAS', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-portable-ownership-'));
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');

  try {
    mkdirSync(work);
    git(root, ['init', '--bare', remote]);
    git(work, ['init']);
    git(work, ['remote', 'add', 'origin', remote]);

    const store = new GitPortableOwnershipStore(work);
    const first = acquirePortableOwnershipLease(request(), null).lease;
    const firstPublish = await store.publishCas(first, null);
    assert.equal(firstPublish.status, 'ACCEPT');
    assert.match(firstPublish.revision, /^[a-f0-9]{40,64}$/);

    const firstRead = await store.getLatest(
      first.repositoryIdentity,
      first.projectId,
      first.workItemId,
    );
    assert.deepEqual(firstRead.lease, first);
    assert.equal(firstRead.revision, firstPublish.revision);
    assert.equal(firstRead.authority, 'NONE');

    const stale = await store.publishCas(first, null);
    assert.equal(stale.status, 'CONFLICT');
    assert.equal(stale.revision, null);

    const renewed = renewPortableOwnershipLease(
      first,
      first.leaseId,
      first.generation,
      '2026-09-25T07:00:30.000Z',
      120_000,
      4,
    );
    const renewPublish = await store.publishCas(renewed, firstPublish.revision);
    assert.equal(renewPublish.status, 'ACCEPT');
    assert.equal(renewed.generation, first.generation);

    const released = releasePortableOwnershipLease(
      renewed,
      renewed.leaseId,
      renewed.generation,
      '2026-09-25T07:00:40.000Z',
    );
    const releasePublish = await store.publishCas(released, renewPublish.revision);
    assert.equal(releasePublish.status, 'ACCEPT');

    const latest = await store.getLatest(
      released.repositoryIdentity,
      released.projectId,
      released.workItemId,
    );
    assert.deepEqual(latest.lease, released);
    assert.equal(latest.revision, releasePublish.revision);

    const stateRef = portableOwnershipStateRef(released.projectId, released.workItemId);
    const names = git(root, ['--git-dir', remote, 'ls-tree', '--name-only', stateRef]);
    assert.equal(names, 'lease.json');

    const persisted = JSON.parse(
      git(root, ['--git-dir', remote, 'show', `${stateRef}:lease.json`]),
    );
    assert.deepEqual(persisted, released);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('portable ownership state refs are Git-safe and authority-neutral', () => {
  const ref = portableOwnershipStateRef('project:151', 'issue:151');
  assert.match(ref, /^refs\/heads\/freehighlander-ownership\/[a-f0-9]{64}\/[a-f0-9]{64}$/);
  assert.equal(portableOwnershipStateCanMergeIntoProductBranches(), false);
  assert.equal(portableOwnershipStoreCanGrantAuthority(), false);
});

test('portable ownership store fails closed on malformed configuration and revisions', async () => {
  assert.throws(() => new GitPortableOwnershipStore('', 'origin'), /repositoryRoot/);
  assert.throws(() => new GitPortableOwnershipStore('/tmp', 'bad remote'), /bounded Git remote/);
  assert.throws(() => portableOwnershipStateRef('x', 'issue-151'), /projectId/);

  const store = new GitPortableOwnershipStore('/tmp', 'origin', {
    run(args) {
      if (args[0] === 'ls-remote') return { exitCode: 0, stdout: '', stderr: '' };
      throw new Error('unexpected git command');
    },
  });
  const lease = acquirePortableOwnershipLease(request(), null).lease;
  await assert.rejects(() => store.publishCas(lease, 'not-a-revision'), /expectedRevision/);
});
