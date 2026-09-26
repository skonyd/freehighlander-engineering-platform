import {
  diffFhKuikaConnectorPermissionsV1,
  type FhKuikaConnectorPermissionDiffV1,
  type FhKuikaConnectorRegistryEntryV1,
} from './kuika-connector-registry.js';

export type FhKuikaConnectorInstallWarning =
  | 'EXTERNAL_UNTRUSTED'
  | 'MUTATION_CAPABLE'
  | 'FILESYSTEM_ACCESS_REQUESTED'
  | 'NETWORK_ACCESS_REQUESTED'
  | 'SECRET_HANDLE_REQUESTED'
  | 'VERSION_PIN_REQUIRED'
  | 'PERMISSION_CHANGE';

export interface FhKuikaConnectorInstallReviewV1 {
  readonly schemaVersion: 1;
  readonly connectorId: string;
  readonly name: string;
  readonly source: string;
  readonly protocol: string;
  readonly version: string | null;
  readonly trustLevel: string;
  readonly requestedCapabilityCount: number;
  readonly mutationCapable: boolean;
  readonly filesystemScopes: readonly string[];
  readonly networkDestinations: readonly string[];
  readonly secretHandleRefs: readonly string[];
  readonly roleAllowlist: readonly string[];
  readonly warnings: readonly FhKuikaConnectorInstallWarning[];
  readonly permissionDiff: FhKuikaConnectorPermissionDiffV1 | null;
  readonly humanReviewRequired: true;
  readonly installAuthority: 'NONE';
}

export function buildFhKuikaConnectorInstallReviewV1(
  candidate: FhKuikaConnectorRegistryEntryV1,
  previous: FhKuikaConnectorRegistryEntryV1 | null = null,
): FhKuikaConnectorInstallReviewV1 {
  if (previous && previous.id !== candidate.id) {
    throw new Error('install review previous connector must use the same connector id');
  }

  const permissionDiff = previous
    ? diffFhKuikaConnectorPermissionsV1(previous, candidate)
    : null;
  const mutationCapable = candidate.capabilities.some((item) => item.mutationCapable);
  const warnings = new Set<FhKuikaConnectorInstallWarning>();

  if (candidate.trustLevel === 'EXTERNAL_UNTRUSTED') {
    warnings.add('EXTERNAL_UNTRUSTED');
  }
  if (mutationCapable) warnings.add('MUTATION_CAPABLE');
  if (candidate.filesystemScopes.length > 0) warnings.add('FILESYSTEM_ACCESS_REQUESTED');
  if (candidate.networkDestinations.length > 0) warnings.add('NETWORK_ACCESS_REQUESTED');
  if (candidate.secretHandleRefs.length > 0) warnings.add('SECRET_HANDLE_REQUESTED');
  if (candidate.versionPinRequired) warnings.add('VERSION_PIN_REQUIRED');
  if (permissionDiff?.humanReviewRequired) warnings.add('PERMISSION_CHANGE');

  return {
    schemaVersion: 1,
    connectorId: candidate.id,
    name: candidate.name,
    source: candidate.source,
    protocol: candidate.protocol,
    version: candidate.version,
    trustLevel: candidate.trustLevel,
    requestedCapabilityCount: candidate.capabilities.length,
    mutationCapable,
    filesystemScopes: candidate.filesystemScopes,
    networkDestinations: candidate.networkDestinations,
    secretHandleRefs: candidate.secretHandleRefs,
    roleAllowlist: candidate.roleAllowlist,
    warnings: [...warnings].sort(),
    permissionDiff,
    humanReviewRequired: true,
    installAuthority: 'NONE',
  };
}

export function connectorInstallReviewCanInstallDirectly(): false {
  return false;
}

export function connectorInstallReviewCanGrantAuthority(): false {
  return false;
}

export function connectorInstallReviewCanRevealRawSecrets(): false {
  return false;
}
