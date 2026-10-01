import type {
  ActivityExecutor,
  ActivityExecutorOutcome,
  ActivityRequest,
} from './execution-runtime.js';
import {
  createReleaseDeployGatedExecutor,
  type AuthorityCapabilityExecutionGate,
} from './authority-capability-execution.js';

export type ReleaseMutationOperation =
  | 'PUBLISH_TAG'
  | 'PUBLISH_RELEASE'
  | 'DEPLOY'
  | 'ROLLBACK';

export interface TrustedReleaseExecutionEvidenceV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly sourceRevision: string;
  readonly snapshotHash: string;
  readonly status: 'READY';
  readonly rollbackVerified: boolean;
}

export interface ReleaseMutationActionV1 {
  readonly schemaVersion: 1;
  readonly operation: ReleaseMutationOperation;
  readonly candidateId: string;
  readonly sourceRevision: string;
  readonly snapshotHash: string;
  readonly target: string;
}

export interface ReleaseMutationReceiptV1 {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly operation: ReleaseMutationOperation;
  readonly target: string;
}

export interface ReleaseMutationAdapter {
  readonly id: string;
  execute(action: ReleaseMutationActionV1): Promise<ReleaseMutationReceiptV1>;
}

export function createGatedReleaseMutationExecutor(
  gate: AuthorityCapabilityExecutionGate,
  evidence: TrustedReleaseExecutionEvidenceV1,
  adapter: ReleaseMutationAdapter,
): ActivityExecutor {
  validateEvidence(evidence, gate);
  validateAdapter(adapter);

  const raw: ActivityExecutor = {
    id: 'release-mutation-v1',
    async execute(request: ActivityRequest): Promise<ActivityExecutorOutcome> {
      let action: ReleaseMutationActionV1;
      try {
        action = parseAction(request.input);
        validateActionBinding(action, evidence);
      } catch {
        return failed('RELEASE_MUTATION_INPUT_INVALID');
      }

      if (action.operation === 'ROLLBACK' && !evidence.rollbackVerified) {
        return failed('RELEASE_ROLLBACK_NOT_VERIFIED');
      }

      try {
        const receipt = await adapter.execute(action);
        validateReceipt(receipt, action);
        return { status: 'SUCCEEDED', output: JSON.stringify(receipt) };
      } catch {
        return failed('RELEASE_MUTATION_FAILED');
      }
    },
  };

  return createReleaseDeployGatedExecutor(gate, raw);
}

export function releaseMutationExecutorCanBypassCapabilityGate(): false {
  return false;
}

export function releaseMutationExecutorCanTreatReadinessAsAuthority(): false {
  return false;
}

function validateEvidence(
  evidence: TrustedReleaseExecutionEvidenceV1,
  gate: AuthorityCapabilityExecutionGate,
): void {
  if (evidence.schemaVersion !== 1 || evidence.status !== 'READY') {
    throw new Error('release evidence must be READY schemaVersion 1');
  }
  requireIdentifier(evidence.candidateId, 'candidateId');
  requireRevision(evidence.sourceRevision, 'sourceRevision');
  requireSha256(evidence.snapshotHash, 'snapshotHash');
  if (evidence.sourceRevision !== gate.options.expectedRevision) {
    throw new Error('release evidence revision must match execution gate revision');
  }
}

function validateAdapter(adapter: ReleaseMutationAdapter): void {
  if (!adapter || typeof adapter.execute !== 'function') {
    throw new Error('release mutation adapter is required');
  }
  requireIdentifier(adapter.id, 'adapter id');
}

function parseAction(source: string): ReleaseMutationActionV1 {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)) throw new Error('release action must be an object');
  const allowed = new Set([
    'schemaVersion',
    'operation',
    'candidateId',
    'sourceRevision',
    'snapshotHash',
    'target',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('release action contains unknown fields');
  }
  if (value.schemaVersion !== 1) throw new Error('release action schemaVersion must be 1');
  if (!isOperation(value.operation)) throw new Error('unsupported release mutation operation');
  if (typeof value.candidateId !== 'string') throw new Error('candidateId must be a string');
  if (typeof value.sourceRevision !== 'string') throw new Error('sourceRevision must be a string');
  if (typeof value.snapshotHash !== 'string') throw new Error('snapshotHash must be a string');
  if (typeof value.target !== 'string') throw new Error('target must be a string');

  const action: ReleaseMutationActionV1 = {
    schemaVersion: 1,
    operation: value.operation,
    candidateId: requireIdentifier(value.candidateId, 'candidateId'),
    sourceRevision: value.sourceRevision,
    snapshotHash: value.snapshotHash,
    target: requireBoundedText(value.target, 'target', 256),
  };
  requireRevision(action.sourceRevision, 'sourceRevision');
  requireSha256(action.snapshotHash, 'snapshotHash');
  return action;
}

function validateActionBinding(
  action: ReleaseMutationActionV1,
  evidence: TrustedReleaseExecutionEvidenceV1,
): void {
  if (
    action.candidateId !== evidence.candidateId ||
    action.sourceRevision !== evidence.sourceRevision ||
    action.snapshotHash !== evidence.snapshotHash
  ) {
    throw new Error('release action does not match trusted release evidence');
  }
}

function validateReceipt(
  receipt: ReleaseMutationReceiptV1,
  action: ReleaseMutationActionV1,
): void {
  if (!receipt || receipt.schemaVersion !== 1) throw new Error('invalid release mutation receipt');
  requireIdentifier(receipt.receiptId, 'receiptId');
  if (receipt.operation !== action.operation || receipt.target !== action.target) {
    throw new Error('release mutation receipt does not match action');
  }
}

function isOperation(value: unknown): value is ReleaseMutationOperation {
  return (
    value === 'PUBLISH_TAG' ||
    value === 'PUBLISH_RELEASE' ||
    value === 'DEPLOY' ||
    value === 'ROLLBACK'
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
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(field + ' must be a 40-character git SHA');
  }
}

function requireSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(field + ' must be lowercase sha256');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failed(failureKind: string): ActivityExecutorOutcome {
  return { status: 'FAILED', output: '', failureKind };
}
