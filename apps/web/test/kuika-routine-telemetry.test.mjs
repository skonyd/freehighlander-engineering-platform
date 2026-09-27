import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptFhKuikaExternalRoutineEventV1,
  createDashboardServer,
  createFhKuikaRoutineTelemetryObservationV1,
  getFhKuikaRoutineTemplateV1,
  prepareFhKuikaRoutineDispatchV1,
  routineTelemetryCanActivateRoutine,
  routineTelemetryCanInvokeModel,
  routineTelemetryCanPersistFromPreview,
  routineTelemetryCanSubmitToScheduler,
  summarizeFhKuikaRoutineTelemetryV1,
} from '../dist/index.js';

function candidate() {
  const routine = getFhKuikaRoutineTemplateV1('pull-request-review');
  assert.ok(routine);
  const event = adaptFhKuikaExternalRoutineEventV1('GIT_EVENT', {
    source: 'github',
    event: 'pull-request-opened',
    occurredAt: '2026-09-28T00:00:00.000Z',
    payload: '{}',
  });
  return prepareFhKuikaRoutineDispatchV1(routine, event, ['github']);
}

test('routine telemetry preview is metadata-only and authority-neutral', () => {
  const observation = createFhKuikaRoutineTelemetryObservationV1({
    candidate: candidate(),
    observedAt: '2026-09-28T00:00:00.000Z',
  });

  assert.equal(observation.state, 'READY_FOR_CONTROL_PLANE_REVIEW');
  assert.equal(observation.authority, 'NONE');
  assert.equal(observation.persisted, false);
  assert.equal(routineTelemetryCanInvokeModel(), false);
  assert.equal(routineTelemetryCanPersistFromPreview(), false);
  assert.equal(routineTelemetryCanActivateRoutine(), false);
  assert.equal(routineTelemetryCanSubmitToScheduler(), false);
});

test('routine telemetry models retry and terminal failure within declared policy', () => {
  const retry = createFhKuikaRoutineTelemetryObservationV1({
    candidate: candidate(),
    observedAt: '2026-09-28T00:00:00.000Z',
    retryAttempt: 1,
    failureCode: 'provider_unavailable',
    nextRetryAt: '2026-09-28T00:00:05.000Z',
  });
  assert.equal(retry.state, 'RETRY_SCHEDULED');

  const failed = createFhKuikaRoutineTelemetryObservationV1({
    candidate: candidate(),
    observedAt: '2026-09-28T00:00:10.000Z',
    retryAttempt: 2,
    failureCode: 'provider_unavailable',
  });
  assert.equal(failed.state, 'FAILED');

  const summary = summarizeFhKuikaRoutineTelemetryV1('pull-request-review', [retry, failed]);
  assert.equal(summary.retriesScheduled, 1);
  assert.equal(summary.failures, 1);
  assert.equal(summary.latestFailureCode, 'provider_unavailable');

  assert.throws(
    () =>
      createFhKuikaRoutineTelemetryObservationV1({
        candidate: candidate(),
        observedAt: '2026-09-28T00:00:00.000Z',
        retryAttempt: 3,
      }),
    /exceeds declared retry policy/,
  );
});

test('routine telemetry preview endpoint is GET-only and never persists or activates', async () => {
  const server = createDashboardServer({ databasePath: '/tmp/fh-kuika-routine-telemetry-no-db.sqlite' });
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
      occurredAt: '2026-09-28T00:00:00.000Z',
      payload: '{}',
      connector: 'github',
      retryAttempt: '1',
      failureCode: 'provider_unavailable',
      nextRetryAt: '2026-09-28T00:00:05.000Z',
    });

    const response = await fetch(
      base + '/api/modules/fh-kuika/routines/pull-request-review/telemetry-preview?' + params,
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.observation.state, 'RETRY_SCHEDULED');
    assert.equal(body.observation.persisted, false);
    assert.equal(body.observation.authority, 'NONE');
    assert.equal(body.summary.retriesScheduled, 1);

    const denied = await fetch(
      base + '/api/modules/fh-kuika/routines/pull-request-review/telemetry-preview?' + params,
      { method: 'POST' },
    );
    assert.equal(denied.status, 405);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
