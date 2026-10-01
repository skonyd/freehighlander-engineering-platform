import {
  createEvent,
  type EngineeringEvent,
  type EngineeringEventInput,
} from './index.js';

export type AuthorityEventType =
  | 'authority.requested'
  | 'authority.approved'
  | 'authority.activated'
  | 'authority.deactivated';

export type AuthorityEventAction = 'REQUEST' | 'APPROVE' | 'ACTIVATE' | 'DEACTIVATE';

export interface AuthorityEventPayload extends Record<string, unknown> {
  readonly action: AuthorityEventAction;
  readonly capability:
    | 'GIT_WRITE'
    | 'RELEASE_DEPLOY'
    | 'INFRASTRUCTURE_MUTATION'
    | 'AUTOMATIC_REMEDIATION';
  readonly principalKind: 'HUMAN' | 'SYSTEM';
  readonly principalId: string;
  readonly exactRevision: string;
  readonly generation: number;
  readonly outcome: 'APPLIED' | 'APPROVED' | 'UNCHANGED' | 'BLOCKED' | 'CONFLICT';
  readonly requested?: boolean;
  readonly policyHash?: string;
  readonly approvalRequestHash?: string;
  readonly humanDecisionHash?: string;
  readonly reasons: readonly string[];
}

const KEYS = new Set([
  'action',
  'capability',
  'principalKind',
  'principalId',
  'exactRevision',
  'generation',
  'outcome',
  'requested',
  'policyHash',
  'approvalRequestHash',
  'humanDecisionHash',
  'reasons',
]);

const CAPABILITIES = new Set([
  'GIT_WRITE',
  'RELEASE_DEPLOY',
  'INFRASTRUCTURE_MUTATION',
  'AUTOMATIC_REMEDIATION',
]);

const OUTCOMES = new Set(['APPLIED', 'APPROVED', 'UNCHANGED', 'BLOCKED', 'CONFLICT']);

export function createAuthorityEvent(
  input: Omit<EngineeringEventInput<AuthorityEventPayload>, 'type'> & {
    readonly type: AuthorityEventType;
  },
): EngineeringEvent<AuthorityEventPayload> {
  validateAuthorityPayload(input.payload);

  const expectedAction: Readonly<Record<AuthorityEventType, AuthorityEventAction>> = {
    'authority.requested': 'REQUEST',
    'authority.approved': 'APPROVE',
    'authority.activated': 'ACTIVATE',
    'authority.deactivated': 'DEACTIVATE',
  };
  if (input.payload.action !== expectedAction[input.type]) {
    throw new Error('authority telemetry action does not match event type');
  }
  if (input.type === 'authority.requested' && input.payload.requested === undefined) {
    throw new Error('authority request telemetry requires requested');
  }
  if (input.type !== 'authority.requested' && input.payload.requested !== undefined) {
    throw new Error('requested is valid only for authority request telemetry');
  }
  const bindingHashesRequired =
    (input.type === 'authority.approved' && input.payload.outcome === 'APPROVED') ||
    (input.type === 'authority.activated' &&
      (input.payload.outcome === 'APPLIED' || input.payload.outcome === 'UNCHANGED'));
  if (
    bindingHashesRequired &&
    (input.payload.policyHash === undefined ||
      input.payload.approvalRequestHash === undefined ||
      input.payload.humanDecisionHash === undefined)
  ) {
    throw new Error('successful authority approval and activation require approval binding hashes');
  }

  return createEvent(input);
}

export function authorityTelemetryCanContainRawSecrets(): false {
  return false;
}

export function authorityTelemetryCanGrantAuthority(): false {
  return false;
}

function validateAuthorityPayload(payload: AuthorityEventPayload): void {
  for (const key of Object.keys(payload)) {
    if (!KEYS.has(key)) throw new Error('authority telemetry field is not allowed: ' + key);
  }
  if (!CAPABILITIES.has(payload.capability)) {
    throw new Error('authority telemetry capability is invalid');
  }
  if (payload.principalKind !== 'HUMAN' && payload.principalKind !== 'SYSTEM') {
    throw new Error('authority telemetry principalKind is invalid');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,127}$/.test(payload.principalId)) {
    throw new Error('authority telemetry principalId is invalid');
  }
  if (!/^[a-f0-9]{40}$/.test(payload.exactRevision)) {
    throw new Error('authority telemetry exactRevision must be a full git SHA');
  }
  if (!Number.isInteger(payload.generation) || payload.generation < 0) {
    throw new Error('authority telemetry generation must be a non-negative integer');
  }
  if (!OUTCOMES.has(payload.outcome)) {
    throw new Error('authority telemetry outcome is invalid');
  }
  if (payload.requested !== undefined && typeof payload.requested !== 'boolean') {
    throw new Error('authority telemetry requested must be boolean');
  }
  for (const [name, value] of [
    ['policyHash', payload.policyHash],
    ['approvalRequestHash', payload.approvalRequestHash],
    ['humanDecisionHash', payload.humanDecisionHash],
  ] as const) {
    if (value !== undefined && !/^[a-f0-9]{64}$/.test(value)) {
      throw new Error('authority telemetry ' + name + ' must be lowercase sha256');
    }
  }
  if (!Array.isArray(payload.reasons) || payload.reasons.length > 8) {
    throw new Error('authority telemetry reasons must contain at most 8 items');
  }
  for (const reason of payload.reasons) {
    if (
      typeof reason !== 'string' ||
      !reason.trim() ||
      reason.length > 200 ||
      /[\r\n]/.test(reason) ||
      /(?:password|secret|authorization|bearer|api[_-]?key|access[_-]?token)/i.test(reason)
    ) {
      throw new Error('authority telemetry reason contains unsafe content');
    }
  }
}
