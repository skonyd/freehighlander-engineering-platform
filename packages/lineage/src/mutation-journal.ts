import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';

import { AUTHORITY_CAPABILITY_IDS, type AuthorityCapabilityId } from '@freehighlander/contracts';

export type MutationLineageActionKind =
  | 'PLANNING_TRANSITION'
  | 'GIT_WRITE'
  | 'TEST_RUN'
  | 'SECURITY_ASSESSMENT'
  | 'SECURITY_WAIVER'
  | 'RELEASE_MUTATION'
  | 'INFRASTRUCTURE_MUTATION'
  | 'INCIDENT_REMEDIATION';

export type MutationLineagePrincipalKind = 'MODEL' | 'HUMAN' | 'SYSTEM';

export interface MutationLineageAppendInputV1 {
  readonly actionId: string;
  readonly kind: MutationLineageActionKind;
  readonly repository: string;
  readonly revision: string;
  readonly occurredAt: string;
  readonly principalKind: MutationLineagePrincipalKind;
  readonly capabilities: readonly AuthorityCapabilityId[];
  readonly evidenceDigest: string;
  readonly resultDigest: string;
  readonly policyHash?: string;
  readonly approvalDecisionHash?: string;
  readonly authorityGeneration?: number;
}

export interface MutationLineageRecordV1 extends MutationLineageAppendInputV1 {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly previousHash: string | null;
  readonly entryHash: string;
  readonly authority: 'NONE';
}

export interface MutationLineageJournalReadV1 {
  readonly schemaVersion: 1;
  readonly records: readonly MutationLineageRecordV1[];
  readonly headHash: string | null;
  readonly authority: 'NONE';
}

const CRITICAL_CAPABILITY_BY_ACTION: Readonly<
  Partial<Record<MutationLineageActionKind, readonly AuthorityCapabilityId[]>>
> = {
  GIT_WRITE: ['GIT_WRITE'],
  RELEASE_MUTATION: ['RELEASE_DEPLOY'],
  INFRASTRUCTURE_MUTATION: ['INFRASTRUCTURE_MUTATION'],
  INCIDENT_REMEDIATION: ['AUTOMATIC_REMEDIATION'],
};

export class MutationLineageJournalV1 {
  #tail: Promise<void> = Promise.resolve();

  constructor(readonly filePath: string) {
    if (!path.isAbsolute(filePath)) throw new Error('lineage journal path must be absolute');
  }

  append(input: MutationLineageAppendInputV1): Promise<MutationLineageRecordV1> {
    let resolveResult!: (value: MutationLineageRecordV1) => void;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<MutationLineageRecordV1>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    this.#tail = this.#tail.then(async () => {
      try {
        const current = await this.read();
        validateAppendInput(input);
        const sequence = current.records.length + 1;
        const previousHash = current.headHash;
        const identity = {
          schemaVersion: 1,
          sequence,
          ...input,
          previousHash,
          authority: 'NONE',
        } as const;
        const record: MutationLineageRecordV1 = Object.freeze({
          ...identity,
          entryHash: sha256(canonicalJson(identity)),
        });

        await mkdir(path.dirname(this.filePath), { recursive: true });
        const handle = await open(this.filePath, 'a', 0o600);
        try {
          await handle.writeFile(JSON.stringify(record) + '\n', 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        resolveResult(record);
      } catch (error) {
        rejectResult(error);
      }
    });

    return result;
  }

  async read(): Promise<MutationLineageJournalReadV1> {
    let content: string;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) {
        return { schemaVersion: 1, records: [], headHash: null, authority: 'NONE' };
      }
      throw error;
    }

    const records: MutationLineageRecordV1[] = [];
    let previousHash: string | null = null;
    const lines = content.split('\n');
    if (lines.at(-1) === '') lines.pop();

    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index];
      if (!raw) throw new Error('lineage journal contains an empty record');
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new Error('lineage journal contains invalid JSON at line ' + (index + 1));
      }
      const record = validatePersistedRecord(value, index + 1, previousHash);
      records.push(record);
      previousHash = record.entryHash;
    }

    return {
      schemaVersion: 1,
      records,
      headHash: previousHash,
      authority: 'NONE',
    };
  }
}

export function mutationLineageJournalCanGrantAuthority(): false {
  return false;
}

export function mutationLineageRecordCanAuthorizeSideEffect(): false {
  return false;
}

export function mutationLineageSemanticSearchCanEstablishAuthority(): false {
  return false;
}

function validateAppendInput(input: MutationLineageAppendInputV1): void {
  requireIdentifier(input.actionId, 'actionId');
  requireBoundedText(input.repository, 'repository', 256);
  requireRevision(input.revision);
  requireTimestamp(input.occurredAt);
  if (!isActionKind(input.kind)) throw new Error('unknown mutation lineage action kind');
  if (!['MODEL', 'HUMAN', 'SYSTEM'].includes(input.principalKind)) {
    throw new Error('unknown mutation lineage principal kind');
  }
  requireSha256(input.evidenceDigest, 'evidenceDigest');
  requireSha256(input.resultDigest, 'resultDigest');

  const capabilityIds = new Set<string>(AUTHORITY_CAPABILITY_IDS);
  const seen = new Set<string>();
  for (const capability of input.capabilities) {
    if (!capabilityIds.has(capability)) throw new Error('unknown mutation lineage capability');
    if (seen.has(capability)) throw new Error('duplicate mutation lineage capability');
    seen.add(capability);
  }

  const required = CRITICAL_CAPABILITY_BY_ACTION[input.kind] ?? [];
  for (const capability of required) {
    if (!seen.has(capability)) {
      throw new Error(input.kind + ' lineage requires capability ' + capability);
    }
  }

  if (required.length > 0) {
    if (input.policyHash === undefined) {
      throw new Error('critical mutation lineage requires policyHash');
    }
    requireSha256(input.policyHash, 'policyHash');
    if (
      input.authorityGeneration === undefined ||
      !Number.isInteger(input.authorityGeneration) ||
      input.authorityGeneration < 0
    ) {
      throw new Error('critical mutation lineage requires non-negative authorityGeneration');
    }
  } else if (input.policyHash !== undefined) {
    requireSha256(input.policyHash, 'policyHash');
  }

  if (input.approvalDecisionHash !== undefined) {
    requireSha256(input.approvalDecisionHash, 'approvalDecisionHash');
  }
  if (input.kind === 'SECURITY_WAIVER' && input.approvalDecisionHash === undefined) {
    throw new Error('SECURITY_WAIVER lineage requires approvalDecisionHash');
  }
  if (
    input.authorityGeneration !== undefined &&
    (!Number.isInteger(input.authorityGeneration) || input.authorityGeneration < 0)
  ) {
    throw new Error('authorityGeneration must be a non-negative integer');
  }
}

