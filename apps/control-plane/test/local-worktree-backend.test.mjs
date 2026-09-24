import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  ActivityRunner,
  LocalGitWorktreeBackend,
  createExecutionWorkspaceDescriptor,
  createLocalCommandActivityExecutor,
  createLocalFilesystemActivityExecutor,
  createLocalGitActivityExecutor,
  localCommandExecutorUsesShell,
  localWorkspaceDestroyRequiresLeaseGuard,
  localWorktreeBackendCanGrantAuthority,
} from '../dist/index.js';

const execFileAsync = promisify(execFile);
const SNAPSHOT_HASH = 'a'.repeat(64);

async function git(cwd, args) {
  const result = await execFileAsync('git', args, { cwd });
  return result.stdout.trim();
}

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fh-local-runtime-'));
  const repositoryRoot = path.join(root, 'repo');
  const runtimeRoot = path.join(root, 'runtime');
  await mkdir(repositoryRoot, { recursive: true });

  await git(repositoryRoot, ['init']);
  await git(repositoryRoot, ['config', 'user.email', 'test@example.invalid']);
  await git(repositoryRoot, ['config', 'user.name', 'FreeHighlander Test']);

  await writeFile(path.join(repositoryRoot, 'tracked.txt'), 'one\n', 'utf8');
  await git(repositoryRoot, ['add', 'tracked.txt']);
  await git(repositoryRoot, ['commit', '-m', 'first']);
  const firstRevision = await git(repositoryRoot, ['rev-parse', 'HEAD']);

  await writeFile(path.join(repositoryRoot, 'tracked.txt'), 'two\n', 'utf8');
  await mkdir(path.join(repositoryRoot, 'nested'), { recursive: true });
  await writeFile(path.join(repositoryRoot, 'nested', 'keep.txt'), 'keep\n', 'utf8');
  await git(repositoryRoot, ['add', '.']);
  await git(repositoryRoot, ['commit', '-m', 'second']);
  const revision = await git(repositoryRoot, ['rev-parse', 'HEAD']);

  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  return { root, repositoryRoot, runtimeRoot, firstRevision, revision };
}

function descriptor(revision, overrides = {}) {
  return createExecutionWorkspaceDescriptor({
    workspaceId: 'workspace-001',
    runId: 'run-001',
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    exactRevision: revision,
    runSnapshotHash: SNAPSHOT_HASH,
    backendId: 'local-git-worktree',
    accessMode: 'MUTABLE_IMPLEMENTATION',
    ...overrides,
  });
}

function request(handle, kind, input, overrides = {}) {
  return {
    schemaVersion: 1,
    activityId: 'activity-001',
    runId: handle.descriptor.runId,
    workspaceHash: handle.descriptor.workspaceHash,
    kind,
    input: JSON.stringify(input),
    timeoutMs: 1000,
    attempt: 1,
    executionMode: 'LIVE',
    ...overrides,
  };
}

test('local worktree backend validates configuration and exact repository identity', async (t) => {
  const fixture = await createFixture(t);

  assert.throws(() => new LocalGitWorktreeBackend({ runtimeRoot: 'relative' }), /absolute/);
  assert.throws(
    () => new LocalGitWorktreeBackend({ runtimeRoot: fixture.runtimeRoot, maxSnapshotBytes: 0 }),
    /positive integer/,
  );

  const backend = new LocalGitWorktreeBackend({ runtimeRoot: fixture.runtimeRoot });
  const input = descriptor(fixture.revision);
  const handle = await backend.create(input, fixture.repositoryRoot);

  assert.equal(handle.descriptor.workspaceHash, input.workspaceHash);
  assert.equal(handle.repositoryRoot, fixture.repositoryRoot);
  assert.equal(handle.workspacePath, path.join(fixture.runtimeRoot, 'workspaces', 'workspace-001'));
  assert.equal(handle.authority, 'NONE');
  assert.equal(await git(handle.workspacePath, ['rev-parse', 'HEAD']), fixture.revision);

  const reattached = await backend.reattach(input);
  assert.deepEqual(reattached, handle);

  await assert.rejects(() => backend.create(input, fixture.repositoryRoot), /already exists/);

  const wrongBackend = descriptor(fixture.revision, {
    workspaceId: 'workspace-002',
    backendId: 'other-backend',
  });
  await assert.rejects(() => backend.create(wrongBackend, fixture.repositoryRoot), /backendId/);

  const shortRevision = descriptor(fixture.revision, {
    workspaceId: 'workspace-003',
    exactRevision: 'abc123',
  });
  await assert.rejects(() => backend.create(shortRevision, fixture.repositoryRoot), /full Git SHA/);

  assert.throws(
    () => descriptor(fixture.revision, { workspaceId: 'bad/id' }),
    /workspaceId must be a bounded identifier/,
  );
  await assert.rejects(() =>
    backend.create(descriptor(fixture.revision, { workspaceId: 'workspace-004' }), 'relative'),
  );
  await assert.rejects(
    () =>
      backend.create(
        descriptor(fixture.revision, { workspaceId: 'workspace-005' }),
        path.join(fixture.repositoryRoot, 'nested'),
      ),
    /Git top-level/,
  );
});

