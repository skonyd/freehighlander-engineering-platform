import { createHash } from 'node:crypto';

export type ModelQualificationStage =
  'DISCOVERED' | 'PROBED' | 'SHADOW_VERIFIED' | 'ELIGIBLE' | 'DEPRECATED' | 'UNAVAILABLE';

export type QualificationRiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface ModelQualificationIdentity {
  readonly providerId: string;
  readonly modelId: string;
  readonly catalogHash: string;
}

export interface CapabilityProbeEvidence {
  readonly evidenceHash: string;
  readonly status: 'PASS' | 'FAIL';
  readonly probedAt: string;
}

export interface ShadowVerificationEvidence {
  readonly evidenceHash: string;
  readonly status: 'PASS' | 'FAIL';
  readonly verifiedAt: string;
  readonly role: string;
  readonly riskTier: QualificationRiskTier;
}

export interface RegressionVerificationEvidence {
  readonly corpusHash: string;
  readonly reportHash: string;
  readonly status: 'PASS' | 'FAIL';
  readonly verifiedAt: string;
}

export interface EligibilityGrant {
  readonly role: string;
  readonly riskTier: QualificationRiskTier;
  readonly grantedAt: string;
  readonly decisionHash: string;
  readonly requiredRegressionCorpusHash?: string;
}

export interface ModelQualificationSnapshotV1 extends ModelQualificationIdentity {
  readonly schemaVersion: 1;
  readonly stage: ModelQualificationStage;
  readonly probe?: CapabilityProbeEvidence;
  readonly shadow?: ShadowVerificationEvidence;
  readonly regression?: RegressionVerificationEvidence;
  readonly eligibility?: EligibilityGrant;
  readonly hash: string;
  readonly authority: 'NONE';
}

export function createDiscoveredQualification(
  identity: ModelQualificationIdentity,
): ModelQualificationSnapshotV1 {
  validateIdentity(identity);
  return finalize({ schemaVersion: 1, ...identity, stage: 'DISCOVERED' });
}

export function recordCapabilityProbe(
  previous: ModelQualificationSnapshotV1,
  evidence: CapabilityProbeEvidence,
): ModelQualificationSnapshotV1 {
  validateSnapshot(previous);
  validateEvidenceHash(evidence.evidenceHash, 'probe evidenceHash');
  const probedAt = normalizeTimestamp(evidence.probedAt, 'probedAt');

  if (previous.stage !== 'DISCOVERED' && previous.stage !== 'PROBED') {
    throw new Error(`cannot record capability probe from stage ${previous.stage}`);
  }

  return finalize({
    ...baseIdentity(previous),
    stage: evidence.status === 'PASS' ? 'PROBED' : 'DISCOVERED',
    probe: { ...evidence, probedAt },
  });
}

export function recordShadowVerification(
  previous: ModelQualificationSnapshotV1,
  evidence: ShadowVerificationEvidence,
): ModelQualificationSnapshotV1 {
  validateSnapshot(previous);
  validateEvidenceHash(evidence.evidenceHash, 'shadow evidenceHash');
  requireId(evidence.role, 'shadow role');
  const verifiedAt = normalizeTimestamp(evidence.verifiedAt, 'verifiedAt');

  if (previous.stage !== 'PROBED' && previous.stage !== 'SHADOW_VERIFIED') {
    throw new Error(`cannot record shadow verification from stage ${previous.stage}`);
  }
  if (previous.probe?.status !== 'PASS') {
    throw new Error('shadow verification requires a passing capability probe');
  }

  return finalize({
    ...baseIdentity(previous),
    stage: evidence.status === 'PASS' ? 'SHADOW_VERIFIED' : 'PROBED',
    probe: previous.probe,
    shadow: { ...evidence, verifiedAt },
  });
}

export function recordRegressionVerification(
  previous: ModelQualificationSnapshotV1,
  evidence: RegressionVerificationEvidence,
): ModelQualificationSnapshotV1 {
  validateSnapshot(previous);
  validateEvidenceHash(evidence.corpusHash, 'regression corpusHash');
  validateEvidenceHash(evidence.reportHash, 'regression reportHash');
  const verifiedAt = normalizeTimestamp(evidence.verifiedAt, 'regression verifiedAt');

  if (previous.stage !== 'SHADOW_VERIFIED') {
    throw new Error(`cannot record regression verification from stage ${previous.stage}`);
  }
  if (previous.probe?.status !== 'PASS') {
    throw new Error('regression verification requires a passing capability probe');
  }
  if (previous.shadow?.status !== 'PASS') {
    throw new Error('regression verification requires passing shadow verification');
  }

  return finalize({
    ...baseIdentity(previous),
    stage: 'SHADOW_VERIFIED',
    probe: previous.probe,
    shadow: previous.shadow,
    regression: { ...evidence, verifiedAt },
  });
}

