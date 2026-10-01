import type { AuthorityCapabilityId } from './authority-capability-registry.js';

export interface FhKuikaConnectorInvocationRequestV1 {
  readonly schemaVersion: 1;
  readonly invocationId: string;
  readonly connectorId: string;
  readonly capabilityId: string;
  readonly repository: string;
  readonly exactRevision: string;
  readonly role: string;
  readonly filesystemScopes: readonly string[];
  readonly networkDestinations: readonly string[];
  readonly secretHandleRefs: readonly string[];
  readonly payloadDigest: string;
  readonly authority: 'NONE';
  readonly executionOwner: 'CONTROL_PLANE';
}

export interface FhKuikaTrustedConnectorCapabilityV1 {
  readonly id: string;
  readonly mutationCapability: AuthorityCapabilityId | null;
}

export interface FhKuikaTrustedConnectorRuntimeV1 {
  readonly id: string;
  readonly enabled: boolean;
  readonly capabilities: readonly FhKuikaTrustedConnectorCapabilityV1[];
  readonly filesystemScopes: readonly string[];
  readonly networkDestinations: readonly string[];
  readonly secretHandleRefs: readonly string[];
  readonly roleAllowlist: readonly string[];
}

export function createFhKuikaConnectorInvocationRequestV1(
  input: Omit<
    FhKuikaConnectorInvocationRequestV1,
    'schemaVersion' | 'authority' | 'executionOwner'
  >,
): FhKuikaConnectorInvocationRequestV1 {
  return validateFhKuikaConnectorInvocationRequestV1({
    schemaVersion: 1,
    ...input,
    authority: 'NONE',
    executionOwner: 'CONTROL_PLANE',
  });
}

export function validateFhKuikaConnectorInvocationRequestV1(
  request: FhKuikaConnectorInvocationRequestV1,
): FhKuikaConnectorInvocationRequestV1 {
  if (request.schemaVersion !== 1) throw new Error('connector invocation schemaVersion must be 1');
  requireIdentifier(request.invocationId, 'invocationId');
  requireIdentifier(request.connectorId, 'connectorId');
  requireIdentifier(request.capabilityId, 'capabilityId');
  requireRepository(request.repository);
  requireRevision(request.exactRevision);
  requireIdentifier(request.role, 'role');
  requireBoundedList(request.filesystemScopes, 'filesystemScopes');
  requireBoundedList(request.networkDestinations, 'networkDestinations');
  requireSecretHandles(request.secretHandleRefs);
  requireSha256(request.payloadDigest);
  if (request.authority !== 'NONE') throw new Error('connector invocation authority must be NONE');
  if (request.executionOwner !== 'CONTROL_PLANE') {
    throw new Error('connector invocation owner must be CONTROL_PLANE');
  }
  return request;
}

export function fhKuikaConnectorInvocationCanGrantAuthority(): false {
  return false;
}

export function fhKuikaConnectorInvocationCanCarryRawSecrets(): false {
  return false;
}

function requireIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(value)) {
    throw new Error(field + ' must be a bounded identifier');
  }
}

function requireRepository(value: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('repository must use owner/name');
  }
}

function requireRevision(value: string): void {
  if (!/^[a-f0-9]{40}$/.test(value))
    throw new Error('exactRevision must be a 40-character git SHA');
}

function requireBoundedList(values: readonly string[], field: string): void {
  for (const value of values) {
    if (!value.trim() || value.length > 500 || /[\r\n\t]/.test(value)) {
      throw new Error(field + ' must contain bounded single-line values');
    }
  }
}

function requireSecretHandles(values: readonly string[]): void {
  for (const value of values) {
    if (!/^secret:[A-Za-z0-9._/-]+$/.test(value)) {
      throw new Error('secretHandleRefs must contain opaque secret:<reference> handles');
    }
  }
}

function requireSha256(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('payloadDigest must be lowercase sha256');
}
