import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDiagnosedUserErrorV1,
  buildRuntimeErrorDiagnosisV1,
  errorDiagnosisCanExposeRawCause,
  errorDiagnosisCanGrantAuthority,
  formatRuntimeErrorDiagnosisForUser,
  runtimeErrorDiagnosisV1Schema,
  runtimeErrorReportV1Schema,
  unresolvedDiagnosisCanClaimSpecificRootCause,
} from '../dist/index.js';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);

function runtimeError(overrides = {}) {
  return runtimeErrorReportV1Schema.parse({
    schemaVersion: 1,
    kind: 'RUNTIME_ERROR',
    errorId: 'error-001',
    patternId: 'FH-RATELIMIT-001',
    errorClass: 'RATE_LIMIT',
    severity: 'WARNING',
    retryability: 'AFTER_BACKOFF',
    binding: {
      runId: 'run-001',
      exactRevision: 'abc123',
      scopeHash: H1,
      runSnapshotHash: H2,
    },
    component: 'model-runtime',
    operation: 'provider-invoke',
    correlationId: 'corr-001',
    technicalSummary: 'provider quota exhausted',
    failureKind: 'quota-exhausted',
    evidence: [{ artifactId: 'artifact-001', contentHash: H3 }],
    occurredAt: '2026-09-25T22:30:00+03:00',
    authority: 'NONE',
    ...overrides,
  });
}

function quotaDiagnosisInput(overrides = {}) {
  return {
    causeCode: 'PROVIDER_QUOTA_EXHAUSTED',
    causeKind: 'QUOTA_EXHAUSTED',
    certainty: 'CONFIRMED_SIGNAL',
    headline: 'Primary model quota exhausted',
    failedStep: 'Invoke preferred final-review model',
    rootCause:
      'The provider rejected the preferred model because its current usage quota is exhausted.',
    observedSignal: 'quota_exhausted with Retry-After=1800s',
    causalChain: [
      {
        sequence: 0,
        layer: 'PROVIDER',
        component: 'anthropic-provider',
        operation: 'chat-completions',
        code: 'QUOTA_EXHAUSTED',
        summary: 'Provider reported exhausted quota.',
      },
      {
        sequence: 1,
        layer: 'MODEL_RUNTIME',
        component: 'model-runtime',
        operation: 'provider-invoke',
        code: 'PROVIDER_FAILURE',
        summary: 'Model runtime surfaced the provider availability failure.',
      },
    ],
    nextAction:
      'Use the configured fallback now and retry the preferred model after its reset time',
    retryAt: '2026-09-25T23:00:00+03:00',
    redactionStatus: 'NOT_REQUIRED',
    ...overrides,
  };
}

test('confirmed quota failure produces concise root-cause user reporting', () => {
  const error = runtimeError();
  const diagnosis = buildRuntimeErrorDiagnosisV1(error, quotaDiagnosisInput());
  const bundle = buildDiagnosedUserErrorV1(error, diagnosis, [
    { label: 'Fallback', value: 'gpt6-secondary' },
  ]);

  assert.equal(diagnosis.causeKind, 'QUOTA_EXHAUSTED');
  assert.equal(diagnosis.certainty, 'CONFIRMED_SIGNAL');
  assert.equal(bundle.userError.title, 'Primary model quota exhausted');
  assert.match(bundle.userError.summary, /usage quota is exhausted/);
  assert.match(bundle.userError.whatHappened, /quota_exhausted/);
  assert.match(bundle.userError.nextAction, /configured fallback/);
  assert.match(bundle.conciseMessage, /Source anthropic-provider\/chat-completions/);
  assert.match(bundle.conciseMessage, /Retry at 2026-09-25T23:00:00\+03:00/);
  assert.equal(bundle.authority, 'NONE');
});

test('diagnosis is exact-bound to error identity binding and surfaced component', () => {
  const error = runtimeError();
  const diagnosis = buildRuntimeErrorDiagnosisV1(error, quotaDiagnosisInput());

  assert.throws(
    () => buildDiagnosedUserErrorV1(runtimeError({ errorId: 'error-002' }), diagnosis),
    /errorId does not match/,
  );

  assert.throws(
    () =>
      buildDiagnosedUserErrorV1(
        runtimeError({ correlationId: 'corr-002' }),
        diagnosis,
      ),
    /correlationId does not match/,
  );

  assert.throws(
    () =>
      buildDiagnosedUserErrorV1(
        runtimeError({
          binding: {
            runId: 'run-002',
            exactRevision: 'abc123',
            scopeHash: H1,
            runSnapshotHash: H2,
          },
        }),
        diagnosis,
      ),
    /binding does not match/,
  );

  const wrongSurface = buildRuntimeErrorDiagnosisV1(
    error,
    quotaDiagnosisInput({
      causalChain: [
        quotaDiagnosisInput().causalChain[0],
        {
          sequence: 1,
          layer: 'CONTROL_PLANE',
          component: 'other-component',
          operation: 'other-operation',
          code: 'SURFACED',
          summary: 'Wrong surface.',
        },
      ],
    }),
  );
  assert.throws(() => buildDiagnosedUserErrorV1(error, wrongSurface), /must end at the surfaced/);
});

