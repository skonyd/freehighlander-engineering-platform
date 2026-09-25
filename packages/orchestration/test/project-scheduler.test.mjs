import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProjectSchedulePlan,
  createHumanDecisionQueueEntry,
  createInitialNodeStates,
  modelCanResolveHumanDecision,
  parkedHumanRequiredCancelsProject,
  propagateWorkflowStates,
  publishWorkflow,
  schedulerCanGrantAuthority,
  transitionNodeState,
  unknownConflictCanRun,
} from '../dist/index.js';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);

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

function decisionInput(overrides = {}) {
  return {
    decisionId: 'decision-001',
    projectId: 'project-001',
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    workItemId: 'work-a',
    runId: 'run-001',
    nodeId: 'human-gate',
    exactRevision: 'abc123',
    scopeHash: H1,
    decisionType: 'MERGE_AUTHORIZATION',
    reason: 'Protected policy requires a human decision.',
    choices: ['approve', 'reject'],
    consequences: ['approve continues the blocked branch', 'reject leaves it stopped'],
    evidenceHashes: [H2, H1],
    createdAt: '2026-09-24T09:30:00.000Z',
    blockedWorkItemIds: ['work-c', 'work-b'],
    otherWorkContinuing: true,
    ...overrides,
  };
}

test('HUMAN_REQUIRED parks only dependent work while independent work remains selectable', () => {
  const items = [
    workItem('work-a', { state: 'PARKED_HUMAN', roadmapOrder: 1 }),
    workItem('work-b', { priority: 20, roadmapOrder: 2 }),
    workItem('work-c', { dependencyIds: ['work-a'], roadmapOrder: 3 }),
    workItem('work-d', { dependencyIds: ['work-c'], roadmapOrder: 4 }),
    workItem('work-e', { state: 'ACTIVE', roadmapOrder: 5 }),
  ];

  const plan = buildProjectSchedulePlan(items, 2);

  assert.deepEqual(plan.activeIds, ['work-e']);
  assert.deepEqual(plan.parkedHumanIds, ['work-a']);
  assert.deepEqual(plan.readyIds, ['work-b']);
  assert.deepEqual(plan.selectedIds, ['work-b']);
  assert.equal(plan.dispositions['work-a'], 'PARKED_HUMAN');
  assert.equal(plan.dispositions['work-b'], 'READY');
  assert.equal(plan.dispositions['work-c'], 'WAITING_DEPENDENCY');
  assert.equal(plan.dispositions['work-d'], 'WAITING_DEPENDENCY');
  assert.equal(plan.dispositions['work-e'], 'ACTIVE');
  assert.equal(plan.shouldStop, false);
  assert.equal(plan.authority, 'NONE');
});

test('secret-blocked work waits locally while independent work remains selectable', () => {
  const items = [
    workItem('work-secret', {
      priority: 30,
      roadmapOrder: 1,
      blockedSecretHandleIds: ['provider.openai.api'],
    }),
    workItem('work-independent', { priority: 20, roadmapOrder: 2 }),
    workItem('work-dependent', {
      dependencyIds: ['work-secret'],
      priority: 40,
      roadmapOrder: 3,
    }),
  ];

  const plan = buildProjectSchedulePlan(items, 2);

  assert.equal(plan.dispositions['work-secret'], 'WAITING_SECRET');
  assert.equal(plan.dispositions['work-independent'], 'READY');
  assert.equal(plan.dispositions['work-dependent'], 'WAITING_DEPENDENCY');
  assert.deepEqual(plan.secretBlockedIds, ['work-secret']);
  assert.deepEqual(plan.readyIds, ['work-independent']);
  assert.deepEqual(plan.selectedIds, ['work-independent']);
  assert.equal(plan.shouldStop, false);
  assert.equal(plan.authority, 'NONE');
});

test('selection is deterministic by priority then roadmap order then id', () => {
  const items = [
    workItem('work-c', { priority: 20, roadmapOrder: 2 }),
    workItem('work-a', { priority: 20, roadmapOrder: 1 }),
    workItem('work-b', { priority: 20, roadmapOrder: 1 }),
    workItem('work-d', { priority: 5, roadmapOrder: 0 }),
  ];

  const first = buildProjectSchedulePlan(items, 3);
  const second = buildProjectSchedulePlan([...items].reverse(), 3);

  assert.deepEqual(first.selectedIds, ['work-a', 'work-b', 'work-c']);
  assert.deepEqual(first, second);
});

