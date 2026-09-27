import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FH_KUIKA_CONNECTOR_HUB_HTML,
  connectorCatalogCanActivate,
  connectorCredentialConfigCanAcceptRawSecrets,
  connectorCredentialConfigCanActivate,
  connectorCredentialConfigCanGrantAuthority,
  connectorCredentialConfigCanPersist,
  connectorCredentialConfigCanResolveSecrets,
  createFhKuikaConnectorCredentialConfigDraftV1,
  connectorHubPageCanActivate,
  connectorHubPageCanGrantAuthority,
  connectorHubPageCanInvokeModel,
  createDashboardServer,
  getFhKuikaConnectorCatalogItemV1,
  listFhKuikaConnectorCatalogV1,
} from '../dist/index.js';

test('Connector Hub catalog is authority-neutral and uses SecretHandle references only', () => {
  const connectors = listFhKuikaConnectorCatalogV1();
  assert.ok(connectors.length >= 5);
  assert.ok(connectors.every((item) => item.authority === 'NONE'));
  assert.ok(connectors.every((item) => item.enabled === false));

  for (const connector of connectors) {
    for (const handle of connector.secretHandleRefs) {
      assert.match(handle, /^secret:/);
    }
  }

  assert.equal(connectorCatalogCanActivate(), false);
  assert.equal(connectorHubPageCanActivate(), false);
  assert.equal(connectorHubPageCanGrantAuthority(), false);
  assert.equal(connectorHubPageCanInvokeModel(), false);
});

test('Connector Hub exposes reviewed pinned and external-untrusted boundaries', () => {
  const kubernetes = getFhKuikaConnectorCatalogItemV1('kubernetes-mcp');
  const generic = getFhKuikaConnectorCatalogItemV1('generic-mcp');

  assert.equal(kubernetes?.trustLevel, 'REVIEWED_PINNED');
  assert.equal(kubernetes?.versionPinRequired, true);
  assert.equal(
    kubernetes?.capabilities.some((item) => item.mutationCapable),
    true,
  );

  assert.equal(generic?.trustLevel, 'EXTERNAL_UNTRUSTED');
  assert.equal(generic?.enabled, false);
  assert.deepEqual(generic?.secretHandleRefs, []);
});

test('Connector Hub UI exposes review only and no activation action', () => {
  assert.match(FH_KUIKA_CONNECTOR_HUB_HTML, /Connector Hub/);
  assert.match(FH_KUIKA_CONNECTOR_HUB_HTML, /Install \/ permission review/);
  assert.match(FH_KUIKA_CONNECTOR_HUB_HTML, /Activation is not available from this surface/);
  assert.doesNotMatch(FH_KUIKA_CONNECTOR_HUB_HTML, /id="activate"/);
  assert.doesNotMatch(FH_KUIKA_CONNECTOR_HUB_HTML, /id="install"/);
});

test('Connector Hub HTTP routes expose catalog/review and remain GET-only', async () => {
  const server = createDashboardServer({ databasePath: '/tmp/fh-kuika-connectors-no-db.sqlite' });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port;

    const page = await fetch(base + '/modules/fh-kuika/integrate/connectors');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Connector Hub/);

    const catalog = await (await fetch(base + '/api/modules/fh-kuika/connectors')).json();
    assert.ok(catalog.connectors.length >= 5);

    const review = await (
      await fetch(base + '/api/modules/fh-kuika/connectors/kubernetes-mcp/review')
    ).json();
    assert.equal(review.review.installAuthority, 'NONE');
    assert.equal(review.review.humanReviewRequired, true);
    assert.ok(review.review.warnings.includes('MUTATION_CAPABLE'));

    const credentials = await (
      await fetch(base + '/api/modules/fh-kuika/connectors/kubernetes-mcp/credential-config')
    ).json();
    assert.equal(credentials.credentialConfig.authority, 'NONE');
    assert.equal(credentials.credentialConfig.rawSecretValuesAccepted, false);
    assert.equal(credentials.credentialConfig.secretResolutionPerformed, false);
    assert.equal(credentials.credentialConfig.persistencePerformed, false);
    assert.equal(credentials.credentialConfig.activationAuthorized, false);

    const missing = await fetch(base + '/api/modules/fh-kuika/connectors/missing/review');
    assert.equal(missing.status, 404);

    const denied = await fetch(base + '/api/modules/fh-kuika/connectors', { method: 'POST' });
    assert.equal(denied.status, 405);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});


test('Connector credential configuration accepts only opaque SecretHandle references', () => {
  const connector = getFhKuikaConnectorCatalogItemV1('kubernetes-mcp');
  assert.ok(connector);

  const draft = createFhKuikaConnectorCredentialConfigDraftV1(connector);
  assert.equal(draft.connectorId, 'kubernetes-mcp');
  assert.equal(Object.isFrozen(draft), true);
  assert.equal(Object.isFrozen(draft.bindings), true);
  assert.ok(draft.bindings.every((item) => item.secretHandleRef.startsWith('secret:')));
  assert.equal(draft.rawSecretValuesAccepted, false);
  assert.equal(draft.secretResolutionPerformed, false);
  assert.equal(draft.persistencePerformed, false);
  assert.equal(draft.activationAuthorized, false);
  assert.equal(draft.authority, 'NONE');

  assert.equal(connectorCredentialConfigCanAcceptRawSecrets(), false);
  assert.equal(connectorCredentialConfigCanResolveSecrets(), false);
  assert.equal(connectorCredentialConfigCanPersist(), false);
  assert.equal(connectorCredentialConfigCanActivate(), false);
  assert.equal(connectorCredentialConfigCanGrantAuthority(), false);

  assert.throws(
    () =>
      createFhKuikaConnectorCredentialConfigDraftV1(connector, [
        {
          requirementRef: 'secret:kubernetes/kubeconfig',
          secretHandleRef: 'plain-text-kubeconfig',
        },
      ]),
    /opaque secret:<reference> handle/,
  );
});
