import {
  validateFhKuikaConnectorManifestV1,
  type FhKuikaConnectorManifestV1,
} from './kuika-connector.js';

const CONNECTORS: readonly FhKuikaConnectorManifestV1[] = Object.freeze([
  {
    schemaVersion: 1,
    id: 'github',
    name: 'GitHub',
    category: 'SOURCE_CONTROL',
    protocol: 'BUILT_IN',
    version: '1.0.0',
    trustLevel: 'BUILT_IN',
    source: 'freehighlander:github',
    requestedPermissions: [
      {
        capability: 'repository.read',
        mutation: false,
        filesystem: [],
        network: ['api.github.com'],
        secretHandles: ['GITHUB_TOKEN'],
      },
      {
        capability: 'pull-request.read',
        mutation: false,
        filesystem: [],
        network: ['api.github.com'],
        secretHandles: ['GITHUB_TOKEN'],
      },
    ],
    enabledByDefault: false,
    authority: 'NONE',
  },
  {
    schemaVersion: 1,
    id: 'kubernetes-mcp',
    name: 'Kubernetes MCP',
    category: 'KUBERNETES',
    protocol: 'MCP',
    version: '1.0.0',
    trustLevel: 'REVIEWED_PINNED',
    source: 'mcp:kubernetes',
    requestedPermissions: [
      {
        capability: 'cluster.read',
        mutation: false,
        filesystem: [],
        network: ['configured-cluster-endpoint'],
        secretHandles: ['KUBECONFIG_HANDLE'],
      },
      {
        capability: 'cluster.write',
        mutation: true,
        filesystem: [],
        network: ['configured-cluster-endpoint'],
        secretHandles: ['KUBECONFIG_HANDLE'],
      },
    ],
    enabledByDefault: false,
    authority: 'NONE',
  },
  {
    schemaVersion: 1,
    id: 'prometheus-mcp',
    name: 'Prometheus MCP',
    category: 'OBSERVABILITY',
    protocol: 'MCP',
    version: '1.0.0',
    trustLevel: 'REVIEWED_PINNED',
    source: 'mcp:prometheus',
    requestedPermissions: [
      {
        capability: 'metrics.query',
        mutation: false,
        filesystem: [],
        network: ['configured-prometheus-endpoint'],
        secretHandles: [],
      },
    ],
    enabledByDefault: false,
    authority: 'NONE',
  },
  {
    schemaVersion: 1,
    id: 'trivy-mcp',
    name: 'Trivy MCP',
    category: 'SECURITY',
    protocol: 'MCP',
    version: '1.0.0',
    trustLevel: 'REVIEWED_PINNED',
    source: 'mcp:trivy',
    requestedPermissions: [
      {
        capability: 'security.scan',
        mutation: false,
        filesystem: ['workspace-readonly'],
        network: [],
        secretHandles: [],
      },
    ],
    enabledByDefault: false,
    authority: 'NONE',
  },
  {
    schemaVersion: 1,
    id: 'vault-mcp',
    name: 'Vault MCP',
    category: 'SECRETS',
    protocol: 'MCP',
    version: '1.0.0',
    trustLevel: 'REVIEWED_PINNED',
    source: 'mcp:vault',
    requestedPermissions: [
      {
        capability: 'secret-handle.resolve',
        mutation: false,
        filesystem: [],
        network: ['configured-vault-endpoint'],
        secretHandles: ['VAULT_AUTH_HANDLE'],
      },
    ],
    enabledByDefault: false,
    authority: 'NONE',
  },
  {
    schemaVersion: 1,
    id: 'generic-mcp',
    name: 'Generic MCP Server',
    category: 'GENERIC_MCP',
    protocol: 'MCP',
    version: '1.0.0',
    trustLevel: 'EXTERNAL_UNTRUSTED',
    source: 'mcp:external',
    requestedPermissions: [],
    enabledByDefault: false,
    authority: 'NONE',
  },
]);

for (const connector of CONNECTORS) validateFhKuikaConnectorManifestV1(connector);

export function listFhKuikaConnectorCatalogV1(): readonly FhKuikaConnectorManifestV1[] {
  return CONNECTORS.map((connector) => ({
    ...connector,
    requestedPermissions: connector.requestedPermissions.map((permission) => ({
      ...permission,
      filesystem: [...permission.filesystem],
      network: [...permission.network],
      secretHandles: [...permission.secretHandles],
    })),
  }));
}

export function getFhKuikaConnectorCatalogItemV1(id: string): FhKuikaConnectorManifestV1 | null {
  return listFhKuikaConnectorCatalogV1().find((connector) => connector.id === id) ?? null;
}
