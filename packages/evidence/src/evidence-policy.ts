export type EvidenceKind = 'RAW' | 'ARTIFACT' | 'RELATION' | 'TEST' | 'DIFF' | 'SUMMARY';

export interface EvidenceRequirement {
  readonly id: string;
  readonly kind: EvidenceKind;
  readonly exactRevisionRequired?: boolean;
  readonly trustedProvenanceRequired?: boolean;
  readonly relationVerificationRequired?: boolean;
}

export interface EvidencePolicy {
  readonly id: string;
  readonly version: string;
  readonly requirements: readonly EvidenceRequirement[];
  readonly allowSummarySubstitution: false;
}

export interface EvidenceCandidate {
  readonly id: string;
  readonly kind: EvidenceKind;
  readonly exactRevision?: string;
  readonly trustedProvenance?: boolean;
  readonly relationVerified?: boolean;
}

export interface EvidenceValidationContext {
  readonly exactRevision: string;
}

export interface EvidenceValidationResult {
  readonly status: 'PASS' | 'FAIL';
  readonly satisfiedRequirementIds: readonly string[];
  readonly errors: readonly string[];
  readonly authorityGranted: false;
  readonly requiredEvidenceMayBeDropped: false;
}

export function validateEvidencePolicy(
  policy: EvidencePolicy,
  candidates: readonly EvidenceCandidate[],
  context: EvidenceValidationContext,
): EvidenceValidationResult {
  validatePolicy(policy);
  requireText(context.exactRevision, 'exactRevision');

  const candidateMap = new Map<string, EvidenceCandidate>();
  for (const candidate of candidates) {
    requireText(candidate.id, 'candidate id');
    if (candidateMap.has(candidate.id))
      throw new Error(`duplicate evidence candidate id: ${candidate.id}`);
    candidateMap.set(candidate.id, candidate);
  }

  const satisfied: string[] = [];
  const errors: string[] = [];

  for (const requirement of policy.requirements) {
    const candidate = candidateMap.get(requirement.id);
    if (!candidate) {
      errors.push(`missing required evidence: ${requirement.id}`);
      continue;
    }

    if (candidate.kind !== requirement.kind) {
      const summarySubstitution =
        candidate.kind === 'SUMMARY' &&
        requirement.kind !== 'SUMMARY' &&
        !policy.allowSummarySubstitution;
      errors.push(
        summarySubstitution
          ? `summary cannot substitute required ${requirement.kind} evidence: ${requirement.id}`
          : `evidence kind mismatch for ${requirement.id}: expected ${requirement.kind}, got ${candidate.kind}`,
      );
      continue;
    }

    if (
      requirement.exactRevisionRequired === true &&
      candidate.exactRevision !== context.exactRevision
    ) {
      errors.push(`exact revision mismatch for evidence: ${requirement.id}`);
      continue;
    }

    if (requirement.trustedProvenanceRequired === true && candidate.trustedProvenance !== true) {
      errors.push(`trusted provenance required for evidence: ${requirement.id}`);
      continue;
    }

    if (requirement.relationVerificationRequired === true && candidate.relationVerified !== true) {
      errors.push(`relation verification required for evidence: ${requirement.id}`);
      continue;
    }

    satisfied.push(requirement.id);
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    satisfiedRequirementIds: satisfied,
    errors,
    authorityGranted: false,
    requiredEvidenceMayBeDropped: false,
  };
}

export function evidencePolicyCanGrantAuthority(): false {
  return false;
}

export function evidenceBudgetCanTruncateRequiredEvidence(): false {
  return false;
}

function validatePolicy(policy: EvidencePolicy): void {
  requireText(policy.id, 'policy id');
  if (!/^\d+\.\d+\.\d+$/.test(policy.version)) {
    throw new Error('evidence policy version must be semantic version');
  }
  if (policy.allowSummarySubstitution !== false) {
    throw new Error('summary substitution must remain disabled');
  }

  const ids = new Set<string>();
  for (const requirement of policy.requirements) {
    requireText(requirement.id, 'requirement id');
    if (ids.has(requirement.id)) {
      throw new Error(`duplicate evidence requirement id: ${requirement.id}`);
    }
    ids.add(requirement.id);
  }
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}