test('causal chain is bounded contiguous and root-first', () => {
  const error = runtimeError();

  assert.throws(
    () =>
      buildRuntimeErrorDiagnosisV1(
        error,
        quotaDiagnosisInput({
          causalChain: [
            quotaDiagnosisInput().causalChain[0],
            { ...quotaDiagnosisInput().causalChain[1], sequence: 2 },
          ],
        }),
      ),
    /contiguous and root-first/,
  );

  assert.throws(() =>
    runtimeErrorDiagnosisV1Schema.parse({
      ...buildRuntimeErrorDiagnosisV1(error, quotaDiagnosisInput()),
      causalChain: Array.from({ length: 9 }, (_, index) => ({
        sequence: index,
        layer: 'INTERNAL',
        component: 'internal-component',
        operation: 'internal-operation',
        code: 'INTERNAL_CODE',
        summary: 'bounded causal hop',
      })),
    }),
  );
});

test('unresolved root cause is explicit and cannot claim a specific cause kind', () => {
  const error = runtimeError({
    patternId: 'FH-INTERNAL-001',
    errorClass: 'INTERNAL',
    severity: 'CRITICAL',
    retryability: 'NEVER',
  });

  const diagnosis = buildRuntimeErrorDiagnosisV1(error, {
    causeCode: 'ROOT_CAUSE_UNRESOLVED',
    causeKind: 'UNKNOWN',
    certainty: 'UNRESOLVED',
    headline: 'Internal failure needs diagnosis',
    failedStep: 'Complete orchestration transition',
    rootCause: 'The exact root cause could not be established from the available typed signals.',
    observedSignal: 'An internal invariant failed without a registered causal signal.',
    causalChain: [
      {
        sequence: 0,
        layer: 'INTERNAL',
        component: 'model-runtime',
        operation: 'provider-invoke',
        code: 'UNRESOLVED',
        summary: 'No confirmed lower-level cause is available.',
      },
    ],
    nextAction: 'Inspect the correlation evidence and registered internal diagnostics',
    redactionStatus: 'APPLIED',
  });

  assert.equal(diagnosis.causeKind, 'UNKNOWN');
  assert.equal(diagnosis.certainty, 'UNRESOLVED');
  assert.match(formatRuntimeErrorDiagnosisForUser(error, diagnosis), /exact root cause could not/);

  const bundle = buildDiagnosedUserErrorV1(error, diagnosis);
  assert.equal(bundle.userError.title, 'Internal failure needs diagnosis');
  assert.match(bundle.userError.whatHappened, /internal invariant failed/i);
  assert.doesNotMatch(bundle.conciseMessage, /Retry at/);

  assert.throws(
    () =>
      buildRuntimeErrorDiagnosisV1(error, {
        ...quotaDiagnosisInput(),
        causeKind: 'TRANSPORT',
        certainty: 'UNRESOLVED',
      }),
    /UNRESOLVED diagnosis must use UNKNOWN/,
  );

  assert.throws(
    () =>
      buildRuntimeErrorDiagnosisV1(error, {
        ...quotaDiagnosisInput(),
        causeKind: 'UNKNOWN',
        certainty: 'CONFIRMED_SIGNAL',
      }),
    /UNKNOWN cause must remain UNRESOLVED/,
  );

  assert.equal(unresolvedDiagnosisCanClaimSpecificRootCause(), false);
});

test('diagnosis schema rejects raw diagnostic fields and preserves safe-display invariants', () => {
  const error = runtimeError();
  const diagnosis = buildRuntimeErrorDiagnosisV1(error, quotaDiagnosisInput());

  assert.throws(() =>
    runtimeErrorDiagnosisV1Schema.parse({
      ...diagnosis,
      rawCause: 'provider body with secret',
    }),
  );
  assert.throws(() =>
    runtimeErrorDiagnosisV1Schema.parse({
      ...diagnosis,
      safeForUserDisplay: false,
    }),
  );
  assert.throws(() =>
    runtimeErrorDiagnosisV1Schema.parse({
      ...diagnosis,
      authority: 'SYSTEM_POLICY',
    }),
  );

  assert.equal(errorDiagnosisCanExposeRawCause(), false);
  assert.equal(errorDiagnosisCanGrantAuthority(), false);
});

test('diagnosed user error enforces existing safe detail bounds', () => {
  const error = runtimeError();
  const diagnosis = buildRuntimeErrorDiagnosisV1(error, quotaDiagnosisInput());
  const extras = Array.from({ length: 15 }, (_, index) => ({
    label: `Extra ${index}`,
    value: 'safe',
  }));

  assert.throws(
    () => buildDiagnosedUserErrorV1(error, diagnosis, extras),
    /safe details exceed maximum/,
  );
});
