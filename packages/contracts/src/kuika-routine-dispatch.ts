export interface FhKuikaRoutineDispatchRequestV1 {
  readonly schemaVersion: 1;
  readonly dispatchId: string;
  readonly routineId: string;
  readonly routineVersion: string;
  readonly repository: string;
  readonly exactRevision: string;
  readonly payloadDigest: string;
  readonly attempt: number;
  readonly authority: 'NONE';
  readonly executionOwner: 'CONTROL_PLANE';
}

export function createFhKuikaRoutineDispatchRequestV1(
  input: Omit<FhKuikaRoutineDispatchRequestV1, 'schemaVersion' | 'authority' | 'executionOwner'>,
): FhKuikaRoutineDispatchRequestV1 {
  return validateFhKuikaRoutineDispatchRequestV1({
    schemaVersion: 1,
    ...input,
    authority: 'NONE',
    executionOwner: 'CONTROL_PLANE',
  });
}

export function validateFhKuikaRoutineDispatchRequestV1(
  request: FhKuikaRoutineDispatchRequestV1,
): FhKuikaRoutineDispatchRequestV1 {
  if (request.schemaVersion !== 1) throw new Error('routine dispatch schemaVersion must be 1');
  requireIdentifier(request.dispatchId, 'dispatchId');
  requireIdentifier(request.routineId, 'routineId');
  if (!/^\d+\.\d+\.\d+$/.test(request.routineVersion)) {
    throw new Error('routineVersion must use semantic version x.y.z');
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(request.repository)) {
    throw new Error('repository must use owner/name');
  }
  if (!/^[a-f0-9]{40}$/.test(request.exactRevision)) {
    throw new Error('exactRevision must be a 40-character git SHA');
  }
  if (!/^[a-f0-9]{64}$/.test(request.payloadDigest)) {
    throw new Error('payloadDigest must be lowercase sha256');
  }
  if (!Number.isInteger(request.attempt) || request.attempt < 1 || request.attempt > 11) {
    throw new Error('attempt must be an integer between 1 and 11');
  }
  if (request.authority !== 'NONE') throw new Error('routine dispatch authority must be NONE');
  if (request.executionOwner !== 'CONTROL_PLANE') {
    throw new Error('routine dispatch owner must be CONTROL_PLANE');
  }
  return request;
}

export function fhKuikaRoutineDispatchRequestCanGrantAuthority(): false {
  return false;
}

export function fhKuikaRoutineTriggerMetadataCanGrantAuthority(): false {
  return false;
}

function requireIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(value)) {
    throw new Error(field + ' must be a bounded identifier');
  }
}
