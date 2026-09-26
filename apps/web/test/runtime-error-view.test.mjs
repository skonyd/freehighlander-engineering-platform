import assert from 'node:assert/strict';
import test from 'node:test';

import { projectDashboardRuntimeErrors } from '../dist/index.js';

function event(payload, overrides = {}) {
  return {
    type: 'runtime.error.reported',
    timestamp: '2026-09-25T21:00:00.000Z',
    nodeId: 'review-a',
    nodeType: 'MODEL',
    status: 'FAILED',
    result: null,
    failureClass: 'quota',
    event: {
      schemaVersion: 1,
      type: 'runtime.error.reported',
      timestamp: '2026-09-25T21:00:00.000Z',
      runId: 'run-1',
      payload,
    },
    ...overrides,
  };
}

const safePayload = {
  code: 'PROVIDER_QUOTA',
  severity: 'ERROR',
  retryable: true,
  correlationId: 'err-12345678',
  causeCode: 'QUOTA_EXHAUSTED',
  causeKind: 'QUOTA_EXHAUSTED',
  certainty: 'CONFIRMED_SIGNAL',
  headline: 'Primary model quota exhausted',
  sourceComponent: 'model-runtime',
  sourceOperation: 'provider-invoke',
  failedStep: 'Invoke selected provider binding',
  rootCause: 'The provider rejected the request because quota is exhausted.',
  observedSignal: 'HTTP 429 quota_exhausted',
  nextAction: 'Use the configured fallback or retry after quota reset.',
  retryAt: '2026-09-25T22:00:00.000Z',
  redactionStatus: 'NOT_REQUIRED',
  safeForUserDisplay: true,
};

test('dashboard projects only explicitly safe runtime diagnoses', () => {
  const errors = projectDashboardRuntimeErrors([
    event(safePayload),
    event({ ...safePayload, safeForUserDisplay: false }, { timestamp: '2026-09-25T21:01:00.000Z' }),
    {
      ...event(safePayload),
      type: 'model.call.completed',
    },
  ]);

  assert.equal(errors.length, 1);
  assert.equal(errors[0].headline, 'Primary model quota exhausted');
  assert.equal(errors[0].sourceComponent, 'model-runtime');
  assert.equal(errors[0].observedSignal, 'HTTP 429 quota_exhausted');
  assert.equal(errors[0].correlationId, 'err-12345678');
});

test('malformed or multiline payload data is rejected from the user projection', () => {
  assert.deepEqual(
    projectDashboardRuntimeErrors([
      event({ ...safePayload, rootCause: 'safe first line\nraw second line' }),
      event({ ...safePayload, retryAt: 'not-a-date' }),
      event({ ...safePayload, correlationId: null }),
    ]),
    [],
  );
});
