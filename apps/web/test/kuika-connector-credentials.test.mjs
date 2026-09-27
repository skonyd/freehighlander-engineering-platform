import assert from 'node:assert/strict';
import test from 'node:test';

import {
  connectorCredentialConfigCanAcceptRawSecret,
  connectorCredentialConfigCanActivate,
  connectorCredentialConfigCanGrantAuthority,
  createFhKuikaConnectorCredentialConfigV1,
} from '../dist/index.js';

test('connector credentials accept SecretHandle references only', () => {
  const config = createFhKuikaConnectorCredentialConfigV1({
    connectorId: 'github',
    bindings: [
      { slot: 'token', secretHandleRef: 'secret:github/token' },
      { slot: 'webhook', secretHandleRef: 'secret:github/webhook' },
    ],
  });

  assert.equal(config.authority, 'NONE');
  assert.equal(config.rawSecretsAccepted, false);
  assert.equal(config.persistenceContainsSecretValues, false);
  assert.equal(config.activationAuthorized, false);
  assert.equal(config.bindings.length, 2);
  assert.equal(connectorCredentialConfigCanAcceptRawSecret(), false);
  assert.equal(connectorCredentialConfigCanActivate(), false);
  assert.equal(connectorCredentialConfigCanGrantAuthority(), false);
});

test('connector credentials reject raw values and duplicate slots', () => {
  assert.throws(
    () =>
      createFhKuikaConnectorCredentialConfigV1({
        connectorId: 'github',
        bindings: [{ slot: 'token', secretHandleRef: 'ghp_raw-secret-value' }],
      }),
    /secret:<reference>/,
  );

  assert.throws(
    () =>
      createFhKuikaConnectorCredentialConfigV1({
        connectorId: 'github',
        bindings: [
          { slot: 'token', secretHandleRef: 'secret:one' },
          { slot: 'token', secretHandleRef: 'secret:two' },
        ],
      }),
    /credential slots must be unique/,
  );
});
