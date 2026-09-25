import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeErrorReport, runtimeErrorReportToTelemetryInput } from '../dist/index.js';

test('diagnosed runtime report projects to safe telemetry input without raw details', () => {
  const report = createRuntimeErrorReport({
    code: 'PROVIDER_QUOTA',
    userMessage: 'Provider quota is exhausted.',
    correlationId: 'err-12345678',
    retryable: true,
    details: {
      provider: 'anthropic',
      token: 'must-not-leak',
    },
    diagnosis: {
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
      redactionStatus: 'APPLIED',
    },
  });

  const telemetry = runtimeErrorReportToTelemetryInput(report);
  assert.equal(telemetry.code, 'PROVIDER_QUOTA');
  assert.equal(telemetry.diagnosis.safeForUserDisplay, true);
  assert.equal('details' in telemetry, false);
  assert.equal('fingerprint' in telemetry, false);
});

test('legacy runtime report without diagnosis is not projected as causal telemetry', () => {
  const report = createRuntimeErrorReport({
    code: 'LEGACY_FAILURE',
    userMessage: 'Legacy operation failed.',
    correlationId: 'err-legacy-1234',
  });

  assert.throws(() => runtimeErrorReportToTelemetryInput(report), /requires safe diagnosis/);
});
