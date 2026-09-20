export type ReleaseReadinessStatus = 'READY' | 'BLOCKED' | 'INSUFFICIENT_EVIDENCE';
export type ReleaseEvidenceKind = 'DEVELOPMENT' | 'TESTING' | 'SECURITY' | 'BUILD' | 'PROVENANCE';
export type ReleaseEvidenceState = 'PASS' | 'FAIL' | 'INSUFFICIENT_EVIDENCE';
export type ReleaseEvidenceProvenance = 'TRUSTED' | 'UNTRUSTED';

export interface ReleaseArtifact {
  readonly id: string;
  readonly path: string;
  readonly digest: string;
  readonly mediaType: string;
}

export interface ArtifactManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly repository: string;
  readonly sourceRevision: string;
  readonly buildRevision: string;
  readonly artifacts: readonly ReleaseArtifact[];
}

export interface ReleaseEvidenceRef {
  readonly id: string;
  readonly kind: ReleaseEvidenceKind;
  readonly repository: string;
  readonly revision: string;
  readonly digest: string;
  readonly provenance: ReleaseEvidenceProvenance;
  readonly state: ReleaseEvidenceState;
}

export interface RollbackPlan {
  readonly id: string;
  readonly version: number;
  readonly targetRevision: string;
  readonly steps: readonly string[];
  readonly verified: boolean;
}

