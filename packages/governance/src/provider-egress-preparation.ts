import { createHash } from 'node:crypto';

import {
  evaluateProviderEgress,
  redactSensitive,
  type DataPolicy,
  type ProviderEgressDecision,
  type ProviderEgressRequest,
} from './data-policy.js';
import type { DataClassification } from './policy-engine.js';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue };

export type ProviderEgressReasonCode =
  | 'LOCAL_PROCESSING_ALLOWED'
  | 'PUBLIC_REMOTE_ALLOWED'
  | 'INTERNAL_POLICY_APPROVED'
  | 'INTERNAL_POLICY_REQUIRED'
  | 'CONFIDENTIAL_POLICY_BINDING_APPROVED'
  | 'CONFIDENTIAL_POLICY_BINDING_REQUIRED'
  | 'SECRET_REMOTE_FORBIDDEN';

export interface ProviderEgressPreparationRequest extends ProviderEgressRequest {
  readonly packetId: string;
  readonly providerId: string;
  readonly providerBindingId?: string;
  readonly payload: unknown;
}

export interface ProviderEgressCandidatePacket {
  readonly packetId: string;
  readonly providerId: string;
  readonly providerBindingId: string | null;
  readonly classification: DataClassification;
  readonly remote: boolean;
  readonly sanitizedPayload: JsonValue;
  readonly contentHash: string;
  readonly redactionApplied: boolean;
  readonly authority: 'NONE';
}

export interface ProviderEgressTelemetryPayload extends Record<string, unknown> {
  readonly category: 'provider-egress';
  readonly action: 'prepare';
  readonly outcome: 'ALLOW' | 'DENY';
  readonly reasonCode: ProviderEgressReasonCode;
  readonly subjectId: string;
  readonly resourceId: string;
  readonly contentHash?: string;
}

export interface ProviderEgressPreparation {
  readonly decision: ProviderEgressDecision;
  readonly packet: ProviderEgressCandidatePacket | null;
  readonly telemetryPayload: ProviderEgressTelemetryPayload;
  readonly invocationAuthorized: false;
  readonly authority: 'NONE';
}

export interface ProviderEgressPreparationValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const CLASSIFICATIONS = new Set<DataClassification>([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'SECRET',
]);

export function validateProviderEgressPreparationRequest(
  request: ProviderEgressPreparationRequest,
): ProviderEgressPreparationValidation {
  const errors: string[] = [];

  if (!ID_PATTERN.test(request.packetId)) {
    errors.push('provider egress packetId must be bounded and identifier-safe');
  }
  if (!ID_PATTERN.test(request.providerId)) {
    errors.push('provider egress providerId must be bounded and identifier-safe');
  }
  if (!CLASSIFICATIONS.has(request.classification)) {
    errors.push('provider egress classification is unsupported');
  }
  if (
    request.providerBindingApproved === true &&
    (!request.providerBindingId || !ID_PATTERN.test(request.providerBindingId))
  ) {
    errors.push('approved provider binding requires an explicit bounded providerBindingId');
  }
  if (request.providerBindingId !== undefined && !ID_PATTERN.test(request.providerBindingId)) {
    errors.push('providerBindingId must be bounded and identifier-safe');
  }

  const payloadValidation = validateJsonValue(request.payload);
  if (!payloadValidation.valid) {
    errors.push(...payloadValidation.errors.map((error) => 'payload ' + error));
  }

  return { valid: errors.length === 0, errors };
}