function validatePersistedRecord(
  value: unknown,
  sequence: number,
  previousHash: string | null,
): MutationLineageRecordV1 {
  if (!isRecord(value)) throw new Error('lineage journal record must be an object');
  const keys = new Set([
    'schemaVersion',
    'sequence',
    'actionId',
    'kind',
    'repository',
    'revision',
    'occurredAt',
    'principalKind',
    'capabilities',
    'evidenceDigest',
    'resultDigest',
    'policyHash',
    'approvalDecisionHash',
    'authorityGeneration',
    'previousHash',
    'entryHash',
    'authority',
  ]);
  if (Object.keys(value).some((key) => !keys.has(key))) {
    throw new Error('lineage journal record contains unknown fields');
  }
  if (value.schemaVersion !== 1 || value.sequence !== sequence || value.authority !== 'NONE') {
    throw new Error('lineage journal record identity is invalid');
  }
  if (value.previousHash !== previousHash) {
    throw new Error('lineage journal hash chain is broken');
  }
  if (!Array.isArray(value.capabilities))
    throw new Error('lineage journal capabilities must be an array');

  const input: MutationLineageAppendInputV1 = {
    actionId: requireString(value.actionId, 'actionId'),
    kind: requireActionKind(value.kind),
    repository: requireString(value.repository, 'repository'),
    revision: requireString(value.revision, 'revision'),
    occurredAt: requireString(value.occurredAt, 'occurredAt'),
    principalKind: requirePrincipalKind(value.principalKind),
    capabilities: value.capabilities.map((item) => requireCapability(item)),
    evidenceDigest: requireString(value.evidenceDigest, 'evidenceDigest'),
    resultDigest: requireString(value.resultDigest, 'resultDigest'),
    ...(value.policyHash === undefined
      ? {}
      : { policyHash: requireString(value.policyHash, 'policyHash') }),
    ...(value.approvalDecisionHash === undefined
      ? {}
      : {
          approvalDecisionHash: requireString(value.approvalDecisionHash, 'approvalDecisionHash'),
        }),
    ...(value.authorityGeneration === undefined
      ? {}
      : {
          authorityGeneration: requireNumber(value.authorityGeneration, 'authorityGeneration'),
        }),
  };
  validateAppendInput(input);
  const entryHash = requireString(value.entryHash, 'entryHash');
  requireSha256(entryHash, 'entryHash');

  const identity = {
    schemaVersion: 1,
    sequence,
    ...input,
    previousHash,
    authority: 'NONE',
  } as const;
  if (sha256(canonicalJson(identity)) !== entryHash) {
    throw new Error('lineage journal entry hash does not match record');
  }

  return Object.freeze({ ...identity, entryHash });
}

function requireCapability(value: unknown): AuthorityCapabilityId {
  if (
    typeof value !== 'string' ||
    !(AUTHORITY_CAPABILITY_IDS as readonly string[]).includes(value)
  ) {
    throw new Error('unknown mutation lineage capability');
  }
  return value as AuthorityCapabilityId;
}

function requireActionKind(value: unknown): MutationLineageActionKind {
  if (typeof value !== 'string' || !isActionKind(value)) {
    throw new Error('unknown mutation lineage action kind');
  }
  return value;
}

function requirePrincipalKind(value: unknown): MutationLineagePrincipalKind {
  if (value !== 'MODEL' && value !== 'HUMAN' && value !== 'SYSTEM') {
    throw new Error('unknown mutation lineage principal kind');
  }
  return value;
}

function isActionKind(value: string): value is MutationLineageActionKind {
  return [
    'PLANNING_TRANSITION',
    'GIT_WRITE',
    'TEST_RUN',
    'SECURITY_ASSESSMENT',
    'SECURITY_WAIVER',
    'RELEASE_MUTATION',
    'INFRASTRUCTURE_MUTATION',
    'INCIDENT_REMEDIATION',
  ].includes(value);
}

function requireIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(value)) {
    throw new Error(field + ' must be a bounded identifier');
  }
}

function requireBoundedText(value: string, field: string, maxLength: number): void {
  if (!value.trim() || value.length > maxLength || value.includes('\0')) {
    throw new Error(field + ' must be non-empty bounded text');
  }
}

function requireRevision(value: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new Error('revision must be a 40-character git SHA');
  }
}

function requireTimestamp(value: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error('occurredAt must be an ISO timestamp');
  }
}

function requireSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(field + ' must be lowercase sha256');
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(field + ' must be a string');
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') throw new Error(field + ' must be a number');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
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
