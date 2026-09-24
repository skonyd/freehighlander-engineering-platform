import { createHash } from 'node:crypto';

export interface CanonicalExecutionScopeInput {
  readonly repositoryIdentity: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly components: Readonly<Record<string, string>>;
}

export interface CanonicalExecutionScope {
  readonly schemaVersion: 1;
  readonly repositoryIdentity: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly components: Readonly<Record<string, string>>;
  readonly scopeHash: string;
  readonly authority: 'NONE';
}

export interface NodeExecutionIdentityInput {
  readonly runSnapshotHash: string;
  readonly nodeId: string;
  readonly nodeVersion: string;
  readonly exactRevision: string;
  readonly scopeHash: string;
  readonly inputHash: string;
  readonly roleContractHash: string;
  readonly promptContractHash: string;
  readonly bindingId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly effort: string;
  readonly policyHash: string;
  readonly configHash: string;
  readonly predecessorResultHashes: readonly string[];
  readonly artifactHashes: readonly string[];
}

export interface NodeExecutionIdentity extends NodeExecutionIdentityInput {
  readonly schemaVersion: 1;
  readonly predecessorResultHashes: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly executionKey: string;
  readonly authority: 'NONE';
}

export type NodeResultStatus =
  | 'SUCCEEDED'
  | 'SEMANTIC_NEGATIVE'
  | 'FAILED'
  | 'HUMAN_REQUIRED';

export interface NodeResultV1Input {
  readonly identity: NodeExecutionIdentity;
  readonly status: NodeResultStatus;
  readonly outputHash: string;
  readonly artifactHashes: readonly string[];
  readonly idempotencyEvidenceHash?: string;
}

export interface NodeResultV1 {
  readonly schemaVersion: 1;
  readonly identity: NodeExecutionIdentity;
  readonly status: NodeResultStatus;
  readonly outputHash: string;
  readonly artifactHashes: readonly string[];
  readonly idempotencyEvidenceHash: string | null;
  readonly resultHash: string;
  readonly authority: 'NONE';
}

export type NodeReuseStatus = 'REUSABLE' | 'STALE' | 'NOT_REUSABLE';

export interface NodeReuseDecision {
  readonly status: NodeReuseStatus;
  readonly reasons: readonly string[];
  readonly authority: 'NONE';
}

export interface NodeReuseContext {
  readonly expectedIdentity: NodeExecutionIdentity;
  readonly sideEffecting: boolean;
}

export interface MandatoryJoinRequirement {
  readonly nodeId: string;
  readonly expectedIdentity: NodeExecutionIdentity;
  readonly sideEffecting: boolean;
}

