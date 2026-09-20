import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSafeCheckpointWorktree,
  checkpointCanInferSemanticGatePass,
  collectRepositoryReconciliation,
  evaluateRepositoryReconciliation,
  isForbiddenCheckpointPath,
} from '../lib/reconciliation.mjs';

const state = {
  active_work: {
    branch: 'feat/work',
    pull_request: 77,
  },
  external_dependency: {
    repository: 'owner/dependency',
    pull_request: 207,
    expected_head: 'external-sha',
  },
  repository: 'owner/repo',
};

test('matching branch, remote head and PR are canonical', () => {
  const result = evaluateRepositoryReconciliation({
    state,
    localBranch: 'feat/work',
    localHead: 'abc',
    remoteHead: 'abc',
    pullRequest: {
      number: 77,
      state: 'open',
      headRef: 'feat/work',
      headSha: 'abc',
    },
    externalPullRequest: {
      number: 207,
      state: 'open',
      headRef: 'dependency',
      headSha: 'external-sha',
    },
  });

  assert.equal(result.canonical, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('branch, remote and PR mismatches are stale and fail closed', () => {
  const result = evaluateRepositoryReconciliation({
    state,
    localBranch: 'main',
    localHead: 'local',
    remoteHead: 'remote',
    pullRequest: {
      number: 77,
      state: 'closed',
      headRef: 'other',
      headSha: 'different',
    },
  });

  assert.equal(result.canonical, false);
  assert.equal(
    result.errors.some((entry) => entry.includes('local branch')),
    true,
  );
  assert.equal(
    result.errors.some((entry) => entry.includes('local HEAD')),
    true,
  );
  assert.equal(
    result.errors.some((entry) => entry.includes('not open')),
    true,
  );
  assert.equal(
    result.errors.some((entry) => entry.includes('head branch mismatch')),
    true,
  );
});

test('external dependency head drift is visible without fabricating gate failure', () => {
  const result = evaluateRepositoryReconciliation({
    state,
    localBranch: 'feat/work',
    localHead: 'abc',
    remoteHead: 'abc',
    pullRequest: {
      number: 77,
      state: 'open',
      headRef: 'feat/work',
      headSha: 'abc',
    },
    externalPullRequest: {
      number: 207,
      state: 'open',
      headRef: 'dependency',
      headSha: 'new-external-sha',
    },
  });

  assert.equal(result.canonical, true);
  assert.deepEqual(result.warnings, [
    'external dependency head changed; reconcile canonical state',
  ]);
});

test('collector can be deterministically exercised with injected git and PR lookup', async () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'branch') return 'feat/work';
    if (args[0] === 'rev-parse') return 'abc';
    if (args[0] === 'ls-remote') return 'abc\trefs/heads/feat/work';
    throw new Error('unexpected git call');
  };
  const fetchPullRequest = async (repository, number) => ({
    number,
    state: 'open',
    headRef: repository === 'owner/repo' ? 'feat/work' : 'dependency',
    headSha: repository === 'owner/repo' ? 'abc' : 'external-sha',
  });

  const result = await collectRepositoryReconciliation('/repo', state, {
    runGit,
    fetchPullRequest,
  });

  assert.equal(result.canonical, true);
  assert.equal(calls.includes('ls-remote origin refs/heads/feat/work'), true);
});

test('checkpoint path guard rejects runtime and secret-like paths', () => {
  for (const file of [
    '.env',
    '.env.local',
    '.freehighlander/runtime/events.jsonl',
    'tmp/app.log',
    'state.sqlite',
    'credentials.json',
    'api_token.txt',
  ]) {
    assert.equal(isForbiddenCheckpointPath(file), true, file);
  }

  assert.equal(isForbiddenCheckpointPath('src/index.ts'), false);
  assert.throws(
    () => assertSafeCheckpointWorktree('?? .env\n M src/index.ts'),
    /forbidden runtime\/secret paths/,
  );
  assert.throws(() => assertSafeCheckpointWorktree(' M src/index.ts'), /worktree is dirty/);
  assert.doesNotThrow(() => assertSafeCheckpointWorktree(''));
});

test('checkpoint state can never infer semantic gate PASS', () => {
  assert.equal(checkpointCanInferSemanticGatePass(), false);
});
