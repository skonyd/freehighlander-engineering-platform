export type ContextItemKind =
  | 'stable-system'
  | 'stable-tool'
  | 'stable-repository'
  | 'evidence'
  | 'tool-result'
  | 'task'
  | 'user-request';

export interface ContextPacketItemInput {
  readonly id: string;
  readonly kind: ContextItemKind;
  readonly content: string;
  readonly requiredForAuthority?: boolean;
}

export interface ContextPacketItemManifest {
  readonly position: number;
  readonly id: string;
  readonly kind: ContextItemKind;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly requiredForAuthority: boolean;
}

export interface ExactRevision {
  readonly repository: string;
  readonly baseSha?: string;
  readonly headSha: string;
}

export interface ContextPacketInput {
  readonly profile: string;
  readonly revision: ExactRevision;
  readonly items: readonly ContextPacketItemInput[];
}

export interface ContextPacketManifest {
  readonly schemaVersion: 1;
  readonly profile: string;
  readonly revision: ExactRevision;
  readonly items: readonly ContextPacketItemManifest[];
  readonly packetHash: string;
}

export interface SemanticReuseKeyInput {
  readonly logicalRole: string;
  readonly revision: ExactRevision;
  readonly workflowHash: string;
  readonly roleContractHash: string;
  readonly promptVersion: string;
  readonly policyHash: string;
  readonly bindingId: string;
  readonly model: string;
  readonly effort?: string;
  readonly relevantInputHash: string;
}

export interface SemanticReuseKey {
  readonly schemaVersion: 1;
  readonly key: string;
}

export async function buildContextPacketManifest(
  input: ContextPacketInput,
): Promise<ContextPacketManifest> {
  requireNonEmpty(input.profile, 'profile');
  validateRevision(input.revision);

  const ids = new Set<string>();
  const items: ContextPacketItemManifest[] = [];

  for (const [position, item] of input.items.entries()) {
    requireNonEmpty(item.id, 'context item id');
    if (ids.has(item.id)) throw new Error(`duplicate context item id: ${item.id}`);
    ids.add(item.id);

    items.push({
      position,
      id: item.id,
      kind: item.kind,
      contentHash: await sha256Hex(item.content),
      byteLength: new TextEncoder().encode(item.content).byteLength,
      requiredForAuthority: item.requiredForAuthority ?? false,
    });
  }

  const identity = {
    schemaVersion: 1,
    profile: input.profile,
    revision: normalizeRevision(input.revision),
    items,
  } as const;

  return {
    ...identity,
    packetHash: await sha256Hex(canonicalJson(identity)),
  };
}

export async function buildSemanticReuseKey(
  input: SemanticReuseKeyInput,
): Promise<SemanticReuseKey> {
  requireNonEmpty(input.logicalRole, 'logicalRole');
  requireNonEmpty(input.workflowHash, 'workflowHash');
  requireNonEmpty(input.roleContractHash, 'roleContractHash');
  requireNonEmpty(input.promptVersion, 'promptVersion');
  requireNonEmpty(input.policyHash, 'policyHash');
  requireNonEmpty(input.bindingId, 'bindingId');
  requireNonEmpty(input.model, 'model');
  requireNonEmpty(input.relevantInputHash, 'relevantInputHash');
  validateRevision(input.revision);

  const identity = {
    schemaVersion: 1,
    logicalRole: input.logicalRole,
    revision: normalizeRevision(input.revision),
    workflowHash: input.workflowHash,
    roleContractHash: input.roleContractHash,
    promptVersion: input.promptVersion,
    policyHash: input.policyHash,
    bindingId: input.bindingId,
    model: input.model,
    effort: input.effort ?? null,
    relevantInputHash: input.relevantInputHash,
  } as const;

  return {
    schemaVersion: 1,
    key: await sha256Hex(canonicalJson(identity)),
  };
}

export function authoritativeItemIds(
  manifest: ContextPacketManifest,
): readonly string[] {
  return manifest.items
    .filter((item) => item.requiredForAuthority)
    .map((item) => item.id);
}

function validateRevision(revision: ExactRevision): void {
  requireNonEmpty(revision.repository, 'revision.repository');
  requireNonEmpty(revision.headSha, 'revision.headSha');
  if (revision.baseSha !== undefined) requireNonEmpty(revision.baseSha, 'revision.baseSha');
}

function normalizeRevision(revision: ExactRevision): {
  readonly repository: string;
  readonly baseSha: string | null;
  readonly headSha: string;
} {
  return {
    repository: revision.repository,
    baseSha: revision.baseSha ?? null,
    headSha: revision.headSha,
  };
}

function requireNonEmpty(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
