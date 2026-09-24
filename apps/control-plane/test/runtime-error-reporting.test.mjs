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
  assert.doesNotMatch(rendered, /super-secret-value|Bearer abc|raw provider response/);
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

test('runtime error report covers defaults primitive details and safe user formatting', () => {
  const report = createRuntimeErrorReport({
    code: 'DEFAULT_PATH',
    userMessage: 'Defaults are safe.',
    retryable: true,
    details: {
      '': 'ignored-empty-key',
      bool: true,
      count: 7,
      nothing: null,
      missing: undefined,
      bigint: 9n,
      errorObject: new TypeError('hidden detail'),
    },
  });

  assert.equal(report.severity, 'ERROR');
  assert.equal(report.retryable, true);
  assert.match(report.correlationId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(report.details, [
    { key: 'bigint', value: '9' },
    { key: 'bool', value: 'true' },
    { key: 'count', value: '7' },
    { key: 'errorObject', value: 'TypeError' },
    { key: 'missing', value: 'undefined' },
    { key: 'nothing', value: 'null' },
  ]);

  const rendered = formatRuntimeErrorForUser(report);
  assert.doesNotMatch(rendered, /Operation:|Details:\n- :/);
  assert.match(rendered, /Retryable: yes/);
});

test('runtime error report covers bounded causes and detail-count cutoff', () => {
  const stringCause = createRuntimeErrorReport({
    code: 'STRING_CAUSE',
    userMessage: 'String cause is omitted.',
    correlationId: 'corr-string01',
    cause: 'sensitive raw cause',
  });
  assert.deepEqual(stringCause.details, [{ key: 'cause', value: '[cause-string-omitted]' }]);

  const objectCause = createRuntimeErrorReport({
    code: 'OBJECT_CAUSE',
    userMessage: 'Object cause is omitted.',
    correlationId: 'corr-object01',
    cause: { message: 'hidden' },
  });
  assert.deepEqual(objectCause.details, [{ key: 'cause', value: '[cause-omitted]' }]);

  const nullCause = createRuntimeErrorReport({
    code: 'NULL_CAUSE',
    userMessage: 'Null cause adds nothing.',
    correlationId: 'corr-null0001',
    cause: null,
  });
  assert.deepEqual(nullCause.details, []);

  const capped = createRuntimeErrorReport({
    code: 'CAPPED_CAUSE',
    userMessage: 'Cause is omitted when detail budget is full.',
    correlationId: 'corr-capped01',
    maxDetailEntries: 1,
    details: { alpha: 'kept', beta: 'not-reached' },
    cause: new Error('hidden'),
  });
  assert.deepEqual(capped.details, [{ key: 'alpha', value: 'kept' }]);
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
  assert.throws(
    () =>
      createRuntimeErrorReport({
        code: 'VALID_CODE',
        userMessage: 'valid message',
        correlationId: 'corr-12345678',
        operation: 'bad operation!',
      }),
    /operation/,
  );
  assert.throws(
    () =>
      createRuntimeErrorReport({
        code: 'VALID_CODE',
        userMessage: 'valid message',
        correlationId: 'corr-12345678',
        maxDetailEntries: 0,
      }),
    /maxDetailEntries/,
  );
  assert.throws(
    () =>
      createRuntimeErrorReport({
        code: 'VALID_CODE',
        userMessage: 'valid message',
        correlationId: 'corr-12345678',
        maxValueChars: 0,
      }),
    /maxValueChars/,
  );
  assert.throws(
    () =>
      createRuntimeErrorReport({
        code: 'VALID_CODE',
        userMessage: 'x'.repeat(501),
        correlationId: 'corr-12345678',
      }),
    /userMessage/,
  );
  assert.throws(
    () =>
      createRuntimeErrorReport({
        code: 'VALID_CODE',
        userMessage: 'valid message',
        correlationId: 'corr-12345678',
        maxDetailEntries: 1.5,
      }),
    /maxDetailEntries/,
  );
  assert.throws(
    () =>
      createRuntimeErrorReport({
        code: 'VALID_CODE',
        userMessage: 'valid message',
        correlationId: 'corr-12345678',
        maxValueChars: 1.5,
      }),
    /maxValueChars/,
  );
});
