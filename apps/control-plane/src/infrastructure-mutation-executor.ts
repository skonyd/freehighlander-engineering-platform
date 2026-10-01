import type {
  ActivityExecutor,
  ActivityExecutorOutcome,
  ActivityRequest,
} from './execution-runtime.js';
import {
  createInfrastructureMutationGatedExecutor,
  type AuthorityCapabilityExecutionGate,
} from './authority-capability-execution.js';

export type InfrastructureMutationOperation =
  | 'RESTART'
  | 'SCALE'
  | 'DEPLOY'
  | 'ROLLBACK'
  | 'CONFIGURE';

export interface TrustedOperationalIntentEvidenceV1 {
  readonly schemaVersion: 1;
  readonly intentId: string;
  readonly sourceRevision: string;
  readonly intentHash: string;
  readonly serviceId: string;
  readonly environment: string;
  readonly operation: InfrastructureMutationOperation;
  readonly targetResourceIds: readonly string[];
}

export interface InfrastructureMutationActionV1 {
  readonly schemaVersion: 1;
  readonly intentId: string;
  readonly sourceRevision: string;
  readonly intentHash: string;
  readonly serviceId: string;
  readonly environment: string;
  readonly operation: InfrastructureMutationOperation;
  readonly targetResourceIds: readonly string[];
}

export interface InfrastructureMutationReceiptV1 {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly intentId: string;
  readonly operation: InfrastructureMutationOperation;
}

export interface InfrastructureMutationAdapter {
  readonly id: string;
  execute(action: InfrastructureMutationActionV1): Promise<InfrastructureMutationReceiptV1>;
}

export function createGatedInfrastructureMutationExecutor(
  gate: AuthorityCapabilityExecutionGate,
  evidence: TrustedOperationalIntentEvidenceV1,
  adapter: InfrastructureMutationAdapter,
): ActivityExecutor {
  validateEvidence(evidence, gate);
  validateAdapter(adapter);

  const raw: ActivityExecutor = {
    id: 'infrastructure-mutation-v1',
    async execute(request: ActivityRequest): Promise<ActivityExecutorOutcome> {
      try {
        validateRequestBinding(request.input, evidence);
      } catch {
        return failed('INFRASTRUCTURE_MUTATION_INPUT_INVALID');
      }

      const action: InfrastructureMutationActionV1 = {
        schemaVersion: 1,
        intentId: evidence.intentId,
        sourceRevision: evidence.sourceRevision,
        intentHash: evidence.intentHash,
        serviceId: evidence.serviceId,
        environment: evidence.environment,
        operation: evidence.operation,
        targetResourceIds: evidence.targetResourceIds,
      };

      try {
        const receipt = await adapter.execute(action);
        validateReceipt(receipt, action);
        return { status: 'SUCCEEDED', output: JSON.stringify(receipt) };
      } catch {
        return failed('INFRASTRUCTURE_MUTATION_FAILED');
      }
    },
  };

  return createInfrastructureMutationGatedExecutor(gate, raw);
}

export function infrastructureMutationExecutorCanBypassCapabilityGate(): false {
  return false;
}

export function infrastructureMutationRequestCanChooseTargets(): false {
  return false;
}

function validateEvidence(
  evidence: TrustedOperationalIntentEvidenceV1,
  gate: AuthorityCapabilityExecutionGate,
): void {
  if (evidence.schemaVersion !== 1) throw new Error('operational intent evidence schemaVersion must be 1');
  requireIdentifier(evidence.intentId, 'intentId');
  requireIdentifier(evidence.serviceId, 'serviceId');
  requireBoundedText(evidence.environment, 'environment', 128);
  requireRevision(evidence.sourceRevision, 'sourceRevision');
  requireSha256(evidence.intentHash, 'intentHash');
  if (!isOperation(evidence.operation)) throw new Error('unsupported infrastructure mutation operation');
  if (evidence.sourceRevision !== gate.options.expectedRevision) {
    throw new Error('operational intent revision must match execution gate revision');
  }
  if (evidence.targetResourceIds.length < 1 || evidence.targetResourceIds.length > 128) {
    throw new Error('operational intent requires 1..128 target resources');
  }
  const seen = new Set<string>();
  for (const target of evidence.targetResourceIds) {
    requireIdentifier(target, 'target resource id');
    if (seen.has(target)) throw new Error('duplicate target resource id');
    seen.add(target);
  }
}

function validateAdapter(adapter: InfrastructureMutationAdapter): void {
  if (!adapter || typeof adapter.execute !== 'function') {
    throw new Error('infrastructure mutation adapter is required');
  }
  requireIdentifier(adapter.id, 'adapter id');
}

function validateRequestBinding(
  source: string,
  evidence: TrustedOperationalIntentEvidenceV1,
): void {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)) throw new Error('infrastructure mutation request must be an object');
  const allowed = new Set(['schemaVersion', 'intentId', 'sourceRevision', 'intentHash']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('infrastructure mutation request contains unknown fields');
  }
  if (
    value.schemaVersion !== 1 ||
    value.intentId !== evidence.intentId ||
    value.sourceRevision !== evidence.sourceRevision ||
    value.intentHash !== evidence.intentHash
  ) {
    throw new Error('infrastructure mutation request does not match trusted intent evidence');
  }
}

function validateReceipt(
  receipt: InfrastructureMutationReceiptV1,
  action: InfrastructureMutationActionV1,
): void {
  if (!receipt || receipt.schemaVersion !== 1) {
    throw new Error('invalid infrastructure mutation receipt');
  }
  requireIdentifier(receipt.receiptId, 'receiptId');
  if (receipt.intentId !== action.intentId || receipt.operation !== action.operation) {
    throw new Error('infrastructure mutation receipt does not match action');
  }
}

function isOperation(value: unknown): value is InfrastructureMutationOperation {
  return (
    value === 'RESTART' ||
    value === 'SCALE' ||
    value === 'DEPLOY' ||
    value === 'ROLLBACK' ||
    value === 'CONFIGURE'
  );
}

function requireIdentifier(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(value)) {
    throw new Error(field + ' must be a bounded identifier');
  }
  return value;
}

function requireBoundedText(value: string, field: string, maxLength: number): string {
  if (!value.trim() || value.length > maxLength || value.includes('\0')) {
    throw new Error(field + ' must be non-empty bounded text');
  }
  return value.trim();
}

function requireRevision(value: string, field: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(field + ' must be a 40-character git SHA');
}

function requireSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(field + ' must be lowercase sha256');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failed(failureKind: string): ActivityExecutorOutcome {
  return { status: 'FAILED', output: '', failureKind };
}
