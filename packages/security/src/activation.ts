import {
  createHumanApprovalRequest,
  evaluatePolicy,
  publishPolicy,
  verifyHumanDecisionBinding,
  type HumanApprovalRequest,
  type HumanDecision,
} from '@freehighlander/governance';

import {
  buildSecuritySnapshot,
  evaluateSecurityReadiness,
  type RequiredScanner,
  type ScannerEvidence,
  type SecurityAssessment,
  type SecurityAssessmentPlan,
  type SecurityFinding,
  type SecurityReadinessStatus,
  type SecuritySeverity,
  type SecuritySnapshot,
  validateSecurityAssessment,
  validateSecurityPlan,
} from './index.js';

export interface SecurityScannerExecutionRequestV1 {
  readonly schemaVersion: 1;
  readonly scannerId: string;
  readonly scannerVersion: string;
  readonly repository: string;
  readonly revision: string;
  readonly policyHash: string;
}

export interface SecurityScannerFindingV1 {
  readonly id: string;
  readonly severity: SecuritySeverity;
  readonly controlId: string;
  readonly state: 'OPEN' | 'REMEDIATED';
  readonly remediationPayload?: string;
}

export interface SecurityScannerExecutionOutcomeV1 {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly evidencePayload: string;
  readonly findings: readonly SecurityScannerFindingV1[];
}

export interface SecurityScannerExecutorV1 {
  readonly id: string;
  execute(
    request: SecurityScannerExecutionRequestV1,
    scanner: RequiredScanner,
  ): Promise<SecurityScannerExecutionOutcomeV1>;
}

export interface AuthoritativeSecurityAssessmentOptionsV1 {
  readonly assessmentId: string;
  readonly observedRevision: string;
  readonly observedPolicyHash: string;
}

export interface AuthoritativeSecurityAssessmentResultV1 {
  readonly schemaVersion: 1;
  readonly assessment: SecurityAssessment;
  readonly snapshot: SecuritySnapshot;
  readonly executorId: string;
  readonly authority: 'NONE';
  readonly waiverAuthorized: false;
  readonly releaseAuthorized: false;
}

export interface SecurityWaiverApprovalPacketV1 {
  readonly schemaVersion: 1;
  readonly findingId: string;
  readonly repository: string;
  readonly revision: string;
  readonly securityPolicyHash: string;
  readonly securitySnapshotHash: string;
  readonly request: HumanApprovalRequest;
  readonly authority: 'HUMAN_REQUIRED';
}

export interface ApprovedSecurityWaiverV1 {
  readonly schemaVersion: 1;
  readonly findingId: string;
  readonly repository: string;
  readonly revision: string;
  readonly securityPolicyHash: string;
  readonly securitySnapshotHash: string;
  readonly requestHash: string;
  readonly decisionHash: string;
  readonly approverId: string;
  readonly authority: 'HUMAN_APPROVED_POLICY_BOUND';
}

export interface SecurityGateWithWaiversV1 {
  readonly schemaVersion: 1;
  readonly status: SecurityReadinessStatus;
  readonly reasons: readonly string[];
  readonly openHighFindings: number;
  readonly openCriticalFindings: number;
  readonly waivedHighFindings: number;
  readonly waivedCriticalFindings: number;
  readonly trustedScannerEvidence: number;
  readonly authority: 'NONE';
  readonly mergeAuthorized: false;
  readonly releaseAuthorized: false;
}

