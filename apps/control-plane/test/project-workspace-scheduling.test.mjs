import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProjectSchedulePlan } from '../../../packages/orchestration/dist/index.js';

import {
  LocalGitWorktreeBackend,
  materializeSelectedProjectWorkspaces,
  projectSchedulerCanStartWithoutIsolatedWorkspace,
  projectWorkspaceActivationCanGrantAuthority,
} from '../dist/index.js';

const H1 = '1'.repeat(64);
const REPOSITORY = 'skonyd/freehighlander-engineering-platform';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-project-workspace-'));
  const repositoryRoot = path.join(root, 'repository');
  execFileSync('git', ['init', '-b', 'main', repositoryRoot], { stdio: 'ignore' });
  git(repositoryRoot, ['config', 'user.name', 'FreeHighlander Test']);
  git(repositoryRoot, ['config', 'user.email', 'fh-test@example.invalid']);
  writeFileSync(path.join(repositoryRoot, 'README.md'), '# fixture\n', 'utf8');
  git(repositoryRoot, ['add', 'README.md']);
  git(repositoryRoot, ['commit', '-m', 'initial']);
  return {
    root,
    repositoryRoot,
    runtimeRoot: path.join(root, 'runtime'),
    revision: git(repositoryRoot, ['rev-parse', 'HEAD']),
  };
}

function workItem(id, overrides = {}) {
  return {
    id,
    state: 'PENDING',
    dependencyIds: [],
    priority: 10,
    roadmapOrder: 10,
    workspaceIsolation: 'ISOLATED',
    conflictWithActive: 'SAFE_TO_RUN_CONCURRENTLY',
    blockedSecretHandleIds: [],
    resourcesAvailable: true,
    cutoverBlocked: false,
    ...overrides,
  };
}

function request(workItemId, revision, overrides = {}) {
  return {
    workItemId,
    workspaceId: 'workspace-' + workItemId,
    runId: 'run-' + workItemId,
    repositoryIdentity: REPOSITORY,
    exactRevision: revision,
    runSnapshotHash: H1,
    mode: 'CREATE',
    ...overrides,
  };
}

