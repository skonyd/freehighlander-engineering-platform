import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaCoreExecutionRequestV1,
  fhKuikaExecutionRequestCanCarryApprovalEvidence,
  fhKuikaExecutionRequestCanGrantAuthority,
  validateFhKuikaCoreExecutionRequestV1,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);

test('FH-KUIKA execution request is exact-bound authority-neutral intent', () => {
  const request = createFhKuikaCoreExecutionRequestV1({
    requestId: 'kuika-exec-1',
    surface: 'WORKBENCH',
    mutationClass: 'GIT_WRITE',
    repository: 'skonyd/freehighlander-engineering-platform',
    exactRevision: REVISION,
    payloadDigest: 'b'.repeat(64),
  });

  assert.equal(request.requiredCapability, 'GIT_WRITE');
  assert.match(request.payloadDigest, /^[a-f0-9]{64}$/);
  assert.equal(request.authority, 'NONE');
  assert.equal(request.executionOwner, 'CONTROL_PLANE');
  assert.equal(validateFhKuikaCoreExecutionRequestV1(request), request);
  assert.equal(fhKuikaExecutionRequestCanGrantAuthority(), false);
  assert.equal(fhKuikaExecutionRequestCanCarryApprovalEvidence(), false);
});

test('all four mutation classes derive exactly one matching Core capability', () => {
  for (const mutationClass of [
    'GIT_WRITE',
    'RELEASE_DEPLOY',
    'INFRASTRUCTURE_MUTATION',
    'AUTOMATIC_REMEDIATION',
  ]) {
    const request = createFhKuikaCoreExecutionRequestV1({
      requestId: 'request-' + mutationClass.toLowerCase(),
      surface: 'CONNECTOR',
      mutationClass,
      repository: 'owner/repo',
      exactRevision: REVISION,
      payloadDigest: 'c'.repeat(64),
    });
    assert.equal(request.requiredCapability, mutationClass);
  }
});

test('request validation rejects forged authority ownership capability binding and hashes', () => {
  const request = createFhKuikaCoreExecutionRequestV1({
    requestId: 'kuika-exec-2',
    surface: 'ROUTINE',
    mutationClass: 'RELEASE_DEPLOY',
    repository: 'owner/repo',
    exactRevision: REVISION,
    payloadDigest: 'b'.repeat(64),
  });

  assert.throws(
    () => validateFhKuikaCoreExecutionRequestV1({ ...request, authority: 'ALLOW' }),
    /authority must be NONE/,
  );
  assert.throws(
    () => validateFhKuikaCoreExecutionRequestV1({ ...request, executionOwner: 'WEB' }),
    /owner must be CONTROL_PLANE/,
  );
  assert.throws(
    () => validateFhKuikaCoreExecutionRequestV1({ ...request, requiredCapability: 'GIT_WRITE' }),
    /derived from mutation class/,
  );
  assert.throws(
    () => validateFhKuikaCoreExecutionRequestV1({ ...request, payloadDigest: 'bad' }),
    /payloadDigest/,
  );
});

test('request creation rejects malformed identity revision surface capability and oversized payload', () => {
  assert.throws(
    () =>
      createFhKuikaCoreExecutionRequestV1({
        requestId: 'x',
        surface: 'WORKBENCH',
        mutationClass: 'GIT_WRITE',
        repository: 'owner/repo',
        exactRevision: REVISION,
        payloadDigest: 'b'.repeat(64),
      }),
    /requestId/,
  );
  assert.throws(
    () =>
      createFhKuikaCoreExecutionRequestV1({
        requestId: 'valid-id',
        surface: 'INVALID',
        mutationClass: 'GIT_WRITE',
        repository: 'owner/repo',
        exactRevision: REVISION,
        payloadDigest: 'b'.repeat(64),
      }),
    /surface/,
  );
  assert.throws(
    () =>
      createFhKuikaCoreExecutionRequestV1({
        requestId: 'valid-id',
        surface: 'WORKBENCH',
        mutationClass: 'UNKNOWN',
        repository: 'owner/repo',
        exactRevision: REVISION,
        payloadDigest: 'b'.repeat(64),
      }),
    /unknown authority capability/,
  );
  assert.throws(
    () =>
      createFhKuikaCoreExecutionRequestV1({
        requestId: 'valid-id',
        surface: 'WORKBENCH',
        mutationClass: 'GIT_WRITE',
        repository: 'bad',
        exactRevision: REVISION,
        payloadDigest: 'b'.repeat(64),
      }),
    /owner\/name/,
  );
  assert.throws(
    () =>
      createFhKuikaCoreExecutionRequestV1({
        requestId: 'valid-id',
        surface: 'WORKBENCH',
        mutationClass: 'GIT_WRITE',
        repository: 'owner/repo',
        exactRevision: 'bad',
        payloadDigest: 'b'.repeat(64),
      }),
    /40-character git SHA/,
  );
  assert.throws(
    () =>
      createFhKuikaCoreExecutionRequestV1({
        requestId: 'valid-id',
        surface: 'WORKBENCH',
        mutationClass: 'GIT_WRITE',
        repository: 'owner/repo',
        exactRevision: REVISION,
        payloadDigest: 'bad',
      }),
    /payloadDigest/,
  );
});
