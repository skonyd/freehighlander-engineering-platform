import type {
  ActivityExecutor,
  ActivityExecutorOutcome,
  ActivityRequest,
} from './execution-runtime.js';
import {
  createAutomaticRemediationGatedExecutor,
  createInfrastructureMutationGatedExecutor,
  type AuthorityCapabilityExecutionGate,
} from './authority-capability-execution.js';

export type IncidentRemediationOperation =
  'RESTART' | 'SCALE' | 'ROLLBACK' | 'CONFIGURE' | 'ISOLATE' | 'NOTIFY';

export interface TrustedIncidentRemediationEvidenceV1 {
  readonly schemaVersion: 1;
  readonly incidentId: string;
  readonly remediationId: string;
  readonly sourceRevision: string;
  readonly evidenceHash: string;
  readonly serviceId: string;
  readonly environment: string;
  readonly operation: IncidentRemediationOperation;
  readonly targetResourceIds: readonly string[];
  readonly requiresInfrastructureMutation: boolean;
}

export interface IncidentRemediationActionV1 extends TrustedIncidentRemediationEvidenceV1 {}

export interface IncidentRemediationReceiptV1 {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly incidentId: string;
  readonly remediationId: string;
  readonly operation: IncidentRemediationOperation;
}

export interface IncidentRemediationAdapter {
  readonly id: string;
  execute(action: IncidentRemediationActionV1): Promise<IncidentRemediationReceiptV1>;
}

export function createGatedIncidentRemediationExecutor(
  gate: AuthorityCapabilityExecutionGate,
  evidence: TrustedIncidentRemediationEvidenceV1,
  adapter: IncidentRemediationAdapter,
): ActivityExecutor {
  validateEvidence(evidence, gate);
  validateAdapter(adapter);

  const raw: ActivityExecutor = {
    id: 'incident-remediation-v1',
    async execute(request: ActivityRequest): Promise<ActivityExecutorOutcome> {
      try {
        validateRequestBinding(request.input, evidence);
      } catch {
        return failed('INCIDENT_REMEDIATION_INPUT_INVALID');
      }

      try {
        const receipt = await adapter.execute({ ...evidence });
        validateReceipt(receipt, evidence);
        return { status: 'SUCCEEDED', output: JSON.stringify(receipt) };
      } catch {
        return failed('INCIDENT_REMEDIATION_FAILED');
      }
    },
  };

  let gated = createAutomaticRemediationGatedExecutor(gate, raw);
  if (evidence.requiresInfrastructureMutation) {
    gated = createInfrastructureMutationGatedExecutor(gate, gated);
  }
  return gated;
}

export function incidentRemediationCanBypassAutomaticRemediationGate(): false {
  return false;
}

export function infrastructureRemediationCanBypassInfrastructureGate(): false {
  return false;
}

export function remediationRequestCanChooseActionOrTargets(): false {
  return false;
}

function validateEvidence(
  evidence: TrustedIncidentRemediationEvidenceV1,
  gate: AuthorityCapabilityExecutionGate,
): void {
  if (evidence.schemaVersion !== 1) {
    throw new Error('remediation evidence schemaVersion must be 1');
  }
  requireIdentifier(evidence.incidentId, 'incidentId');
  requireIdentifier(evidence.remediationId, 'remediationId');
  requireIdentifier(evidence.serviceId, 'serviceId');
  requireBoundedText(evidence.environment, 'environment', 128);
  requireRevision(evidence.sourceRevision, 'sourceRevision');
  requireSha256(evidence.evidenceHash, 'evidenceHash');
  if (!isOperation(evidence.operation)) {
    throw new Error('unsupported remediation operation');
  }
  if (evidence.sourceRevision !== gate.options.expectedRevision) {
    throw new Error('remediation revision must match execution gate revision');
  }
  if (evidence.operation !== 'NOTIFY' && evidence.requiresInfrastructureMutation !== true) {
    throw new Error('side-effecting remediation must require infrastructure mutation');
  }
  if (evidence.operation === 'NOTIFY' && evidence.requiresInfrastructureMutation !== false) {
    throw new Error('notification remediation must not require infrastructure mutation');
  }
  if (evidence.targetResourceIds.length < 1 || evidence.targetResourceIds.length > 128) {
    throw new Error('remediation requires 1..128 targets');
  }
  const seen = new Set<string>();
  for (const target of evidence.targetResourceIds) {
    requireIdentifier(target, 'target resource id');
    if (seen.has(target)) throw new Error('duplicate target resource id');
    seen.add(target);
  }
}

function validateAdapter(adapter: IncidentRemediationAdapter): void {
  if (!adapter || typeof adapter.execute !== 'function') {
    throw new Error('incident remediation adapter is required');
  }
  requireIdentifier(adapter.id, 'adapter id');
}

function validateRequestBinding(
  source: string,
  evidence: TrustedIncidentRemediationEvidenceV1,
): void {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)) throw new Error('remediation request must be an object');
  const allowed = new Set([
    'schemaVersion',
    'incidentId',
    'remediationId',
    'sourceRevision',
    'evidenceHash',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('remediation request contains unknown fields');
  }
  if (
    value.schemaVersion !== 1 ||
    value.incidentId !== evidence.incidentId ||
    value.remediationId !== evidence.remediationId ||
    value.sourceRevision !== evidence.sourceRevision ||
    value.evidenceHash !== evidence.evidenceHash
  ) {
    throw new Error('remediation request does not match trusted evidence');
  }
}

function validateReceipt(
  receipt: IncidentRemediationReceiptV1,
  evidence: TrustedIncidentRemediationEvidenceV1,
): void {
  if (!receipt || receipt.schemaVersion !== 1) {
    throw new Error('invalid incident remediation receipt');
  }
  requireIdentifier(receipt.receiptId, 'receiptId');
  if (
    receipt.incidentId !== evidence.incidentId ||
    receipt.remediationId !== evidence.remediationId ||
    receipt.operation !== evidence.operation
  ) {
    throw new Error('incident remediation receipt does not match action');
  }
}

function isOperation(value: unknown): value is IncidentRemediationOperation {
  return (
    value === 'RESTART' ||
    value === 'SCALE' ||
    value === 'ROLLBACK' ||
    value === 'CONFIGURE' ||
    value === 'ISOLATE' ||
    value === 'NOTIFY'
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
