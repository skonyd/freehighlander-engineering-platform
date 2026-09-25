import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  GitResumeStore,
  SpawnGitResumeCommandRunner,
  createResumeManifestV1,
  gitResumeStoreCanContainSecretValues,
  gitResumeStoreCanGrantAuthority,
  resumeStateBranchCanMergeIntoProductBranches,
  resumeStateRef,
} from '../dist/index.js';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);
const H4 = '4'.repeat(64);
const H5 = '5'.repeat(64);

function manifestInput(overrides = {}) {
  return {
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project-151',
    activeWorkItemId: 'issue-151',
    issueNumber: 151,
    pullRequestNumber: null,
    branch: 'feature/resume',
    remoteHead: 'a'.repeat(40),
    baseRevision: 'b'.repeat(40),
    workflow: { id: 'project-execution', version: '1.0.0', hash: H1 },
    runSnapshotHash: H2,
    policyHash: H3,
    catalogSnapshotHash: H4,
    bindingSnapshotHash: H5,
    logicalRoleState: { controller: 'READY' },
    completedNodeResults: [],
    parkedDecisionIds: [],
    waitingNodeIds: [],
    readyNodeIds: ['node-ready'],
    artifactManifest: [],
    checkpointHash: H4,
    replayManifestHash: H5,
    workspaceLogicalId: 'workspace-151',
    requiredProviderCapabilities: { 'provider-a': ['reasoning'] },
    requiredSecretHandleIds: ['github.repo.auth'],
    createdAt: '2026-09-25T05:00:00.000Z',
    generation: 1,
    ...overrides,
  };
}

function runGit(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

test('GitResumeStore publishes and reads a CAS-bound manifest on an isolated state branch', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-git-resume-'));
  const remote = path.join(root, 'remote.git');
  const working = path.join(root, 'working');

  try {
    runGit(root, ['init', '--bare', remote]);
    runGit(root, ['init', '-b', 'main', working]);
    runGit(working, ['config', 'user.name', 'FreeHighlander Test']);
    runGit(working, ['config', 'user.email', 'fh-test@example.invalid']);
    runGit(working, ['commit', '--allow-empty', '-m', 'initial']);
    runGit(working, ['remote', 'add', 'origin', remote]);
    runGit(working, ['push', '-u', 'origin', 'main']);

    const mainBefore = runGit(working, ['rev-parse', 'main']);
    const store = new GitResumeStore({ repositoryRoot: working });

    assert.equal(
      await store.getLatest('skonyd/freehighlander-engineering-platform', 'project-151'),
      null,
    );

    const first = createResumeManifestV1(manifestInput());
    const firstDecision = await store.publishCas(first, null);
    assert.deepEqual(firstDecision, {
      status: 'ACCEPT',
      reasons: [],
      acceptedGeneration: 1,
      authority: 'NONE',
    });

    const stateRef = resumeStateRef('project-151');
    assert.equal(stateRef, 'refs/heads/freehighlander-state/project-151');
    const stateHead = runGit(working, ['ls-remote', '--refs', 'origin', stateRef]).split(/\s+/)[0];
    assert.match(stateHead, /^[a-f0-9]{40}$/);

    const restored = await store.getLatest(
      'skonyd/freehighlander-engineering-platform',
      'project-151',
    );
    assert.deepEqual(restored, first);
    assert.equal(runGit(working, ['rev-parse', 'main']), mainBefore);

    const stateTree = runGit(working, [
      'ls-tree',
      '--name-only',
      'refs/freehighlander/resume-cache/project-151',
    ]);
    assert.equal(stateTree, 'manifest.json');

    const second = createResumeManifestV1(
      manifestInput({
        generation: 2,
        remoteHead: 'c'.repeat(40),
        createdAt: '2026-09-25T05:05:00.000Z',
      }),
    );
    const stale = await store.publishCas(second, 0);
    assert.equal(stale.status, 'CONFLICT');
    assert.deepEqual(stale.reasons, ['stale manifest generation']);

    const accepted = await store.publishCas(second, 1);
    assert.equal(accepted.status, 'ACCEPT');
    assert.equal(accepted.acceptedGeneration, 2);
    assert.deepEqual(
      await store.getLatest('skonyd/freehighlander-engineering-platform', 'project-151'),
      second,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Git resume state is authority-neutral secret-free metadata and not a product merge source', () => {
  assert.equal(resumeStateBranchCanMergeIntoProductBranches(), false);
  assert.equal(gitResumeStoreCanContainSecretValues(), false);
  assert.equal(gitResumeStoreCanGrantAuthority(), false);
  assert.throws(() => resumeStateRef('x'), /bounded identifier/);
});

test('Git resume store and command runner reject unsafe construction and arguments', () => {
  assert.throws(() => new GitResumeStore({ repositoryRoot: '' }), /repositoryRoot is required/);
  assert.throws(
    () => new GitResumeStore({ repositoryRoot: '.', remote: 'bad remote' }),
    /remote must be a bounded Git remote name/,
  );
  assert.throws(() => new SpawnGitResumeCommandRunner(''), /repositoryRoot is required/);

  const runner = new SpawnGitResumeCommandRunner('.');
  assert.throws(
    () => runner.run(['status\nmalformed']),
    /git resume command argument must be bounded single-line metadata/,
  );
  assert.throws(
    () => runner.run(['x'.repeat(4097)]),
    /git resume command argument must be bounded single-line metadata/,
  );
});
