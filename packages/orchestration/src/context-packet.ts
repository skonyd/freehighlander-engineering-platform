import { createHash } from 'node:crypto';

export type ContextItemKind =
  | 'repository-contract'
  | 'requirement'
  | 'evidence'
  | 'tool-result'
  | 'task'
  | 'other';

export interface ContextPacketItemInput {
  readonly id: string;
  readonly source: string;
  readonly kind: ContextItemKind;
  readonly content: string;
  readonly requiredByGate?: boolean;
  readonly stale?: boolean;
}

export interface ContextPacketManifestItem {
  readonly ordinal: number;
  readonly id: string;
  readonly source: string;
  readonly kind: ContextItemKind;
  readonly contentHash: string;
  readonly bytes: number;
  readonly requiredByGate: boolean;
  readonly stale: boolean;
}

export interface ContextPacket {
  readonly profile: string;
  readonly packetId: string;
  readonly packetHash: string;
  readonly manifest: readonly ContextPacketManifestItem[];
  readonly items: readonly ContextPacketItemInput[];
}

export interface ContractFingerprintInput {
  readonly promptVersion: string;
  readonly roleContract: string;
  readonly inputContract: string;
  readonly outputContract: string;
  readonly evidencePolicy: string;
  readonly policyVersion: string;
}

export interface SemanticReuseKeyInput {
  readonly logicalRole: string;
  readonly exactRevision: string;
  readonly workflowHash: string;
  readonly roleContractHash: string;
  readonly promptVersion: string;
  readonly policyHash: string;
  readonly bindingId: string;
  readonly model: string;
  readonly effort?: string;
  readonly relevantInputHash: string;
}

export function buildContextPacket(
  profile: string,
  items: readonly ContextPacketItemInput[],
): ContextPacket {
  requireText(profile, 'context profile');
  assertUniqueContextIds(items);

  const manifest = items.map((item, ordinal) => {
    requireText(item.id, 'context item id');
    requireText(item.source, `context item ${item.id} source`);

    return {
      ordinal,
      id: item.id,
      source: item.source,
      kind: item.kind,
      contentHash: sha256Text(item.content),
      bytes: Buffer.byteLength(item.content, 'utf8'),
      requiredByGate: item.requiredByGate ?? false,
      stale: item.stale ?? false,
    } satisfies ContextPacketManifestItem;
  });

  const packetHash = sha256Fields([
    'freehighlander-context-packet-v1',
    profile,
    ...manifest.flatMap((item) => [
      String(item.ordinal),
      item.id,
      item.source,
      item.kind,
      item.contentHash,
      String(item.bytes),
      item.requiredByGate ? 'required' : 'optional',
      item.stale ? 'stale' : 'current',
    ]),
  ]);

  return {
    profile,
    packetId: `ctx-${packetHash.slice(0, 16)}`,
    packetHash,
    manifest,
    items: [...items],
  };
}

export function trimStaleContextItems(
  items: readonly ContextPacketItemInput[],
): readonly ContextPacketItemInput[] {
  return items.filter((item) => item.requiredByGate === true || item.stale !== true);
}

export function buildContractFingerprint(input: ContractFingerprintInput): string {
  return sha256Fields([
    'freehighlander-contract-fingerprint-v1',
    input.promptVersion,
    input.roleContract,
    input.inputContract,
    input.outputContract,
    input.evidencePolicy,
    input.policyVersion,
  ]);
}

export function buildSemanticReuseKey(input: SemanticReuseKeyInput): string {
  const required: readonly [string, string][] = [
    ['logicalRole', input.logicalRole],
    ['exactRevision', input.exactRevision],
    ['workflowHash', input.workflowHash],
    ['roleContractHash', input.roleContractHash],
    ['promptVersion', input.promptVersion],
    ['policyHash', input.policyHash],
    ['bindingId', input.bindingId],
    ['model', input.model],
    ['relevantInputHash', input.relevantInputHash],
  ];

  for (const [name, value] of required) requireText(value, name);

  return sha256Fields([
    'freehighlander-semantic-reuse-v1',
    input.logicalRole,
    input.exactRevision,
    input.workflowHash,
    input.roleContractHash,
    input.promptVersion,
    input.policyHash,
    input.bindingId,
    input.model,
    input.effort ?? '',
    input.relevantInputHash,
  ]);
}

export function tokenOptimizationCanChangeAuthority(): false {
  return false;
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Fields(fields: readonly string[]): string {
  const hash = createHash('sha256');
  for (const field of fields) {
    const bytes = Buffer.from(field, 'utf8');
    hash.update(String(bytes.length));
    hash.update(':');
    hash.update(bytes);
    hash.update(';');
  }
  return hash.digest('hex');
}

function assertUniqueContextIds(items: readonly ContextPacketItemInput[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`duplicate context item id: ${item.id}`);
    seen.add(item.id);
  }
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}
