import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlanningSnapshot,
  planningCanAuthorizeExecution,
  planningCanGrantAuthority,
  planningProjection,
  validateEngineeringPlan,
} from '../dist/index.js';

const readyPlan = {
  schemaVersion: 1,
  id: 'fh-30a',
  revision: 1,
  title: 'Planning module',
  repository: 'skonyd/freehighlander-engineering-platform',
  baseRevision: '262173216860ea30a63324d7e5f962db3cf6abbe',
  status: 'READY',
  acceptanceCriteria: [
    { id: 'AC-1', text: 'Planning contracts are deterministic.' },
    { id: 'AC-2', text: 'Planning cannot grant execution authority.' },
  ],
  workItems: [
    {
      id: 'WI-1',
      title: 'Define contracts',
      dependsOn: [],
      acceptanceCriteria: ['AC-1'],
    },
    {
      id: 'WI-2',
      title: 'Verify authority boundary',
      dependsOn: ['WI-1'],
      acceptanceCriteria: ['AC-2'],
    },
  ],
  blockers: [],
};

test('valid READY plan creates deterministic non-authoritative snapshot', async () => {
  const first = await buildPlanningSnapshot(readyPlan);
  const second = await buildPlanningSnapshot(readyPlan);

  assert.equal(first.planHash, second.planHash);
  assert.equal(first.readiness, 'READY');
  assert.equal(first.authority, 'NONE');
  assert.equal(first.executionAuthorized, false);
  assert.equal(planningCanGrantAuthority(), false);
  assert.equal(planningCanAuthorizeExecution(), false);
});

test('planning projection is read-only readiness, not execution authority', () => {
  const projection = planningProjection({
    ...readyPlan,
    status: 'DRAFT',
  });

  assert.equal(projection.readiness, 'NOT_READY');
  assert.equal(projection.authority, 'NONE');
  assert.equal(projection.executionAuthorized, false);
});

test('unknown dependency and criterion fail closed', () => {
  const result = validateEngineeringPlan({
    ...readyPlan,
    workItems: [
      {
        id: 'WI-1',
        title: 'Broken item',
        dependsOn: ['WI-missing'],
        acceptanceCriteria: ['AC-missing'],
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /unknown dependency WI-missing/);
  assert.match(result.errors.join('\n'), /unknown acceptance criterion AC-missing/);
});

test('dependency cycles fail closed', () => {
  const result = validateEngineeringPlan({
    ...readyPlan,
    workItems: [
      {
        id: 'WI-1',
        title: 'First',
        dependsOn: ['WI-2'],
        acceptanceCriteria: ['AC-1'],
      },
      {
        id: 'WI-2',
        title: 'Second',
        dependsOn: ['WI-1'],
        acceptanceCriteria: ['AC-2'],
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /must be acyclic/);
});

test('READY cannot hide blockers and BLOCKED requires a blocker', () => {
  const readyWithBlocker = validateEngineeringPlan({
    ...readyPlan,
    blockers: [{ id: 'B-1', reason: 'external dependency' }],
  });
  const blockedWithoutBlocker = validateEngineeringPlan({
    ...readyPlan,
    status: 'BLOCKED',
    blockers: [],
  });

  assert.equal(readyWithBlocker.valid, false);
  assert.match(readyWithBlocker.errors.join('\n'), /READY plan cannot retain blockers/);
  assert.equal(blockedWithoutBlocker.valid, false);
  assert.match(blockedWithoutBlocker.errors.join('\n'), /requires at least one blocker/);
});

test('duplicate identities and invalid supersession fail closed', () => {
  const result = validateEngineeringPlan({
    ...readyPlan,
    revision: 2,
    status: 'SUPERSEDED',
    acceptanceCriteria: [
      { id: 'AC-1', text: 'one' },
      { id: 'AC-1', text: 'duplicate' },
    ],
    supersedes: {
      planId: 'fh-30a',
      revision: 2,
    },
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /duplicate acceptance criterion id/);
  assert.match(result.errors.join('\n'), /must precede the current revision/);
});
