import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRuntimeErrorReport,
  formatRuntimeErrorForUser,
  runtimeErrorReportCanExposeSecrets,
  runtimeErrorReportCanGrantAuthority,
} from '../dist/index.js';

test('runtime error report creates stable diagnostic shape without authority', () => {
  const report = createRuntimeErrorReport({
    code: 'workspace_invalid',
    userMessage: 'The execution workspace is no longer valid.',
    severity: 'ERROR',
    operation: 'runtime.reattach',
    retryable: false,
    correlationId: 'corr-12345678',
    details: {
      workspaceId: 'workspace-001',
      expectedRevision: 'a'.repeat(40),
    },
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.code, 'WORKSPACE_INVALID');
  assert.equal(report.correlationId, 'corr-12345678');
  assert.equal(report.authority, 'NONE');
  assert.equal(report.fingerprint.length, 64);
  assert.equal(runtimeErrorReportCanGrantAuthority(), false);
  assert.equal(runtimeErrorReportCanExposeSecrets(), false);
});

test('runtime error report redacts secret-like keys and omits raw cause messages', () => {
  const report = createRuntimeErrorReport({
    code: 'PROVIDER_FAILURE',
    userMessage: 'The provider request failed.',
    correlationId: 'corr-abcdefgh',
    details: {
      apiKey: 'super-secret-value',
      Authorization: 'Bearer abc',
      model: 'example-model',
      payload: { prompt: 'sensitive' },
    },
    cause: new Error('raw provider response with secret text'),
  });

  assert.deepEqual(report.details, [
    { key: 'Authorization', value: '[REDACTED]' },
    { key: 'apiKey', value: '[REDACTED]' },
    { key: 'model', value: 'example-model' },
    { key: 'payload', value: '[structured-value-omitted]' },
    { key: 'cause', value: 'Error' },
  ]);

  const rendered = formatRuntimeErrorForUser(report);
  assert.match(rendered, /Correlation ID: corr-abcdefgh/);
  assert.doesNotMatch(
    rendered,
    /super-secret-value|Bearer abc|raw provider response/,
  );
});

test('runtime error report bounds details and normalizes multiline values', () => {
  const report = createRuntimeErrorReport({
    code: 'COMMAND_FAILED',
    userMessage: 'The registered command failed.',
    correlationId: 'corr-87654321',
    maxDetailEntries: 2,
    maxValueChars: 8,
    details: {
      alpha: 'one\ntwo',
      beta: '123456789012',
      gamma: 'ignored',
    },
  });

  assert.deepEqual(report.details, [
    { key: 'alpha', value: 'one two' },
    { key: 'beta', value: '12345678…' },
  ]);
});

test('runtime error report validates public identifiers and messages', () => {
  assert.throws(
    () =>
      createRuntimeErrorReport({
        code: 'x',
        userMessage: 'valid message',
        correlationId: 'corr-12345678',
      }),
    /error code/,
  );
  assert.throws(
    () =>
      createRuntimeErrorReport({
        code: 'VALID_CODE',
        userMessage: 'bad',
        correlationId: 'corr-12345678',
      }),
    /userMessage/,
  );
  assert.throws(
    () =>
      createRuntimeErrorReport({
        code: 'VALID_CODE',
        userMessage: 'valid message',
        correlationId: 'bad id',
      }),
    /correlationId/,
  );
});
