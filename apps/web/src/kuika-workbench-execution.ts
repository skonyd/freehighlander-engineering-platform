import { createHash } from 'node:crypto';

import {
  createFhKuikaCoreExecutionRequestV1,
  type AuthorityCapabilityId,
  type FhKuikaCoreExecutionRequestV1,
} from '@freehighlander/contracts';

import type { FhKuikaWorkbenchIntentV1 } from './kuika-workbench-intent.js';

export interface FhKuikaWorkbenchExecutionEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly payload: string;
  readonly payloadDigest: string;
  readonly executionRequest: FhKuikaCoreExecutionRequestV1;
  readonly authority: 'NONE';
  readonly executionOwner: 'CONTROL_PLANE';
}

export function createFhKuikaWorkbenchExecutionEnvelopeV1(input: {
  readonly requestId: string;
  readonly mutationClass: AuthorityCapabilityId;
  readonly intent: FhKuikaWorkbenchIntentV1;
}): FhKuikaWorkbenchExecutionEnvelopeV1 {
  const intent = input.intent;
  if (intent.mode !== 'EXECUTE' || intent.disposition !== 'CONTROL_PLANE_REQUEST') {
    throw new Error('Workbench execution envelope requires EXECUTE control-plane intent');
  }
  if (!intent.mutationRequested || !intent.requiresEnabledV3Authority) {
    throw new Error('Workbench EXECUTE intent must request gated mutation authority');
  }
  if (intent.selectionAuthority !== 'NONE' || intent.executionOwner !== 'CONTROL_PLANE') {
    throw new Error('Workbench EXECUTE intent authority boundary is invalid');
  }

  const exactRevision = intent.context.exactRevision;
  if (!exactRevision) throw new Error('Workbench EXECUTE requires an exact revision');

  const payload = JSON.stringify({
    schemaVersion: 1,
    mode: intent.mode,
    request: intent.request,
    context: {
      repository: intent.context.repository,
      branch: intent.context.branch,
      exactRevision,
      selectedFiles: intent.context.selectedFiles,
      evidenceIds: intent.context.evidenceIds,
      blueprintId: intent.context.blueprintId,
      workflowId: intent.context.workflowId,
    },
  });
  const payloadDigest = createHash('sha256').update(payload, 'utf8').digest('hex');

  return Object.freeze({
    schemaVersion: 1,
    payload,
    payloadDigest,
    executionRequest: createFhKuikaCoreExecutionRequestV1({
      requestId: input.requestId,
      surface: 'WORKBENCH',
      mutationClass: input.mutationClass,
      repository: intent.context.repository,
      exactRevision,
      payloadDigest,
    }),
    authority: 'NONE',
    executionOwner: 'CONTROL_PLANE',
  });
}

export function workbenchExecutionEnvelopeCanGrantAuthority(): false {
  return false;
}

export function workbenchExecutionEnvelopeCanExecuteDirectly(): false {
  return false;
}