export interface MandatoryJoinResult {
  readonly status: 'READY' | 'BLOCKED';
  readonly acceptedResultHashes: readonly string[];
  readonly errors: readonly string[];
  readonly authority: 'NONE';
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export function buildCanonicalExecutionScope(
  input: CanonicalExecutionScopeInput,
): CanonicalExecutionScope {
  requireText(input.repositoryIdentity, 'repositoryIdentity');
  requireText(input.exactRevision, 'exactRevision');
  requireHash(input.runSnapshotHash, 'runSnapshotHash');

  const components = sortedHashRecord(input.components, 'scope component');
  if (Object.keys(components).length === 0) {
    throw new Error('execution scope requires at least one component');
  }

  const identity = {
    schemaVersion: 1,
    repositoryIdentity: input.repositoryIdentity,
    exactRevision: input.exactRevision,
    runSnapshotHash: input.runSnapshotHash,
    components,
  } as const;

  return {
    ...identity,
    scopeHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function buildNodeExecutionIdentity(
  input: NodeExecutionIdentityInput,
): NodeExecutionIdentity {
  requireHash(input.runSnapshotHash, 'runSnapshotHash');
  requireIdentifier(input.nodeId, 'nodeId');
  requireText(input.nodeVersion, 'nodeVersion');
  requireText(input.exactRevision, 'exactRevision');
  for (const [name, value] of [
    ['scopeHash', input.scopeHash],
    ['inputHash', input.inputHash],
    ['roleContractHash', input.roleContractHash],
    ['promptContractHash', input.promptContractHash],
    ['policyHash', input.policyHash],
    ['configHash', input.configHash],
  ] as const) {
    requireHash(value, name);
  }
  for (const [name, value] of [
    ['bindingId', input.bindingId],
    ['providerId', input.providerId],
    ['modelId', input.modelId],
    ['effort', input.effort],
  ] as const) {
    requireIdentifier(value, name);
  }

  const predecessorResultHashes = uniqueSortedHashes(
    input.predecessorResultHashes,
    'predecessor result hash',
  );
  const artifactHashes = uniqueSortedHashes(input.artifactHashes, 'artifact hash');

  const identity = {
    schemaVersion: 1,
    runSnapshotHash: input.runSnapshotHash,
    nodeId: input.nodeId,
    nodeVersion: input.nodeVersion,
    exactRevision: input.exactRevision,
    scopeHash: input.scopeHash,
    inputHash: input.inputHash,
    roleContractHash: input.roleContractHash,
    promptContractHash: input.promptContractHash,
    bindingId: input.bindingId,
    providerId: input.providerId,
    modelId: input.modelId,
    effort: input.effort,
    policyHash: input.policyHash,
    configHash: input.configHash,
    predecessorResultHashes,
    artifactHashes,
  } as const;

  return {
    ...identity,
    executionKey: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function createNodeResultV1(input: NodeResultV1Input): NodeResultV1 {
  validateNodeExecutionIdentity(input.identity);
  if (
    input.status !== 'SUCCEEDED' &&
    input.status !== 'SEMANTIC_NEGATIVE' &&
    input.status !== 'FAILED' &&
    input.status !== 'HUMAN_REQUIRED'
  ) {
    throw new Error('unsupported node result status');
  }
  requireHash(input.outputHash, 'outputHash');

  const artifactHashes = uniqueSortedHashes(input.artifactHashes, 'result artifact hash');
  const idempotencyEvidenceHash = input.idempotencyEvidenceHash ?? null;
  if (idempotencyEvidenceHash !== null) {
    requireHash(idempotencyEvidenceHash, 'idempotencyEvidenceHash');
  }

  const identity = {
    schemaVersion: 1,
    executionKey: input.identity.executionKey,
    status: input.status,
    outputHash: input.outputHash,
    artifactHashes,
    idempotencyEvidenceHash,
  } as const;

  return {
    schemaVersion: 1,
    identity: cloneIdentity(input.identity),
    status: input.status,
    outputHash: input.outputHash,
    artifactHashes,
    idempotencyEvidenceHash,
    resultHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function evaluateNodeResultReuse(
  result: NodeResultV1,
  context: NodeReuseContext,
): NodeReuseDecision {
  validateNodeResult(result);
  validateNodeExecutionIdentity(context.expectedIdentity);

  const reasons: string[] = [];
  if (result.identity.executionKey !== context.expectedIdentity.executionKey) {
    reasons.push('execution identity mismatch');
  }
  if (result.status !== 'SUCCEEDED') {
    reasons.push('only successful node results may be reused');
  }
  if (context.sideEffecting && result.idempotencyEvidenceHash === null) {
    reasons.push('side-effecting result requires idempotency evidence');
  }

  if (reasons.includes('execution identity mismatch')) {
    return { status: 'STALE', reasons, authority: 'NONE' };
  }
  if (reasons.length > 0) {
    return { status: 'NOT_REUSABLE', reasons, authority: 'NONE' };
  }
  return { status: 'REUSABLE', reasons: [], authority: 'NONE' };
}

export function evaluateMandatoryJoin(
  requirements: readonly MandatoryJoinRequirement[],
  results: ReadonlyMap<string, NodeResultV1>,
): MandatoryJoinResult {
  if (requirements.length === 0) throw new Error('mandatory join requires at least one predecessor');

  const seen = new Set<string>();
  const errors: string[] = [];
  const acceptedResultHashes: string[] = [];

  for (const requirement of [...requirements].sort((left, right) =>
    left.nodeId.localeCompare(right.nodeId),
  )) {
    requireIdentifier(requirement.nodeId, 'join nodeId');
    if (seen.has(requirement.nodeId)) {
      throw new Error('duplicate mandatory join nodeId: ' + requirement.nodeId);
    }
    seen.add(requirement.nodeId);
    validateNodeExecutionIdentity(requirement.expectedIdentity);
    if (requirement.expectedIdentity.nodeId !== requirement.nodeId) {
      throw new Error('join nodeId must match expected identity nodeId');
    }

    const result = results.get(requirement.nodeId);
    if (!result) {
      errors.push(requirement.nodeId + ': missing mandatory result');
      continue;
    }

    const reuse = evaluateNodeResultReuse(result, {
      expectedIdentity: requirement.expectedIdentity,
      sideEffecting: requirement.sideEffecting,
    });
    if (reuse.status !== 'REUSABLE') {
      for (const reason of reuse.reasons) {
        errors.push(requirement.nodeId + ': ' + reason);
      }
      continue;
    }
    acceptedResultHashes.push(result.resultHash);
  }

  acceptedResultHashes.sort();
  errors.sort();

  return {
    status: errors.length === 0 ? 'READY' : 'BLOCKED',
    acceptedResultHashes,
    errors,
    authority: 'NONE',
  };
}

export function nodeResultReuseCanGrantAuthority(): false {
  return false;
}

export function semanticNegativeCanTriggerModelShopping(): false {
  return false;
}

function validateNodeResult(result: NodeResultV1): void {
  if (result.schemaVersion !== 1) throw new Error('node result schemaVersion must be 1');
  validateNodeExecutionIdentity(result.identity);
  requireHash(result.outputHash, 'outputHash');
  requireHash(result.resultHash, 'resultHash');
  for (const hash of result.artifactHashes) requireHash(hash, 'result artifact hash');
  if (result.idempotencyEvidenceHash !== null) {
    requireHash(result.idempotencyEvidenceHash, 'idempotencyEvidenceHash');
  }

  const rebuilt = createNodeResultV1({
    identity: result.identity,
    status: result.status,
    outputHash: result.outputHash,
    artifactHashes: result.artifactHashes,
    ...(result.idempotencyEvidenceHash === null
      ? {}
      : { idempotencyEvidenceHash: result.idempotencyEvidenceHash }),
  });
  if (rebuilt.resultHash !== result.resultHash) {
    throw new Error('node result hash mismatch');
  }
}

function validateNodeExecutionIdentity(identity: NodeExecutionIdentity): void {
  if (identity.schemaVersion !== 1) throw new Error('node identity schemaVersion must be 1');
  const rebuilt = buildNodeExecutionIdentity(identity);
  if (rebuilt.executionKey !== identity.executionKey) {
    throw new Error('node execution identity hash mismatch');
  }
}

function cloneIdentity(identity: NodeExecutionIdentity): NodeExecutionIdentity {
  return {
    ...identity,
    predecessorResultHashes: [...identity.predecessorResultHashes],
    artifactHashes: [...identity.artifactHashes],
  };
}

function sortedHashRecord(
  input: Readonly<Record<string, string>>,
  label: string,
): Readonly<Record<string, string>> {
  const entries = Object.entries(input).sort(([left], [right]) => left.localeCompare(right));
  for (const [name, value] of entries) {
    requireIdentifier(name, label + ' name');
    requireHash(value, label + ' hash');
  }
  return Object.fromEntries(entries);
}

function uniqueSortedHashes(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    requireHash(value, label);
    if (seen.has(value)) throw new Error('duplicate ' + label + ': ' + value);
    seen.add(value);
  }
  return [...seen].sort();
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