export interface ReleaseCandidate {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly repository: string;
  readonly sourceRevision: string;
  readonly buildRevision: string;
  readonly artifactManifestId: string;
  readonly evidence: readonly ReleaseEvidenceRef[];
  readonly rollbackPlan: RollbackPlan;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface ReleaseReadiness {
  readonly status: ReleaseReadinessStatus;
  readonly reasons: readonly string[];
  readonly requiredEvidenceKinds: number;
  readonly trustedPassingEvidenceKinds: number;
  readonly artifacts: number;
  readonly rollbackVerified: boolean;
  readonly authority: 'NONE';
  readonly mergeAuthorized: false;
  readonly releaseAuthorized: false;
  readonly deployAuthorized: false;
  readonly rollbackAuthorized: false;
}

export interface ReleaseSnapshot extends ReleaseReadiness {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly repository: string;
  readonly sourceRevision: string;
  readonly buildRevision: string;
  readonly snapshotHash: string;
}

const REQUIRED_EVIDENCE: readonly ReleaseEvidenceKind[] = [
  'DEVELOPMENT',
  'TESTING',
  'SECURITY',
  'BUILD',
  'PROVENANCE',
];

export function validateArtifactManifest(manifest: ArtifactManifest): ValidationResult {
  const errors: string[] = [];

  if (manifest.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  requireText(manifest.id, 'manifest id', errors);
  requireText(manifest.repository, 'manifest repository', errors);
  requireText(manifest.sourceRevision, 'manifest sourceRevision', errors);
  requireText(manifest.buildRevision, 'manifest buildRevision', errors);

  uniqueNonEmpty(
    manifest.artifacts.map((artifact) => artifact.id),
    'artifact id',
    errors,
  );

  if (manifest.artifacts.length === 0) errors.push('artifact manifest requires artifacts');

  for (const artifact of manifest.artifacts) {
    requireText(artifact.path, `artifact ${artifact.id} path`, errors);
    requireText(artifact.mediaType, `artifact ${artifact.id} mediaType`, errors);
    requireSha256(artifact.digest, `artifact ${artifact.id} digest`, errors);
  }

  return { valid: errors.length === 0, errors };
}

export function validateReleaseCandidate(
  manifest: ArtifactManifest,
  candidate: ReleaseCandidate,
): ValidationResult {
  const manifestValidation = validateArtifactManifest(manifest);
  const errors = [...manifestValidation.errors];

  if (candidate.schemaVersion !== 1) errors.push('unsupported release candidate schemaVersion');
  requireText(candidate.id, 'candidate id', errors);
  requireText(candidate.repository, 'candidate repository', errors);
  requireText(candidate.sourceRevision, 'candidate sourceRevision', errors);
  requireText(candidate.buildRevision, 'candidate buildRevision', errors);
  requireText(candidate.artifactManifestId, 'candidate artifactManifestId', errors);

  if (candidate.artifactManifestId !== manifest.id) {
    errors.push('candidate artifactManifestId must match manifest id');
  }
  if (candidate.repository !== manifest.repository) {
    errors.push('candidate repository must match manifest repository');
  }
  if (candidate.sourceRevision !== manifest.sourceRevision) {
    errors.push('candidate sourceRevision must match manifest sourceRevision');
  }
  if (candidate.buildRevision !== manifest.buildRevision) {
    errors.push('candidate buildRevision must match manifest buildRevision');
  }

  uniqueNonEmpty(
    candidate.evidence.map((entry) => entry.id),
    'release evidence id',
    errors,
  );

  for (const evidence of candidate.evidence) {
    if (evidence.repository !== candidate.repository) {
      errors.push(`release evidence ${evidence.id} repository must match candidate repository`);
    }
    if (evidence.revision !== candidate.sourceRevision) {
      errors.push(`release evidence ${evidence.id} revision must match candidate sourceRevision`);
    }
    requireSha256(evidence.digest, `release evidence ${evidence.id} digest`, errors);
  }

  requireText(candidate.rollbackPlan.id, 'rollback plan id', errors);
  requireText(candidate.rollbackPlan.targetRevision, 'rollback targetRevision', errors);
  if (!Number.isInteger(candidate.rollbackPlan.version) || candidate.rollbackPlan.version < 1) {
    errors.push('rollback plan version must be a positive integer');
  }
  uniqueNonEmpty(candidate.rollbackPlan.steps, 'rollback step', errors);
  if (candidate.rollbackPlan.steps.length === 0) errors.push('rollback plan requires steps');

  return { valid: errors.length === 0, errors };
}

export function evaluateReleaseReadiness(
  manifest: ArtifactManifest,
  candidate: ReleaseCandidate,
): ReleaseReadiness {
  const validation = validateReleaseCandidate(manifest, candidate);
  if (!validation.valid) {
    throw new Error(`invalid release evidence: ${validation.errors.join('; ')}`);
  }

  const reasons: string[] = [];
  const passingKinds = new Set<ReleaseEvidenceKind>();
  let hasFailure = false;

  for (const kind of REQUIRED_EVIDENCE) {
    const matches = candidate.evidence.filter((entry) => entry.kind === kind);
    const trustedPass = matches.some(
      (entry) => entry.provenance === 'TRUSTED' && entry.state === 'PASS',
    );
    const failed = matches.some((entry) => entry.state === 'FAIL');

    if (failed) {
      hasFailure = true;
      reasons.push(`${kind} evidence is FAIL`);
    } else if (!trustedPass) {
      reasons.push(`missing trusted PASS evidence: ${kind}`);
    } else {
      passingKinds.add(kind);
    }
  }

  if (!candidate.rollbackPlan.verified) {
    reasons.push('rollback plan is not verified');
  }

  const complete =
    passingKinds.size === REQUIRED_EVIDENCE.length && candidate.rollbackPlan.verified;

  return {
    status: hasFailure ? 'BLOCKED' : complete ? 'READY' : 'INSUFFICIENT_EVIDENCE',
    reasons,
    requiredEvidenceKinds: REQUIRED_EVIDENCE.length,
    trustedPassingEvidenceKinds: passingKinds.size,
    artifacts: manifest.artifacts.length,
    rollbackVerified: candidate.rollbackPlan.verified,
    authority: 'NONE',
    mergeAuthorized: false,
    releaseAuthorized: false,
    deployAuthorized: false,
    rollbackAuthorized: false,
  };
}

export async function buildReleaseSnapshot(
  manifest: ArtifactManifest,
  candidate: ReleaseCandidate,
): Promise<ReleaseSnapshot> {
  const readiness = evaluateReleaseReadiness(manifest, candidate);
  const snapshotHash = await sha256Hex(canonicalJson({ manifest, candidate }));

  return {
    schemaVersion: 1,
    candidateId: candidate.id,
    repository: candidate.repository,
    sourceRevision: candidate.sourceRevision,
    buildRevision: candidate.buildRevision,
    snapshotHash,
    ...readiness,
  };
}

export function releaseCanGrantAuthority(): false {
  return false;
}

export function releaseReadyCanAuthorizeDeployment(): false {
  return false;
}

export function releaseCanPublishTagOrRelease(): false {
  return false;
}

export function releaseCanExecuteRollback(): false {
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
