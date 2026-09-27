import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptFhKuikaExternalRoutineEventV1,
  createDashboardServer,
  externalRoutineEventAdapterCanInvokeModel,
  getFhKuikaRoutineTemplateV1,
  prepareFhKuikaRoutineDispatchV1,
  routineDispatchCandidateCanExecuteWorkflow,
  routineDispatchCandidateCanGrantAuthority,
  routineDispatchCandidateCanSubmitToScheduler,
} from '../dist/index.js';

test('routine event adapter creates metadata-only normalized event', () => {
  const event = adaptFhKuikaExternalRoutineEventV1('GIT_EVENT', {
    source: 'github',
    event: 'pull-request-opened',
    occurredAt: '2026-09-27T20:00:00.000Z',
    payload: '{"number":123}',
    repository: 'skonyd/freehighlander-engineering-platform',
    exactRevision: 'a'.repeat(40),
  });

  assert.equal(event.kind, 'GIT_EVENT');
  assert.equal(event.source, 'github');
  assert.equal(event.event, 'pull-request-opened');
  assert.match(event.payloadDigest, /^[a-f0-9]{64}$/);
  assert.equal(event.authority, 'NONE');
  assert.equal(externalRoutineEventAdapterCanInvokeModel(), false);
});

test('routine dispatch candidate matches declared event but cannot submit or execute', () => {
  const routine = getFhKuikaRoutineTemplateV1('pull-request-review');
  assert.ok(routine);

  const event = adaptFhKuikaExternalRoutineEventV1('GIT_EVENT', {
    source: 'github',
    event: 'pull-request-opened',
    occurredAt: '2026-09-27T20:00:00.000Z',
    payload: '{}',
  });

  const candidate = prepareFhKuikaRoutineDispatchV1(routine, event, ['github']);

  assert.equal(candidate.matched, true);
  assert.equal(candidate.state, 'READY_FOR_CONTROL_PLANE_REVIEW');
  assert.equal(candidate.schedulerSubmissionPrepared, true);
  assert.deepEqual(candidate.missingConnectorRefs, []);
  assert.equal(candidate.dispatchAuthorized, false);
  assert.equal(candidate.executionAuthorized, false);
  assert.equal(candidate.authority, 'NONE');
  assert.equal(routineDispatchCandidateCanSubmitToScheduler(), false);
  assert.equal(routineDispatchCandidateCanExecuteWorkflow(), false);
  assert.equal(routineDispatchCandidateCanGrantAuthority(), false);
});

test('routine dispatch candidate fails closed for unmatched event and missing connector', () => {
  const routine = getFhKuikaRoutineTemplateV1('pull-request-review');
  assert.ok(routine);

  const unmatched = adaptFhKuikaExternalRoutineEventV1('GIT_EVENT', {
    source: 'github',
    event: 'issue-opened',
    occurredAt: '2026-09-27T20:00:00.000Z',
    payload: '{}',
  });
  assert.equal(
    prepareFhKuikaRoutineDispatchV1(routine, unmatched, ['github']).state,
    'EVENT_NOT_MATCHED',
  );

  const matched = adaptFhKuikaExternalRoutineEventV1('GIT_EVENT', {
    source: 'github',
    event: 'pull-request-opened',
    occurredAt: '2026-09-27T20:00:00.000Z',
    payload: '{}',
  });
  const missing = prepareFhKuikaRoutineDispatchV1(routine, matched, []);
  assert.equal(missing.state, 'MISSING_CONNECTOR');
  assert.deepEqual(missing.missingConnectorRefs, ['github']);
  assert.equal(missing.schedulerSubmissionPrepared, false);
});

test('routine dispatch preview endpoint remains GET-only and non-authoritative', async () => {
  const server = createDashboardServer({ databasePath: '/tmp/fh-kuika-routine-no-db.sqlite' });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port;
    const params = new URLSearchParams({
      kind: 'GIT_EVENT',
      source: 'github',
      event: 'pull-request-opened',
      occurredAt: '2026-09-27T20:00:00.000Z',
      payload: '{}',
      connector: 'github',
    });

    const response = await fetch(
      base + '/api/modules/fh-kuika/routines/pull-request-review/dispatch-preview?' + params,
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.candidate.state, 'READY_FOR_CONTROL_PLANE_REVIEW');
    assert.equal(body.candidate.executionAuthorized, false);

    const denied = await fetch(
      base + '/api/modules/fh-kuika/routines/pull-request-review/dispatch-preview?' + params,
      { method: 'POST' },
    );
    assert.equal(denied.status, 405);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