test('reattach fails closed on descriptor metadata path schema and revision drift', async (t) => {
  const fixture = await createFixture(t);
  const backend = new LocalGitWorktreeBackend({ runtimeRoot: fixture.runtimeRoot });
  const input = descriptor(fixture.revision);
  const handle = await backend.create(input, fixture.repositoryRoot);

  const mismatchedDescriptor = descriptor(fixture.revision, { runId: 'run-002' });
  await assert.rejects(() => backend.reattach(mismatchedDescriptor), /descriptor hash mismatch/);

  const originalMetadata = await readFile(handle.metadataPath, 'utf8');
  const parsed = JSON.parse(originalMetadata);
  parsed.workspacePath = path.join(fixture.root, 'wrong');
  await writeFile(handle.metadataPath, JSON.stringify(parsed), 'utf8');
  await assert.rejects(() => backend.reattach(input), /metadata path mismatch/);

  await writeFile(handle.metadataPath, JSON.stringify({ schemaVersion: 2 }), 'utf8');
  await assert.rejects(() => backend.reattach(input), /metadata schema mismatch/);

  await writeFile(
    handle.metadataPath,
    JSON.stringify({
      schemaVersion: 1,
      descriptor: null,
      repositoryRoot: fixture.repositoryRoot,
      workspacePath: handle.workspacePath,
    }),
    'utf8',
  );
  await assert.rejects(() => backend.reattach(input), /metadata is malformed/);

  await writeFile(handle.metadataPath, originalMetadata, 'utf8');
  await git(handle.workspacePath, ['checkout', '--detach', fixture.firstRevision]);
  await assert.rejects(() => backend.reattach(input), /HEAD no longer matches exact revision/);
});

test('filesystem backend contains reads and writes and snapshots tracked plus untracked changes', async (t) => {
  const fixture = await createFixture(t);
  const backend = new LocalGitWorktreeBackend({ runtimeRoot: fixture.runtimeRoot });
  const handle = await backend.create(descriptor(fixture.revision), fixture.repositoryRoot);

  assert.equal(await backend.readText(handle, 'tracked.txt'), 'two\n');

  await backend.writeText(handle, 'tracked.txt', 'changed\n', 100);
  assert.equal(await backend.readText(handle, 'tracked.txt'), 'changed\n');

  await backend.writeText(handle, 'new.txt', 'new file\n', 100);
  const snapshot = await backend.snapshot(handle);

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.workspaceHash, handle.descriptor.workspaceHash);
  assert.equal(snapshot.headRevision, fixture.revision);
  assert.match(snapshot.trackedDiff, /changed/);
  assert.match(snapshot.diffHash, /^[a-f0-9]{64}$/);
  assert.match(snapshot.snapshotHash, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.authority, 'NONE');
  assert.deepEqual(
    snapshot.untracked.map((entry) => entry.path),
    ['new.txt'],
  );
  assert.equal(snapshot.untracked[0].sizeBytes, Buffer.byteLength('new file\n'));
  assert.match(snapshot.untracked[0].contentHash, /^[a-f0-9]{64}$/);

  await assert.rejects(() => backend.writeText(handle, 'new.txt', 'too long', 2), /maxBytes/);
  await assert.rejects(() => backend.writeText(handle, 'new.txt', 'x', -1), /non-negative/);
  await assert.rejects(() => backend.readText(handle, '../tracked.txt'), /traversal/);
  await assert.rejects(
    () => backend.readText(handle, path.resolve(handle.workspacePath, 'tracked.txt')),
    /relative/,
  );
  await assert.rejects(() => backend.readText(handle, '.git'), /.git/);
  await assert.rejects(() => backend.readText(handle, 'missing.txt'));

  const outside = path.join(fixture.root, 'outside.txt');
  await writeFile(outside, 'outside', 'utf8');
  await symlink(outside, path.join(handle.workspacePath, 'linked.txt'));
  await assert.rejects(() => backend.readText(handle, 'linked.txt'), /symbolic links/);
  await assert.rejects(() => backend.writeText(handle, 'linked.txt', 'x', 10), /symbolic links/);

  const outsideDirectory = path.join(fixture.root, 'outside-dir');
  await mkdir(outsideDirectory);
  await writeFile(path.join(outsideDirectory, 'secret.txt'), 'secret', 'utf8');
  await symlink(outsideDirectory, path.join(handle.workspacePath, 'linked-dir'));
  await assert.rejects(() => backend.readText(handle, 'linked-dir/secret.txt'), /symbolic links/);
});

