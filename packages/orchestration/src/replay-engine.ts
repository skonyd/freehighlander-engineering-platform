import { createHash } from 'node:crypto';

export type ReplayMode = 'REPLAY' | 'SIMULATION';

export interface RecordedNodeOutcome {
  readonly sequence: number;
  readonly nodeId: string;
  readonly state: 'PASSED' | 'FAILED' | 'BLOCKED' | 'HUMAN_REQUIRED';
  readonly inputHash: string;
  readonly outputHash?: string;
  readonly artifactHashes?: readonly string[];
}

export interface ReplayManifestInput {
  readonly runId: string;
  readonly exactRevision: string;
  readonly workflowHash: string;
  readonly runSnapshotHash: string;
  readonly policyHash: string;
  readonly artifactRootHashes: readonly string[];
  readonly outcomes: readonly RecordedNodeOutcome[];
}

export interface ReplayManifest {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly exactRevision: string;
  readonly workflowHash: string;
  readonly runSnapshotHash: string;
  readonly policyHash: string;
  readonly artifactRootHashes: readonly string[];
  readonly outcomes: readonly RecordedNodeOutcome[];
  readonly manifestHash: string;
}

export interface ReplayContext {
  readonly exactRevision: string;
  readonly workflowHash: string;
  readonly runSnapshotHash: string;
  readonly policyHash: string;
  readonly artifactRootHashes: readonly string[];
}

export interface ReplayValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface ReplayStepResult {
  readonly nodeId: string;
  readonly expectedState: RecordedNodeOutcome['state'];
  readonly observedInputHash: string;
  readonly expectedInputHash: string;
  readonly divergent: boolean;
}

export interface RecoveryCheckpointInput {
  readonly runId: string;
  readonly exactRevision: string;
  readonly workflowHash: string;
  readonly runSnapshotHash: string;
  readonly replayManifestHash: string;
  readonly completedSequence: number;
  readonly nodeStates: Readonly<Record<string, string>>;
  readonly artifactHashes: readonly string[];
}

export interface RecoveryCheckpoint extends RecoveryCheckpointInput {
  readonly schemaVersion: 1;
  readonly checkpointHash: string;
}

export function buildReplayManifest(input: ReplayManifestInput): ReplayManifest {
  requireText(input.runId, 'runId');
  requireText(input.exactRevision, 'exactRevision');
  requireHash(input.workflowHash, 'workflowHash');
  requireHash(input.runSnapshotHash, 'runSnapshotHash');
  requireHash(input.policyHash, 'policyHash');

  const artifactRootHashes = uniqueHashes(input.artifactRootHashes, 'artifactRootHashes');
  const outcomes = normalizeOutcomes(input.outcomes);
  const identity = {
    schemaVersion: 1,
    runId: input.runId,
    exactRevision: input.exactRevision,
    workflowHash: input.workflowHash,
    runSnapshotHash: input.runSnapshotHash,
    policyHash: input.policyHash,
    artifactRootHashes,
    outcomes,
  } as const;

  return {
    ...identity,
    manifestHash: sha256(canonicalJson(identity)),
  };
}

export function validateReplayContext(
  manifest: ReplayManifest,
  context: ReplayContext,
): ReplayValidation {
  const errors: string[] = [];
  if (manifest.exactRevision !== context.exactRevision) errors.push('exact revision mismatch');
  if (manifest.workflowHash !== context.workflowHash) errors.push('workflow hash mismatch');
  if (manifest.runSnapshotHash !== context.runSnapshotHash)
    errors.push('run snapshot hash mismatch');
  if (manifest.policyHash !== context.policyHash) errors.push('policy hash mismatch');

  const expectedRoots = [...manifest.artifactRootHashes].sort();
  const actualRoots = uniqueHashes(context.artifactRootHashes, 'artifactRootHashes').sort();
  if (canonicalJson(expectedRoots) !== canonicalJson(actualRoots)) {
    errors.push('artifact root hash mismatch');
  }

  return { valid: errors.length === 0, errors };
}

export function replayStep(
  manifest: ReplayManifest,
  sequence: number,
  observedInputHash: string,
): ReplayStepResult {
  const outcome = manifest.outcomes.find((entry) => entry.sequence === sequence);
  if (!outcome) throw new Error(`unknown replay sequence: ${sequence}`);
  requireHash(observedInputHash, 'observedInputHash');

  return {
    nodeId: outcome.nodeId,
    expectedState: outcome.state,
    observedInputHash,
    expectedInputHash: outcome.inputHash,
    divergent: observedInputHash !== outcome.inputHash,
  };
}

