import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRuntimeErrorTelemetryPayload,
  runtimeErrorTelemetryCanExposeRawCause,
  runtimeErrorTelemetryCanGrantAuthority,
} from '../dist/index.js';

function input(overrides = {}) {
  return {
    code: 'PROVIDER_QUOTA',
    severity: 'ERROR',
    retryable: true,
    correlationId: 'err-12345678',
    diagnosis: {
      causeCode: 'QUOTA_EXHAUSTED',
      causeKind: 'QUOTA_EXHAUSTED',
      certainty: 'CONFIRMED_SIGNAL',
      headline: 'Primary model quota exhausted',
      sourceComponent: 'model-runtime',
      sourceOperation: 'provider-invoke',
      failedStep: 'Invoke selected provider binding',
      rootCause: 'The provider rejected the request because the configured quota is exhausted.',
      observedSignal: 'HTTP 429 quota_exhausted',
      nextAction: 'Use the configured availability fallback or retry after quota reset.',
      retryAt: '2026-09-26T00:00:00+03:00',
      redactionStatus: 'NOT_REQUIRED',
      safeForUserDisplay: true,
    },
    ...overrides,
  };
}

test('runtime error telemetry keeps only the concise safe diagnosis projection', () => {
  const payload = buildRuntimeErrorTelemetryPayload(input());

  assert.equal(payload.code, 'PROVIDER_QUOTA');
  assert.equal(payload.causeKind, 'QUOTA_EXHAUSTED');
  assert.equal(payload.headline, 'Primary model quota exhausted');
  assert.equal(payload.observedSignal, 'HTTP 429 quota_exhausted');
  assert.equal(payload.safeForUserDisplay, true);
  assert.equal(payload.retryAt, '2026-09-25T21:00:00.000Z');
  assert.equal('details' in payload, false);
  assert.equal('stack' in payload, false);
  assert.equal('cause' in payload, false);
});

test('unsafe diagnosis cannot enter runtime error telemetry', () => {
  assert.throws(
    () =>
      buildRuntimeErrorTelemetryPayload(
        input({
          diagnosis: {
            ...input().diagnosis,
            safeForUserDisplay: false,
          },
        }),
      ),
    /safeForUserDisplay/,
  );

  assert.throws(
    () =>
      buildRuntimeErrorTelemetryPayload(
        input({
          diagnosis: {
            ...input().diagnosis,
            observedSignal: 'line one\nraw provider body',
          },
        }),
      ),
    /observedSignal is invalid/,
  );
});

test('runtime error telemetry remains authority-neutral and cannot expose raw causes', () => {
  assert.equal(runtimeErrorTelemetryCanGrantAuthority(), false);
  assert.equal(runtimeErrorTelemetryCanExposeRawCause(), false);
});
