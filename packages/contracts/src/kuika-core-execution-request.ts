import { createHash } from 'node:crypto';

import {
  AUTHORITY_CAPABILITY_IDS,
  type AuthorityCapabilityId,
} from './authority-capability-registry.js';

export type FhKuikaExecutionSurface = 'WORKBENCH' | 'CONNECTOR' | 'ROUTINE';

export interface FhKuikaCoreExecutionRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly surface: FhKuikaExecutionSurface;
  readonly mutationClass: AuthorityCapabilityId;
  readonly requiredCapability: AuthorityCapabilityId;
  readonly repository: string;
  readonly exactRevision: string;
  readonly payloadDigest: string;
  readonly authority: 'NONE';
  readonly executionOwner: 'CONTROL_PLANE';
}

export function createFhKuikaCoreExecutionRequestV1(input: {
  readonly requestId: string;
  readonly surface: FhKuikaExecutionSurface;
  readonly mutationClass: AuthorityCapabilityId;
  readonly repository: string;
  readonly exactRevision: string;
  readonly payload: string;
}): FhKuikaCoreExecutionRequestV1 {
  const requestId = requireIdentifier(input.requestId, 'requestId');
  const repository = requireRepository(input.repository);
  const exactRevision = requireRevision(input.exactRevision);
  requireCapability(input.mutationClass);
  if (!isSurface(input.surface)) throw new Error('unknown FH-KUIKA execution surface');
  if (input.payload.length > 1_000_000) {
    throw new Error('FH-KUIKA execution payload exceeds maximum length');
  }

  return Object.freeze({
    schemaVersion: 1,
    requestId,
    surface: input.surface,
    mutationClass: input.mutationClass,
    requiredCapability: input.mutationClass,
    repository,
    exactRevision,
    payloadDigest: createHash('sha256').update(input.payload, 'utf8').digest('hex'),
    authority: 'NONE',
    executionOwner: 'CONTROL_PLANE',
  });
}

export function validateFhKuikaCoreExecutionRequestV1(
  request: FhKuikaCoreExecutionRequestV1,
): FhKuikaCoreExecutionRequestV1 {
  if (request.schemaVersion !== 1) throw new Error('FH-KUIKA execution request schemaVersion must be 1');
  requireIdentifier(request.requestId, 'requestId');
  if (!isSurface(request.surface)) throw new Error('unknown FH-KUIKA execution surface');
  requireCapability(request.mutationClass);
  requireCapability(request.requiredCapability);
  if (request.requiredCapability !== request.mutationClass) {
    throw new Error('FH-KUIKA required capability must be derived from mutation class');
  }
  requireRepository(request.repository);
  requireRevision(request.exactRevision);
  requireSha256(request.payloadDigest, 'payloadDigest');
  if (request.authority !== 'NONE') throw new Error('FH-KUIKA execution request authority must be NONE');
  if (request.executionOwner !== 'CONTROL_PLANE') {
    throw new Error('FH-KUIKA execution request owner must be CONTROL_PLANE');
  }
  return request;
}

export function fhKuikaExecutionRequestCanGrantAuthority(): false {
  return false;
}

export function fhKuikaExecutionRequestCanCarryApprovalEvidence(): false {
  return false;
}

function isSurface(value: string): value is FhKuikaExecutionSurface {
  return value === 'WORKBENCH' || value === 'CONNECTOR' || value === 'ROUTINE';
}

function requireCapability(value: AuthorityCapabilityId): void {
  if (!(AUTHORITY_CAPABILITY_IDS as readonly string[]).includes(value)) {
    throw new Error('unknown authority capability');
  }
}

function requireIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(normalized)) {
    throw new Error(field + ' must be a bounded identifier');
  }
  return normalized;
}

function requireRepository(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error('repository must use owner/name');
  }
  return normalized;
}

function requireRevision(value: string): string {
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new Error('exactRevision must be a 40-character git SHA');
  }
  return value;
}

function requireSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(field + ' must be lowercase sha256');
}
