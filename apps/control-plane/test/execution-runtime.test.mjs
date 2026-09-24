import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ActivityRunner,
  activityRunnerCanExecuteDuringReplay,
  createExecutionWorkspaceDescriptor,
  createImmutableReviewSnapshot,
  evaluateChangeBudget,
  executionRuntimeCanGrantAuthority,
  validateWorkspaceReattach,
} from '../dist/index.js';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);
const H4 = '4'.repeat(64);

function workspaceInput(overrides = {}) {
  return {
    workspaceId: 'workspace-001',
    runId: 'run-001',
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    exactRevision: 'abc123',
    runSnapshotHash: H1,
    backendId: 'local-worktree',
    accessMode: 'MUTABLE_IMPLEMENTATION',
    ...overrides,
  };
}

function activityRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    activityId: 'activity-001',
    runId: 'run-001',
    workspaceHash: H1,
    kind: 'COMMAND',
    input: 'npm test',
    timeoutMs: 1000,
    attempt: 1,
    executionMode: 'LIVE',
    ...overrides,
  };
}

function budget(overrides = {}) {
  return {
    allowedPathPrefixes: ['src'],
    forbiddenPathPrefixes: ['secret'],
    maxChangedFiles: 2,
    maxAddedLines: 20,
    maxDeletedLines: 20,
    allowBinary: false,
    allowGenerated: false,
    ...overrides,
  };
}

test('workspace descriptor is deterministic authority-neutral and reattaches only to exact identity', () => {
  const first = createExecutionWorkspaceDescriptor(workspaceInput());
  const second = createExecutionWorkspaceDescriptor(workspaceInput());

  assert.deepEqual(first, second);
  assert.match(first.workspaceHash, /^[a-f0-9]{64}$/);
  assert.equal(first.authority, 'NONE');

  assert.deepEqual(
    validateWorkspaceReattach(first, {
      runId: first.runId,
      repositoryIdentity: first.repositoryIdentity,
      exactRevision: first.exactRevision,
      runSnapshotHash: first.runSnapshotHash,
      backendId: first.backendId,
    }),
    { valid: true, errors: [] },
  );

  const mismatched = validateWorkspaceReattach(first, {
    runId: 'run-002',
    repositoryIdentity: 'other/repo',
    exactRevision: 'def456',
    runSnapshotHash: H2,
    backendId: 'other-backend',
  });
  assert.equal(mismatched.valid, false);
  assert.deepEqual(mismatched.errors, [
    'workspace run identity mismatch',
    'workspace repository identity mismatch',
    'workspace exact revision mismatch',
    'workspace run snapshot mismatch',
    'workspace backend identity mismatch',
  ]);
});

test('workspace descriptor validation fails closed on malformed identity', () => {
  for (const input of [
    workspaceInput({ workspaceId: 'x' }),
    workspaceInput({ runId: 'x' }),
    workspaceInput({ repositoryIdentity: ' ' }),
    workspaceInput({ exactRevision: '' }),
    workspaceInput({ runSnapshotHash: 'bad' }),
    workspaceInput({ backendId: 'x' }),
    workspaceInput({ accessMode: 'UNKNOWN' }),
  ]) {
    assert.throws(() => createExecutionWorkspaceDescriptor(input));
  }

  assert.equal(
    createExecutionWorkspaceDescriptor(workspaceInput({ accessMode: 'IMMUTABLE_REVIEW' }))
      .accessMode,
    'IMMUTABLE_REVIEW',
  );
});

test('review snapshot is immutable exact-bound deterministic and rejects duplicate evidence', () => {
  const input = {
    workspaceHash: H1,
    exactRevision: 'abc123',
    diffHash: H2,
    scopeHash: H3,
    evidenceHashes: [H4, H2],
  };
  const first = createImmutableReviewSnapshot(input);
  const second = createImmutableReviewSnapshot({ ...input, evidenceHashes: [H2, H4] });

  assert.deepEqual(first, second);
  assert.deepEqual(first.evidenceHashes, [H2, H4]);
  assert.equal(first.readOnly, true);
  assert.equal(first.authority, 'NONE');
  assert.match(first.snapshotHash, /^[a-f0-9]{64}$/);

  assert.throws(
    () => createImmutableReviewSnapshot({ ...input, evidenceHashes: [H2, H2] }),
    /duplicate evidenceHashes/,
  );
  assert.throws(() => createImmutableReviewSnapshot({ ...input, workspaceHash: 'bad' }));
  assert.throws(() => createImmutableReviewSnapshot({ ...input, exactRevision: ' ' }));
  assert.throws(() => createImmutableReviewSnapshot({ ...input, diffHash: 'bad' }));
  assert.throws(() => createImmutableReviewSnapshot({ ...input, scopeHash: 'bad' }));
});

