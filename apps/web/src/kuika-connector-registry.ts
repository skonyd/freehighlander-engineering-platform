export type FhKuikaConnectorTrustLevel =
  | 'BUILT_IN'
  | 'REVIEWED_PINNED'
  | 'EXTERNAL_UNTRUSTED';

export type FhKuikaConnectorProtocol =
  | 'NATIVE'
  | 'MCP_2026_07_28'
  | 'OPENAPI_HTTP';

export type FhKuikaConnectorDataClassification =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'CONFIDENTIAL'
  | 'SECRET';

export interface FhKuikaConnectorCapabilityV1 {
  readonly id: string;
  readonly kind: 'TOOL' | 'RESOURCE';
  readonly mutationCapable: boolean;
}

export interface FhKuikaConnectorRegistryEntryV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly protocol: FhKuikaConnectorProtocol;
  readonly version: string | null;
  readonly trustLevel: FhKuikaConnectorTrustLevel;
  readonly enabled: boolean;
  readonly capabilities: readonly FhKuikaConnectorCapabilityV1[];
  readonly filesystemScopes: readonly string[];
  readonly networkDestinations: readonly string[];
  readonly secretHandleRefs: readonly string[];
  readonly roleAllowlist: readonly string[];
  readonly dataClassifications: readonly FhKuikaConnectorDataClassification[];
  readonly humanInstallRequired: boolean;
  readonly versionPinRequired: boolean;
  readonly authority: 'NONE';
}

export interface FhKuikaConnectorRegistryViewV1 {
  readonly schemaVersion: 1;
  readonly preferredExternalProtocol: 'MCP_2026_07_28';
  readonly connectors: readonly FhKuikaConnectorRegistryEntryV1[];
  readonly externalMetadataGrantsAuthority: false;
  readonly permissionRevalidationRequiredAtInvocation: true;
  readonly authority: 'NONE';
}

export interface FhKuikaConnectorPermissionDiffV1 {
  readonly connectorId: string;
  readonly addedCapabilities: readonly string[];
  readonly removedCapabilities: readonly string[];
  readonly addedFilesystemScopes: readonly string[];
  readonly removedFilesystemScopes: readonly string[];
  readonly addedNetworkDestinations: readonly string[];
  readonly removedNetworkDestinations: readonly string[];
  readonly addedSecretHandleRefs: readonly string[];
  readonly removedSecretHandleRefs: readonly string[];
  readonly mutationCapabilityChanged: boolean;
  readonly humanReviewRequired: boolean;
  readonly authority: 'NONE';
}

export function createFhKuikaConnectorRegistryEntryV1(
  input: Omit<
    FhKuikaConnectorRegistryEntryV1,
    'schemaVersion' | 'humanInstallRequired' | 'versionPinRequired' | 'authority'
  >,
): FhKuikaConnectorRegistryEntryV1 {
  const id = requireIdentifier(input.id, 'connector id');
  const name = requireText(input.name, 'connector name');
  const source = requireText(input.source, 'connector source');

  if (input.trustLevel === 'REVIEWED_PINNED' && !input.version?.trim()) {
    throw new Error('REVIEWED_PINNED connector requires a version pin');
  }
  if (input.trustLevel === 'EXTERNAL_UNTRUSTED' && input.enabled) {
    throw new Error('EXTERNAL_UNTRUSTED connector must default disabled');
  }

  const capabilities = normalizeCapabilities(input.capabilities);
  const filesystemScopes = normalizeSingleLineList(input.filesystemScopes, 'filesystem scope');
  const networkDestinations = normalizeSingleLineList(
    input.networkDestinations,
    'network destination',
  );
  const secretHandleRefs = normalizeSecretHandleRefs(input.secretHandleRefs);
  const roleAllowlist = normalizeSingleLineList(input.roleAllowlist, 'role allowlist');
  const dataClassifications = [...new Set(input.dataClassifications)].sort();

  if (
    input.trustLevel === 'EXTERNAL_UNTRUSTED' &&
    (secretHandleRefs.length > 0 ||
      filesystemScopes.includes('*') ||
      networkDestinations.includes('*'))
  ) {
    throw new Error(
      'EXTERNAL_UNTRUSTED connector cannot request secrets or unrestricted filesystem/network',
    );
  }

  return {
    schemaVersion: 1,
    id,
    name,
    source,
    protocol: input.protocol,
    version: normalizeOptionalText(input.version),
    trustLevel: input.trustLevel,
    enabled: input.enabled,
    capabilities,
    filesystemScopes,
    networkDestinations,
    secretHandleRefs,
    roleAllowlist,
    dataClassifications,
    humanInstallRequired: input.trustLevel !== 'BUILT_IN',
    versionPinRequired: input.trustLevel === 'REVIEWED_PINNED',
    authority: 'NONE',
  };
}

