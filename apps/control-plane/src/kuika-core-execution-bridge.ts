import { createHash } from 'node:crypto';

import {
  validateFhKuikaCoreExecutionRequestV1,
  type FhKuikaCoreExecutionRequestV1,
} from '@freehighlander/contracts';

import {
  createCapabilityGatedActivityExecutor,
  type AuthorityCapabilityExecutionGate,
} from './authority-capability-execution.js';
import type {
  ActivityExecutor,
  ActivityExecutorOutcome,
  ActivityRequest,
} from './execution-runtime.js';

export interface FhKuikaCoreExecutionBridgeOptions {
  readonly repository: string;
  readonly revision: string;
  readonly gate: AuthorityCapabilityExecutionGate;
}

export class FhKuikaCoreExecutionBridge {
  constructor(readonly options: FhKuikaCoreExecutionBridgeOptions) {
    requireRepository(options.repository);
    requireRevision(options.revision);
    if (options.gate.options.expectedRevision !== options.revision) {
      throw new Error('FH-KUIKA bridge revision must match authority execution gate revision');
    }
  }

  bind(
    executionRequest: FhKuikaCoreExecutionRequestV1,
    delegate: ActivityExecutor,
  ): ActivityExecutor {
    validateFhKuikaCoreExecutionRequestV1(executionRequest);
    if (executionRequest.repository !== this.options.repository) {
      throw new Error('FH-KUIKA execution request repository does not match control-plane');
    }
    if (executionRequest.exactRevision !== this.options.revision) {
      throw new Error('FH-KUIKA execution request revision is stale');
    }

    const bound: ActivityExecutor = {
      id: 'kuika-core-' + executionRequest.requestId,
      async execute(request: ActivityRequest): Promise<ActivityExecutorOutcome> {
        const digest = createHash('sha256').update(request.input, 'utf8').digest('hex');
        if (digest !== executionRequest.payloadDigest) {
          return failed('KUIKA_EXECUTION_REQUEST_BINDING_INVALID');
        }
        return delegate.execute(request);
      },
    };

    return createCapabilityGatedActivityExecutor(
      executionRequest.requiredCapability,
      this.options.gate,
      bound,
    );
  }
}

export function fhKuikaCoreExecutionBridgeCanGrantAuthority(): false {
  return false;
}

export function fhKuikaCoreExecutionBridgeCanBypassCapabilityGate(): false {
  return false;
}

export function fhKuikaCoreExecutionBridgeTrustsClientApprovalEvidence(): false {
  return false;
}

function requireRepository(value: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('repository must use owner/name');
  }
}

function requireRevision(value: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new Error('revision must be a 40-character git SHA');
  }
}

function failed(failureKind: string): ActivityExecutorOutcome {
  return { status: 'FAILED', output: '', failureKind };
}
