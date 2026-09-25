import { createHash } from 'node:crypto';

export type SemanticCheckpointBoundary =
  | 'IMPLEMENTATION_TO_REVIEW'
  | 'REPAIR_TO_REVIEW'
  | 'STABLE_COMMIT';

export interface SemanticCheckpointInput {
  readonly boundary: SemanticCheckpointBoundary;
  readonly logicalRole: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly policyHash: string;
  readonly bindingPlanHash: string;
  readonly authoritativeStateHashes: readonly string[];
  readonly artifactReferences: readonly string[];
}

export interface SemanticCheckpoint {
  readonly schemaVersion: 1;
  readonly boundary: SemanticCheckpointBoundary;
  readonly logicalRole: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly policyHash: string;
  readonly bindingPlanHash: string;
  readonly authoritativeStateHashes: readonly string[];
  readonly artifactReferences: readonly string[];
  readonly checkpointHash: string;
  readonly authority: 'NONE';
}

export interface FreshContextResetInput {
  readonly checkpoint: SemanticCheckpoint;
  readonly stablePrefixHash: string;
  readonly taskHash: string;
  readonly requiredAuthoritativeStateHashes: readonly string[];
  readonly selectedArtifactReferences: readonly string[];
}

export interface FreshContextReset {
  readonly schemaVersion: 1;
  readonly checkpointHash: string;
  readonly stablePrefixHash: string;
  readonly taskHash: string;
  readonly authoritativeStateHashes: readonly string[];
  readonly artifactReferences: readonly string[];
  readonly previousTrajectoryIncluded: false;
  readonly resetHash: string;
  readonly authority: 'NONE';
}

export function createSemanticCheckpoint(input: SemanticCheckpointInput): SemanticCheckpoint {
  const boundary = validateBoundary(input.boundary);
  const logicalRole = requireText(input.logicalRole, 'logicalRole');
  const exactRevision = requireText(input.exactRevision, 'exactRevision');
  const runSnapshotHash = requireSha256(input.runSnapshotHash, 'runSnapshotHash');
  const policyHash = requireSha256(input.policyHash, 'policyHash');
  const bindingPlanHash = requireSha256(input.bindingPlanHash, 'bindingPlanHash');
  const authoritativeStateHashes = uniqueSortedHashes(
    input.authoritativeStateHashes,
    'authoritativeStateHashes',
  );
  const artifactReferences = uniqueSortedText(input.artifactReferences, 'artifactReferences');

  if (authoritativeStateHashes.length === 0) {
    throw new Error('semantic checkpoint requires authoritative state');
  }

  const identity = {
    schemaVersion: 1,
    boundary,
    logicalRole,
    exactRevision,
    runSnapshotHash,
    policyHash,
    bindingPlanHash,
    authoritativeStateHashes,
    artifactReferences,
  } as const;

  return {
    ...identity,
    checkpointHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function validateSemanticCheckpoint(checkpoint: SemanticCheckpoint): void {
  if (checkpoint.schemaVersion !== 1) {
    throw new Error('semantic checkpoint schemaVersion must be 1');
  }
  if (checkpoint.authority !== 'NONE') {
    throw new Error('semantic checkpoint authority must be NONE');
  }

  const rebuilt = createSemanticCheckpoint({
    boundary: checkpoint.boundary,
    logicalRole: checkpoint.logicalRole,
    exactRevision: checkpoint.exactRevision,
    runSnapshotHash: checkpoint.runSnapshotHash,
    policyHash: checkpoint.policyHash,
    bindingPlanHash: checkpoint.bindingPlanHash,
    authoritativeStateHashes: checkpoint.authoritativeStateHashes,
    artifactReferences: checkpoint.artifactReferences,
  });

  if (rebuilt.checkpointHash !== checkpoint.checkpointHash) {
    throw new Error('semantic checkpoint hash mismatch');
  }
}

export function buildFreshContextReset(input: FreshContextResetInput): FreshContextReset {
  validateSemanticCheckpoint(input.checkpoint);

  const stablePrefixHash = requireSha256(input.stablePrefixHash, 'stablePrefixHash');
  const taskHash = requireSha256(input.taskHash, 'taskHash');
  const requiredAuthoritativeStateHashes = uniqueSortedHashes(
    input.requiredAuthoritativeStateHashes,
    'requiredAuthoritativeStateHashes',
  );
  const selectedArtifactReferences = uniqueSortedText(
    input.selectedArtifactReferences,
    'selectedArtifactReferences',
  );

  const availableState = new Set(input.checkpoint.authoritativeStateHashes);
  for (const hash of requiredAuthoritativeStateHashes) {
    if (!availableState.has(hash)) {
      throw new Error('fresh context reset is missing required authoritative state');
    }
  }

  const availableArtifacts = new Set(input.checkpoint.artifactReferences);
  for (const reference of selectedArtifactReferences) {
    if (!availableArtifacts.has(reference)) {
      throw new Error('fresh context reset references unknown checkpoint artifact');
    }
  }

  const identity = {
    schemaVersion: 1,
    checkpointHash: input.checkpoint.checkpointHash,
    stablePrefixHash,
    taskHash,
    authoritativeStateHashes: requiredAuthoritativeStateHashes,
    artifactReferences: selectedArtifactReferences,
    previousTrajectoryIncluded: false,
  } as const;

  return {
    ...identity,
    resetHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function semanticCheckpointCanGrantAuthority(): false {
  return false;
}

export function semanticCheckpointCanReplaceRequiredRawEvidence(): false {
  return false;
}

export function freshContextResetCarriesPreviousTrajectory(): false {
  return false;
}

function validateBoundary(value: string): SemanticCheckpointBoundary {
  if (
    value !== 'IMPLEMENTATION_TO_REVIEW' &&
    value !== 'REPAIR_TO_REVIEW' &&
    value !== 'STABLE_COMMIT'
  ) {
    throw new Error('semantic checkpoint boundary is invalid');
  }
  return value;
}

function uniqueSortedHashes(values: readonly string[], field: string): readonly string[] {
  const normalized = values.map((value) => requireSha256(value, field));
  return [...new Set(normalized)].sort();
}

function uniqueSortedText(values: readonly string[], field: string): readonly string[] {
  const normalized = values.map((value) => requireText(value, field));
  return [...new Set(normalized)].sort();
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function requireSha256(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`${field} must be lowercase sha256`);
  }
  return normalized;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
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
