import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaConnectorInstallReviewV1,
  connectorInstallReviewCanGrantAuthority,
  connectorInstallReviewCanInstallDirectly,
  connectorInstallReviewCanRevealRawSecrets,
  createFhKuikaConnectorRegistryEntryV1,
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

test('install review is authority-neutral and never installs directly', () => {
  const review = buildFhKuikaConnectorInstallReviewV1(connector());

  assert.equal(review.schemaVersion, 1);
  assert.equal(review.installAuthority, 'NONE');
  assert.equal(review.humanReviewRequired, true);
  assert.equal(review.permissionDiff, null);
  assert.equal(connectorInstallReviewCanInstallDirectly(), false);
  assert.equal(connectorInstallReviewCanGrantAuthority(), false);
  assert.equal(connectorInstallReviewCanRevealRawSecrets(), false);
});

test('install review surfaces mutation, network and version-pin warnings', () => {
  const candidate = connector({
    id: 'reviewed-github',
    trustLevel: 'REVIEWED_PINNED',
    enabled: false,
    capabilities: [{ id: 'repository.write', kind: 'TOOL', mutationCapable: true }],
  });

  const review = buildFhKuikaConnectorInstallReviewV1(candidate);

  assert.deepEqual(review.warnings, [
    'MUTATION_CAPABLE',
    'NETWORK_ACCESS_REQUESTED',
    'VERSION_PIN_REQUIRED',
  ]);
});

test('install review carries deterministic permission diff for updates', () => {
  const before = connector();
  const after = connector({
    capabilities: [
      { id: 'repository.read', kind: 'TOOL', mutationCapable: false },
      { id: 'repository.write', kind: 'TOOL', mutationCapable: true },
    ],
    networkDestinations: ['api.github.com', 'uploads.github.com'],
  });

  const review = buildFhKuikaConnectorInstallReviewV1(after, before);

  assert.ok(review.permissionDiff);
  assert.deepEqual(review.permissionDiff.addedCapabilities, ['TOOL:repository.write']);
  assert.deepEqual(review.permissionDiff.addedNetworkDestinations, ['uploads.github.com']);
  assert.equal(review.permissionDiff.humanReviewRequired, true);
  assert.ok(review.warnings.includes('PERMISSION_CHANGE'));
});

test('install review fails closed when comparing different connector identities', () => {
  assert.throws(
    () =>
      buildFhKuikaConnectorInstallReviewV1(
        connector({ id: 'candidate' }),
        connector({ id: 'previous' }),
      ),
    /same connector id/,
  );
});