test('selected independent work items receive distinct real Git worktrees before start', async () => {
  const fixture = createFixture();
  try {
    const schedule = buildProjectSchedulePlan(
      [
        workItem('work-parked', { state: 'PARKED_HUMAN', roadmapOrder: 1 }),
        workItem('work-b', { priority: 30, roadmapOrder: 2 }),
        workItem('work-c', { priority: 20, roadmapOrder: 3 }),
      ],
      2,
    );
    assert.deepEqual(schedule.selectedIds, ['work-b', 'work-c']);

    const backend = new LocalGitWorktreeBackend({ runtimeRoot: fixture.runtimeRoot });
    const activation = await materializeSelectedProjectWorkspaces({
      schedule,
      requests: [request('work-b', fixture.revision), request('work-c', fixture.revision)],
      repositoryRoot: fixture.repositoryRoot,
      backend,
    });

    assert.deepEqual(activation.startableIds, ['work-b', 'work-c']);
    assert.deepEqual(activation.blockedWorkspaceIds, []);
    assert.equal(activation.allSelectedItemsHaveIsolatedWorkspace, true);
    assert.equal(activation.authority, 'NONE');
    assert.equal(activation.results[0].workspaceId, 'workspace-work-b');
    assert.equal(activation.results[1].workspaceId, 'workspace-work-c');
    assert.notEqual(activation.results[0].workspaceHash, activation.results[1].workspaceHash);

    assert.equal(
      git(fixture.repositoryRoot, ['worktree', 'list', '--porcelain']).includes(
        path.join(fixture.runtimeRoot, 'workspaces', 'workspace-work-b'),
      ),
      true,
    );
    assert.equal(
      git(fixture.repositoryRoot, ['worktree', 'list', '--porcelain']).includes(
        path.join(fixture.runtimeRoot, 'workspaces', 'workspace-work-c'),
      ),
      true,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('workspace activation reattaches only the exact #148 descriptor identity', async () => {
  const fixture = createFixture();
  try {
    const schedule = buildProjectSchedulePlan([workItem('work-a')], 1);
    const backend = new LocalGitWorktreeBackend({ runtimeRoot: fixture.runtimeRoot });
    const createRequest = request('work-a', fixture.revision);

    const first = await materializeSelectedProjectWorkspaces({
      schedule,
      requests: [createRequest],
      repositoryRoot: fixture.repositoryRoot,
      backend,
    });
    assert.deepEqual(first.startableIds, ['work-a']);

    const second = await materializeSelectedProjectWorkspaces({
      schedule,
      requests: [{ ...createRequest, mode: 'REATTACH' }],
      repositoryRoot: fixture.repositoryRoot,
      backend,
    });
    assert.deepEqual(second.startableIds, ['work-a']);
    assert.equal(second.results[0].workspaceHash, first.results[0].workspaceHash);

    const drifted = await materializeSelectedProjectWorkspaces({
      schedule,
      requests: [
        {
          ...createRequest,
          runSnapshotHash: '2'.repeat(64),
          mode: 'REATTACH',
        },
      ],
      repositoryRoot: fixture.repositoryRoot,
      backend,
    });
    assert.deepEqual(drifted.startableIds, []);
    assert.deepEqual(drifted.blockedWorkspaceIds, ['work-a']);
    assert.equal(drifted.results[0].failureClass, 'WORKSPACE_ALLOCATION_FAILED');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('workspace allocation failure blocks only that selected item and does not grant fallback authority', async () => {
  const schedule = buildProjectSchedulePlan(
    [workItem('work-a', { priority: 20 }), workItem('work-b', { priority: 10 })],
    2,
  );

  const backend = {
    async create(descriptor) {
      if (descriptor.workspaceId === 'workspace-work-a') {
        throw new Error('fixture allocation failure with private path detail');
      }
      return {
        descriptor,
        repositoryRoot: '/repo',
        workspacePath: '/runtime/work-b',
        metadataPath: '/runtime/meta-b.json',
        authority: 'NONE',
      };
    },
    async reattach() {
      throw new Error('not used');
    },
  };

  const activation = await materializeSelectedProjectWorkspaces({
    schedule,
    requests: [request('work-a', 'a'.repeat(40)), request('work-b', 'a'.repeat(40))],
    repositoryRoot: '/repo',
    backend,
  });

  assert.deepEqual(activation.startableIds, ['work-b']);
  assert.deepEqual(activation.blockedWorkspaceIds, ['work-a']);
  assert.equal(activation.results[0].failureClass, 'WORKSPACE_ALLOCATION_FAILED');
  assert.doesNotMatch(JSON.stringify(activation), /private path detail/);
  assert.equal(activation.authority, 'NONE');
});

test('scheduler workspace bridge fails closed on missing extra or shared workspace requests', async () => {
  const schedule = buildProjectSchedulePlan([workItem('work-a'), workItem('work-b')], 2);
  const backend = {
    async create() {
      throw new Error('must not be reached for malformed activation input');
    },
    async reattach() {
      throw new Error('must not be reached for malformed activation input');
    },
  };

  await assert.rejects(
    () =>
      materializeSelectedProjectWorkspaces({
        schedule,
        requests: [request('work-a', 'a'.repeat(40))],
        repositoryRoot: '/repo',
        backend,
      }),
    /missing an isolated workspace request/,
  );

  await assert.rejects(
    () =>
      materializeSelectedProjectWorkspaces({
        schedule,
        requests: [
          request('work-a', 'a'.repeat(40), { workspaceId: 'workspace-shared' }),
          request('work-b', 'a'.repeat(40), { workspaceId: 'workspace-shared' }),
        ],
        repositoryRoot: '/repo',
        backend,
      }),
    /cannot share a mutable workspace id/,
  );

  const oneSelected = buildProjectSchedulePlan(
    [workItem('work-a', { priority: 20 }), workItem('work-b', { priority: 10 })],
    1,
  );
  await assert.rejects(
    () =>
      materializeSelectedProjectWorkspaces({
        schedule: oneSelected,
        requests: [request('work-a', 'a'.repeat(40)), request('work-b', 'a'.repeat(40))],
        repositoryRoot: '/repo',
        backend,
      }),
    /not selected by the scheduler/,
  );
});

test('workspace bridge validates every runtime identity input before backend mutation', async () => {
  const schedule = buildProjectSchedulePlan([workItem('work-a')], 1);
  let backendCalls = 0;
  const backend = {
    async create() {
      backendCalls += 1;
      throw new Error('must not be reached');
    },
    async reattach() {
      backendCalls += 1;
      throw new Error('must not be reached');
    },
  };

  await assert.rejects(
    () =>
      materializeSelectedProjectWorkspaces({
        schedule: { selectedIds: ['work-a'], authority: 'SYSTEM_POLICY' },
        requests: [request('work-a', 'a'.repeat(40))],
        repositoryRoot: '/repo',
        backend,
      }),
    /authority-neutral/,
  );
  await assert.rejects(
    () =>
      materializeSelectedProjectWorkspaces({
        schedule,
        requests: [request('work-a', 'a'.repeat(40))],
        repositoryRoot: '',
        backend,
      }),
    /repositoryRoot is required/,
  );
  await assert.rejects(
    () =>
      materializeSelectedProjectWorkspaces({
        schedule,
        requests: null,
        repositoryRoot: '/repo',
        backend,
      }),
    /requests must be an array/,
  );

  for (const invalid of [
    request('work-a', 'a'.repeat(40), { workItemId: 'x' }),
    request('work-a', 'a'.repeat(40), { workspaceId: 'x' }),
    request('work-a', 'a'.repeat(40), { runId: 'x' }),
    request('work-a', 'a'.repeat(40), { repositoryIdentity: ' ' }),
    request('work-a', 'bad'),
    request('work-a', 'a'.repeat(40), { runSnapshotHash: 'bad' }),
    request('work-a', 'a'.repeat(40), { mode: 'UNKNOWN' }),
  ]) {
    await assert.rejects(() =>
      materializeSelectedProjectWorkspaces({
        schedule,
        requests: [invalid],
        repositoryRoot: '/repo',
        backend,
      }),
    );
  }

  await assert.rejects(
    () =>
      materializeSelectedProjectWorkspaces({
        schedule,
        requests: [
          request('work-a', 'a'.repeat(40)),
          request('work-a', 'a'.repeat(40), { workspaceId: 'workspace-other' }),
        ],
        repositoryRoot: '/repo',
        backend,
      }),
    /duplicate workspace request workItemId/,
  );

  assert.equal(backendCalls, 0);
});

test('workspace bridge rejects forged successful backend handles as item-local allocation failures', async () => {
  const schedule = buildProjectSchedulePlan([workItem('work-a')], 1);
  const baseRequest = request('work-a', 'a'.repeat(40));

  async function activateWithForge(forge) {
    return materializeSelectedProjectWorkspaces({
      schedule,
      requests: [baseRequest],
      repositoryRoot: '/repo',
      backend: {
        async create(descriptor) {
          return forge({
            descriptor,
            repositoryRoot: '/repo',
            workspacePath: '/runtime/work-a',
            metadataPath: '/runtime/work-a.json',
            authority: 'NONE',
          });
        },
        async reattach() {
          throw new Error('not used');
        },
      },
    });
  }

  for (const forge of [
    (handle) => ({ ...handle, authority: 'SYSTEM_POLICY' }),
    (handle) => ({
      ...handle,
      descriptor: { ...handle.descriptor, workspaceHash: 'f'.repeat(64) },
    }),
    (handle) => ({
      ...handle,
      descriptor: {
        ...handle.descriptor,
        workspaceId: 'workspace-forged',
        workspaceHash: handle.descriptor.workspaceHash,
      },
    }),
    (handle) => ({
      ...handle,
      descriptor: {
        ...handle.descriptor,
        accessMode: 'IMMUTABLE_REVIEW',
        workspaceHash: handle.descriptor.workspaceHash,
      },
    }),
  ]) {
    const result = await activateWithForge(forge);
    assert.deepEqual(result.startableIds, []);
    assert.deepEqual(result.blockedWorkspaceIds, ['work-a']);
    assert.equal(result.results[0].failureClass, 'WORKSPACE_ALLOCATION_FAILED');
  }

  const empty = await materializeSelectedProjectWorkspaces({
    schedule: { selectedIds: [], authority: 'NONE' },
    requests: [],
    repositoryRoot: '/repo',
    backend: {
      async create() {
        throw new Error('not used');
      },
      async reattach() {
        throw new Error('not used');
      },
    },
  });
  assert.deepEqual(empty.results, []);
  assert.equal(empty.allSelectedItemsHaveIsolatedWorkspace, true);
});

test('project scheduling cannot start without isolated workspace or grant authority', () => {
  assert.equal(projectSchedulerCanStartWithoutIsolatedWorkspace(), false);
  assert.equal(projectWorkspaceActivationCanGrantAuthority(), false);
});