export async function runAuthoritativeSecurityAssessmentV1(
  plan: SecurityAssessmentPlan,
  executor: SecurityScannerExecutorV1,
  options: AuthoritativeSecurityAssessmentOptionsV1,
): Promise<AuthoritativeSecurityAssessmentResultV1> {
  validateAssessmentInputs(plan, executor, options);

  const scannerEvidence: ScannerEvidence[] = [];
  const findings: SecurityFinding[] = [];

  for (const scanner of plan.requiredScanners) {
    let outcome: SecurityScannerExecutionOutcomeV1 | null = null;
    try {
      outcome = await executor.execute(
        {
          schemaVersion: 1,
          scannerId: scanner.id,
          scannerVersion: scanner.version,
          repository: plan.repository,
          revision: plan.revision,
          policyHash: plan.policyHash,
        },
        scanner,
      );
      validateScannerOutcome(outcome);
    } catch {
      outcome = null;
    }

    if (outcome === null) {
      scannerEvidence.push({
        id: 'scanner-error-' + scanner.id,
        scannerId: scanner.id,
        scannerVersion: scanner.version,
        repository: plan.repository,
        revision: plan.revision,
        policyHash: plan.policyHash,
        provenance: 'UNTRUSTED',
        digest: await sha256Hex(
          JSON.stringify(['SCANNER_ERROR', scanner.id, scanner.version, plan.revision]),
        ),
      });
      continue;
    }

    const evidenceDigest = await sha256Hex(outcome.evidencePayload);
    scannerEvidence.push({
      id: outcome.evidenceId,
      scannerId: scanner.id,
      scannerVersion: scanner.version,
      repository: plan.repository,
      revision: plan.revision,
      policyHash: plan.policyHash,
      provenance: 'TRUSTED',
      digest: evidenceDigest,
    });

    for (const finding of outcome.findings) {
      findings.push({
        id: finding.id,
        scannerId: scanner.id,
        severity: finding.severity,
        controlId: finding.controlId,
        state: finding.state,
        evidenceDigest,
        ...(finding.state === 'REMEDIATED'
          ? {
              remediationEvidenceDigest: await sha256Hex(
                requireRemediationPayload(finding.remediationPayload),
              ),
            }
          : {}),
      });
    }
  }

  const assessment: SecurityAssessment = {
    schemaVersion: 1,
    id: options.assessmentId,
    planId: plan.id,
    repository: plan.repository,
    revision: plan.revision,
    policyHash: plan.policyHash,
    scannerEvidence,
    findings,
  };
  const validation = validateSecurityAssessment(plan, assessment);
  if (!validation.valid) {
    throw new Error('authoritative security assessment invalid: ' + validation.errors.join('; '));
  }

  return {
    schemaVersion: 1,
    assessment,
    snapshot: await buildSecuritySnapshot(plan, assessment),
    executorId: executor.id,
    authority: 'NONE',
    waiverAuthorized: false,
    releaseAuthorized: false,
  };
}

export async function createSecurityWaiverApprovalPacketV1(
  plan: SecurityAssessmentPlan,
  assessment: SecurityAssessment,
  snapshot: SecuritySnapshot,
  findingId: string,
): Promise<SecurityWaiverApprovalPacketV1> {
  const validation = validateSecurityAssessment(plan, assessment);
  if (!validation.valid) {
    throw new Error('invalid security assessment: ' + validation.errors.join('; '));
  }
  await assertSnapshotBinding(plan, assessment, snapshot);

  const finding = assessment.findings.find((item) => item.id === findingId);
  if (!finding) throw new Error('security waiver finding does not exist');
  if (finding.state !== 'OPEN') throw new Error('security waiver requires an OPEN finding');

  const policy = publishSecurityWaiverPolicyV1();
  const decision = evaluatePolicy(policy, {
    action: 'security:waive-finding',
    riskTier: 'CRITICAL',
    principalKind: 'HUMAN',
    dataClassification: 'INTERNAL',
  });
  const request = createHumanApprovalRequest({
    policyDecision: decision,
    runSnapshotHash: snapshot.snapshotHash,
    repository: plan.repository,
    revision: plan.revision,
    action: 'security:waive-finding',
    riskTier: 'CRITICAL',
    evidenceHash: finding.evidenceDigest,
  });

  return {
    schemaVersion: 1,
    findingId,
    repository: plan.repository,
    revision: plan.revision,
    securityPolicyHash: plan.policyHash,
    securitySnapshotHash: snapshot.snapshotHash,
    request,
    authority: 'HUMAN_REQUIRED',
  };
}

