import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPlanningTransitionV1,
  createPlanningAuthoritativeStateV1,
  createPlanningExecutionIntentV1,
  planningExecutionIntentCanBypassCapabilityGate,
  planningTransitionCanGrantAuthority,
} from '../dist/index.js';

const plan = {
  schemaVersion: 1,
  id: 'plan-1',
  revision: 1,
  title: 'B-lane plan',
  repository: 'skonyd/freehighlander-engineering-platform',
  baseRevision: 'a'.repeat(40),
  status: 'DRAFT',
  acceptanceCriteria: [{ id: 'AC-1', text: 'Complete the work.' }],
  workItems: [
    {
      id: 'WI-1',
      title: 'Implement',
      dependsOn: [],
      acceptanceCriteria: ['AC-1'],
    },
  ],
  blockers: [],
};

test('authoritative planning state starts generation zero and remains authority-neutral', async () => {
  const state = await createPlanningAuthoritativeStateV1(plan);

  assert.equal(state.generation, 0);
  assert.match(state.planHash, /^[a-f0-9]{64}$/);
  assert.equal(state.authority, 'NONE');
  assert.equal(planningTransitionCanGrantAuthority(), false);
  assert.equal(planningExecutionIntentCanBypassCapabilityGate(), false);
});

test('exact-current SET_STATUS transition applies and recomputes plan hash', async () => {
  const state = await createPlanningAuthoritativeStateV1(plan);
  const result = await applyPlanningTransitionV1(state, {
    schemaVersion: 1,
    expectedGeneration: state.generation,
    expectedPlanHash: state.planHash,
    kind: 'SET_STATUS',
    nextStatus: 'READY',
  });

  assert.equal(result.status, 'APPLIED');
  assert.equal(result.state.generation, 1);
  assert.equal(result.state.plan.status, 'READY');
  assert.notEqual(result.state.planHash, state.planHash);
  assert.equal(result.authority, 'NONE');
});

test('stale generation or plan hash fails closed without mutation', async () => {
  const state = await createPlanningAuthoritativeStateV1(plan);

  for (const patch of [{ expectedGeneration: 1 }, { expectedPlanHash: 'b'.repeat(64) }]) {
    const result = await applyPlanningTransitionV1(state, {
      schemaVersion: 1,
      expectedGeneration: state.generation,
      expectedPlanHash: state.planHash,
      kind: 'SET_STATUS',
      nextStatus: 'READY',
      ...patch,
    });
    assert.equal(result.status, 'CONFLICT');
    assert.deepEqual(result.state, state);
  }
});

test('invalid transitions are BLOCKED instead of manufacturing valid plan state', async () => {
  const state = await createPlanningAuthoritativeStateV1(plan);

  const missingStatus = await applyPlanningTransitionV1(state, {
    schemaVersion: 1,
    expectedGeneration: 0,
    expectedPlanHash: state.planHash,
    kind: 'SET_STATUS',
  });
  assert.equal(missingStatus.status, 'BLOCKED');

  const blockedWithoutBlockers = await applyPlanningTransitionV1(state, {
    schemaVersion: 1,
    expectedGeneration: 0,
    expectedPlanHash: state.planHash,
    kind: 'SET_STATUS',
    nextStatus: 'BLOCKED',
    blockers: [],
  });
  assert.equal(blockedWithoutBlockers.status, 'BLOCKED');

  const badSupersede = await applyPlanningTransitionV1(state, {
    schemaVersion: 1,
    expectedGeneration: 0,
    expectedPlanHash: state.planHash,
    kind: 'SUPERSEDE',
    supersededByRevision: 1,
  });
  assert.equal(badSupersede.status, 'BLOCKED');
});

test('SUPERSEDE creates exact revision metadata but no execution authority', async () => {
  const state = await createPlanningAuthoritativeStateV1(plan);
  const result = await applyPlanningTransitionV1(state, {
    schemaVersion: 1,
    expectedGeneration: 0,
    expectedPlanHash: state.planHash,
    kind: 'SUPERSEDE',
    supersededByRevision: 2,
  });

  assert.equal(result.status, 'APPLIED');
  assert.equal(result.state.plan.status, 'SUPERSEDED');
  assert.equal(result.state.plan.revision, 2);
  assert.deepEqual(result.state.plan.supersedes, { planId: 'plan-1', revision: 1 });
});

