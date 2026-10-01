import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaConnectorInvocationRequestV1,
  fhKuikaConnectorInvocationCanCarryRawSecrets,
  fhKuikaConnectorInvocationCanGrantAuthority,
  validateFhKuikaConnectorInvocationRequestV1,
} from '../dist/index.js';

const base = {
  invocationId: 'invoke-1',
  connectorId: 'kubernetes-mcp',
  capabilityId: 'cluster.write',
  repository: 'owner/repo',
  exactRevision: 'a'.repeat(40),
  role: 'operations-agent',
  filesystemScopes: ['workspace-readonly'],
  networkDestinations: ['cluster.internal'],
  secretHandleRefs: ['secret:kubernetes/kubeconfig'],
  payloadDigest: 'b'.repeat(64),
};

test('connector invocation intent is exact-bound authority-neutral and secret-handle only', () => {
  const request = createFhKuikaConnectorInvocationRequestV1(base);
  assert.equal(request.authority, 'NONE');
  assert.equal(request.executionOwner, 'CONTROL_PLANE');
  assert.equal(validateFhKuikaConnectorInvocationRequestV1(request), request);
  assert.equal(fhKuikaConnectorInvocationCanGrantAuthority(), false);
  assert.equal(fhKuikaConnectorInvocationCanCarryRawSecrets(), false);
});

test('connector invocation rejects forged authority ownership and malformed identity', () => {
  const request = createFhKuikaConnectorInvocationRequestV1(base);
  for (const [value, pattern] of [
    [{ ...request, schemaVersion: 2 }, /schemaVersion/],
    [{ ...request, invocationId: 'x' }, /invocationId/],
    [{ ...request, connectorId: 'x' }, /connectorId/],
    [{ ...request, capabilityId: 'x' }, /capabilityId/],
    [{ ...request, repository: 'bad' }, /repository/],
    [{ ...request, exactRevision: 'bad' }, /exactRevision/],
    [{ ...request, role: 'x' }, /role/],
    [{ ...request, authority: 'ALLOW' }, /authority/],
    [{ ...request, executionOwner: 'WEB' }, /owner/],
  ]) {
    assert.throws(() => validateFhKuikaConnectorInvocationRequestV1(value), pattern);
  }
});

test('connector invocation rejects malformed scope secret and digest fields', () => {
  const request = createFhKuikaConnectorInvocationRequestV1(base);
  assert.throws(
    () =>
      validateFhKuikaConnectorInvocationRequestV1({
        ...request,
        filesystemScopes: ['bad\nvalue'],
      }),
    /filesystemScopes/,
  );
  assert.throws(
    () =>
      validateFhKuikaConnectorInvocationRequestV1({
        ...request,
        networkDestinations: [''],
      }),
    /networkDestinations/,
  );
  assert.throws(
    () =>
      validateFhKuikaConnectorInvocationRequestV1({
        ...request,
        secretHandleRefs: ['raw-secret-value'],
      }),
    /secretHandleRefs/,
  );
  assert.throws(
    () => validateFhKuikaConnectorInvocationRequestV1({ ...request, payloadDigest: 'bad' }),
    /payloadDigest/,
  );
});
