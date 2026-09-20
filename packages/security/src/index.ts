export type SecuritySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FindingState = 'OPEN' | 'REMEDIATED';
export type EvidenceProvenance = 'TRUSTED' | 'UNTRUSTED';
export type SecurityReadinessStatus = 'CLEAR' | 'BLOCKED' | 'INSUFFICIENT_EVIDENCE';

export interface RequiredScanner {
  readonly id: string;
  readonly version: string;
}

export interface SecurityAssessmentPlan {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly repository: string;
  readonly revision: string;
  readonly policyHash: string;
  readonly requiredScanners: readonly RequiredScanner[];
}

export interface ScannerEvidence {
  readonly id: string;
  readonly scannerId: string;
  readonly scannerVersion: string;
  readonly repository: string;
  readonly revision: string;
  readonly policyHash: string;
  readonly provenance: EvidenceProvenance;
  readonly digest: string;
}

export interface SecurityFinding {
  readonly id: string;
  readonly scannerId: string;
  readonly severity: SecuritySeverity;
  readonly controlId: string;
  readonly state: FindingState;
  readonly evidenceDigest: string;
  readonly remediationEvidenceDigest?: string;
}

export interface SecurityAssessment {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly planId: string;
  readonly repository: string;
  readonly revision: string;
  readonly policyHash: string;
  readonly scannerEvidence: readonly ScannerEvidence[];
  readonly findings: readonly SecurityFinding[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface SecurityReadiness {
  readonly status: SecurityReadinessStatus;
  readonly reasons: readonly string[];
  readonly requiredScanners: number;
  readonly trustedScannerEvidence: number;
  readonly openHighFindings: number;
  readonly openCriticalFindings: number;
  readonly authority: 'NONE';
  readonly mergeAuthorized: false;
  readonly releaseAuthorized: false;
  readonly waiverAuthorized: false;
}

export interface SecuritySnapshot extends SecurityReadiness {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly assessmentId: string;
  readonly repository: string;
  readonly revision: string;
  readonly policyHash: string;
  readonly snapshotHash: string;
}

export function validateSecurityPlan(plan: SecurityAssessmentPlan): ValidationResult {
  const errors: string[] = [];

  if (plan.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  requireText(plan.id, 'id', errors);
  requireText(plan.repository, 'repository', errors);
  requireText(plan.revision, 'revision', errors);
  requireSha256(plan.policyHash, 'policyHash', errors);

  const scannerIds = uniqueNonEmpty(
    plan.requiredScanners.map((scanner) => scanner.id),
    'required scanner id',
    errors,
  );
  if (scannerIds.size === 0) errors.push('security plan requires at least one scanner');

  for (const scanner of plan.requiredScanners) {
    requireText(scanner.version, `scanner ${scanner.id || '<missing>'} version`, errors);
  }

  return { valid: errors.length === 0, errors };
}

export function validateSecurityAssessment(
  plan: SecurityAssessmentPlan,
  assessment: SecurityAssessment,
): ValidationResult {
  const planValidation = validateSecurityPlan(plan);
  const errors = [...planValidation.errors];

  if (assessment.schemaVersion !== 1) errors.push('unsupported assessment schemaVersion');
  requireText(assessment.id, 'assessment id', errors);
  requireText(assessment.planId, 'assessment planId', errors);
  requireText(assessment.repository, 'assessment repository', errors);
  requireText(assessment.revision, 'assessment revision', errors);
  requireSha256(assessment.policyHash, 'assessment policyHash', errors);

  if (assessment.planId !== plan.id) errors.push('assessment planId must match security plan');
  if (assessment.repository !== plan.repository) {
    errors.push('assessment repository must match security plan repository');
  }
  if (assessment.revision !== plan.revision) {
    errors.push('assessment revision must match security plan revision');
  }
  if (assessment.policyHash !== plan.policyHash) {
    errors.push('assessment policyHash must match security plan policyHash');
  }

  const requiredScannerById = new Map(plan.requiredScanners.map((scanner) => [scanner.id, scanner]));
  uniqueNonEmpty(
    assessment.scannerEvidence.map((evidence) => evidence.id),
    'scanner evidence id',
    errors,
  );

  for (const evidence of assessment.scannerEvidence) {
    const required = requiredScannerById.get(evidence.scannerId);
    if (!required) {
      errors.push(`scanner evidence ${evidence.id} references unknown scanner ${evidence.scannerId}`);
    } else if (evidence.scannerVersion !== required.version) {
      errors.push(`scanner evidence ${evidence.id} version must match required scanner version`);
    }
    if (evidence.repository !== plan.repository) {
      errors.push(`scanner evidence ${evidence.id} repository must match security plan`);
    }
    if (evidence.revision !== plan.revision) {
      errors.push(`scanner evidence ${evidence.id} revision must match security plan`);
    }
    if (evidence.policyHash !== plan.policyHash) {
      errors.push(`scanner evidence ${evidence.id} policyHash must match security plan`);
    }
    requireSha256(evidence.digest, `scanner evidence ${evidence.id} digest`, errors);
  }

  uniqueNonEmpty(
    assessment.findings.map((finding) => finding.id),
    'security finding id',
    errors,
  );
  for (const finding of assessment.findings) {
    if (!requiredScannerById.has(finding.scannerId)) {
      errors.push(`finding ${finding.id} references unknown scanner ${finding.scannerId}`);
    }
    requireText(finding.controlId, `finding ${finding.id} controlId`, errors);
    requireSha256(finding.evidenceDigest, `finding ${finding.id} evidenceDigest`, errors);

    if (finding.state === 'REMEDIATED') {
      if (!finding.remediationEvidenceDigest) {
        errors.push(`remediated finding ${finding.id} requires remediation evidence`);
      } else {
        requireSha256(
          finding.remediationEvidenceDigest,
          `finding ${finding.id} remediationEvidenceDigest`,
          errors,
        );
      }
    } else if (finding.remediationEvidenceDigest !== undefined) {
      errors.push(`open finding ${finding.id} must not claim remediation evidence`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function evaluateSecurityReadiness(
  plan: SecurityAssessmentPlan,
  assessment: SecurityAssessment,
): SecurityReadiness {
  const validation = validateSecurityAssessment(plan, assessment);
  if (!validation.valid) {
    throw new Error(`invalid security evidence: ${validation.errors.join('; ')}`);
  }

  const trustedEvidenceByScanner = new Map<string, ScannerEvidence>();
  for (const evidence of assessment.scannerEvidence) {
    if (evidence.provenance === 'TRUSTED') {
      trustedEvidenceByScanner.set(evidence.scannerId, evidence);
    }
  }

  const reasons: string[] = [];
  for (const scanner of plan.requiredScanners) {
    if (!trustedEvidenceByScanner.has(scanner.id)) {
      reasons.push(`missing trusted scanner evidence: ${scanner.id}`);
    }
  }

  const openHighFindings = assessment.findings.filter(
    (finding) => finding.state === 'OPEN' && finding.severity === 'HIGH',
  ).length;
  const openCriticalFindings = assessment.findings.filter(
    (finding) => finding.state === 'OPEN' && finding.severity === 'CRITICAL',
  ).length;

  if (openCriticalFindings > 0) reasons.push('open CRITICAL security findings remain');
  if (openHighFindings > 0) reasons.push('open HIGH security findings remain');

  const hasBlockingFinding = openCriticalFindings > 0 || openHighFindings > 0;
  const hasCompleteTrustedEvidence =
    trustedEvidenceByScanner.size === plan.requiredScanners.length;

  return {
    status: hasBlockingFinding
      ? 'BLOCKED'
      : hasCompleteTrustedEvidence
        ? 'CLEAR'
        : 'INSUFFICIENT_EVIDENCE',
    reasons,
    requiredScanners: plan.requiredScanners.length,
    trustedScannerEvidence: trustedEvidenceByScanner.size,
    openHighFindings,
    openCriticalFindings,
    authority: 'NONE',
    mergeAuthorized: false,
    releaseAuthorized: false,
    waiverAuthorized: false,
  };
}

export async function buildSecuritySnapshot(
  plan: SecurityAssessmentPlan,
  assessment: SecurityAssessment,
): Promise<SecuritySnapshot> {
  const readiness = evaluateSecurityReadiness(plan, assessment);
  const snapshotHash = await sha256Hex(canonicalJson({ plan, assessment }));

  return {
    schemaVersion: 1,
    planId: plan.id,
    assessmentId: assessment.id,
    repository: plan.repository,
    revision: plan.revision,
    policyHash: plan.policyHash,
    snapshotHash,
    ...readiness,
  };
}

export function securityCanGrantAuthority(): false {
  return false;
}

export function securityCanWaiveFinding(): false {
  return false;
}

export function securityClearCanAuthorizeRelease(): false {
  return false;
}

export function securityCanExecuteProductionMutation(): false {
  return false;
}

function uniqueNonEmpty(values: readonly string[], kind: string, errors: string[]): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.trim()) {
      errors.push(`${kind} must not be empty`);
      continue;
    }
    if (seen.has(value)) errors.push(`duplicate ${kind}: ${value}`);
    seen.add(value);
  }
  return seen;
}

function requireText(value: string, name: string, errors: string[]): void {
  if (!value.trim()) errors.push(`${name} is required`);
}

function requireSha256(value: string, name: string, errors: string[]): void {
  if (!/^[a-f0-9]{64}$/.test(value)) errors.push(`${name} must be lowercase sha256`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
