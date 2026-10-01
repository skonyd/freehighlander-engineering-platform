import {
  createAuthorityEvent,
  type AuthorityEventPayload,
  type AuthorityEventType,
  type EngineeringEvent,
  type EventSink,
} from '@freehighlander/telemetry';
import type { AuthorityCapability } from '@freehighlander/persistence';

export interface AuthorityCapabilityAuditRecorderOptions {
  readonly repository: string;
  readonly exactRevision: string;
  readonly principalId: string;
  readonly now?: () => Date;
}

export interface AuthorityCapabilityAuditRecordInput {
  readonly type: AuthorityEventType;
  readonly capability: AuthorityCapability;
  readonly generation: number;
  readonly outcome: AuthorityEventPayload['outcome'];
  readonly reasons: readonly string[];
  readonly requested?: boolean;
  readonly policyHash?: string;
  readonly approvalRequestHash?: string;
  readonly humanDecisionHash?: string;
}

export class AuthorityCapabilityAuditRecorder {
  readonly #now: () => Date;

  constructor(
    readonly sink: EventSink,
    readonly options: AuthorityCapabilityAuditRecorderOptions,
  ) {
    if (!options.repository.trim()) throw new Error('audit repository is required');
    if (!/^[a-f0-9]{40}$/.test(options.exactRevision)) {
      throw new Error('audit exactRevision must be a full git SHA');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,127}$/.test(options.principalId)) {
      throw new Error('audit principalId is invalid');
    }
    this.#now = options.now ?? (() => new Date());
  }

  async record(
    input: AuthorityCapabilityAuditRecordInput,
  ): Promise<EngineeringEvent<AuthorityEventPayload>> {
    const event = createAuthorityEvent({
      type: input.type,
      timestamp: this.#now().toISOString(),
      runId: 'authority-control-plane',
      revision: {
        repository: this.options.repository,
        headSha: this.options.exactRevision,
      },
      payload: {
        action: actionForType(input.type),
        capability: input.capability,
        principalKind: 'HUMAN',
        principalId: this.options.principalId,
        exactRevision: this.options.exactRevision,
        generation: input.generation,
        outcome: input.outcome,
        reasons: input.reasons,
        ...(input.requested === undefined ? {} : { requested: input.requested }),
        ...(input.policyHash === undefined ? {} : { policyHash: input.policyHash }),
        ...(input.approvalRequestHash === undefined
          ? {}
          : { approvalRequestHash: input.approvalRequestHash }),
        ...(input.humanDecisionHash === undefined
          ? {}
          : { humanDecisionHash: input.humanDecisionHash }),
      },
    });
    await this.sink.append(event);
    return event;
  }
}

export function authorityAuditRecorderCanGrantAuthority(): false {
  return false;
}

function actionForType(type: AuthorityEventType): AuthorityEventPayload['action'] {
  switch (type) {
    case 'authority.requested':
      return 'REQUEST';
    case 'authority.approved':
      return 'APPROVE';
    case 'authority.activated':
      return 'ACTIVATE';
    case 'authority.deactivated':
      return 'DEACTIVATE';
  }
}