test('ActivityRunner executes an allowed live activity and records exact hashes', async () => {
  let calls = 0;
  const runner = new ActivityRunner(
    {
      authorize() {
        return { allowed: true, reason: 'policy allows bounded command', authority: 'NONE' };
      },
    },
    {
      COMMAND: {
        id: 'local-command',
        async execute(request) {
          calls += 1;
          assert.equal(request.input, 'npm test');
          return { status: 'SUCCEEDED', output: 'ok' };
        },
      },
    },
  );

  const result = await runner.run(activityRequest());
  assert.equal(calls, 1);
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.executorId, 'local-command');
  assert.equal(result.failureKind, null);
  assert.equal(result.authority, 'NONE');
  assert.match(result.inputHash, /^[a-f0-9]{64}$/);
  assert.match(result.outputHash ?? '', /^[a-f0-9]{64}$/);
});

test('ActivityRunner distinguishes executor failure without granting authority', async () => {
  const runner = new ActivityRunner(
    {
      authorize() {
        return { allowed: true, reason: 'allowed', authority: 'NONE' };
      },
    },
    {
      COMMAND: {
        id: 'local-command',
        async execute() {
          return { status: 'FAILED', output: 'exit 1', failureKind: 'COMMAND_FAILED' };
        },
      },
    },
  );

  const result = await runner.run(activityRequest());
  assert.equal(result.status, 'FAILED');
  assert.equal(result.failureKind, 'COMMAND_FAILED');
  assert.equal(result.reason, 'allowed');
});

test('ActivityRunner denies replay policy rejection and unavailable executors without execution', async () => {
  let authorizerCalls = 0;
  let executorCalls = 0;
  const replayRunner = new ActivityRunner(
    {
      authorize() {
        authorizerCalls += 1;
        return { allowed: true, reason: 'unused', authority: 'NONE' };
      },
    },
    {
      COMMAND: {
        id: 'local-command',
        async execute() {
          executorCalls += 1;
          return { status: 'SUCCEEDED', output: 'unexpected' };
        },
      },
    },
  );

  const replay = await replayRunner.run(activityRequest({ executionMode: 'REPLAY' }));
  assert.equal(replay.status, 'DENIED');
  assert.match(replay.reason, /replay cannot execute side effects/);
  assert.equal(replay.outputHash, null);
  assert.equal(replay.executorId, null);
  assert.equal(authorizerCalls, 0);
  assert.equal(executorCalls, 0);

  const deniedRunner = new ActivityRunner(
    {
      authorize() {
        return { allowed: false, reason: 'sandbox denied', authority: 'NONE' };
      },
    },
    {},
  );
  const denied = await deniedRunner.run(activityRequest());
  assert.equal(denied.status, 'DENIED');
  assert.equal(denied.reason, 'sandbox denied');

  const missingRunner = new ActivityRunner(
    {
      authorize() {
        return { allowed: true, reason: 'allowed', authority: 'NONE' };
      },
    },
    {},
  );
  const missing = await missingRunner.run(activityRequest());
  assert.equal(missing.status, 'DENIED');
  assert.match(missing.reason, /executor is unavailable/);
});

test('ActivityRunner fails closed on authority expansion malformed requests and malformed executor results', async () => {
  const badAuthority = new ActivityRunner(
    {
      authorize() {
        return { allowed: true, reason: 'bad', authority: 'SYSTEM_POLICY' };
      },
    },
    {},
  );
  await assert.rejects(() => badAuthority.run(activityRequest()), /authority-neutral/);

  const allowed = {
    authorize() {
      return { allowed: true, reason: 'allowed', authority: 'NONE' };
    },
  };

  for (const request of [
    activityRequest({ schemaVersion: 2 }),
    activityRequest({ activityId: 'x' }),
    activityRequest({ runId: 'x' }),
    activityRequest({ workspaceHash: 'bad' }),
    activityRequest({ kind: 'UNKNOWN' }),
    activityRequest({ timeoutMs: 0 }),
    activityRequest({ timeoutMs: 1.5 }),
    activityRequest({ attempt: 0 }),
    activityRequest({ attempt: 1.5 }),
    activityRequest({ executionMode: 'UNKNOWN' }),
    activityRequest({ input: 123 }),
  ]) {
    const runner = new ActivityRunner(allowed, {});
    await assert.rejects(() => runner.run(request));
  }

  const badIdRunner = new ActivityRunner(allowed, {
    COMMAND: {
      id: 'x',
      async execute() {
        return { status: 'SUCCEEDED', output: 'ok' };
      },
    },
  });
  await assert.rejects(() => badIdRunner.run(activityRequest()), /executor id/);

  const badStatusRunner = new ActivityRunner(allowed, {
    COMMAND: {
      id: 'valid-executor',
      async execute() {
        return { status: 'UNKNOWN', output: 'bad' };
      },
    },
  });
  await assert.rejects(() => badStatusRunner.run(activityRequest()), /unsupported status/);

  const badOutputRunner = new ActivityRunner(allowed, {
    COMMAND: {
      id: 'valid-executor',
      async execute() {
        return { status: 'SUCCEEDED', output: 42 };
      },
    },
  });
  await assert.rejects(() => badOutputRunner.run(activityRequest()), /output must be a string/);
});

