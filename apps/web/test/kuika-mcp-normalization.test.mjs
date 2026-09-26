import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaMcpRegistryViewV1,
  mcpDiscoveryCanEnableConnector,
  mcpDiscoveryMetadataCanGrantAuthority,
  mcpSelfReportedReadOnlyHintsAreTrusted,
  normalizeFhKuikaMcpDiscoveryV1,
} from '../dist/index.js';

function discovery(overrides = {}) {
  return {
    schemaVersion: 1,
    serverId: 'github-mcp',
    serverName: 'GitHub MCP',
    serverVersion: '2.0.0',
    source: 'mcp://github.example',
    protocolVersion: '2026-07-28',
    tools: [
      {
        name: 'repository/read',
        title: 'Read repository',
        readOnlyHint: true,
        destructiveHint: false,
      },
    ],
    resources: [{ uri: 'repo://current', name: 'Current repository' }],
    promptCount: 2,
    ...overrides,
  };
}

test('MCP discovery normalizes into disabled untrusted connector metadata', () => {
  const normalized = normalizeFhKuikaMcpDiscoveryV1(discovery());

  assert.equal(normalized.protocol, 'MCP_2026_07_28');
  assert.equal(normalized.connector.trustLevel, 'EXTERNAL_UNTRUSTED');
  assert.equal(normalized.connector.enabled, false);
  assert.equal(normalized.connector.authority, 'NONE');
  assert.equal(normalized.metadataAuthority, 'NONE');
  assert.equal(normalized.requiresHumanReview, true);
  assert.equal(normalized.selfReportedReadOnlyHintsTrusted, false);
});

test('MCP tool metadata is fail-closed for mutation capability', () => {
  const normalized = normalizeFhKuikaMcpDiscoveryV1(discovery());
  const tool = normalized.connector.capabilities.find((item) => item.kind === 'TOOL');
  const resource = normalized.connector.capabilities.find((item) => item.kind === 'RESOURCE');

  assert.equal(tool?.id, 'mcp-tool-repository-read');
  assert.equal(tool?.mutationCapable, true);
  assert.equal(resource?.id, 'mcp-resource-repo-current');
  assert.equal(resource?.mutationCapable, false);
  assert.equal(mcpSelfReportedReadOnlyHintsAreTrusted(), false);
});

test('MCP discovery grants no authority and cannot enable a connector', () => {
  assert.equal(mcpDiscoveryMetadataCanGrantAuthority(), false);
  assert.equal(mcpDiscoveryCanEnableConnector(), false);
});

test('MCP registry view is deterministic across discovered servers', () => {
  const view = buildFhKuikaMcpRegistryViewV1([
    discovery({ serverId: 'z-server', serverName: 'Z server' }),
    discovery({ serverId: 'a-server', serverName: 'A server' }),
  ]);

  assert.deepEqual(
    view.connectors.map((item) => item.id),
    ['a-server', 'z-server'],
  );
  assert.equal(view.permissionRevalidationRequiredAtInvocation, true);
});

test('MCP discovery fails closed on collisions and malformed metadata', () => {
  assert.throws(
    () =>
      normalizeFhKuikaMcpDiscoveryV1(
        discovery({
          tools: [
            { name: 'repo/read', readOnlyHint: true },
            { name: 'repo read', readOnlyHint: true },
          ],
        }),
      ),
    /remain unique after normalization/,
  );

  assert.throws(
    () => normalizeFhKuikaMcpDiscoveryV1(discovery({ promptCount: -1 })),
    /non-negative integer/,
  );

  assert.throws(
    () => normalizeFhKuikaMcpDiscoveryV1(discovery({ serverId: 'Invalid Server' })),
    /bounded lowercase identifier/,
  );
});