test('immutable review workspace cannot be written or execute registered commands', async (t) => {
  const fixture = await createFixture(t);
  const backend = new LocalGitWorktreeBackend({ runtimeRoot: fixture.runtimeRoot });
  const reviewDescriptor = descriptor(fixture.revision, {
    workspaceId: 'review-001',
    runId: 'review-run',
    accessMode: 'IMMUTABLE_REVIEW',
  });
  const handle = await backend.create(reviewDescriptor, fixture.repositoryRoot);

  await assert.rejects(
    () => backend.writeText(handle, 'tracked.txt', 'nope', 100),
    /immutable review workspace/,
  );

  const command = createLocalCommandActivityExecutor(handle, {
    commands: [
      { id: 'node-print', executable: 'node', args: ['-e', "process.stdout.write('ok')"] },
    ],
  });
  const outcome = await command.execute(
    request(handle, 'COMMAND', { schemaVersion: 1, commandId: 'node-print' }),
  );
  assert.equal(outcome.status, 'FAILED');
  assert.equal(outcome.failureKind, 'IMMUTABLE_WORKSPACE');
});

test('registered command executor is shell-free bounded and normalizes success failure timeout and malformed input', async (t) => {
  const fixture = await createFixture(t);
  const backend = new LocalGitWorktreeBackend({ runtimeRoot: fixture.runtimeRoot });
  const handle = await backend.create(descriptor(fixture.revision), fixture.repositoryRoot);

  assert.throws(
    () => createLocalCommandActivityExecutor(handle, { commands: [] }),
    /commands must not be empty/,
  );
  assert.throws(
    () =>
      createLocalCommandActivityExecutor(handle, {
        commands: [{ id: 'x', executable: 'node', args: [] }],
      }),
    /commandId/,
  );
  assert.throws(
    () =>
      createLocalCommandActivityExecutor(handle, {
        commands: [{ id: 'bad-command', executable: '/bin/sh', args: [] }],
      }),
    /path-free/,
  );
  assert.throws(
    () =>
      createLocalCommandActivityExecutor(handle, {
        commands: [{ id: 'node-print', executable: 'node', args: [1] }],
      }),
    /string array/,
  );
  assert.throws(
    () =>
      createLocalCommandActivityExecutor(handle, {
        commands: [
          { id: 'same-id', executable: 'node', args: [] },
          { id: 'same-id', executable: 'node', args: [] },
        ],
      }),
    /duplicate/,
  );
  assert.throws(
    () =>
      createLocalCommandActivityExecutor(handle, {
        commands: [{ id: 'node-print', executable: 'node', args: [] }],
        maxOutputBytes: 0,
      }),
    /positive integer/,
  );
  assert.throws(
    () =>
      createLocalCommandActivityExecutor(handle, {
        commands: [{ id: 'node-print', executable: 'node', args: [] }],
        inheritedEnvironmentKeys: ['BAD-KEY'],
      }),
    /environment key/,
  );

  process.env.FH_RUNTIME_TEST = 'visible';
  t.after(() => {
    delete process.env.FH_RUNTIME_TEST;
  });

  const executor = createLocalCommandActivityExecutor(handle, {
    commands: [
      {
        id: 'node-print',
        executable: 'node',
        args: [
          '-e',
          "process.stdout.write((process.env.FH_RUNTIME_TEST || 'missing') + ':' + process.cwd())",
        ],
      },
      {
        id: 'node-fail',
        executable: 'node',
        args: ['-e', "process.stdout.write('before');process.stderr.write('bad');process.exit(3)"],
      },
      {
        id: 'node-timeout',
        executable: 'node',
        args: ['-e', 'setTimeout(() => {}, 5000)'],
      },
    ],
    inheritedEnvironmentKeys: ['PATH', 'FH_RUNTIME_TEST'],
  });

  const success = await executor.execute(
    request(handle, 'COMMAND', {
      schemaVersion: 1,
      commandId: 'node-print',
      cwd: 'nested',
    }),
  );
  assert.equal(success.status, 'SUCCEEDED');
  assert.match(success.output, /visible/);
  assert.match(success.output, /nested/);

  const missing = await executor.execute(
    request(handle, 'COMMAND', { schemaVersion: 1, commandId: 'not-registered' }),
  );
  assert.equal(missing.failureKind, 'COMMAND_NOT_REGISTERED');

  const failed = await executor.execute(
    request(handle, 'COMMAND', { schemaVersion: 1, commandId: 'node-fail' }),
  );
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.failureKind, 'COMMAND_FAILED');
  assert.match(failed.output, /before/);
  assert.match(failed.output, /bad/);

  const timedOut = await executor.execute(
    request(handle, 'COMMAND', { schemaVersion: 1, commandId: 'node-timeout' }, { timeoutMs: 10 }),
  );
  assert.equal(timedOut.status, 'FAILED');
  assert.equal(timedOut.failureKind, 'COMMAND_TIMEOUT');

  const malformedInputs = [
    'not json',
    JSON.stringify([]),
    JSON.stringify({ schemaVersion: 2, commandId: 'node-print' }),
    JSON.stringify({ schemaVersion: 1 }),
    JSON.stringify({ schemaVersion: 1, commandId: 1 }),
    JSON.stringify({ schemaVersion: 1, commandId: '/bad' }),
    JSON.stringify({ schemaVersion: 1, commandId: 'node-print', cwd: 1 }),
    JSON.stringify({ schemaVersion: 1, commandId: 'node-print', extra: true }),
  ];
  for (const input of malformedInputs) {
    const malformed = await executor.execute(
      request(handle, 'COMMAND', { schemaVersion: 1, commandId: 'node-print' }, { input }),
    );
    assert.equal(malformed.failureKind, 'MALFORMED_ACTIVITY_INPUT');
  }

  const invalidCwd = await executor.execute(
    request(handle, 'COMMAND', {
      schemaVersion: 1,
      commandId: 'node-print',
      cwd: 'tracked.txt',
    }),
  );
  assert.equal(invalidCwd.failureKind, 'COMMAND_WORKSPACE_INVALID');

  assert.equal(localCommandExecutorUsesShell(), false);
});

