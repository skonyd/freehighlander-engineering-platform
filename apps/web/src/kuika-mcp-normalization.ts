import {
  buildFhKuikaConnectorRegistryViewV1,
  createFhKuikaConnectorRegistryEntryV1,
  type FhKuikaConnectorCapabilityV1,
  type FhKuikaConnectorRegistryEntryV1,
} from './kuika-connector-registry.js';

export interface FhKuikaMcpToolDiscoveryV1 {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
}

export interface FhKuikaMcpResourceDiscoveryV1 {
  readonly uri: string;
  readonly name?: string;
  readonly mimeType?: string;
}

export interface FhKuikaMcpServerDiscoveryV1 {
  readonly schemaVersion: 1;
  readonly serverId: string;
  readonly serverName: string;
  readonly serverVersion: string | null;
  readonly source: string;
  readonly protocolVersion: '2026-07-28';
  readonly tools: readonly FhKuikaMcpToolDiscoveryV1[];
  readonly resources: readonly FhKuikaMcpResourceDiscoveryV1[];
  readonly promptCount: number;
}

export interface FhKuikaMcpNormalizedDiscoveryV1 {
  readonly schemaVersion: 1;
  readonly serverId: string;
  readonly displayName: string;
  readonly source: string;
  readonly protocol: 'MCP_2026_07_28';
  readonly protocolVersion: '2026-07-28';
  readonly toolCount: number;
  readonly resourceCount: number;
  readonly promptCount: number;
  readonly connector: FhKuikaConnectorRegistryEntryV1;
  readonly metadataAuthority: 'NONE';
  readonly requiresHumanReview: true;
  readonly selfReportedReadOnlyHintsTrusted: false;
}

export function normalizeFhKuikaMcpDiscoveryV1(
  discovery: FhKuikaMcpServerDiscoveryV1,
): FhKuikaMcpNormalizedDiscoveryV1 {
  if (discovery.schemaVersion !== 1) {
    throw new Error('MCP discovery schemaVersion must be 1');
  }

  const serverId = requireIdentifier(discovery.serverId, 'MCP server id');
  const serverName = requireSingleLine(discovery.serverName, 'MCP server name');
  const source = requireSingleLine(discovery.source, 'MCP source');
  const serverVersion = normalizeOptionalSingleLine(discovery.serverVersion, 'MCP server version');
  requireNonNegativeInteger(discovery.promptCount, 'MCP prompt count');

  const capabilities = normalizeCapabilities(discovery.tools, discovery.resources);

  const connector = createFhKuikaConnectorRegistryEntryV1({
    id: serverId,
    name: serverName,
    source,
    protocol: 'MCP_2026_07_28',
    version: serverVersion,
    trustLevel: 'EXTERNAL_UNTRUSTED',
    enabled: false,
    capabilities,
    filesystemScopes: [],
    networkDestinations: [],
    secretHandleRefs: [],
    roleAllowlist: [],
    dataClassifications: ['INTERNAL'],
  });

  return {
    schemaVersion: 1,
    serverId,
    displayName: serverName,
    source,
    protocol: 'MCP_2026_07_28',
    protocolVersion: discovery.protocolVersion,
    toolCount: discovery.tools.length,
    resourceCount: discovery.resources.length,
    promptCount: discovery.promptCount,
    connector,
    metadataAuthority: 'NONE',
    requiresHumanReview: true,
    selfReportedReadOnlyHintsTrusted: false,
  };
}

export function buildFhKuikaMcpRegistryViewV1(discoveries: readonly FhKuikaMcpServerDiscoveryV1[]) {
  return buildFhKuikaConnectorRegistryViewV1(
    discoveries.map((discovery) => normalizeFhKuikaMcpDiscoveryV1(discovery).connector),
  );
}

export function mcpDiscoveryMetadataCanGrantAuthority(): false {
  return false;
}

export function mcpDiscoveryCanEnableConnector(): false {
  return false;
}

export function mcpSelfReportedReadOnlyHintsAreTrusted(): false {
  return false;
}

function normalizeCapabilities(
  tools: readonly FhKuikaMcpToolDiscoveryV1[],
  resources: readonly FhKuikaMcpResourceDiscoveryV1[],
): readonly FhKuikaConnectorCapabilityV1[] {
  const seen = new Set<string>();
  const capabilities: FhKuikaConnectorCapabilityV1[] = [];

  for (const tool of tools) {
    const name = requireSingleLine(tool.name, 'MCP tool name');
    normalizeOptionalSingleLine(tool.title ?? null, 'MCP tool title');
    normalizeOptionalSingleLine(tool.description ?? null, 'MCP tool description');

    const id = 'mcp-tool-' + normalizeCapabilityId(name);
    const key = 'TOOL:' + id;
    if (seen.has(key)) {
      throw new Error('MCP discovery capabilities must remain unique after normalization');
    }
    seen.add(key);

    capabilities.push({
      id,
      kind: 'TOOL',
      mutationCapable: true,
    });
  }

  for (const resource of resources) {
    const uri = requireSingleLine(resource.uri, 'MCP resource uri');
    normalizeOptionalSingleLine(resource.name ?? null, 'MCP resource name');
    normalizeOptionalSingleLine(resource.mimeType ?? null, 'MCP resource mime type');

    const id = 'mcp-resource-' + normalizeCapabilityId(uri);
    const key = 'RESOURCE:' + id;
    if (seen.has(key)) {
      throw new Error('MCP discovery capabilities must remain unique after normalization');
    }
    seen.add(key);

    capabilities.push({
      id,
      kind: 'RESOURCE',
      mutationCapable: false,
    });
  }

  return capabilities;
}

function normalizeCapabilityId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '');

  if (!normalized) {
    throw new Error('MCP capability identity cannot normalize to an empty identifier');
  }
  if (normalized.length > 120) {
    throw new Error('MCP capability identity is too long after normalization');
  }
  return normalized;
}

function normalizeOptionalSingleLine(value: string | null, field: string): string | null {
  if (value === null) return null;
  return requireSingleLine(value, field);
}

function requireIdentifier(value: string, field: string): string {
  const normalized = requireSingleLine(value, field);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new Error(field + ' must use a bounded lowercase identifier');
  }
  return normalized;
}

function requireSingleLine(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  if (/[\r\n\t]/.test(normalized) || normalized.length > 500) {
    throw new Error(field + ' must be a bounded single-line value');
  }
  return normalized;
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(field + ' must be a non-negative integer');
  }
}
