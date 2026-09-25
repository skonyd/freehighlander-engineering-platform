import { createHash } from 'node:crypto';

export type ResumeArtifactClassification =
  'PORTABLE_REQUIRED' | 'RECONSTRUCTIBLE' | 'LOCAL_ONLY_CACHE';

export interface ResumeWorkflowIdentity {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
}

export interface ResumeNodeResultIdentity {
  readonly nodeId: string;
  readonly resultHash: string;
  readonly executionKey: string;
}

export interface ResumeArtifactManifestEntry {
  readonly artifactId: string;
  readonly contentHash: string;
  readonly classification: ResumeArtifactClassification;
}

export interface ResumeManifestV1Input {
  readonly repositoryIdentity: string;
  readonly projectId: string;
  readonly activeWorkItemId: string | null;
  readonly issueNumber: number | null;
  readonly pullRequestNumber: number | null;
  readonly branch: string;
  readonly remoteHead: string;
  readonly baseRevision: string;
  readonly workflow: ResumeWorkflowIdentity;
  readonly runSnapshotHash: string;
  readonly policyHash: string;
  readonly catalogSnapshotHash: string;
  readonly bindingSnapshotHash: string;
  readonly logicalRoleState: Readonly<Record<string, string>>;
  readonly completedNodeResults: readonly ResumeNodeResultIdentity[];
  readonly parkedDecisionIds: readonly string[];
  readonly waitingNodeIds: readonly string[];
  readonly readyNodeIds: readonly string[];
  readonly artifactManifest: readonly ResumeArtifactManifestEntry[];
  readonly checkpointHash: string;
  readonly replayManifestHash: string;
  readonly workspaceLogicalId: string;
  readonly requiredProviderCapabilities: Readonly<Record<string, readonly string[]>>;
  readonly requiredSecretHandleIds: readonly string[];
  readonly createdAt: string;
  readonly generation: number;
}

export interface ResumeManifestV1 extends ResumeManifestV1Input {
  readonly schemaVersion: 1;
  readonly logicalRoleState: Readonly<Record<string, string>>;
  readonly completedNodeResults: readonly ResumeNodeResultIdentity[];
  readonly parkedDecisionIds: readonly string[];
  readonly waitingNodeIds: readonly string[];
  readonly readyNodeIds: readonly string[];
  readonly artifactManifest: readonly ResumeArtifactManifestEntry[];
  readonly requiredProviderCapabilities: Readonly<Record<string, readonly string[]>>;
  readonly requiredSecretHandleIds: readonly string[];
  readonly manifestHash: string;
  readonly authority: 'NONE';
}

export type ResumeManifestCasStatus = 'ACCEPT' | 'CONFLICT';

export interface ResumeManifestCasDecision {
  readonly status: ResumeManifestCasStatus;
  readonly reasons: readonly string[];
  readonly acceptedGeneration: number | null;
  readonly authority: 'NONE';
}