test('dependency barrier isolation conflict and resource uncertainty fail closed', () => {
  const complete = workItem('done', { state: 'COMPLETE', roadmapOrder: 0 });
  const failed = workItem('failed', { state: 'FAILED', roadmapOrder: 1 });
  const barrier = workItem('barrier', {
    dependencyIds: ['done'],
    cutoverBlocked: true,
  });
  const shared = workItem('shared', {
    dependencyIds: ['done'],
    workspaceIsolation: 'SHARED',
  });
  const unknownIsolation = workItem('unknown-isolation', {
    dependencyIds: ['done'],
    workspaceIsolation: 'UNKNOWN',
  });
  const serial = workItem('serial', {
    dependencyIds: ['done'],
    conflictWithActive: 'SERIALIZE_WITH_ACTIVE_ITEM',
  });
  const unknownConflict = workItem('unknown-conflict', {
    dependencyIds: ['done'],
    conflictWithActive: 'UNKNOWN',
  });
  const noResource = workItem('no-resource', {
    dependencyIds: ['done'],
    resourcesAvailable: false,
  });
  const blockedByFailed = workItem('blocked-failed', {
    dependencyIds: ['failed'],
  });

  const plan = buildProjectSchedulePlan(
    [
      complete,
      failed,
      barrier,
      shared,
      unknownIsolation,
      serial,
      unknownConflict,
      noResource,
      blockedByFailed,
    ],
    2,
  );

  assert.equal(plan.dispositions.done, 'COMPLETE');
  assert.equal(plan.dispositions.failed, 'FAILED');
  assert.equal(plan.dispositions.barrier, 'WAITING_BARRIER');
  assert.equal(plan.dispositions.shared, 'WAITING_CONFLICT');
  assert.equal(plan.dispositions['unknown-isolation'], 'WAITING_CONFLICT');
  assert.equal(plan.dispositions.serial, 'WAITING_CONFLICT');
  assert.equal(plan.dispositions['unknown-conflict'], 'WAITING_CONFLICT');
  assert.equal(plan.dispositions['no-resource'], 'WAITING_RESOURCE');
  assert.equal(plan.dispositions['blocked-failed'], 'WAITING_DEPENDENCY');
  assert.deepEqual(plan.selectedIds, []);
  assert.equal(plan.shouldStop, true);
});

test('scheduler rejects ambiguous or malformed project dependency state', () => {
  assert.throws(() => buildProjectSchedulePlan([], 0), /positive integer/);
  assert.throws(
    () => buildProjectSchedulePlan([workItem('work-a'), workItem('work-a')], 1),
    /duplicate work item/,
  );
  assert.throws(
    () => buildProjectSchedulePlan([workItem('work-a', { dependencyIds: ['missing'] })], 1),
    /unknown work item dependency/,
  );
  assert.throws(
    () => buildProjectSchedulePlan([workItem('work-a', { dependencyIds: ['work-a'] })], 1),
    /depend on itself/,
  );
  assert.throws(
    () =>
      buildProjectSchedulePlan(
        [
          workItem('work-a', { dependencyIds: ['work-b'] }),
          workItem('work-b', { dependencyIds: ['work-a'] }),
        ],
        1,
      ),
    /acyclic/,
  );
  assert.throws(
    () =>
      buildProjectSchedulePlan(
        [workItem('work-a', { dependencyIds: ['work-b', 'work-b'] }), workItem('work-b')],
        1,
      ),
    /duplicate dependency/,
  );

  for (const invalid of [
    workItem('x'),
    workItem('work-a', { state: 'UNKNOWN' }),
    workItem('work-a', { priority: 1.5 }),
    workItem('work-a', { roadmapOrder: -1 }),
    workItem('work-a', { roadmapOrder: 1.5 }),
    workItem('work-a', { workspaceIsolation: 'UNSAFE' }),
    workItem('work-a', { conflictWithActive: 'MAYBE' }),
    workItem('work-a', { blockedSecretHandleIds: 'provider.openai.api' }),
    workItem('work-a', { blockedSecretHandleIds: ['x'] }),
    workItem('work-a', {
      blockedSecretHandleIds: ['provider.openai.api', 'provider.openai.api'],
    }),
    workItem('work-a', { resourcesAvailable: 'yes' }),
    workItem('work-a', { cutoverBlocked: 'no' }),
  ]) {
    assert.throws(() => buildProjectSchedulePlan([invalid], 1));
  }
});

