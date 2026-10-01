import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityExecutionGate,
  LocalGitWorktreeBackend,
  createExecutionWorkspaceDescriptor,
  createGatedLocalGitWriteExecutor,
  localGitWriteExecutorCanBypassCapabilityGate,
  localGitWriteExecutorUsesShell,
} from '../dist/index.js';

const execFileAsync = promisify(execFile);
const SNAPSHOT_HASH = 'a'.repeat(64);

async function git(cwd, args) {
  const result = await execFileAsync('git', args, { cwd });
  return result.stdout.trim();
}

async function fixture(t, accessMode = 'MUTABLE_IMPLEMENTATION') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fh31b-git-write-'));
  const repositoryRoot = path.join(root, 'repo');
  const runtimeRoot = path.join(root, 'runtime');
  await mkdir(repositoryRoot, { recursive: true });
  await git(repositoryRoot, ['init']);
  await git(repositoryRoot, ['config', 'user.email', 'seed@example.invalid']);
  await git(repositoryRoot, ['config', 'user.name', 'Seed']);
  await writeFile(path.join(repositoryRoot, 'tracked.txt'), 'one\n', 'utf8');
  await git(repositoryRoot, ['add', 'tracked.txt']);
  await git(repositoryRoot, ['commit', '-m', 'seed']);
  const revision = await git(repositoryRoot, ['rev-parse', 'HEAD']);

  const backend = new LocalGitWorktreeBackend({ runtimeRoot });
  const descriptor = createExecutionWorkspaceDescriptor({
    workspaceId: accessMode === 'MUTABLE_IMPLEMENTATION' ? 'workspace-mut' : 'workspace-ro',
    runId: 'run-001',
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    exactRevision: revision,
    runSnapshotHash: SNAPSHOT_HASH,
    backendId: 'local-git-worktree',
    accessMode,
  });
  const handle = await backend.create(descriptor, repositoryRoot);
  const stateStore = new AuthorityCapabilityStateStore(path.join(root, 'authority.json'));
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore,
    expectedRevision: revision,
    observeRevision: () => revision,
  });

  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  return { root, repositoryRoot, runtimeRoot, revision, backend, handle, stateStore, gate };
}

function activateGitWrite(stateStore) {
  const current = stateStore.read();
  const result = stateStore.write(current.generation, {
    schemaVersion: 1,
    requestedCapabilities: ['GIT_WRITE'],
    activeCapabilities: ['GIT_WRITE'],
  });
  assert.equal(result.status, 'WRITTEN');
}

function request(handle, input, overrides = {}) {
  return {
    schemaVersion: 1,
    activityId: 'activity-001',
    runId: handle.descriptor.runId,
    workspaceHash: handle.descriptor.workspaceHash,
    kind: 'COMMAND',
    input: JSON.stringify(input),
    timeoutMs: 3000,
    attempt: 1,
    executionMode: 'LIVE',
    ...overrides,
  };
}

function executor(fx, overrides = {}) {
  return createGatedLocalGitWriteExecutor(fx.gate, fx.handle, {
    authorName: 'FreeHighlander Operator',
    authorEmail: 'operator@example.invalid',
    ...overrides,
  });
}

function commitInput(overrides = {}) {
  return {
    schemaVersion: 1,
    operation: 'COMMIT_CHANGESET',
    branch: 'fh/test-change',
    message: 'Apply test change',
    paths: ['tracked.txt'],
    ...overrides,
  };
}

test('FH-31B local Git mutation stays default DENY and exposes no raw bypass', async (t) => {
  const fx = await fixture(t);
  await writeFile(path.join(fx.handle.workspacePath, 'tracked.txt'), 'two\n', 'utf8');

  const result = await executor(fx).execute(request(fx.handle, commitInput()));

  assert.equal(result.status, 'FAILED');
  assert.equal(result.failureKind, 'CAPABILITY_GATE_DENIED');
  assert.equal(await git(fx.handle.workspacePath, ['rev-parse', 'HEAD']), fx.revision);
  assert.equal(localGitWriteExecutorUsesShell(), false);
  assert.equal(localGitWriteExecutorCanBypassCapabilityGate(), false);
});

