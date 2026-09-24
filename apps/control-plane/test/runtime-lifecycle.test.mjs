import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancellationCanSkipResourceRelease,
  cancellationCanTriggerModelShopping,
  cancellationCountsAsSemanticFailure,
  gracefulDrainCanGrantAuthority,
  planRuntimeCancellation,
  queuedWaitCountsAsExecutionTime,
  runtimeDrainAcceptsNewWork,
  transitionRuntimeDrain,
} from '../dist/index.js';

function activity(id, parentId, state, supportsCancellation = true) {
  return { id, parentId, state, supportsCancellation };
}

function drainEvidence(overrides = {}) {
  return {
    acceptingNewWork: false,
    safeCheckpointPersisted: true,
    activitiesSettled: true,
    permitsReleased: true,
    leasesReleased: true,
    secretReceiptsRevoked: true,
    ...overrides,
  };
}

test('cancellation propagates through descendants in deterministic parent-first order', () => {
  const plan = planRuntimeCancellation(
    [
      activity('root-001', null, 'RUNNING', true),
      activity('child-b', 'root-001', 'RUNNING', false),
      activity('child-a', 'root-001', 'QUEUED', false),
      activity('grand-001', 'child-a', 'CANCEL_REQUESTED', true),
      activity('done-001', 'child-b', 'COMPLETED', true),
      activity('cancelled-001', 'child-b', 'CANCELLED', true),
      activity('failed-001', 'child-b', 'FAILED', true),
    ],
    'root-001',
    'USER_CANCEL',
  );

  assert.equal(plan.semanticFailure, false);
  assert.equal(plan.modelShoppingAllowed, false);
  assert.equal(plan.authority, 'NONE');
  assert.deepEqual(
    plan.actions.map((entry) => [entry.activityId, entry.action]),
    [
      ['root-001', 'SIGNAL_CANCEL'],
      ['child-a', 'CANCEL_BEFORE_START'],
      ['child-b', 'DRAIN_UNINTERRUPTIBLE'],
      ['grand-001', 'ALREADY_REQUESTED'],
      ['cancelled-001', 'NO_ACTION'],
      ['done-001', 'NO_ACTION'],
      ['failed-001', 'NO_ACTION'],
    ],
  );

  for (const action of plan.actions.slice(0, 4)) {
    assert.equal(action.resourceReleaseRequired, true);
  }
  for (const action of plan.actions.slice(4)) {
    assert.equal(action.resourceReleaseRequired, false);
  }
  assert.equal(plan.actions[0].cancellationSignalRequired, true);
  assert.equal(plan.actions[1].cancellationSignalRequired, false);
  assert.equal(plan.actions[2].cancellationSignalRequired, false);
});

test('all supported cancellation reasons are accepted', () => {
  for (const reason of ['USER_CANCEL', 'DEADLINE_EXCEEDED', 'SHUTDOWN', 'PARENT_CANCELLED']) {
    const plan = planRuntimeCancellation(
      [activity('root-001', null, 'RUNNING')],
      'root-001',
      reason,
    );
    assert.equal(plan.reason, reason);
  }
});

test('cancellation graph validation fails closed on malformed topology and enums', () => {
  assert.throws(
    () => planRuntimeCancellation([], 'root-001', 'USER_CANCEL'),
    /cannot be empty/,
  );
  assert.throws(
    () =>
      planRuntimeCancellation(
        [activity('x', null, 'RUNNING')],
        'x',
        'USER_CANCEL',
      ),
    /bounded identifier/,
  );
  assert.throws(
    () =>
      planRuntimeCancellation(
        [activity('root-001', null, 'RUNNING'), activity('root-001', null, 'RUNNING')],
        'root-001',
        'USER_CANCEL',
      ),
    /duplicate/,
  );
  assert.throws(
    () =>
      planRuntimeCancellation(
        [activity('root-001', null, 'UNKNOWN')],
        'root-001',
        'USER_CANCEL',
      ),
    /unsupported activity lifecycle state/,
  );
  assert.throws(
    () =>
      planRuntimeCancellation(
        [activity('root-001', null, 'RUNNING'), activity('child-001', 'x', 'RUNNING')],
        'root-001',
        'USER_CANCEL',
      ),
    /parent activity id/,
  );
  assert.throws(
    () =>
      planRuntimeCancellation(
        [activity('root-001', 'root-001', 'RUNNING')],
        'root-001',
        'USER_CANCEL',
      ),
    /cannot parent itself/,
  );
  assert.throws(
    () =>
      planRuntimeCancellation(
        [activity('root-001', null, 'RUNNING'), activity('child-001', 'missing-001', 'RUNNING')],
        'root-001',
        'USER_CANCEL',
      ),
    /unknown parent activity/,
  );
  assert.throws(
    () =>
      planRuntimeCancellation(
        [
          activity('root-001', 'child-001', 'RUNNING'),
          activity('child-001', 'root-001', 'RUNNING'),
        ],
        'root-001',
        'USER_CANCEL',
      ),
    /acyclic/,
  );
  assert.throws(
    () =>
      planRuntimeCancellation(
        [activity('root-001', null, 'RUNNING')],
        'missing-001',
        'USER_CANCEL',
      ),
    /unknown cancellation root/,
  );
  assert.throws(
    () =>
      planRuntimeCancellation(
        [activity('root-001', null, 'RUNNING')],
        'root-001',
        'UNKNOWN',
      ),
    /unsupported cancellation reason/,
  );
});

