import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaConnectorRegistryViewV1,
  connectorCatalogCacheCanBypassPermissionRevalidation,
  connectorExternalMetadataCanGrantAuthority,
  connectorRegistryCanGrantAuthority,
  createFhKuikaConnectorRegistryEntryV1,
  diffFhKuikaConnectorPermissionsV1,
} from '../dist/index.js';

function connector(overrides = {}) {
  return createFhKuikaConnectorRegistryEntryV1({
    id: 'github',
    name: 'GitHub',
    source: 'builtin:github',
    protocol: 'NATIVE',
    version: '1.0.0',
    trustLevel: 'BUILT_IN',
    enabled: true,
    capabilities: [{ id: 'repository.read', kind: 'TOOL', mutationCapable: false }],
    filesystemScopes: [],
    networkDestinations: ['api.github.com'],
    secretHandleRefs: [],
    roleAllowlist: ['development-agent'],
    dataClassifications: ['INTERNAL'],
    ...overrides,
  });
}

test('connector registry is deterministic, authority-neutral and permission-revalidated', () => {
  const github = connector();
  const view = buildFhKuikaConnectorRegistryViewV1([github]);

  assert.equal(view.schemaVersion, 1);
  assert.equal(view.preferredExternalProtocol, 'MCP_2026_07_28');
  assert.equal(view.authority, 'NONE');
  assert.equal(view.externalMetadataGrantsAuthority, false);
  assert.equal(view.permissionRevalidationRequiredAtInvocation, true);
  assert.equal(connectorRegistryCanGrantAuthority(), false);
  assert.equal(connectorExternalMetadataCanGrantAuthority(), false);
  assert.equal(connectorCatalogCacheCanBypassPermissionRevalidation(), false);
});

test('trust policy fails closed for reviewed and untrusted connectors', () => {
  assert.throws(
    () =>
      connector({
        id: 'reviewed',
        trustLevel: 'REVIEWED_PINNED',
        version: null,
        enabled: false,
      }),
    /requires a version pin/,
  );

  assert.throws(
    () =>
      connector({
        id: 'external',
        trustLevel: 'EXTERNAL_UNTRUSTED',
        protocol: 'MCP_2026_07_28',
        enabled: true,
      }),
    /must default disabled/,
  );

  assert.throws(
    () =>
      connector({
        id: 'external',
        trustLevel: 'EXTERNAL_UNTRUSTED',
        protocol: 'MCP_2026_07_28',
        enabled: false,
        secretHandleRefs: ['secret:GITHUB_TOKEN'],
      }),
    /cannot request secrets/,
  );
});

test('secret references are handles only and raw-looking values are rejected', () => {
  const safe = connector({
    id: 'reviewed',
    trustLevel: 'REVIEWED_PINNED',
    enabled: false,
    secretHandleRefs: ['secret:github/token'],
  });
  assert.deepEqual(safe.secretHandleRefs, ['secret:github/token']);

  assert.throws(
    () =>
      connector({
        secretHandleRefs: ['ghp_raw_token_value'],
      }),
    /secret:<reference>/,
  );
});

test('permission diff exposes capability and boundary changes for human review', () => {
  const before = connector();
  const after = connector({
    capabilities: [
      { id: 'repository.read', kind: 'TOOL', mutationCapable: false },
      { id: 'repository.write', kind: 'TOOL', mutationCapable: true },
    ],
    networkDestinations: ['api.github.com', 'uploads.github.com'],
  });

  const diff = diffFhKuikaConnectorPermissionsV1(before, after);
  assert.deepEqual(diff.addedCapabilities, ['TOOL:repository.write']);
  assert.deepEqual(diff.addedNetworkDestinations, ['uploads.github.com']);
  assert.equal(diff.mutationCapabilityChanged, true);
  assert.equal(diff.humanReviewRequired, true);
  assert.equal(diff.authority, 'NONE');
});

test('connector registry rejects duplicate connector ids', () => {
  assert.throws(
    () => buildFhKuikaConnectorRegistryViewV1([connector(), connector()]),
    /connector ids must be unique/,
  );
});


test('untrusted connectors cannot request unrestricted filesystem or network access', () => {
  assert.throws(
    () =>
      connector({
        id: 'external-filesystem',
        trustLevel: 'EXTERNAL_UNTRUSTED',
        protocol: 'MCP_2026_07_28',
        enabled: false,
        filesystemScopes: ['*'],
        networkDestinations: [],
      }),
    /cannot request secrets or unrestricted filesystem\/network/,
  );

  assert.throws(
    () =>
      connector({
        id: 'external-network',
        trustLevel: 'EXTERNAL_UNTRUSTED',
        protocol: 'MCP_2026_07_28',
        enabled: false,
        filesystemScopes: [],
        networkDestinations: ['*'],
      }),
    /cannot request secrets or unrestricted filesystem\/network/,
  );
});

test('reviewed connectors require human install and version pinning', () => {
  const reviewed = connector({
    id: 'reviewed',
    trustLevel: 'REVIEWED_PINNED',
    enabled: false,
  });

  assert.equal(reviewed.humanInstallRequired, true);
  assert.equal(reviewed.versionPinRequired, true);
});