export function verifySecurityWaiverApprovalV1(
  packet: SecurityWaiverApprovalPacketV1,
  decision: HumanDecision,
  observed: {
    readonly repository: string;
    readonly revision: string;
    readonly securityPolicyHash: string;
    readonly securitySnapshotHash: string;
  },
): ApprovedSecurityWaiverV1 {
  if (!verifyHumanDecisionBinding(packet.request, decision)) {
    throw new Error('security waiver human decision binding is invalid');
  }
  if (decision.decision !== 'APPROVE') throw new Error('security waiver human decision is not APPROVE');
  if (
    observed.repository !== packet.repository ||
    observed.revision !== packet.revision ||
    observed.securityPolicyHash !== packet.securityPolicyHash ||
    observed.securitySnapshotHash !== packet.securitySnapshotHash
  ) {
    throw new Error('security waiver approval is stale');
  }
  if (
    packet.request.repository !== packet.repository ||
    packet.request.revision !== packet.revision ||
    packet.request.runSnapshotHash !== packet.securitySnapshotHash ||
    packet.request.action !== 'security:waive-finding'
  ) {
    throw new Error('security waiver approval packet binding is invalid');
  }

  return {
    schemaVersion: 1,
    findingId: packet.findingId,
    repository: packet.repository,
    revision: packet.revision,
    securityPolicyHash: packet.securityPolicyHash,
    securitySnapshotHash: packet.securitySnapshotHash,
    requestHash: packet.request.requestHash,
    decisionHash: decision.decisionHash,
    approverId: decision.approverId,
    authority: 'HUMAN_APPROVED_POLICY_BOUND',
  };
}

export async function evaluateSecurityGateWithWaiversV1(
  plan: SecurityAssessmentPlan,
  assessment: SecurityAssessment,
  snapshot: SecuritySnapshot,
  waivers: readonly ApprovedSecurityWaiverV1[],
): Promise<SecurityGateWithWaiversV1> {
  await assertSnapshotBinding(plan, assessment, snapshot);
  const baseline = evaluateSecurityReadiness(plan, assessment);
  const validWaivedIds = new Set(
    waivers
      .filter(
        (waiver) =>
          waiver.repository === plan.repository &&
          waiver.revision === plan.revision &&
          waiver.securityPolicyHash === plan.policyHash &&
          waiver.securitySnapshotHash === snapshot.snapshotHash,
      )
      .map((waiver) => waiver.findingId),
  );

  const openHigh = assessment.findings.filter(
    (finding) =>
      finding.state === 'OPEN' &&
      finding.severity === 'HIGH' &&
      !validWaivedIds.has(finding.id),
  ).length;
  const openCritical = assessment.findings.filter(
    (finding) =>
      finding.state === 'OPEN' &&
      finding.severity === 'CRITICAL' &&
      !validWaivedIds.has(finding.id),
  ).length;
  const waivedHigh = assessment.findings.filter(
    (finding) =>
      finding.state === 'OPEN' &&
      finding.severity === 'HIGH' &&
      validWaivedIds.has(finding.id),
  ).length;
  const waivedCritical = assessment.findings.filter(
    (finding) =>
      finding.state === 'OPEN' &&
      finding.severity === 'CRITICAL' &&
      validWaivedIds.has(finding.id),
  ).length;

  const reasons = baseline.reasons.filter(
    (reason) =>
      reason !== 'open HIGH security findings remain' &&
      reason !== 'open CRITICAL security findings remain',
  );
  if (openCritical > 0) reasons.push('open CRITICAL security findings remain');
  if (openHigh > 0) reasons.push('open HIGH security findings remain');

  const completeEvidence = baseline.trustedScannerEvidence === baseline.requiredScanners;
  return {
    schemaVersion: 1,
    status:
      openCritical > 0 || openHigh > 0
        ? 'BLOCKED'
        : completeEvidence
          ? 'CLEAR'
          : 'INSUFFICIENT_EVIDENCE',
    reasons,
    openHighFindings: openHigh,
    openCriticalFindings: openCritical,
    waivedHighFindings: waivedHigh,
    waivedCriticalFindings: waivedCritical,
    trustedScannerEvidence: baseline.trustedScannerEvidence,
    authority: 'NONE',
    mergeAuthorized: false,
    releaseAuthorized: false,
  };
}

export function securityScannerCanSelfApproveWaiver(): false {
  return false;
}

export function securityModelCanSelfApproveWaiver(): false {
  return false;
}