export function buildFhKuikaConnectorRegistryViewV1(
  connectors: readonly FhKuikaConnectorRegistryEntryV1[],
): FhKuikaConnectorRegistryViewV1 {
  const ids = new Set<string>();
  const normalized = connectors.map((connector) => {
    if (ids.has(connector.id)) throw new Error('connector ids must be unique');
    ids.add(connector.id);
    return createFhKuikaConnectorRegistryEntryV1({
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
    });
  });

  return {
    schemaVersion: 1,
    preferredExternalProtocol: 'MCP_2026_07_28',
    connectors: normalized.sort((left, right) => left.id.localeCompare(right.id)),
    externalMetadataGrantsAuthority: false,
    permissionRevalidationRequiredAtInvocation: true,
    authority: 'NONE',
  };
}

export function diffFhKuikaConnectorPermissionsV1(
  before: FhKuikaConnectorRegistryEntryV1,
  after: FhKuikaConnectorRegistryEntryV1,
): FhKuikaConnectorPermissionDiffV1 {
  if (before.id !== after.id) {
    throw new Error('permission diff requires the same connector id');
  }

  const beforeMutation = before.capabilities.some((item) => item.mutationCapable);
  const afterMutation = after.capabilities.some((item) => item.mutationCapable);
  const capabilityDiff = listDiff(
    before.capabilities.map((item) => capabilityKey(item)),
    after.capabilities.map((item) => capabilityKey(item)),
  );
  const filesystemDiff = listDiff(before.filesystemScopes, after.filesystemScopes);
  const networkDiff = listDiff(before.networkDestinations, after.networkDestinations);
  const secretDiff = listDiff(before.secretHandleRefs, after.secretHandleRefs);
  const mutationCapabilityChanged = beforeMutation !== afterMutation;

  const permissionChanged =
    capabilityDiff.added.length > 0 ||
    capabilityDiff.removed.length > 0 ||
    filesystemDiff.added.length > 0 ||
    filesystemDiff.removed.length > 0 ||
    networkDiff.added.length > 0 ||
    networkDiff.removed.length > 0 ||
    secretDiff.added.length > 0 ||
    secretDiff.removed.length > 0;

  return {
    connectorId: before.id,
    addedCapabilities: capabilityDiff.added,
    removedCapabilities: capabilityDiff.removed,
    addedFilesystemScopes: filesystemDiff.added,
    removedFilesystemScopes: filesystemDiff.removed,
    addedNetworkDestinations: networkDiff.added,
    removedNetworkDestinations: networkDiff.removed,
    addedSecretHandleRefs: secretDiff.added,
    removedSecretHandleRefs: secretDiff.removed,
    mutationCapabilityChanged,
    humanReviewRequired:
      permissionChanged || mutationCapabilityChanged || after.trustLevel !== 'BUILT_IN',
    authority: 'NONE',
  };
}

export function connectorRegistryCanGrantAuthority(): false {
  return false;
}

export function connectorExternalMetadataCanGrantAuthority(): false {
  return false;
}

export function connectorCatalogCacheCanBypassPermissionRevalidation(): false {
  return false;
}

function normalizeCapabilities(
  values: readonly FhKuikaConnectorCapabilityV1[],
): readonly FhKuikaConnectorCapabilityV1[] {
  const seen = new Set<string>();
  return values
    .map((item) => {
      const normalized = {
        id: requireIdentifier(item.id, 'capability id'),
        kind: item.kind,
        mutationCapable: item.mutationCapable,
      };
      const key = capabilityKey(normalized);
      if (seen.has(key)) throw new Error('connector capabilities must be unique');
      seen.add(key);
      return normalized;
    })
    .sort((left, right) => capabilityKey(left).localeCompare(capabilityKey(right)));
}

function capabilityKey(value: FhKuikaConnectorCapabilityV1): string {
  return value.kind + ':' + value.id;
}

function listDiff(
  before: readonly string[],
  after: readonly string[],
): { readonly added: readonly string[]; readonly removed: readonly string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((item) => !beforeSet.has(item)).sort(),
    removed: before.filter((item) => !afterSet.has(item)).sort(),
  };
}

function normalizeSecretHandleRefs(values: readonly string[]): readonly string[] {
  return normalizeSingleLineList(values, 'secret handle').map((value) => {
    if (!/^secret:[a-zA-Z0-9._/-]+$/.test(value)) {
      throw new Error('secret handles must use secret:<reference> and never contain raw values');
    }
    return value;
  });
}

function normalizeSingleLineList(values: readonly string[], field: string): readonly string[] {
  return [...new Set(values.map((value) => requireSingleLine(value, field)))].sort();
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function requireIdentifier(value: string, field: string): string {
  const normalized = requireSingleLine(value, field);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new Error(field + ' must use a bounded lowercase identifier');
  }
  return normalized;
}

function requireSingleLine(value: string, field: string): string {
  const normalized = requireText(value, field);
  if (/[\r\n\t]/.test(normalized) || normalized.length > 500) {
    throw new Error(field + ' must be a bounded single-line value');
  }
  return normalized;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  return normalized;
}