export function prepareProviderEgress(
  policy: DataPolicy,
  request: ProviderEgressPreparationRequest,
): ProviderEgressPreparation {
  const validation = validateProviderEgressPreparationRequest(request);
  if (!validation.valid) {
    throw new Error('invalid provider egress preparation request: ' + validation.errors.join('; '));
  }

  const decision = evaluateProviderEgress(policy, request);
  const reasonCode = providerEgressReasonCode(request, decision);

  if (!decision.allowed) {
    return {
      decision,
      packet: null,
      telemetryPayload: {
        category: 'provider-egress',
        action: 'prepare',
        outcome: 'DENY',
        reasonCode,
        subjectId: request.packetId,
        resourceId: request.providerId,
      },
      invocationAuthorized: false,
      authority: 'NONE',
    };
  }

  const originalPayload = request.payload as JsonValue;
  const sanitizedPayload = redactSensitive(originalPayload) as JsonValue;
  const originalCanonical = canonicalJson(originalPayload);
  const sanitizedCanonical = canonicalJson(sanitizedPayload);
  const contentHash = createHash('sha256').update(sanitizedCanonical, 'utf8').digest('hex');

  const packet: ProviderEgressCandidatePacket = {
    packetId: request.packetId,
    providerId: request.providerId,
    providerBindingId: request.providerBindingId ?? null,
    classification: request.classification,
    remote: request.remote,
    sanitizedPayload,
    contentHash,
    redactionApplied: originalCanonical !== sanitizedCanonical,
    authority: 'NONE',
  };

  return {
    decision,
    packet,
    telemetryPayload: {
      category: 'provider-egress',
      action: 'prepare',
      outcome: 'ALLOW',
      reasonCode,
      subjectId: request.packetId,
      resourceId: request.providerId,
      contentHash,
    },
    invocationAuthorized: false,
    authority: 'NONE',
  };
}

export function providerEgressPreparationCanInvokeProvider(): false {
  return false;
}

export function providerEgressPreparationCanGrantAuthority(): false {
  return false;
}

function providerEgressReasonCode(
  request: ProviderEgressPreparationRequest,
  decision: ProviderEgressDecision,
): ProviderEgressReasonCode {
  if (!request.remote) return 'LOCAL_PROCESSING_ALLOWED';

  switch (request.classification) {
    case 'PUBLIC':
      return 'PUBLIC_REMOTE_ALLOWED';
    case 'INTERNAL':
      return decision.allowed ? 'INTERNAL_POLICY_APPROVED' : 'INTERNAL_POLICY_REQUIRED';
    case 'CONFIDENTIAL':
      return decision.allowed
        ? 'CONFIDENTIAL_POLICY_BINDING_APPROVED'
        : 'CONFIDENTIAL_POLICY_BINDING_REQUIRED';
    case 'SECRET':
      return 'SECRET_REMOTE_FORBIDDEN';
  }
}

function validateJsonValue(value: unknown): ProviderEgressPreparationValidation {
  const errors: string[] = [];
  const seen = new WeakSet<object>();

  const visit = (candidate: unknown, currentPath: string): void => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') {
      return;
    }

    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) {
        errors.push(currentPath + ' must contain only finite numbers');
      }
      return;
    }

    if (Array.isArray(candidate)) {
      if (seen.has(candidate)) {
        errors.push(currentPath + ' must not contain circular references');
        return;
      }
      seen.add(candidate);
      candidate.forEach((item, index) => visit(item, currentPath + '[' + index + ']'));
      seen.delete(candidate);
      return;
    }

    if (candidate && typeof candidate === 'object') {
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        errors.push(currentPath + ' must contain only plain JSON objects');
        return;
      }
      if (seen.has(candidate)) {
        errors.push(currentPath + ' must not contain circular references');
        return;
      }
      seen.add(candidate);
      for (const [key, nested] of Object.entries(candidate)) {
        visit(nested, currentPath + '.' + key);
      }
      seen.delete(candidate);
      return;
    }

    errors.push(currentPath + ' contains unsupported JSON value type ' + typeof candidate);
  };

  visit(value, '$');
  return { valid: errors.length === 0, errors };
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalJson(item)).join(',') + ']';
  }

  const entries = Object.keys(value)
    .sort()
    .map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key]));
  return '{' + entries.join(',') + '}';
}
