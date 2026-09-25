import { createHash } from 'node:crypto';

export interface RepositoryMapEntryInput {
  readonly path: string;
  readonly symbols: readonly string[];
  readonly imports: readonly string[];
  readonly estimatedTokens: number;
}

export interface RepositoryMapEntry {
  readonly path: string;
  readonly symbols: readonly string[];
  readonly imports: readonly string[];
  readonly estimatedTokens: number;
}

export interface RepositoryMapV1 {
  readonly schemaVersion: 1;
  readonly exactRevision: string;
  readonly entries: readonly RepositoryMapEntry[];
  readonly mapHash: string;
  readonly authority: 'NONE';
}

export interface JitRepositoryContextInput {
  readonly map: RepositoryMapV1;
  readonly query: string;
  readonly changedPaths: readonly string[];
  readonly requiredPaths: readonly string[];
  readonly targetTokens: number;
}

export interface JitRepositoryContextSelection {
  readonly schemaVersion: 1;
  readonly mapHash: string;
  readonly selectedPaths: readonly string[];
  readonly requiredPaths: readonly string[];
  readonly estimatedTokens: number;
  readonly targetTokens: number;
  readonly targetExceededForRequiredContext: boolean;
  readonly authority: 'NONE';
}

export function buildRepositoryMap(
  exactRevision: string,
  inputs: readonly RepositoryMapEntryInput[],
): RepositoryMapV1 {
  const revision = requireText(exactRevision, 'exactRevision');
  if (inputs.length === 0) throw new Error('repository map requires at least one entry');

  const entries = inputs
    .map(normalizeEntry)
    .sort((left, right) => left.path.localeCompare(right.path));

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`duplicate repository map path: ${entry.path}`);
    seen.add(entry.path);
  }

  const identity = {
    schemaVersion: 1,
    exactRevision: revision,
    entries,
  } as const;

  return {
    ...identity,
    mapHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function validateRepositoryMap(map: RepositoryMapV1): void {
  if (map.schemaVersion !== 1) throw new Error('repository map schemaVersion must be 1');
  if (map.authority !== 'NONE') throw new Error('repository map authority must be NONE');

  const rebuilt = buildRepositoryMap(map.exactRevision, map.entries);
  if (rebuilt.mapHash !== map.mapHash) throw new Error('repository map hash mismatch');
}

export function selectJitRepositoryContext(
  input: JitRepositoryContextInput,
): JitRepositoryContextSelection {
  validateRepositoryMap(input.map);
  if (!Number.isInteger(input.targetTokens) || input.targetTokens < 0) {
    throw new Error('targetTokens must be a non-negative integer');
  }

  const byPath = new Map(input.map.entries.map((entry) => [entry.path, entry]));
  const changedPaths = uniqueSortedPaths(input.changedPaths, 'changedPaths');
  const requiredPaths = uniqueSortedPaths(input.requiredPaths, 'requiredPaths');

  for (const path of [...changedPaths, ...requiredPaths]) {
    if (!byPath.has(path)) throw new Error(`repository map does not contain path: ${path}`);
  }

  const selected = new Set(requiredPaths);
  let estimatedTokens = requiredPaths.reduce(
    (total, path) => total + byPath.get(path)!.estimatedTokens,
    0,
  );
  const targetExceededForRequiredContext = estimatedTokens > input.targetTokens;

  const queryTerms = tokenize(input.query);
  const ranked = input.map.entries
    .filter((entry) => !selected.has(entry.path))
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, queryTerms, changedPaths),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) => right.score - left.score || left.entry.path.localeCompare(right.entry.path),
    );

  for (const { entry } of ranked) {
    if (estimatedTokens + entry.estimatedTokens > input.targetTokens) continue;
    selected.add(entry.path);
    estimatedTokens += entry.estimatedTokens;
  }

  return {
    schemaVersion: 1,
    mapHash: input.map.mapHash,
    selectedPaths: [...selected].sort(),
    requiredPaths,
    estimatedTokens,
    targetTokens: input.targetTokens,
    targetExceededForRequiredContext,
    authority: 'NONE',
  };
}

export function repositoryMapCanGrantAuthority(): false {
  return false;
}

export function jitSelectionCanDropRequiredPathsForBudget(): false {
  return false;
}

function normalizeEntry(input: RepositoryMapEntryInput): RepositoryMapEntry {
  const path = normalizePath(input.path);
  if (!Number.isInteger(input.estimatedTokens) || input.estimatedTokens < 0) {
    throw new Error(`repository map entry ${path} estimatedTokens must be a non-negative integer`);
  }

  return {
    path,
    symbols: uniqueSortedText(input.symbols, `repository map symbols for ${path}`),
    imports: uniqueSortedPaths(input.imports, `repository map imports for ${path}`),
    estimatedTokens: input.estimatedTokens,
  };
}

function scoreEntry(
  entry: RepositoryMapEntry,
  queryTerms: readonly string[],
  changedPaths: readonly string[],
): number {
  let score = changedPaths.includes(entry.path) ? 1000 : 0;
  const path = entry.path.toLowerCase();

  for (const term of queryTerms) {
    if (path === term) score += 300;
    else if (path.includes(term)) score += 100;

    for (const symbol of entry.symbols) {
      const normalized = symbol.toLowerCase();
      if (normalized === term) score += 250;
      else if (normalized.includes(term)) score += 80;
    }

    for (const imported of entry.imports) {
      const normalized = imported.toLowerCase();
      if (normalized.includes(term)) score += 30;
    }
  }

  return score;
}

function uniqueSortedText(values: readonly string[], field: string): readonly string[] {
  return [...new Set(values.map((value) => requireText(value, field)))].sort();
}

function uniqueSortedPaths(values: readonly string[], field: string): readonly string[] {
  return [...new Set(values.map((value) => normalizePath(value, field)))].sort();
}

function normalizePath(value: string, field = 'repository path'): string {
  const normalized = requireText(value, field).replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`${field} must stay repository-relative`);
  }
  return normalized;
}

function tokenize(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9._:/-]+/)
        .filter(Boolean),
    ),
  ].sort();
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
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