test('change budget allows bounded changes and deterministically reports every exceeded control', () => {
  const allowed = evaluateChangeBudget(
    [
      {
        path: 'src',
        additions: 1,
        deletions: 0,
        binary: false,
        generated: false,
      },
      {
        path: 'src/runtime/file.ts',
        additions: 2,
        deletions: 1,
        binary: false,
        generated: false,
      },
    ],
    budget(),
  );
  assert.deepEqual(allowed, {
    allowed: true,
    reasonCodes: [],
    changedFiles: 2,
    addedLines: 3,
    deletedLines: 1,
    authority: 'NONE',
  });

  const blocked = evaluateChangeBudget(
    [
      {
        path: 'docs/private.bin',
        additions: 5,
        deletions: 7,
        binary: true,
        generated: true,
      },
    ],
    budget({
      allowedPathPrefixes: ['src'],
      forbiddenPathPrefixes: ['docs'],
      maxChangedFiles: 0,
      maxAddedLines: 0,
      maxDeletedLines: 0,
    }),
  );
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.reasonCodes, [
    'ADDED_LINE_LIMIT',
    'BINARY_CHANGE_FORBIDDEN',
    'CHANGED_FILE_LIMIT',
    'DELETED_LINE_LIMIT',
    'FORBIDDEN_PATH',
    'GENERATED_CHANGE_FORBIDDEN',
    'PATH_OUTSIDE_ALLOWED_SCOPE',
  ]);

  const unscoped = evaluateChangeBudget(
    [{ path: './docs/readme.md', additions: 0, deletions: 0, binary: false, generated: false }],
    budget({ allowedPathPrefixes: [], forbiddenPathPrefixes: ['secret/'] }),
  );
  assert.equal(unscoped.allowed, true);

  const windowsSeparator = evaluateChangeBudget(
    [{ path: 'src\\nested\\file.ts', additions: 0, deletions: 0, binary: false, generated: false }],
    budget({ forbiddenPathPrefixes: ['other'] }),
  );
  assert.equal(windowsSeparator.allowed, true);
});

test('change budget rejects malformed budgets paths and counters', () => {
  const entry = [{ path: 'src/a.ts', additions: 0, deletions: 0, binary: false, generated: false }];

  for (const invalidBudget of [
    budget({ maxChangedFiles: -1 }),
    budget({ maxAddedLines: 1.5 }),
    budget({ maxDeletedLines: -1 }),
    budget({ allowedPathPrefixes: ['/absolute'] }),
    budget({ allowedPathPrefixes: ['../escape'] }),
    budget({ allowedPathPrefixes: ['C:\\escape'] }),
    budget({ allowedPathPrefixes: ['\\escape'] }),
    budget({ allowedPathPrefixes: [' '] }),
  ]) {
    assert.throws(() => evaluateChangeBudget(entry, invalidBudget));
  }

  for (const invalidEntry of [
    { path: '../escape', additions: 0, deletions: 0, binary: false, generated: false },
    { path: '/absolute', additions: 0, deletions: 0, binary: false, generated: false },
    { path: 'src/a.ts', additions: -1, deletions: 0, binary: false, generated: false },
    { path: 'src/a.ts', additions: 1.5, deletions: 0, binary: false, generated: false },
    { path: 'src/a.ts', additions: 0, deletions: -1, binary: false, generated: false },
    { path: 'src/a.ts', additions: 0, deletions: 1.5, binary: false, generated: false },
  ]) {
    assert.throws(() => evaluateChangeBudget([invalidEntry], budget()));
  }
});

test('execution runtime remains authority-neutral and replay cannot execute activities', () => {
  assert.equal(executionRuntimeCanGrantAuthority(), false);
  assert.equal(activityRunnerCanExecuteDuringReplay(), false);
});