export function grantModelEligibility(
  previous: ModelQualificationSnapshotV1,
  grant: EligibilityGrant,
): ModelQualificationSnapshotV1 {
  validateSnapshot(previous);
  requireId(grant.role, 'eligibility role');
  validateEvidenceHash(grant.decisionHash, 'eligibility decisionHash');
  if (grant.requiredRegressionCorpusHash !== undefined) {
    validateEvidenceHash(grant.requiredRegressionCorpusHash, 'required regression corpusHash');
  }
  const grantedAt = normalizeTimestamp(grant.grantedAt, 'grantedAt');

  if (previous.stage !== 'SHADOW_VERIFIED' && previous.stage !== 'ELIGIBLE') {
    throw new Error(`cannot grant eligibility from stage ${previous.stage}`);
  }
  if (previous.probe?.status !== 'PASS') {
    throw new Error('eligibility requires a passing capability probe');
  }
  if (previous.shadow?.status !== 'PASS') {
    throw new Error('eligibility requires passing shadow verification');
  }
  if (previous.shadow.role !== grant.role || previous.shadow.riskTier !== grant.riskTier) {
    throw new Error('eligibility role/risk must match shadow verification evidence');
  }
  if (grant.requiredRegressionCorpusHash !== undefined) {
    if (previous.regression?.status !== 'PASS') {
      throw new Error('eligibility requires passing regression verification');
    }
    if (previous.regression.corpusHash !== grant.requiredRegressionCorpusHash) {
      throw new Error('eligibility regression corpus hash mismatch');
    }
  }

  return finalize({
    ...baseIdentity(previous),
    stage: 'ELIGIBLE',
    probe: previous.probe,
    shadow: previous.shadow,
    ...(previous.regression ? { regression: previous.regression } : {}),
    eligibility: { ...grant, grantedAt },
  });
}

export function markQualificationUnavailable(
  previous: ModelQualificationSnapshotV1,
): ModelQualificationSnapshotV1 {
  validateSnapshot(previous);
  return finalize({
    ...baseIdentity(previous),
    stage: 'UNAVAILABLE',
    ...(previous.probe ? { probe: previous.probe } : {}),
    ...(previous.shadow ? { shadow: previous.shadow } : {}),
    ...(previous.regression ? { regression: previous.regression } : {}),
    ...(previous.eligibility ? { eligibility: previous.eligibility } : {}),
  });
}

export function markQualificationDeprecated(
  previous: ModelQualificationSnapshotV1,
): ModelQualificationSnapshotV1 {
  validateSnapshot(previous);
  return finalize({
    ...baseIdentity(previous),
    stage: 'DEPRECATED',
    ...(previous.probe ? { probe: previous.probe } : {}),
    ...(previous.shadow ? { shadow: previous.shadow } : {}),
    ...(previous.regression ? { regression: previous.regression } : {}),
    ...(previous.eligibility ? { eligibility: previous.eligibility } : {}),
  });
}

export function qualificationAllowsBinding(
  snapshot: ModelQualificationSnapshotV1,
  role: string,
  riskTier: QualificationRiskTier,
): boolean {
  validateSnapshot(snapshot);
  return (
    snapshot.stage === 'ELIGIBLE' &&
    snapshot.eligibility?.role === role &&
    snapshot.eligibility.riskTier === riskTier
  );
}

export function validateModelQualificationSnapshotV1(
  snapshot: ModelQualificationSnapshotV1,
): void {
  validateSnapshot(snapshot);
}

export function modelQualificationCanGrantAuthority(): false {
  return false;
}

function baseIdentity(
  previous: ModelQualificationSnapshotV1,
): ModelQualificationIdentity & { readonly schemaVersion: 1 } {
  return {
    schemaVersion: 1,
    providerId: previous.providerId,
    modelId: previous.modelId,
    catalogHash: previous.catalogHash,
  };
}

function finalize(
  input: Omit<ModelQualificationSnapshotV1, 'hash' | 'authority'>,
): ModelQualificationSnapshotV1 {
  const identity = { ...input, authority: 'NONE' as const };
  return { ...identity, hash: sha256Canonical(identity) };
}

function validateSnapshot(snapshot: ModelQualificationSnapshotV1): void {
  validateIdentity(snapshot);
  if (snapshot.schemaVersion !== 1) throw new Error('qualification schemaVersion must be 1');
  if (snapshot.authority !== 'NONE') throw new Error('qualification authority must be NONE');

  if (snapshot.regression !== undefined) {
    validateEvidenceHash(snapshot.regression.corpusHash, 'regression corpusHash');
    validateEvidenceHash(snapshot.regression.reportHash, 'regression reportHash');
    normalizeTimestamp(snapshot.regression.verifiedAt, 'regression verifiedAt');
  }
  if (snapshot.eligibility?.requiredRegressionCorpusHash !== undefined) {
    validateEvidenceHash(
      snapshot.eligibility.requiredRegressionCorpusHash,
      'required regression corpusHash',
    );
  }

  const expected = finalize({
    schemaVersion: 1,
    providerId: snapshot.providerId,
    modelId: snapshot.modelId,
    catalogHash: snapshot.catalogHash,
    stage: snapshot.stage,
    ...(snapshot.probe ? { probe: snapshot.probe } : {}),
    ...(snapshot.shadow ? { shadow: snapshot.shadow } : {}),
    ...(snapshot.regression ? { regression: snapshot.regression } : {}),
    ...(snapshot.eligibility ? { eligibility: snapshot.eligibility } : {}),
  });
  if (expected.hash !== snapshot.hash) throw new Error('qualification snapshot hash mismatch');
}

function validateIdentity(identity: ModelQualificationIdentity): void {
  requireId(identity.providerId, 'providerId');
  requireId(identity.modelId, 'modelId');
  validateEvidenceHash(identity.catalogHash, 'catalogHash');
}

function requireId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function validateEvidenceHash(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${field} must be a 64-character hex hash`);
  }
}

function normalizeTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value.trim() || Number.isNaN(parsed)) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return new Date(parsed).toISOString();
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
