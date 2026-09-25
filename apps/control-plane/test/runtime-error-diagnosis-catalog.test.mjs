import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createKnownRuntimeFailureReport,
  formatRuntimeErrorForUser,
  knownRuntimeFailureCatalogCanGrantAuthority,
} from '../dist/index.js';

const cases = [
  [
    'VALIDATION_FAILURE',
    'request.schema',
    'VALIDATION_FAILED',
    'VALIDATION',
    'Input validation failed',
    false,
  ],
  [
    'CONFIGURATION_FAILURE',
    'provider.config',
    'CONFIGURATION_INVALID',
    'CONFIGURATION',
    'Configuration is invalid',
    false,
  ],
  [
    'POLICY_DENIED',
    'merge-rule',
    'POLICY_DENIED',
    'POLICY',
    'System policy denied the operation',
    false,
  ],
  [
    'SECRET_BINDING_MISSING',
    'anthropic-api',
    'SECRET_BINDING_MISSING',
    'SECRET_BINDING',
    'Required secret binding is missing',
    false,
  ],
  [
    'WORKSPACE_IDENTITY_MISMATCH',
    'workspace-001',
    'WORKSPACE_INVALID',
    'WORKSPACE_STATE',
    'Execution workspace is stale',
    false,
  ],
  [
    'REVISION_CONFLICT',
    'abc123',
    'REVISION_CONFLICT',
    'REVISION_CONFLICT',
    'Repository revision changed',
    false,
  ],
  [
    'COMMAND_FAILED',
    'verify-command',
    'COMMAND_FAILED',
    'COMMAND_EXIT',
    'Registered command failed',
    false,
  ],
  [
    'ACTIVITY_TIMEOUT',
    'provider-call-001',
    'ACTIVITY_TIMEOUT',
    'TIMEOUT',
    'Activity timed out',
    true,
  ],
  [
    'DEPENDENCY_UNAVAILABLE',
    'github-api',
    'DEPENDENCY_UNAVAILABLE',
    'DEPENDENCY_UNAVAILABLE',
    'Required dependency is unavailable',
    true,
  ],
  [
    'INTERNAL_INVARIANT',
    'exact-currentness',
    'INTERNAL_INVARIANT_FAILED',
    'INTERNAL_INVARIANT',
    'Internal invariant failed',
    false,
  ],
];

test('known runtime failure catalog produces specific causal reports for every supported class', () => {
  for (const [kind, subject, code, causeKind, headline, retryable] of cases) {
    const report = createKnownRuntimeFailureReport({
      kind,
      component: 'control-plane',
      operation: 'runtime.execute',
      failedStep: 'Execute bounded runtime step',
      subject,
      observedSignal: 'typed signal for ' + kind,
      correlationId: 'corr-' + String(kind).toLowerCase(),
      ...(retryable ? { retryAt: '2026-09-25T23:00:00+03:00' } : {}),
      details: { runId: 'run-001' },
    });

    assert.equal(report.code, code);
    assert.equal(report.retryable, retryable);
    assert.equal(report.diagnosis?.causeKind, causeKind);
    assert.equal(report.diagnosis?.headline, headline);
    assert.equal(report.diagnosis?.certainty, 'DETERMINISTIC_RULE');
    assert.equal(report.diagnosis?.sourceComponent, 'control-plane');
    assert.equal(report.diagnosis?.sourceOperation, 'runtime.execute');
    assert.equal(report.diagnosis?.failedStep, 'Execute bounded runtime step');
    assert.ok((report.diagnosis?.rootCause ?? '').includes(subject));
    assert.equal(report.diagnosis?.observedSignal, 'typed signal for ' + kind);
    assert.equal(report.diagnosis?.safeForUserDisplay, true);
    assert.equal(report.authority, 'NONE');

    const rendered = formatRuntimeErrorForUser(report);
    assert.ok(rendered.includes(headline));
    assert.match(rendered, /Cause:/);
    assert.match(rendered, /Source: control-plane\/runtime.execute/);
    assert.match(rendered, /Failed step: Execute bounded runtime step/);
    assert.match(rendered, /Signal: typed signal/);
    assert.match(rendered, /Next:/);
    if (retryable) {
      assert.match(rendered, /Retry at: 2026-09-25T20:00:00.000Z/);
    } else {
      assert.doesNotMatch(rendered, /Retry at:/);
    }
  }
});

test('catalog preserves optional correlation and details behavior', () => {
  const report = createKnownRuntimeFailureReport({
    kind: 'COMMAND_FAILED',
    component: 'activity-runner',
    operation: 'command.execute',
    failedStep: 'Run registered verify command',
    subject: 'verify-command',
    observedSignal: 'registered command exited with status 2',
    correlationId: 'corr-command01',
    details: {
      commandId: 'verify-command',
      exitCode: 2,
      password: 'must-not-leak',
    },
  });

  assert.equal(report.correlationId, 'corr-command01');
  assert.deepEqual(report.details, [
    { key: 'commandId', value: 'verify-command' },
    { key: 'exitCode', value: '2' },
    { key: 'password', value: '[REDACTED]' },
  ]);
});

test('catalog rejects retry timestamps for non-retryable failures', () => {
  assert.throws(
    () =>
      createKnownRuntimeFailureReport({
        kind: 'VALIDATION_FAILURE',
        component: 'control-plane',
        operation: 'request.validate',
        failedStep: 'Validate request',
        subject: 'request.schema',
        observedSignal: 'schema mismatch',
        retryAt: '2026-09-25T23:00:00+03:00',
      }),
    /retryAt is only valid for retryable/,
  );
});

test('catalog rejects unknown kinds and malformed subjects fail-closed', () => {
  const base = {
    component: 'control-plane',
    operation: 'runtime.execute',
    failedStep: 'Execute step',
    observedSignal: 'typed signal',
  };

  assert.throws(
    () => createKnownRuntimeFailureReport({ ...base, kind: 'NOPE', subject: 'valid-subject' }),
    /known runtime failure kind is unsupported/,
  );
  assert.throws(
    () => createKnownRuntimeFailureReport({ ...base, kind: 'COMMAND_FAILED', subject: 'x' }),
    /subject length is invalid/,
  );
  assert.throws(
    () =>
      createKnownRuntimeFailureReport({
        ...base,
        kind: 'COMMAND_FAILED',
        subject: 'x'.repeat(121),
      }),
    /subject length is invalid/,
  );
});

test('catalog normalizes multiline subjects before diagnosis rendering', () => {
  const report = createKnownRuntimeFailureReport({
    kind: 'DEPENDENCY_UNAVAILABLE',
    component: 'control-plane',
    operation: 'dependency.check',
    failedStep: 'Check required dependency',
    subject: 'github\napi',
    observedSignal: 'health check unavailable',
  });

  assert.match(report.diagnosis?.rootCause ?? '', /github api/);
});

test('known runtime diagnosis catalog remains authority-neutral', () => {
  assert.equal(knownRuntimeFailureCatalogCanGrantAuthority(), false);
});