export function securityWaiverCanAuthorizeReleaseDirectly(): false {
  return false;
}

function publishSecurityWaiverPolicyV1() {
  return publishPolicy({
    id: 'security-waiver',
    version: '1.0.0',
    rules: [
      {
        id: 'deny-model-waiver',
        actions: ['security:waive-finding'],
        riskTiers: ['CRITICAL'],
        principalKinds: ['MODEL'],
        dataClassifications: ['INTERNAL'],
        effect: 'DENY',
      },
      {
        id: 'require-human-waiver',
        actions: ['security:waive-finding'],
        riskTiers: ['CRITICAL'],
        principalKinds: ['HUMAN'],
        dataClassifications: ['INTERNAL'],
        effect: 'HUMAN_REQUIRED',
      },
      {
        id: 'allow-system-waiver-application',
        actions: ['security:waive-finding'],
        riskTiers: ['CRITICAL'],
        principalKinds: ['SYSTEM'],
        dataClassifications: ['INTERNAL'],
        effect: 'ALLOW',
      },
    ],
  });
}

function validateAssessmentInputs(
  plan: SecurityAssessmentPlan,
  executor: SecurityScannerExecutorV1,
  options: AuthoritativeSecurityAssessmentOptionsV1,
): void {
  const validation = validateSecurityPlan(plan);
  if (!validation.valid) throw new Error('invalid security plan: ' + validation.errors.join('; '));
  if (!executor || typeof executor.execute !== 'function') throw new Error('security scanner executor is required');
  requireIdentifier(executor.id, 'executor id');
  requireIdentifier(options.assessmentId, 'assessment id');
  if (options.observedRevision !== plan.revision) {
    throw new Error('observed revision does not match security plan revision');
  }
  if (options.observedPolicyHash !== plan.policyHash) {
    throw new Error('observed policy does not match security plan policy');
  }
}

function validateScannerOutcome(outcome: SecurityScannerExecutionOutcomeV1): void {
  if (!outcome || outcome.schemaVersion !== 1) throw new Error('invalid scanner execution outcome');
  requireIdentifier(outcome.evidenceId, 'scanner evidence id');
  if (typeof outcome.evidencePayload !== 'string' || outcome.evidencePayload.length > 1024 * 1024) {
    throw new Error('scanner evidence payload must be a bounded string');
  }
  if (!Array.isArray(outcome.findings)) throw new Error('scanner findings must be an array');
  const ids = new Set<string>();
  for (const finding of outcome.findings) {
    requireIdentifier(finding.id, 'security finding id');
    if (ids.has(finding.id)) throw new Error('duplicate scanner finding id');
    ids.add(finding.id);
    if (!['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(finding.severity)) {
      throw new Error('invalid security finding severity');
    }
    requireIdentifier(finding.controlId, 'security control id');
    if (!['OPEN', 'REMEDIATED'].includes(finding.state)) {
      throw new Error('invalid security finding state');
    }
    if (finding.state === 'REMEDIATED') requireRemediationPayload(finding.remediationPayload);
    if (finding.state === 'OPEN' && finding.remediationPayload !== undefined) {
      throw new Error('OPEN security finding cannot contain remediation payload');
    }
  }
}

async function assertSnapshotBinding(
  plan: SecurityAssessmentPlan,
  assessment: SecurityAssessment,
  snapshot: SecuritySnapshot,
): Promise<void> {
  const expected = await buildSecuritySnapshot(plan, assessment);
  if (
    snapshot.planId !== plan.id ||
    snapshot.assessmentId !== assessment.id ||
    snapshot.repository !== plan.repository ||
    snapshot.revision !== plan.revision ||
    snapshot.policyHash !== plan.policyHash ||
    snapshot.snapshotHash !== expected.snapshotHash
  ) {
    throw new Error('security snapshot binding is stale');
  }
}

function requireRemediationPayload(value: string | undefined): string {
  if (!value || value.length > 1024 * 1024) {
    throw new Error('remediated finding requires bounded remediation payload');
  }
  return value;
}

function requireIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(value)) {
    throw new Error(field + ' must be a bounded identifier');
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