export interface ResumeStore {
  getLatest(repositoryIdentity: string, projectId: string): Promise<ResumeManifestV1 | null>;
  publishCas(
    candidate: ResumeManifestV1,
    expectedCurrentGeneration: number | null,
  ): Promise<ResumeManifestCasDecision>;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const GIT_REVISION_PATTERN = /^[a-f0-9]{40,64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const ARTIFACT_CLASSIFICATIONS = new Set<ResumeArtifactClassification>([
  'PORTABLE_REQUIRED',
  'RECONSTRUCTIBLE',
  'LOCAL_ONLY_CACHE',
]);

const RESUME_MANIFEST_KEYS = [
  'schemaVersion',
  'repositoryIdentity',
  'projectId',
  'activeWorkItemId',
  'issueNumber',
  'pullRequestNumber',
  'branch',
  'remoteHead',
  'baseRevision',
  'workflow',
  'runSnapshotHash',
  'policyHash',
  'catalogSnapshotHash',
  'bindingSnapshotHash',
  'logicalRoleState',
  'completedNodeResults',
  'parkedDecisionIds',
  'waitingNodeIds',
  'readyNodeIds',
  'artifactManifest',
  'checkpointHash',
  'replayManifestHash',
  'workspaceLogicalId',
  'requiredProviderCapabilities',
  'requiredSecretHandleIds',
  'createdAt',
  'generation',
  'manifestHash',
  'authority',
] as const;

const WORKFLOW_IDENTITY_KEYS = ['id', 'version', 'hash'] as const;
const NODE_RESULT_IDENTITY_KEYS = ['nodeId', 'resultHash', 'executionKey'] as const;
const ARTIFACT_ENTRY_KEYS = ['artifactId', 'contentHash', 'classification'] as const;

export function createResumeManifestV1(input: ResumeManifestV1Input): ResumeManifestV1 {
  requireText(input.repositoryIdentity, 'repositoryIdentity');
  requireIdentifier(input.projectId, 'projectId');
  if (input.activeWorkItemId !== null) {
    requireIdentifier(input.activeWorkItemId, 'activeWorkItemId');
  }
  requireNullablePositiveInteger(input.issueNumber, 'issueNumber');
  requireNullablePositiveInteger(input.pullRequestNumber, 'pullRequestNumber');
  requireText(input.branch, 'branch');
  requireGitRevision(input.remoteHead, 'remoteHead');
  requireGitRevision(input.baseRevision, 'baseRevision');
  validateWorkflowIdentity(input.workflow);

  for (const [name, value] of [
    ['runSnapshotHash', input.runSnapshotHash],
    ['policyHash', input.policyHash],
    ['catalogSnapshotHash', input.catalogSnapshotHash],
    ['bindingSnapshotHash', input.bindingSnapshotHash],
    ['checkpointHash', input.checkpointHash],
    ['replayManifestHash', input.replayManifestHash],
  ] as const) {
    requireHash(value, name);
  }

  requireWorkspaceLogicalId(input.workspaceLogicalId);
  requireTimestamp(input.createdAt, 'createdAt');
  requirePositiveInteger(input.generation, 'generation');

  const logicalRoleState = sortedTextRecord(input.logicalRoleState, 'logical role');
  const completedNodeResults = normalizeNodeResults(input.completedNodeResults);
  const parkedDecisionIds = uniqueSortedIdentifiers(input.parkedDecisionIds, 'parked decision id');
  const waitingNodeIds = uniqueSortedIdentifiers(input.waitingNodeIds, 'waiting node id');
  const readyNodeIds = uniqueSortedIdentifiers(input.readyNodeIds, 'ready node id');
  assertDisjoint(waitingNodeIds, readyNodeIds, 'waiting and ready node ids');

  const artifactManifest = normalizeArtifacts(input.artifactManifest);
  const requiredProviderCapabilities = normalizeProviderCapabilities(
    input.requiredProviderCapabilities,
  );
  const requiredSecretHandleIds = uniqueSortedIdentifiers(
    input.requiredSecretHandleIds,
    'required secret handle id',
  );

  const identity = {
    schemaVersion: 1,
    repositoryIdentity: input.repositoryIdentity,
    projectId: input.projectId,
    activeWorkItemId: input.activeWorkItemId,
    issueNumber: input.issueNumber,
    pullRequestNumber: input.pullRequestNumber,
    branch: input.branch,
    remoteHead: input.remoteHead,
    baseRevision: input.baseRevision,
    workflow: { ...input.workflow },
    runSnapshotHash: input.runSnapshotHash,
    policyHash: input.policyHash,
    catalogSnapshotHash: input.catalogSnapshotHash,
    bindingSnapshotHash: input.bindingSnapshotHash,
    logicalRoleState,
    completedNodeResults,
    parkedDecisionIds,
    waitingNodeIds,
    readyNodeIds,
    artifactManifest,
    checkpointHash: input.checkpointHash,
    replayManifestHash: input.replayManifestHash,
    workspaceLogicalId: input.workspaceLogicalId,
    requiredProviderCapabilities,
    requiredSecretHandleIds,
    createdAt: input.createdAt,
    generation: input.generation,
  } as const;

  return {
    ...identity,
    manifestHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function validateResumeManifestV1(manifest: ResumeManifestV1): void {
  requireExactObjectKeys(manifest, RESUME_MANIFEST_KEYS, 'resume manifest');
  requireExactObjectKeys(manifest.workflow, WORKFLOW_IDENTITY_KEYS, 'resume workflow identity');
  for (const result of manifest.completedNodeResults) {
    requireExactObjectKeys(result, NODE_RESULT_IDENTITY_KEYS, 'resume node result identity');
  }
  for (const artifact of manifest.artifactManifest) {
    requireExactObjectKeys(artifact, ARTIFACT_ENTRY_KEYS, 'resume artifact entry');
  }

  if (manifest.schemaVersion !== 1) throw new Error('resume manifest schemaVersion must be 1');
  if (manifest.authority !== 'NONE') throw new Error('resume manifest authority must remain NONE');

  const rebuilt = createResumeManifestV1({
    repositoryIdentity: manifest.repositoryIdentity,
    projectId: manifest.projectId,
    activeWorkItemId: manifest.activeWorkItemId,
    issueNumber: manifest.issueNumber,
    pullRequestNumber: manifest.pullRequestNumber,
    branch: manifest.branch,
    remoteHead: manifest.remoteHead,
    baseRevision: manifest.baseRevision,
    workflow: manifest.workflow,
    runSnapshotHash: manifest.runSnapshotHash,
    policyHash: manifest.policyHash,
    catalogSnapshotHash: manifest.catalogSnapshotHash,
    bindingSnapshotHash: manifest.bindingSnapshotHash,
    logicalRoleState: manifest.logicalRoleState,
    completedNodeResults: manifest.completedNodeResults,
    parkedDecisionIds: manifest.parkedDecisionIds,
    waitingNodeIds: manifest.waitingNodeIds,
    readyNodeIds: manifest.readyNodeIds,
    artifactManifest: manifest.artifactManifest,
    checkpointHash: manifest.checkpointHash,
    replayManifestHash: manifest.replayManifestHash,
    workspaceLogicalId: manifest.workspaceLogicalId,
    requiredProviderCapabilities: manifest.requiredProviderCapabilities,
    requiredSecretHandleIds: manifest.requiredSecretHandleIds,
    createdAt: manifest.createdAt,
    generation: manifest.generation,
  });
  if (rebuilt.manifestHash !== manifest.manifestHash) {
    throw new Error('resume manifest hash mismatch');
  }
}

export function evaluateResumeManifestCas(
  current: ResumeManifestV1 | null,
  candidate: ResumeManifestV1,
  expectedCurrentGeneration: number | null,
): ResumeManifestCasDecision {
  validateResumeManifestV1(candidate);
  if (current !== null) validateResumeManifestV1(current);

  const reasons: string[] = [];

  if (current === null) {
    if (expectedCurrentGeneration !== null) {
      reasons.push('expected generation requires an existing manifest');
    }
    if (candidate.generation !== 1) {
      reasons.push('initial manifest generation must be 1');
    }
  } else {
    if (current.repositoryIdentity !== candidate.repositoryIdentity) {
      reasons.push('repository identity mismatch');
    }
    if (current.projectId !== candidate.projectId) {
      reasons.push('project identity mismatch');
    }
    if (expectedCurrentGeneration !== current.generation) {
      reasons.push('stale manifest generation');
    }
    if (candidate.generation !== current.generation + 1) {
      reasons.push('candidate generation must increment by one');
    }
  }

  return {
    status: reasons.length === 0 ? 'ACCEPT' : 'CONFLICT',
    reasons: [...reasons].sort(),
    acceptedGeneration: reasons.length === 0 ? candidate.generation : null,
    authority: 'NONE',
  };
}

export function resumeArtifactMustTransfer(classification: ResumeArtifactClassification): boolean {
  requireArtifactClassification(classification);
  return classification === 'PORTABLE_REQUIRED';
}

export function resumeArtifactCanBeReconstructed(
  classification: ResumeArtifactClassification,
): boolean {
  requireArtifactClassification(classification);
  return classification === 'RECONSTRUCTIBLE';
}

export function localResumeCacheRequiredForCorrectness(): false {
  return false;
}

export function resumeManifestCanContainSecretValues(): false {
  return false;
}

export function resumeManifestCanGrantAuthority(): false {
  return false;
}

function requireExactObjectKeys(
  value: object,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(label + ' contains unsupported fields');
  }
}

function validateWorkflowIdentity(workflow: ResumeWorkflowIdentity): void {
  requireIdentifier(workflow.id, 'workflow id');
  requireText(workflow.version, 'workflow version');
  requireHash(workflow.hash, 'workflow hash');
}

function normalizeNodeResults(
  values: readonly ResumeNodeResultIdentity[],
): readonly ResumeNodeResultIdentity[] {
  const seen = new Set<string>();
  const normalized = values.map((value) => {
    requireIdentifier(value.nodeId, 'completed node id');
    requireHash(value.resultHash, 'completed node result hash');
    requireHash(value.executionKey, 'completed node execution key');
    if (seen.has(value.nodeId)) throw new Error('duplicate completed node id: ' + value.nodeId);
    seen.add(value.nodeId);
    return { ...value };
  });
  return normalized.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
}

function normalizeArtifacts(
  values: readonly ResumeArtifactManifestEntry[],
): readonly ResumeArtifactManifestEntry[] {
  const seen = new Set<string>();
  const normalized = values.map((value) => {
    requireIdentifier(value.artifactId, 'artifact id');
    requireHash(value.contentHash, 'artifact content hash');
    requireArtifactClassification(value.classification);
    if (seen.has(value.artifactId)) throw new Error('duplicate artifact id: ' + value.artifactId);
    seen.add(value.artifactId);
    return { ...value };
  });
  return normalized.sort((left, right) => left.artifactId.localeCompare(right.artifactId));
}

function normalizeProviderCapabilities(
  input: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> {
  const entries = Object.entries(input)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerId, capabilities]) => {
      requireIdentifier(providerId, 'provider id');
      const normalized = uniqueSortedIdentifiers(capabilities, 'provider capability');
      return [providerId, normalized] as const;
    });
  return Object.fromEntries(entries);
}

function sortedTextRecord(
  input: Readonly<Record<string, string>>,
  label: string,
): Readonly<Record<string, string>> {
  const entries = Object.entries(input).sort(([left], [right]) => left.localeCompare(right));
  for (const [key, value] of entries) {
    requireIdentifier(key, label + ' id');
    requireText(value, label + ' state');
  }
  return Object.fromEntries(entries);
}

function uniqueSortedIdentifiers(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    requireIdentifier(value, label);
    if (seen.has(value)) throw new Error('duplicate ' + label + ': ' + value);
    seen.add(value);
  }
  return [...seen].sort();
}