test('all supported activity states validate through cancellation planning', () => {
  for (const state of [
    'QUEUED',
    'RUNNING',
    'CANCEL_REQUESTED',
    'CANCELLED',
    'COMPLETED',
    'FAILED',
  ]) {
    assert.doesNotThrow(() =>
      planRuntimeCancellation(
        [activity('root-001', null, state, false)],
        'root-001',
        'SHUTDOWN',
      ),
    );
  }
});

test('graceful drain permits only the canonical transition sequence', () => {
  const evidence = drainEvidence();

  assert.deepEqual(transitionRuntimeDrain('RUNNING', 'DRAINING', evidence), {
    from: 'RUNNING',
    to: 'DRAINING',
    authority: 'NONE',
  });
  assert.deepEqual(transitionRuntimeDrain('DRAINING', 'CHECKPOINTED', evidence), {
    from: 'DRAINING',
    to: 'CHECKPOINTED',
    authority: 'NONE',
  });
  assert.deepEqual(transitionRuntimeDrain('CHECKPOINTED', 'RELEASING', evidence), {
    from: 'CHECKPOINTED',
    to: 'RELEASING',
    authority: 'NONE',
  });
  assert.deepEqual(transitionRuntimeDrain('RELEASING', 'STOPPED', evidence), {
    from: 'RELEASING',
    to: 'STOPPED',
    authority: 'NONE',
  });

  assert.throws(
    () => transitionRuntimeDrain('RUNNING', 'CHECKPOINTED', evidence),
    /illegal graceful-drain transition/,
  );
  assert.throws(
    () => transitionRuntimeDrain('STOPPED', 'STOPPED', evidence),
    /illegal graceful-drain transition/,
  );
});

test('graceful drain gates checkpoint settle and all resource releases', () => {
  assert.throws(
    () =>
      transitionRuntimeDrain(
        'RUNNING',
        'DRAINING',
        drainEvidence({ acceptingNewWork: true }),
      ),
    /stop accepting new work/,
  );

  assert.throws(
    () =>
      transitionRuntimeDrain(
        'DRAINING',
        'CHECKPOINTED',
        drainEvidence({ safeCheckpointPersisted: false }),
      ),
    /persisted safe checkpoint/,
  );

  assert.throws(
    () =>
      transitionRuntimeDrain(
        'CHECKPOINTED',
        'RELEASING',
        drainEvidence({ activitiesSettled: false }),
      ),
    /activities to settle/,
  );

  for (const overrides of [
    { activitiesSettled: false },
    { permitsReleased: false },
    { leasesReleased: false },
    { secretReceiptsRevoked: false },
  ]) {
    assert.throws(
      () =>
        transitionRuntimeDrain(
          'RELEASING',
          'STOPPED',
          drainEvidence(overrides),
        ),
      /all runtime resources are released/,
    );
  }
});

test('runtime drain intake is allowed only while RUNNING', () => {
  assert.equal(runtimeDrainAcceptsNewWork('RUNNING'), true);
  for (const state of ['DRAINING', 'CHECKPOINTED', 'RELEASING', 'STOPPED']) {
    assert.equal(runtimeDrainAcceptsNewWork(state), false);
  }
});

test('drain and cancellation enums fail closed when malformed', () => {
  assert.throws(
    () => runtimeDrainAcceptsNewWork('UNKNOWN'),
    /unsupported runtime drain state/,
  );
  assert.throws(
    () =>
      transitionRuntimeDrain(
        'UNKNOWN',
        'DRAINING',
        drainEvidence(),
      ),
    /unsupported runtime drain state/,
  );
  assert.throws(
    () =>
      transitionRuntimeDrain(
        'RUNNING',
        'UNKNOWN',
        drainEvidence(),
      ),
    /unsupported runtime drain state/,
  );
});

test('cancellation and drain cannot change semantic or authority behavior', () => {
  assert.equal(cancellationCanTriggerModelShopping(), false);
  assert.equal(cancellationCountsAsSemanticFailure(), false);
  assert.equal(cancellationCanSkipResourceRelease(), false);
  assert.equal(queuedWaitCountsAsExecutionTime(), false);
  assert.equal(gracefulDrainCanGrantAuthority(), false);
});
