export type FhKuikaConnectorTrustLevel =
  | 'BUILT_IN'
  | 'REVIEWED_PINNED'
  | 'EXTERNAL_UNTRUSTED';

export interface FhKuikaConnectorPermissionV1 {
  readonly capability: string;
  readonly mutation: boolean;
  readonly filesystem: readonly string[];
  readonly network: readonly string[];
  readonly secretHandles: readonly string[];
}

export interface FhKuikaConnectorManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly category:
    | 'SOURCE_CONTROL'
    | 'ISSUE_TRACKING'
    | 'MESSAGING'
    | 'CI_CD'
    | 'KUBERNETES'
    | 'OBSERVABILITY'
    | 'SECURITY'
    | 'SECRETS'
    | 'GENERIC_MCP';
  readonly protocol: 'BUILT_IN' | 'MCP';
  readonly version: string;
  readonly trustLevel: FhKuikaConnectorTrustLevel;
  readonly source: string;
  readonly requestedPermissions: readonly FhKuikaConnectorPermissionV1[];
  readonly enabledByDefault: boolean;
  readonly authority: 'NONE';
}

export interface FhKuikaConnectorPermissionDiffItemV1 {
  readonly capability: string;
  readonly change: 'ADDED' | 'UNCHANGED';
  readonly mutation: boolean;
  readonly filesystem: readonly string[];
  readonly network: readonly string[];
  readonly secretHandles: readonly string[];
  readonly requiresHumanReview: boolean;
}

export interface FhKuikaConnectorPermissionDiffV1 {
  readonly connectorId: string;
  readonly trustLevel: FhKuikaConnectorTrustLevel;
  readonly items: readonly FhKuikaConnectorPermissionDiffItemV1[];
  readonly authority: 'NONE';
  readonly activationAuthorized: false;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const SECRET_HANDLE = /^[A-Z][A-Z0-9_]{1,127}$/;

export function validateFhKuikaConnectorManifestV1(input: FhKuikaConnectorManifestV1): void {
  if (input.schemaVersion !== 1) throw new Error('connector schemaVersion must be 1');
  if (!ID.test(input.id)) throw new Error('connector id must use lowercase kebab-case');
  if (!input.name.trim()) throw new Error('connector name is required');
  if (!SEMVER.test(input.version)) throw new Error('connector version must be semantic x.y.z');
  if (!input.source.trim()) throw new Error('connector source is required');
  if (input.authority !== 'NONE') throw new Error('connector metadata authority must be NONE');

  if (input.trustLevel === 'EXTERNAL_UNTRUSTED' && input.enabledByDefault) {
    throw new Error('external untrusted connector cannot be enabled by default');
  }
  if (input.trustLevel === 'REVIEWED_PINNED' && input.version === '0.0.0') {
    throw new Error('reviewed pinned connector requires a concrete pinned version');
  }

  const capabilities = new Set<string>();
  for (const permission of input.requestedPermissions) {
    if (!permission.capability.trim()) throw new Error('connector capability is required');
    if (capabilities.has(permission.capability)) {
      throw new Error('connector capabilities must be unique');
    }
    capabilities.add(permission.capability);

    for (const handle of permission.secretHandles) {
      if (!SECRET_HANDLE.test(handle)) {
        throw new Error('connector secret references must use opaque SecretHandle names');
      }
    }

    if (
      input.trustLevel === 'EXTERNAL_UNTRUSTED' &&
      (permission.secretHandles.length > 0 ||
        permission.filesystem.includes('*') ||
        permission.network.includes('*'))
    ) {
      throw new Error('external untrusted connector requests forbidden broad access');
    }
  }
}

export function buildFhKuikaConnectorPermissionDiffV1(
  connector: FhKuikaConnectorManifestV1,
  existingCapabilities: readonly string[] = [],
): FhKuikaConnectorPermissionDiffV1 {
  validateFhKuikaConnectorManifestV1(connector);
  const existing = new Set(existingCapabilities);

  return {
    connectorId: connector.id,
    trustLevel: connector.trustLevel,
    items: connector.requestedPermissions.map((permission) => ({
      capability: permission.capability,
      change: existing.has(permission.capability) ? 'UNCHANGED' : 'ADDED',
      mutation: permission.mutation,
      filesystem: [...permission.filesystem],
      network: [...permission.network],
      secretHandles: [...permission.secretHandles],
      requiresHumanReview:
        !existing.has(permission.capability) &&
        (connector.trustLevel !== 'BUILT_IN' ||
          permission.mutation ||
          permission.secretHandles.length > 0 ||
          permission.filesystem.length > 0 ||
          permission.network.length > 0),
    })),
    authority: 'NONE',
    activationAuthorized: false,
  };
}

export function connectorMetadataCanGrantAuthority(): false {
  return false;
}

export function connectorPermissionDiffCanActivate(): false {
  return false;
}

export function connectorRawSecretsMayBeStored(): false {
  return false;
}