test('active work count cannot exceed scheduler capacity', () => {
  assert.throws(
    () =>
      buildProjectSchedulePlan(
        [workItem('work-a', { state: 'ACTIVE' }), workItem('work-b', { state: 'ACTIVE' })],
        1,
      ),
    /exceed maxActiveWorkItems/,
  );
});

test('human decision queue entries are exact-bound deterministic metadata only', () => {
  const first = createHumanDecisionQueueEntry(decisionInput());
  const second = createHumanDecisionQueueEntry(
    decisionInput({
      evidenceHashes: [H1, H2],
      blockedWorkItemIds: ['work-b', 'work-c'],
    }),
  );

  assert.deepEqual(first, second);
  assert.match(first.decisionHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.evidenceHashes, [H1, H2]);
  assert.deepEqual(first.blockedWorkItemIds, ['work-b', 'work-c']);
  assert.equal(first.otherWorkContinuing, true);
  assert.equal(first.authority, 'NONE');
});

test('human decision queue rejects malformed identity evidence and user-facing metadata', () => {
  for (const invalid of [
    decisionInput({ decisionId: 'x' }),
    decisionInput({ projectId: 'x' }),
    decisionInput({ repositoryIdentity: ' ' }),
    decisionInput({ workItemId: 'x' }),
    decisionInput({ runId: 'x' }),
    decisionInput({ nodeId: 'x' }),
    decisionInput({ exactRevision: '' }),
    decisionInput({ scopeHash: 'bad' }),
    decisionInput({ decisionType: '' }),
    decisionInput({ reason: ' ' }),
    decisionInput({ choices: [''] }),
    decisionInput({ consequences: [''] }),
    decisionInput({ evidenceHashes: ['bad'] }),
    decisionInput({ evidenceHashes: [H1, H1] }),
    decisionInput({ createdAt: 'not-a-date' }),
    decisionInput({ blockedWorkItemIds: ['x'] }),
    decisionInput({ blockedWorkItemIds: ['work-b', 'work-b'] }),
    decisionInput({ otherWorkContinuing: 'yes' }),
  ]) {
    assert.throws(() => createHumanDecisionQueueEntry(invalid));
  }
});

test('workflow HUMAN_REQUIRED leaves unrelated branch runnable and dependent join pending', () => {
  const workflow = publishWorkflow({
    id: 'human-local-suspension',
    version: '1.0.0',
    nodes: [
      { id: 'start-a', kind: 'MODEL' },
      { id: 'human-a', kind: 'HUMAN' },
      { id: 'after-a', kind: 'MODEL' },
      { id: 'start-b', kind: 'MODEL' },
      { id: 'after-b', kind: 'MODEL' },
      { id: 'join', kind: 'AGGREGATE' },
    ],
    edges: [
      { from: 'start-a', to: 'human-a' },
      { from: 'human-a', to: 'after-a' },
      { from: 'start-b', to: 'after-b' },
      { from: 'after-a', to: 'join' },
      { from: 'after-b', to: 'join' },
    ],
  });

  let states = createInitialNodeStates(workflow);
  states = transitionNodeState(states, 'start-a', 'RUNNING');
  states = transitionNodeState(states, 'start-a', 'PASSED');
  states = transitionNodeState(states, 'start-b', 'RUNNING');
  states = transitionNodeState(states, 'start-b', 'PASSED');
  states = propagateWorkflowStates(workflow, states);

  assert.equal(states['human-a'], 'READY');
  assert.equal(states['after-b'], 'READY');

  states = transitionNodeState(states, 'human-a', 'HUMAN_REQUIRED');
  states = transitionNodeState(states, 'after-b', 'RUNNING');
  states = transitionNodeState(states, 'after-b', 'PASSED');
  states = propagateWorkflowStates(workflow, states);

  assert.equal(states['human-a'], 'HUMAN_REQUIRED');
  assert.equal(states['after-a'], 'PENDING');
  assert.equal(states.join, 'PENDING');
  assert.equal(states['after-b'], 'PASSED');
});

test('true human gates stay human-only and do not globally cancel the project', () => {
  assert.equal(parkedHumanRequiredCancelsProject(), false);
  assert.equal(modelCanResolveHumanDecision(), false);
  assert.equal(unknownConflictCanRun(), false);
  assert.equal(schedulerCanGrantAuthority(), false);
});