test('filesystem and git activity executors integrate through ActivityRunner', async (t) => {
  const fixture = await createFixture(t);
  const backend = new LocalGitWorktreeBackend({ runtimeRoot: fixture.runtimeRoot });
  const handle = await backend.create(descriptor(fixture.revision), fixture.repositoryRoot);
  const filesystem = createLocalFilesystemActivityExecutor(backend, handle);
  const gitExecutor = createLocalGitActivityExecutor(backend, handle);

  const runner = new ActivityRunner(
    {
      authorize() {
        return { allowed: true, reason: 'runtime test', authority: 'NONE' };
      },
    },
    {
      FILESYSTEM: filesystem,
      GIT: gitExecutor,
    },
  );

  const write = await runner.run(
    request(handle, 'FILESYSTEM', {
      schemaVersion: 1,
      operation: 'WRITE_TEXT',
      path: 'tracked.txt',
      content: 'activity write\n',
      maxBytes: 100,
    }),
  );
  assert.equal(write.status, 'SUCCEEDED');
  assert.equal(await backend.readText(handle, 'tracked.txt'), 'activity write\n');

  const readOutcome = await filesystem.execute(
    request(handle, 'FILESYSTEM', {
      schemaVersion: 1,
      operation: 'READ_TEXT',
      path: 'tracked.txt',
    }),
  );
  assert.equal(readOutcome.status, 'SUCCEEDED');
  assert.equal(readOutcome.output, 'activity write\n');

  const status = await gitExecutor.execute(
    request(handle, 'GIT', { schemaVersion: 1, operation: 'STATUS' }),
  );
  assert.equal(status.status, 'SUCCEEDED');
  assert.match(status.output, /snapshotHash/);

  const diff = await gitExecutor.execute(
    request(handle, 'GIT', { schemaVersion: 1, operation: 'DIFF' }),
  );
  assert.equal(diff.status, 'SUCCEEDED');
  assert.match(diff.output, /activity write/);

  const malformedFilesystem = await filesystem.execute(
    request(handle, 'FILESYSTEM', { schemaVersion: 1, operation: 'DELETE', path: 'tracked.txt' }),
  );
  assert.equal(malformedFilesystem.failureKind, 'MALFORMED_ACTIVITY_INPUT');

  const malformedGit = await gitExecutor.execute(
    request(handle, 'GIT', { schemaVersion: 1, operation: 'COMMIT' }),
  );
  assert.equal(malformedGit.failureKind, 'MALFORMED_ACTIVITY_INPUT');

  const missingRead = await filesystem.execute(
    request(handle, 'FILESYSTEM', {
      schemaVersion: 1,
      operation: 'READ_TEXT',
      path: 'missing.txt',
    }),
  );
  assert.equal(missingRead.failureKind, 'FILESYSTEM_READ_FAILED');

  const oversizedWrite = await filesystem.execute(
    request(handle, 'FILESYSTEM', {
      schemaVersion: 1,
      operation: 'WRITE_TEXT',
      path: 'new.txt',
      content: '12345',
      maxBytes: 2,
    }),
  );
  assert.equal(oversizedWrite.failureKind, 'FILESYSTEM_WRITE_FAILED');
});

