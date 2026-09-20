export interface ArtifactLineageBinding {
  readonly exactRevision: string;
  readonly workflowHash: string;
  readonly roleContractHash: string;
  readonly policyHash: string;
  readonly producerRole: string;
  readonly bindingId: string;
}

export interface ArtifactEnvelopeInput {
  readonly artifactId: string;
  readonly artifactKind: string;
  readonly content: string;
  readonly binding: ArtifactLineageBinding;
  readonly parentArtifactHashes?: readonly string[];
}

export interface ArtifactEnvelope {
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly artifactKind: string;
  readonly contentHash: string;
  readonly binding: ArtifactLineageBinding;
  readonly parentArtifactHashes: readonly string[];
  readonly artifactHash: string;
}

export interface ArtifactCurrentContext {
  readonly exactRevision: string;
  readonly workflowHash: string;
  readonly roleContractHash: string;
  readonly policyHash: string;
}

export interface LineageVerificationResult {
  readonly valid: boolean;
  readonly ancestry: readonly string[];
  readonly errors: readonly string[];
}

export async function createArtifactEnvelope(
  input: ArtifactEnvelopeInput,
): Promise<ArtifactEnvelope> {
  requireText(input.artifactId, 'artifactId');
  requireText(input.artifactKind, 'artifactKind');
  validateBinding(input.binding);

  const parents = [...(input.parentArtifactHashes ?? [])];
  assertUniqueParents(parents);
  for (const parent of parents) requireHash(parent, 'parent artifact hash');

  const contentHash = await sha256Hex(input.content);
  const identity = {
    schemaVersion: 1,
    artifactKind: input.artifactKind,
    contentHash,
    binding: input.binding,
    parentArtifactHashes: parents,
  } as const;

  return {
    schemaVersion: 1,
    artifactId: input.artifactId,
    artifactKind: input.artifactKind,
    contentHash,
    binding: { ...input.binding },
    parentArtifactHashes: parents,
    artifactHash: await sha256Hex(canonicalJson(identity)),
  };
}

export function isLineageArtifactCurrent(
  artifact: ArtifactEnvelope,
  context: ArtifactCurrentContext,
): boolean {
  return (
    artifact.binding.exactRevision === context.exactRevision &&
    artifact.binding.workflowHash === context.workflowHash &&
    artifact.binding.roleContractHash === context.roleContractHash &&
    artifact.binding.policyHash === context.policyHash
  );
}

export async function verifyArtifactEnvelope(
  artifact: ArtifactEnvelope,
  content: string,
): Promise<boolean> {
  const rebuilt = await createArtifactEnvelope({
    artifactId: artifact.artifactId,
    artifactKind: artifact.artifactKind,
    content,
    binding: artifact.binding,
    parentArtifactHashes: artifact.parentArtifactHashes,
  });

  return (
    rebuilt.contentHash === artifact.contentHash && rebuilt.artifactHash === artifact.artifactHash
  );
}

export function verifyArtifactLineage(
  rootHash: string,
  artifacts: ReadonlyMap<string, ArtifactEnvelope>,
): LineageVerificationResult {
  const ancestry: string[] = [];
  const errors: string[] = [];
  const visited = new Set<string>();
  const active = new Set<string>();

  const visit = (hash: string): void => {
    if (active.has(hash)) {
      errors.push(`lineage cycle detected at ${hash}`);
      return;
    }
    if (visited.has(hash)) return;

    const artifact = artifacts.get(hash);
    if (!artifact) {
      errors.push(`missing lineage artifact: ${hash}`);
      return;
    }
    if (artifact.artifactHash !== hash) {
      errors.push(`artifact map key does not match artifact hash: ${hash}`);
      return;
    }

    active.add(hash);
    for (const parentHash of artifact.parentArtifactHashes) visit(parentHash);
    active.delete(hash);

    if (!visited.has(hash)) {
      visited.add(hash);
      ancestry.push(hash);
    }
  };

  visit(rootHash);
  return {
    valid: errors.length === 0,
    ancestry,
    errors,
  };
}

export function artifactLineageCanGrantAuthority(): false {
  return false;
}

function validateBinding(binding: ArtifactLineageBinding): void {
  requireText(binding.exactRevision, 'binding.exactRevision');
  requireText(binding.workflowHash, 'binding.workflowHash');
  requireText(binding.roleContractHash, 'binding.roleContractHash');
  requireText(binding.policyHash, 'binding.policyHash');
  requireText(binding.producerRole, 'binding.producerRole');
  requireText(binding.bindingId, 'binding.bindingId');
}

function assertUniqueParents(parents: readonly string[]): void {
  const seen = new Set<string>();
  for (const parent of parents) {
    if (seen.has(parent)) {
      throw new Error(`duplicate parent artifact hash: ${parent}`);
    }
    seen.add(parent);
  }
}

function requireHash(value: string, name: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${name} must be a SHA-256 hex hash`);
  }
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }

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