test('active GIT_WRITE creates a bounded branch and commit from allowlisted paths', async (t) => {
  const fx = await fixture(t);
  activateGitWrite(fx.stateStore);
  await writeFile(path.join(fx.handle.workspacePath, 'tracked.txt'), 'two\n', 'utf8');

  const result = await executor(fx).execute(request(fx.handle, commitInput()));

  assert.equal(result.status, 'SUCCEEDED');
  const output = JSON.parse(result.output);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.branch, 'fh/test-change');
  assert.deepEqual(output.paths, ['tracked.txt']);
  assert.match(output.headRevision, /^[a-f0-9]{40}$/);
  assert.notEqual(output.headRevision, fx.revision);
  assert.equal(await git(fx.handle.workspacePath, ['branch', '--show-current']), 'fh/test-change');
  assert.equal(
    await git(fx.handle.workspacePath, ['show', '-s', '--format=%an']),
    'FreeHighlander Operator',
  );
  assert.equal(
    await git(fx.handle.workspacePath, ['show', '-s', '--format=%ae']),
    'operator@example.invalid',
  );
  assert.equal(
    await git(fx.handle.workspacePath, ['show', '-s', '--format=%s']),
    'Apply test change',
  );
});

test('immutable workspace and exact HEAD drift fail closed before Git mutation', async (t) => {
  const readonly = await fixture(t, 'IMMUTABLE_REVIEW');
  activateGitWrite(readonly.stateStore);
  const readonlyResult = await executor(readonly).execute(request(readonly.handle, commitInput()));
  assert.equal(readonlyResult.failureKind, 'IMMUTABLE_WORKSPACE');

  const fx = await fixture(t);
  activateGitWrite(fx.stateStore);
  await git(fx.handle.workspacePath, ['commit', '--allow-empty', '-m', 'drift']);
  const drifted = await executor(fx).execute(request(fx.handle, commitInput()));
  assert.equal(drifted.failureKind, 'GIT_WRITE_WORKSPACE_INVALID');
});

test('dirty index no-change and directory scope expansion are rejected', async (t) => {
  const dirty = await fixture(t);
  activateGitWrite(dirty.stateStore);
  await writeFile(path.join(dirty.handle.workspacePath, 'tracked.txt'), 'dirty\n', 'utf8');
  await git(dirty.handle.workspacePath, ['add', 'tracked.txt']);
  const dirtyResult = await executor(dirty).execute(request(dirty.handle, commitInput()));
  assert.equal(dirtyResult.failureKind, 'GIT_WRITE_INDEX_NOT_CLEAN');

  const unchanged = await fixture(t);
  activateGitWrite(unchanged.stateStore);
  const unchangedResult = await executor(unchanged).execute(
    request(unchanged.handle, commitInput()),
  );
  assert.equal(unchangedResult.failureKind, 'GIT_WRITE_NO_CHANGES');

  const scoped = await fixture(t);
  activateGitWrite(scoped.stateStore);
  await mkdir(path.join(scoped.handle.workspacePath, 'nested'), { recursive: true });
  await writeFile(path.join(scoped.handle.workspacePath, 'nested', 'a.txt'), 'a\n', 'utf8');
  const scopedResult = await executor(scoped).execute(
    request(scoped.handle, commitInput({ paths: ['nested'] })),
  );
  assert.equal(scopedResult.failureKind, 'GIT_WRITE_SCOPE_VIOLATION');
  assert.equal(await git(scoped.handle.workspacePath, ['diff', '--cached', '--name-only']), '');
});