test('workspace handle tampering and HEAD drift fail closed for all runtime operations', async (t) => {
  const fixture = await createFixture(t);
  const backend = new LocalGitWorktreeBackend({ runtimeRoot: fixture.runtimeRoot });
  const handle = await backend.create(descriptor(fixture.revision), fixture.repositoryRoot);

  const metadata = JSON.parse(await readFile(handle.metadataPath, 'utf8'));
  metadata.repositoryRoot = path.join(fixture.root, 'wrong-repository');
  await writeFile(handle.metadataPath, JSON.stringify(metadata), 'utf8');

  await assert.rejects(() => backend.readText(handle, 'tracked.txt'), /metadata mismatch/);

  const filesystem = createLocalFilesystemActivityExecutor(backend, handle);
  const gitExecutor = createLocalGitActivityExecutor(backend, handle);
  assert.equal(
    (
      await filesystem.execute(
        request(handle, 'FILESYSTEM', {
          schemaVersion: 1,
          operation: 'READ_TEXT',
          path: 'tracked.txt',
        }),
      )
    ).failureKind,
    'FILESYSTEM_READ_FAILED',
  );
  assert.equal(
    (await gitExecutor.execute(request(handle, 'GIT', { schemaVersion: 1, operation: 'STATUS' })))
      .failureKind,
    'GIT_READ_FAILED',
  );

  metadata.repositoryRoot = fixture.repositoryRoot;
  await writeFile(handle.metadataPath, JSON.stringify(metadata), 'utf8');
  await git(handle.workspacePath, ['checkout', '--detach', fixture.firstRevision]);
  await assert.rejects(() => backend.snapshot(handle), /HEAD drifted/);

  const command = createLocalCommandActivityExecutor(handle, {
    commands: [
      { id: 'node-print', executable: 'node', args: ['-e', "process.stdout.write('ok')"] },
    ],
  });
  const commandOutcome = await command.execute(
    request(handle, 'COMMAND', { schemaVersion: 1, commandId: 'node-print' }),
  );
  assert.equal(commandOutcome.failureKind, 'COMMAND_WORKSPACE_INVALID');
});

test('snapshot byte budget counts tracked status and untracked file contents', async (t) => {
  const fixture = await createFixture(t);
  const backend = new LocalGitWorktreeBackend({
    runtimeRoot: fixture.runtimeRoot,
    maxSnapshotBytes: 64,
  });
  const handle = await backend.create(descriptor(fixture.revision), fixture.repositoryRoot);

  await backend.writeText(handle, 'large.txt', 'x'.repeat(200), 500);
  await assert.rejects(() => backend.snapshot(handle), /maxSnapshotBytes/);
});

test('runtime backend authority invariants remain explicit', () => {
  assert.equal(localWorktreeBackendCanGrantAuthority(), false);
  assert.equal(localWorkspaceDestroyRequiresLeaseGuard(), true);
});
