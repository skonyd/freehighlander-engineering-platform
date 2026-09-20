export type CutoverReadinessStatus = 'BLOCKED' | 'READY';

export interface CutoverReadinessInput {
  readonly provisionalReferenceSha: string;
  readonly finalAcceptedReferenceSha?: string;
  readonly parityReferenceSha?: string;
  readonly referenceStatus: 'PROVISIONAL' | 'ACCEPTED';
  readonly deltaReviewed: boolean;
  readonly paritySuitePassed: boolean;
  readonly postPortSmokePassed: boolean;
  readonly authorityPromotionReviewed: boolean;
  readonly humanApprovalVerified: boolean;
  readonly policyDecision: 'ALLOW' | 'DENY' | 'HUMAN_REQUIRED';
  readonly parityStatus: 'PASS' | 'MISMATCH' | 'INSUFFICIENT_EVIDENCE' | 'UNAVAILABLE';
}

export interface CutoverReadinessResult {
  readonly status: CutoverReadinessStatus;
  readonly reasons: readonly string[];
  readonly authorityEnabled: false;
  readonly cutoverMayBeApplied: boolean;
}

export function evaluateV3CutoverReadiness(input: CutoverReadinessInput): CutoverReadinessResult {
  requireText(input.provisionalReferenceSha, 'provisionalReferenceSha');

  const reasons: string[] = [];

  if (input.referenceStatus !== 'ACCEPTED') {
    reasons.push('final V2 reference status must be ACCEPTED');
  }

  if (!input.finalAcceptedReferenceSha?.trim()) {
    reasons.push('final accepted V2 reference SHA is required');
  }

  if (!input.parityReferenceSha?.trim()) {
    reasons.push('parity reference SHA is required');
  }

  if (
    input.finalAcceptedReferenceSha?.trim() &&
    input.parityReferenceSha?.trim() &&
    input.finalAcceptedReferenceSha !== input.parityReferenceSha
  ) {
    reasons.push('parity reference SHA must match final accepted V2 reference SHA');
  }

  if (!input.deltaReviewed) {
    reasons.push('provisional-to-final reference delta must be reviewed');
  }
  if (!input.paritySuitePassed) {
    reasons.push('parity suite must pass against final accepted reference');
  }
  if (input.parityStatus !== 'PASS') reasons.push('V2/V3 parity status must be PASS');
  if (!input.postPortSmokePassed) reasons.push('post-port smoke must pass');
  if (!input.authorityPromotionReviewed) {
    reasons.push('authority promotion must be explicitly reviewed');
  }
  if (!input.humanApprovalVerified) {
    reasons.push('exact human approval must be verified');
  }
  if (input.policyDecision !== 'ALLOW') reasons.push('system policy decision must be ALLOW');

  return {
    status: reasons.length === 0 ? 'READY' : 'BLOCKED',
    reasons,
    authorityEnabled: false,
    cutoverMayBeApplied: reasons.length === 0,
  };
}

export function cutoverReadinessCanEnableAuthority(): false {
  return false;
}

export function cutoverCanBypassFinalReferenceAcceptance(): false {
  return false;
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}
