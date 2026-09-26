export interface FhKuikaReviewEvidenceRefV1 {
  readonly evidenceId: string;
  readonly exactRevision: string;
}

export interface FhKuikaReviewRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly repository: string;
  readonly exactRevision: string;
  readonly producerRole: string;
  readonly reviewerRole: string;
  readonly independenceGroup: string;
  readonly evidence: readonly FhKuikaReviewEvidenceRefV1[];
  readonly authority: 'NONE';
  readonly executionAuthorized: false;
}

export interface FhKuikaReviewRequestValidationV1 {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function createFhKuikaReviewRequestV1(
  input: Omit<FhKuikaReviewRequestV1, 'schemaVersion' | 'authority' | 'executionAuthorized'>,
): FhKuikaReviewRequestV1 {
  const request: FhKuikaReviewRequestV1 = {
    schemaVersion: 1,
    ...input,
    authority: 'NONE',
    executionAuthorized: false,
  };

  const validation = validateFhKuikaReviewRequestV1(request);
  if (!validation.valid) {
    throw new Error(`invalid FH-KUIKA review request: ${validation.errors.join('; ')}`);
  }
  return request;
}

export function validateFhKuikaReviewRequestV1(
  request: FhKuikaReviewRequestV1,
): FhKuikaReviewRequestValidationV1 {
  const errors: string[] = [];

  if (request.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  requireText(request.requestId, 'requestId', errors);
  requireText(request.repository, 'repository', errors);
  requireText(request.exactRevision, 'exactRevision', errors);
  requireText(request.producerRole, 'producerRole', errors);
  requireText(request.reviewerRole, 'reviewerRole', errors);
  requireText(request.independenceGroup, 'independenceGroup', errors);

  if (request.authority !== 'NONE') errors.push('review request authority must be NONE');
  if (request.executionAuthorized !== false) {
    errors.push('review request executionAuthorized must be false');
  }

  if (request.producerRole === request.reviewerRole) {
    errors.push('producerRole and reviewerRole must be different');
  }

  if (request.evidence.length === 0) {
    errors.push('review request requires at least one evidence reference');
  }

  const evidenceIds = new Set<string>();
  for (const item of request.evidence) {
    requireText(item.evidenceId, 'evidenceId', errors);
    requireText(item.exactRevision, 'evidence exactRevision', errors);
    if (item.exactRevision && item.exactRevision !== request.exactRevision) {
      errors.push(`evidence ${item.evidenceId} is not bound to request exactRevision`);
    }
    if (evidenceIds.has(item.evidenceId)) {
      errors.push(`duplicate evidenceId: ${item.evidenceId}`);
    }
    evidenceIds.add(item.evidenceId);
  }

  return { valid: errors.length === 0, errors };
}

export function fhKuikaReviewRequestCanGrantAuthority(): false {
  return false;
}

export function fhKuikaReviewRequestCanAuthorizeExecution(): false {
  return false;
}

function requireText(value: string, name: string, errors: string[]): void {
  if (!value.trim()) errors.push(`${name} is required`);
}