test('existing branch produces a failed closed mutation and cleans staged state', async (t) => {
  const fx = await fixture(t);
  activateGitWrite(fx.stateStore);
  await git(fx.handle.workspacePath, ['branch', 'fh/test-change']);
  await writeFile(path.join(fx.handle.workspacePath, 'tracked.txt'), 'two\n', 'utf8');

  const result = await executor(fx).execute(request(fx.handle, commitInput()));

  assert.equal(result.failureKind, 'GIT_WRITE_FAILED');
  assert.equal(await git(fx.handle.workspacePath, ['diff', '--cached', '--name-only']), '');
  assert.equal(await git(fx.handle.workspacePath, ['rev-parse', 'HEAD']), fx.revision);
});

test('executor validates operator identity and execution bounds at construction', async (t) => {
  const fx = await fixture(t);

  assert.throws(
    () =>
      createGatedLocalGitWriteExecutor(fx.gate, fx.handle, {
        authorName: '',
        authorEmail: 'operator@example.invalid',
      }),
    /authorName/,
  );
  assert.throws(
    () =>
      createGatedLocalGitWriteExecutor(fx.gate, fx.handle, {
        authorName: 'x'.repeat(129),
        authorEmail: 'operator@example.invalid',
      }),
    /authorName/,
  );
  assert.throws(
    () =>
      createGatedLocalGitWriteExecutor(fx.gate, fx.handle, {
        authorName: 'Operator',
        authorEmail: 'bad address',
      }),
    /authorEmail/,
  );
  assert.throws(
    () =>
      createGatedLocalGitWriteExecutor(fx.gate, fx.handle, {
        authorName: 'Operator',
        authorEmail: 'operator@example.invalid',
        maxPaths: 0,
      }),
    /maxPaths/,
  );
  assert.throws(
    () =>
      createGatedLocalGitWriteExecutor(fx.gate, fx.handle, {
        authorName: 'Operator',
        authorEmail: 'operator@example.invalid',
        maxPaths: 4097,
      }),
    /maxPaths/,
  );
  assert.throws(
    () =>
      createGatedLocalGitWriteExecutor(fx.gate, fx.handle, {
        authorName: 'Operator',
        authorEmail: 'operator@example.invalid',
        maxOutputBytes: 100,
      }),
    /maxOutputBytes/,
  );
});

test('malformed activity inputs fail before any Git write', async (t) => {
  const fx = await fixture(t);
  activateGitWrite(fx.stateStore);
  const run = async (input) => executor(fx).execute(request(fx.handle, input));

  const cases = [
    ['{', 'MALFORMED_ACTIVITY_INPUT', true],
    [[], 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), unknown: true }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), schemaVersion: 2 }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), operation: 'PUSH' }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), branch: 3 }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), message: 3 }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), paths: 'tracked.txt' }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), paths: ['tracked.txt', 3] }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), branch: 'bad..branch' }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), branch: 'bad//branch' }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), branch: 'bad@{branch' }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), branch: 'bad/' }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), branch: 'bad.' }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), branch: 'bad.lock' }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), message: '' }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), message: 'x'.repeat(201) }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), message: 'two\nlines' }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), paths: [] }, 'MALFORMED_ACTIVITY_INPUT'],
    [
      { ...commitInput(), paths: Array.from({ length: 257 }, (_, i) => 'p' + i) },
      'MALFORMED_ACTIVITY_INPUT',
    ],
    [{ ...commitInput(), paths: ['tracked.txt', 'tracked.txt'] }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), paths: [''] }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), paths: ['/tmp/x'] }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), paths: ['../x'] }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), paths: ['./x'] }, 'MALFORMED_ACTIVITY_INPUT'],
    [{ ...commitInput(), paths: ['.git/config'] }, 'MALFORMED_ACTIVITY_INPUT'],
  ];

  for (const [input, expected, raw] of cases) {
    const result = raw
      ? await executor(fx).execute(request(fx.handle, input, { input }))
      : await run(input);
    assert.equal(result.failureKind, expected);
  }
});

