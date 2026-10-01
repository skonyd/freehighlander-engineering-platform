import { createHash } from 'node:crypto';

import {
  AUTHORITY_CAPABILITY_IDS,
  validateFhKuikaRoutineDispatchRequestV1,
  type AuthorityCapabilityId,
  type FhKuikaRoutineDispatchRequestV1,
} from '@freehighlander/contracts';

import type { AuthorityCapabilityExecutionGate } from './authority-capability-execution.js';

export interface FhKuikaTrustedRoutineRuntimeV1 {
  readonly id: string;
  readonly version: string;
  readonly active: boolean;
  readonly workflowRef: string;
  readonly mutationCapability: AuthorityCapabilityId;
  readonly maxAttempts: number;
}

export interface FhKuikaRoutineSchedulerSubmissionV1 {
  readonly schemaVersion: 1;
  readonly dispatchId: string;
  readonly routineId: string;
  readonly routineVersion: string;
  readonly workflowRef: string;
  readonly repository: string;
  readonly exactRevision: string;
  readonly payload: string;
  readonly attempt: number;
  readonly authority: 'CONTROL_PLANE_POLICY_GATED';
}

export interface FhKuikaRoutineSchedulerAdapter {
  readonly id: string;
  submit(submission: FhKuikaRoutineSchedulerSubmissionV1): Promise<void>;
}

export interface FhKuikaRoutineDispatchRuntimeOptions {
  readonly repository: string;
  readonly revision: string;
  readonly gate: AuthorityCapabilityExecutionGate;
  readonly resolveRoutine: (routineId: string) => FhKuikaTrustedRoutineRuntimeV1 | null;
}

export interface FhKuikaRoutineDispatchResultV1 {
  readonly schemaVersion: 1;
  readonly status: 'SUBMITTED' | 'BLOCKED' | 'FAILED';
  readonly reason: string | null;
  readonly generation: number | null;
  readonly authority: 'CONTROL_PLANE_POLICY_GATED';
}

export class FhKuikaRoutineDispatchRuntime {
  constructor(readonly options: FhKuikaRoutineDispatchRuntimeOptions) {
    requireRepository(options.repository);
    requireRevision(options.revision);
    if (typeof options.resolveRoutine !== 'function') {
      throw new Error('resolveRoutine must be a function');
    }
  }

  async submitAttempt(
    request: FhKuikaRoutineDispatchRequestV1,
    payload: string,
    scheduler: FhKuikaRoutineSchedulerAdapter,
  ): Promise<FhKuikaRoutineDispatchResultV1> {
    validateFhKuikaRoutineDispatchRequestV1(request);
    if (request.repository !== this.options.repository) {
      throw new Error('routine dispatch repository does not match control-plane');
    }
    if (request.exactRevision !== this.options.revision) {
      throw new Error('routine dispatch revision is stale');
    }
    requireScheduler(scheduler);

    const payloadDigest = createHash('sha256').update(payload, 'utf8').digest('hex');
    if (payloadDigest !== request.payloadDigest) {
      return result('BLOCKED', 'ROUTINE_PAYLOAD_BINDING_INVALID', null);
    }

    const routine = this.options.resolveRoutine(request.routineId);
    if (routine === null || !routine.active) {
      return result('BLOCKED', 'ROUTINE_INACTIVE_OR_MISSING', null);
    }
    validateTrustedRoutine(routine, request.routineId);
    if (routine.version !== request.routineVersion) {
      return result('BLOCKED', 'ROUTINE_VERSION_STALE', null);
    }
    if (request.attempt > routine.maxAttempts + 1) {
      return result('BLOCKED', 'ROUTINE_RETRY_LIMIT_EXCEEDED', null);
    }

    const decision = this.options.gate.check(routine.mutationCapability);
    if (!decision.allowed) {
      return result('BLOCKED', 'CAPABILITY_GATE_DENIED', decision.generation);
    }

    try {
      await scheduler.submit({
        schemaVersion: 1,
        dispatchId: request.dispatchId,
        routineId: request.routineId,
        routineVersion: request.routineVersion,
        workflowRef: routine.workflowRef,
        repository: request.repository,
        exactRevision: request.exactRevision,
        payload,
        attempt: request.attempt,
        authority: 'CONTROL_PLANE_POLICY_GATED',
      });
      return result('SUBMITTED', null, decision.generation);
    } catch {
      return result('FAILED', 'SCHEDULER_SUBMISSION_FAILED', decision.generation);
    }
  }
}

export function routineDispatchRuntimeCanGrantAuthority(): false {
  return false;
}

export function routineDispatchRuntimeCanSkipCapabilityRecheckOnRetry(): false {
  return false;
}

export function routineTriggerMetadataCanAuthorizeExecution(): false {
  return false;
}

function validateTrustedRoutine(routine: FhKuikaTrustedRoutineRuntimeV1, expectedId: string): void {
  if (routine.id !== expectedId) throw new Error('trusted routine id does not match request');
  if (!/^\d+\.\d+\.\d+$/.test(routine.version)) {
    throw new Error('trusted routine version must use semantic version x.y.z');
  }
  if (!/^[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+$/.test(routine.workflowRef)) {
    throw new Error('trusted routine workflowRef must use <id>@<semver>');
  }
  if (!(AUTHORITY_CAPABILITY_IDS as readonly string[]).includes(routine.mutationCapability)) {
    throw new Error('trusted routine mutation capability is unknown');
  }
  if (!Number.isInteger(routine.maxAttempts) || routine.maxAttempts < 0 || routine.maxAttempts > 10) {
    throw new Error('trusted routine maxAttempts must be between 0 and 10');
  }
}

function requireScheduler(scheduler: FhKuikaRoutineSchedulerAdapter): void {
  if (!scheduler || typeof scheduler.submit !== 'function') {
    throw new Error('routine scheduler adapter is required');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(scheduler.id)) {
    throw new Error('routine scheduler id must be a bounded identifier');
  }
}

function requireRepository(value: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('repository must use owner/name');
  }
}

function requireRevision(value: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error('revision must be a 40-character git SHA');
}

function result(
  status: FhKuikaRoutineDispatchResultV1['status'],
  reason: string | null,
  generation: number | null,
): FhKuikaRoutineDispatchResultV1 {
  return {
    schemaVersion: 1,
    status,
    reason,
    generation,
    authority: 'CONTROL_PLANE_POLICY_GATED',
  };
}
