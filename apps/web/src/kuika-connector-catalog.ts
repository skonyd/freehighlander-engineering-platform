import {
  createFhKuikaConnectorRegistryEntryV1,
  type FhKuikaConnectorRegistryEntryV1,
} from './kuika-connector-registry.js';

const CATALOG = Object.freeze([
  createFhKuikaConnectorRegistryEntryV1({
    id: 'github',
    name: 'GitHub',
    source: 'builtin:github',
    protocol: 'NATIVE',
    version: '1.0.0',
    trustLevel: 'BUILT_IN',
    enabled: false,
    capabilities: [
      { id: 'repository.read', kind: 'TOOL', mutationCapable: false },
      { id: 'pull-request.read', kind: 'TOOL', mutationCapable: false },
    ],
    filesystemScopes: [],
    networkDestinations: ['api.github.com'],
    secretHandleRefs: ['secret:github/token'],
    roleAllowlist: [],
    dataClassifications: ['INTERNAL'],
  }),
  createFhKuikaConnectorRegistryEntryV1({
    id: 'kubernetes-mcp',
    name: 'Kubernetes MCP',
    source: 'mcp:kubernetes',
    protocol: 'MCP_2026_07_28',
    version: '1.0.0',
    trustLevel: 'REVIEWED_PINNED',
    enabled: false,
    capabilities: [
      { id: 'cluster.read', kind: 'TOOL', mutationCapable: false },
      { id: 'cluster.write', kind: 'TOOL', mutationCapable: true },
    ],
    filesystemScopes: [],
    networkDestinations: ['configured-cluster-endpoint'],
    secretHandleRefs: ['secret:kubernetes/kubeconfig'],
    roleAllowlist: [],
    dataClassifications: ['INTERNAL'],
  }),
  createFhKuikaConnectorRegistryEntryV1({
    id: 'prometheus-mcp',
    name: 'Prometheus MCP',
    source: 'mcp:prometheus',
    protocol: 'MCP_2026_07_28',
    version: '1.0.0',
    trustLevel: 'REVIEWED_PINNED',
    enabled: false,
    capabilities: [{ id: 'metrics.query', kind: 'TOOL', mutationCapable: false }],
    filesystemScopes: [],
    networkDestinations: ['configured-prometheus-endpoint'],
    secretHandleRefs: [],
    roleAllowlist: [],
    dataClassifications: ['INTERNAL'],
  }),
  createFhKuikaConnectorRegistryEntryV1({
    id: 'trivy-mcp',
    name: 'Trivy MCP',
    source: 'mcp:trivy',
    protocol: 'MCP_2026_07_28',
    version: '1.0.0',
    trustLevel: 'REVIEWED_PINNED',
    enabled: false,
    capabilities: [{ id: 'security.scan', kind: 'TOOL', mutationCapable: false }],
    filesystemScopes: ['workspace-readonly'],
    networkDestinations: [],
    secretHandleRefs: [],
    roleAllowlist: [],
    dataClassifications: ['INTERNAL'],
  }),
  createFhKuikaConnectorRegistryEntryV1({
    id: 'vault-mcp',
    name: 'Vault MCP',
    source: 'mcp:vault',
    protocol: 'MCP_2026_07_28',
    version: '1.0.0',
    trustLevel: 'REVIEWED_PINNED',
    enabled: false,
    capabilities: [{ id: 'secret-handle.resolve', kind: 'TOOL', mutationCapable: false }],
    filesystemScopes: [],
    networkDestinations: ['configured-vault-endpoint'],
    secretHandleRefs: ['secret:vault/auth'],
    roleAllowlist: [],
    dataClassifications: ['SECRET'],
  }),
  createFhKuikaConnectorRegistryEntryV1({
    id: 'generic-mcp',
    name: 'Generic MCP Server',
    source: 'mcp:external',
    protocol: 'MCP_2026_07_28',
    version: null,
    trustLevel: 'EXTERNAL_UNTRUSTED',
    enabled: false,
    capabilities: [],
    filesystemScopes: [],
    networkDestinations: [],
    secretHandleRefs: [],
    roleAllowlist: [],
    dataClassifications: ['INTERNAL'],
  }),
]);

export function listFhKuikaConnectorCatalogV1(): readonly FhKuikaConnectorRegistryEntryV1[] {
  return CATALOG.map((connector) =>
    createFhKuikaConnectorRegistryEntryV1({
      id: connector.id,
      name: connector.name,
      source: connector.source,
      protocol: connector.protocol,
      version: connector.version,
      trustLevel: connector.trustLevel,
      enabled: connector.enabled,
      capabilities: connector.capabilities,
      filesystemScopes: connector.filesystemScopes,
      networkDestinations: connector.networkDestinations,
      secretHandleRefs: connector.secretHandleRefs,
      roleAllowlist: connector.roleAllowlist,
      dataClassifications: connector.dataClassifications,
    }),
  );
}

export function getFhKuikaConnectorCatalogItemV1(
  id: string,
): FhKuikaConnectorRegistryEntryV1 | null {
  return listFhKuikaConnectorCatalogV1().find((connector) => connector.id === id) ?? null;
}

export function connectorCatalogCanActivate(): false {
  return false;
}