export function buildRecoveryCheckpoint(input: RecoveryCheckpointInput): RecoveryCheckpoint {
  requireText(input.runId, 'runId');
  requireText(input.exactRevision, 'exactRevision');
  requireHash(input.workflowHash, 'workflowHash');
  requireHash(input.runSnapshotHash, 'runSnapshotHash');
  requireHash(input.replayManifestHash, 'replayManifestHash');
  if (!Number.isInteger(input.completedSequence) || input.completedSequence < -1) {
    throw new Error('completedSequence must be an integer >= -1');
  }
  const artifactHashes = uniqueHashes(input.artifactHashes, 'artifactHashes');
  const nodeStates = sortedRecord(input.nodeStates);
  const identity = {
    schemaVersion: 1,
    runId: input.runId,
    exactRevision: input.exactRevision,
    workflowHash: input.workflowHash,
    runSnapshotHash: input.runSnapshotHash,
    replayManifestHash: input.replayManifestHash,
    completedSequence: input.completedSequence,
    nodeStates,
    artifactHashes,
  } as const;

  return {
    ...identity,
    checkpointHash: sha256(canonicalJson(identity)),
  };
}

export function validateRecoveryCheckpoint(
  checkpoint: RecoveryCheckpoint,
  manifest: ReplayManifest,
): ReplayValidation {
  const errors: string[] = [];
  if (checkpoint.runId !== manifest.runId) errors.push('checkpoint run mismatch');
  if (checkpoint.exactRevision !== manifest.exactRevision)
    errors.push('checkpoint revision mismatch');
  if (checkpoint.workflowHash !== manifest.workflowHash)
    errors.push('checkpoint workflow mismatch');
  if (checkpoint.runSnapshotHash !== manifest.runSnapshotHash) {
    errors.push('checkpoint snapshot mismatch');
  }
  if (checkpoint.replayManifestHash !== manifest.manifestHash) {
    errors.push('checkpoint replay manifest mismatch');
  }
  if (checkpoint.completedSequence >= manifest.outcomes.length) {
    errors.push('checkpoint sequence exceeds replay manifest');
  }

  const rebuilt = buildRecoveryCheckpoint({
    runId: checkpoint.runId,
    exactRevision: checkpoint.exactRevision,
    workflowHash: checkpoint.workflowHash,
    runSnapshotHash: checkpoint.runSnapshotHash,
    replayManifestHash: checkpoint.replayManifestHash,
    completedSequence: checkpoint.completedSequence,
    nodeStates: checkpoint.nodeStates,
    artifactHashes: checkpoint.artifactHashes,
  });
  if (rebuilt.checkpointHash !== checkpoint.checkpointHash) {
    errors.push('checkpoint hash mismatch');
  }

  return { valid: errors.length === 0, errors };
}

export function nextReplaySequence(
  checkpoint: RecoveryCheckpoint,
  manifest: ReplayManifest,
): number | null {
  const validation = validateRecoveryCheckpoint(checkpoint, manifest);
  if (!validation.valid) {
    throw new Error(`invalid recovery checkpoint: ${validation.errors.join('; ')}`);
  }

  const next = checkpoint.completedSequence + 1;
  return next < manifest.outcomes.length ? next : null;
}

export function replayOrSimulationCanGrantAuthority(_mode: ReplayMode): false {
  return false;
}

function normalizeOutcomes(
  outcomes: readonly RecordedNodeOutcome[],
): readonly RecordedNodeOutcome[] {
  const sorted = [...outcomes].sort((left, right) => left.sequence - right.sequence);
  const sequences = new Set<number>();
  for (const [index, outcome] of sorted.entries()) {
    if (!Number.isInteger(outcome.sequence) || outcome.sequence < 0) {
      throw new Error('replay outcome sequence must be a non-negative integer');
    }
    if (sequences.has(outcome.sequence)) {
      throw new Error(`duplicate replay sequence: ${outcome.sequence}`);
    }
    sequences.add(outcome.sequence);
    if (outcome.sequence !== index) {
      throw new Error('replay outcome sequences must be contiguous from zero');
    }
    requireText(outcome.nodeId, 'replay nodeId');
    requireHash(outcome.inputHash, 'replay inputHash');
    if (outcome.outputHash !== undefined) requireHash(outcome.outputHash, 'replay outputHash');
    const artifactHashes = uniqueHashes(outcome.artifactHashes ?? [], 'outcome artifactHashes');
    sorted[index] = { ...outcome, artifactHashes };
  }
  return sorted;
}

function uniqueHashes(values: readonly string[], name: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    requireHash(value, name);
    if (seen.has(value)) throw new Error(`duplicate ${name}: ${value}`);
    seen.add(value);
    result.push(value);
  }
  return result;
}

function sortedRecord(input: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

function requireHash(value: string, name: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name} must be a SHA-256 hex hash`);
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

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