function assertDisjoint(left: readonly string[], right: readonly string[], label: string): void {
  const rightSet = new Set(right);
  if (left.some((value) => rightSet.has(value))) {
    throw new Error(label + ' must be disjoint');
  }
}

function requireArtifactClassification(value: ResumeArtifactClassification): void {
  if (!ARTIFACT_CLASSIFICATIONS.has(value)) {
    throw new Error('unsupported resume artifact classification');
  }
}

function requireWorkspaceLogicalId(value: string): void {
  requireIdentifier(value, 'workspaceLogicalId');
  if (
    value.startsWith('/') ||
    value.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes('/') ||
    value.includes('\\')
  ) {
    throw new Error('workspaceLogicalId must not be a filesystem path');
  }
}

function requireNullablePositiveInteger(value: number | null, name: string): void {
  if (value !== null) requirePositiveInteger(value, name);
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(name + ' must be a positive integer');
  }
}

function requireIdentifier(value: string, name: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(name + ' must be a bounded identifier');
  }
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(name + ' is required');
}

function requireHash(value: string, name: string): void {
  if (!HASH_PATTERN.test(value)) throw new Error(name + ' must be a SHA-256 hex hash');
}

function requireGitRevision(value: string, name: string): void {
  if (!GIT_REVISION_PATTERN.test(value)) {
    throw new Error(name + ' must be a full lowercase Git revision');
  }
}

function requireTimestamp(value: string, name: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(name + ' must be an ISO timestamp');
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(record)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key]))
      .join(',') +
    '}'
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
