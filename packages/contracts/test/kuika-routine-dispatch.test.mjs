import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaRoutineDispatchRequestV1,
  fhKuikaRoutineDispatchRequestCanGrantAuthority,
  fhKuikaRoutineTriggerMetadataCanGrantAuthority,
  validateFhKuikaRoutineDispatchRequestV1,
} from '../dist/index.js';

const base = {
  dispatchId: 'dispatch-1',
  routineId: 'security-remediation',
  routineVersion: '1.0.0',
  repository: 'owner/repo',
  exactRevision: 'a'.repeat(40),
  payloadDigest: 'b'.repeat(64),
  attempt: 1,
};

test('routine dispatch request is authority-neutral exact-bound intent', () => {
  const request = createFhKuikaRoutineDispatchRequestV1(base);
  assert.equal(validateFhKuikaRoutineDispatchRequestV1(request), request);
  assert.equal(request.authority, 'NONE');
  assert.equal(request.executionOwner, 'CONTROL_PLANE');
  assert.equal(fhKuikaRoutineDispatchRequestCanGrantAuthority(), false);
  assert.equal(fhKuikaRoutineTriggerMetadataCanGrantAuthority(), false);
});

test('routine dispatch validation fails closed for malformed identity and authority', () => {
  const request = createFhKuikaRoutineDispatchRequestV1(base);
  for (const [value, pattern] of [
    [{ ...request, schemaVersion: 2 }, /schemaVersion/],
    [{ ...request, dispatchId: 'x' }, /dispatchId/],
    [{ ...request, routineId: 'x' }, /routineId/],
    [{ ...request, routineVersion: 'v1' }, /routineVersion/],
    [{ ...request, repository: 'bad' }, /repository/],
    [{ ...request, exactRevision: 'bad' }, /exactRevision/],
    [{ ...request, payloadDigest: 'bad' }, /payloadDigest/],
    [{ ...request, attempt: 0 }, /attempt/],
    [{ ...request, attempt: 12 }, /attempt/],
    [{ ...request, authority: 'ALLOW' }, /authority/],
    [{ ...request, executionOwner: 'WEB' }, /owner/],
  ]) {
    assert.throws(() => validateFhKuikaRoutineDispatchRequestV1(value), pattern);
  }
});