test('valid explicit bounds and additional malformed scalar branches are covered', async (t) => {
  const fx = await fixture(t);
  activateGitWrite(fx.stateStore);

  assert.doesNotThrow(() =>
    createGatedLocalGitWriteExecutor(fx.gate, fx.handle, {
      authorName: 'Operator',
      authorEmail: 'operator@example.invalid',
      maxPaths: 1,
      maxOutputBytes: 2048,
    }),
  );
  assert.throws(
    () =>
      createGatedLocalGitWriteExecutor(fx.gate, fx.handle, {
        authorName: 'Operator\0Name',
        authorEmail: 'operator@example.invalid',
      }),
    /authorName/,
  );
  assert.throws(
    () =>
      createGatedLocalGitWriteExecutor(fx.gate, fx.handle, {
        authorName: 'Operator',
        authorEmail: 7,
      }),
    /authorEmail/,
  );

  for (const input of [
    null,
    { ...commitInput(), branch: '-bad' },
    { ...commitInput(), message: 'two\rlines' },
    { ...commitInput(), message: 'bad\0message' },
    { ...commitInput(), paths: null },
    { ...commitInput(), paths: ['C:\\temp\\x'] },
  ]) {
    const result = await executor(fx).execute(request(fx.handle, input));
    assert.equal(result.failureKind, 'MALFORMED_ACTIVITY_INPUT');
  }
});

test('forged workspace path identities fail before mutation', async (t) => {
  const fx = await fixture(t);
  activateGitWrite(fx.stateStore);

  const nonCanonicalHandle = {
    ...fx.handle,
    workspacePath: fx.handle.workspacePath + '/../' + path.basename(fx.handle.workspacePath),
  };
  const nonCanonical = createGatedLocalGitWriteExecutor(fx.gate, nonCanonicalHandle, {
    authorName: 'Operator',
    authorEmail: 'operator@example.invalid',
  });
  assert.equal(
    (await nonCanonical.execute(request(nonCanonicalHandle, commitInput()))).failureKind,
    'GIT_WRITE_WORKSPACE_INVALID',
  );

  const symlinkPath = path.join(fx.root, 'workspace-link');
  await symlink(fx.handle.workspacePath, symlinkPath, 'dir');
  const symlinkHandle = { ...fx.handle, workspacePath: symlinkPath };
  const symlinkExecutor = createGatedLocalGitWriteExecutor(fx.gate, symlinkHandle, {
    authorName: 'Operator',
    authorEmail: 'operator@example.invalid',
  });
  assert.equal(
    (await symlinkExecutor.execute(request(symlinkHandle, commitInput()))).failureKind,
    'GIT_WRITE_WORKSPACE_INVALID',
  );

  const nestedPath = path.join(fx.handle.workspacePath, 'nested-root-check');
  await mkdir(nestedPath);
  const nestedHandle = { ...fx.handle, workspacePath: nestedPath };
  const nestedExecutor = createGatedLocalGitWriteExecutor(fx.gate, nestedHandle, {
    authorName: 'Operator',
    authorEmail: 'operator@example.invalid',
  });
  assert.equal(
    (await nestedExecutor.execute(request(nestedHandle, commitInput()))).failureKind,
    'GIT_WRITE_WORKSPACE_INVALID',
  );
});

test('commit failure after branch creation rolls back branch and index', async (t) => {
  const fx = await fixture(t);
  activateGitWrite(fx.stateStore);
  await writeFile(path.join(fx.handle.workspacePath, 'tracked.txt'), 'two\n', 'utf8');
  await git(fx.handle.workspacePath, ['config', 'commit.cleanup', 'definitely-invalid']);

  const result = await executor(fx).execute(request(fx.handle, commitInput()));

  assert.equal(result.failureKind, 'GIT_WRITE_FAILED');
  assert.equal(await git(fx.handle.workspacePath, ['rev-parse', 'HEAD']), fx.revision);
  assert.equal(await git(fx.handle.workspacePath, ['branch', '--show-current']), '');
  assert.equal(await git(fx.handle.workspacePath, ['diff', '--cached', '--name-only']), '');
  await assert.rejects(() =>
    git(fx.handle.workspacePath, ['show-ref', '--verify', 'refs/heads/fh/test-change']),
  );
});