test('READY work item creates capability-scoped intent that still authorizes nothing', async () => {
  const draft = await createPlanningAuthoritativeStateV1(plan);
  const ready = (
    await applyPlanningTransitionV1(draft, {
      schemaVersion: 1,
      expectedGeneration: 0,
      expectedPlanHash: draft.planHash,
      kind: 'SET_STATUS',
      nextStatus: 'READY',
    })
  ).state;

  const expected = new Map([
    ['IMPLEMENT', 'GIT_WRITE'],
    ['RELEASE', 'RELEASE_DEPLOY'],
    ['OPERATE', 'INFRASTRUCTURE_MUTATION'],
    ['REMEDIATE', 'AUTOMATIC_REMEDIATION'],
  ]);

  for (const [kind, capability] of expected) {
    const intent = createPlanningExecutionIntentV1(ready, {
      schemaVersion: 1,
      expectedGeneration: ready.generation,
      expectedPlanHash: ready.planHash,
      workItemId: 'WI-1',
      kind,
    });
    assert.equal(intent.requiredCapability, capability);
    assert.equal(intent.authority, 'NONE');
    assert.equal(intent.executionAuthorized, false);
  }
});

test('execution intent fails closed for stale non-ready unknown or malformed requests', async () => {
  const state = await createPlanningAuthoritativeStateV1(plan);
  const base = {
    schemaVersion: 1,
    expectedGeneration: state.generation,
    expectedPlanHash: state.planHash,
    workItemId: 'WI-1',
    kind: 'IMPLEMENT',
  };

  assert.throws(() => createPlanningExecutionIntentV1(state, base), /READY plan/);
  assert.throws(
    () => createPlanningExecutionIntentV1(state, { ...base, expectedGeneration: 1 }),
    /generation is stale/,
  );
  assert.throws(
    () => createPlanningExecutionIntentV1(state, { ...base, expectedPlanHash: 'b'.repeat(64) }),
    /planHash is stale/,
  );

  const ready = (
    await applyPlanningTransitionV1(state, {
      schemaVersion: 1,
      expectedGeneration: 0,
      expectedPlanHash: state.planHash,
      kind: 'SET_STATUS',
      nextStatus: 'READY',
    })
  ).state;
  assert.throws(
    () =>
      createPlanningExecutionIntentV1(ready, {
        ...base,
        expectedGeneration: 1,
        expectedPlanHash: ready.planHash,
        workItemId: 'missing',
      }),
    /unknown work item/,
  );
});

test('malformed authoritative envelopes and requests fail closed', async () => {
  const state = await createPlanningAuthoritativeStateV1(plan);

  for (const invalid of [
    { ...state, schemaVersion: 2 },
    { ...state, authority: 'ALLOW' },
    { ...state, generation: -1 },
    { ...state, planHash: 'bad' },
    { ...state, plan: { ...plan, id: '' } },
  ]) {
    await assert.rejects(() =>
      applyPlanningTransitionV1(invalid, {
        schemaVersion: 1,
        expectedGeneration: 0,
        expectedPlanHash: state.planHash,
        kind: 'SET_STATUS',
        nextStatus: 'READY',
      }),
    );
  }

  await assert.rejects(() =>
    applyPlanningTransitionV1(state, {
      schemaVersion: 2,
      expectedGeneration: 0,
      expectedPlanHash: state.planHash,
      kind: 'SET_STATUS',
      nextStatus: 'READY',
    }),
  );
  await assert.rejects(() =>
    applyPlanningTransitionV1(state, {
      schemaVersion: 1,
      expectedGeneration: -1,
      expectedPlanHash: state.planHash,
      kind: 'SET_STATUS',
      nextStatus: 'READY',
    }),
  );
  await assert.rejects(() =>
    applyPlanningTransitionV1(state, {
      schemaVersion: 1,
      expectedGeneration: 0,
      expectedPlanHash: 'bad',
      kind: 'SET_STATUS',
      nextStatus: 'READY',
    }),
  );
});
