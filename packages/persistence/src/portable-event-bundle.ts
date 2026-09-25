import { createHash } from 'node:crypto';

import {
  SqliteTelemetryStore,
  indexedEngineeringEventHash,
  validateIndexedEngineeringEvent,
  type IndexedEngineeringEvent,
  type ImportResult,
  type SqliteIntegrityResult,
} from './sqlite-telemetry-store.js';

export interface PortableCanonicalEventRecordV1 {
  readonly eventHash: string;
  readonly event: IndexedEngineeringEvent;
}

export interface PortableCanonicalEventBundleV1Input {
  readonly repositoryIdentity: string;
  readonly projectId: string;
  readonly runId: string;
  readonly exactRevision: string;
  readonly events: readonly IndexedEngineeringEvent[];
}

export interface PortableCanonicalEventBundleV1 {
  readonly schemaVersion: 1;
  readonly repositoryIdentity: string;
  readonly projectId: string;
  readonly runId: string;
  readonly exactRevision: string;
  readonly events: readonly PortableCanonicalEventRecordV1[];
  readonly eventCount: number;
  readonly firstTimestamp: string | null;
  readonly lastTimestamp: string | null;
  readonly bundleHash: string;
  readonly authority: 'NONE';
}

export interface PortableReadModelRebuildResult extends ImportResult {
  readonly runId: string;
  readonly bundleHash: string;
  readonly integrity: SqliteIntegrityResult;
  readonly localDatabaseRequiredForPortability: false;
  readonly authority: 'NONE';
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const GIT_REVISION_PATTERN = /^[a-f0-9]{40,64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const MAX_PORTABLE_EVENTS = 10_000;
const MAX_PORTABLE_BUNDLE_BYTES = 8 * 1024 * 1024;
const MAX_PORTABLE_VALUE_DEPTH = 12;
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'password',
  'passwd',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'authorization',
  'cookie',
  'privatekey',
  'clientsecret',
  'secretvalue',
  'credentialvalue',
]);

export function createPortableCanonicalEventBundleV1(
  input: PortableCanonicalEventBundleV1Input,
): PortableCanonicalEventBundleV1 {
  requireText(input.repositoryIdentity, 'repositoryIdentity');
  requireIdentifier(input.projectId, 'projectId');
  requireIdentifier(input.runId, 'runId');
  requireRevision(input.exactRevision, 'exactRevision');
  if (!Array.isArray(input.events)) throw new Error('portable events must be an array');
  if (input.events.length > MAX_PORTABLE_EVENTS) {
    throw new Error('portable event bundle exceeds event-count limit');
  }

  let previousTimestamp = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();
  const events = input.events.map((event) => {
    validateIndexedEngineeringEvent(event);
    if (event.runId !== input.runId) {
      throw new Error('portable event runId mismatch');
    }
    if (
      event.revision?.repository !== undefined &&
      event.revision.repository !== input.repositoryIdentity
    ) {
      throw new Error('portable event repository identity mismatch');
    }
    if (event.revision?.headSha !== undefined && event.revision.headSha !== input.exactRevision) {
      throw new Error('portable event exact revision mismatch');
    }

    assertPortableValue(event.payload, 'payload', 0);
    const timestamp = requireTimestamp(event.timestamp, 'portable event timestamp');
    if (timestamp < previousTimestamp) {
      throw new Error('portable events must be ordered by nondecreasing timestamp');
    }
    previousTimestamp = timestamp;

    const normalizedEvent = JSON.parse(JSON.stringify(event)) as IndexedEngineeringEvent;
    validateIndexedEngineeringEvent(normalizedEvent);
    const eventHash = indexedEngineeringEventHash(normalizedEvent);
    if (seen.has(eventHash)) throw new Error('portable event bundle contains duplicate event');
    seen.add(eventHash);
    return { eventHash, event: normalizedEvent };
  });

  const identity = bundleIdentity(input, events);
  const serialized = canonicalJson(identity);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PORTABLE_BUNDLE_BYTES) {
    throw new Error('portable event bundle exceeds byte limit');
  }

  return Object.freeze({
    ...identity,
    bundleHash: sha256(serialized),
    authority: 'NONE' as const,
  });
}

export function validatePortableCanonicalEventBundleV1(
  bundle: PortableCanonicalEventBundleV1,
): void {
  if (!isRecord(bundle)) throw new Error('portable event bundle must be an object');
  assertExactKeys(bundle, [
    'schemaVersion',
    'repositoryIdentity',
    'projectId',
    'runId',
    'exactRevision',
    'events',
    'eventCount',
    'firstTimestamp',
    'lastTimestamp',
    'bundleHash',
    'authority',
  ]);
  if (bundle.schemaVersion !== 1) throw new Error('portable event bundle schemaVersion must be 1');
  if (bundle.authority !== 'NONE') throw new Error('portable event bundle authority must be NONE');
  requireHash(bundle.bundleHash, 'bundleHash');

  const rebuilt = createPortableCanonicalEventBundleV1({
    repositoryIdentity: bundle.repositoryIdentity,
    projectId: bundle.projectId,
    runId: bundle.runId,
    exactRevision: bundle.exactRevision,
    events: bundle.events.map((record) => {
      if (!isRecord(record)) throw new Error('portable event record must be an object');
      assertExactKeys(record, ['eventHash', 'event']);
      requireHash(record.eventHash, 'portable event hash');
      const event = record.event as IndexedEngineeringEvent;
      validateIndexedEngineeringEvent(event);
      if (indexedEngineeringEventHash(event) !== record.eventHash) {
        throw new Error('portable event record hash mismatch');
      }
      return event;
    }),
  });

  if (rebuilt.eventCount !== bundle.eventCount) {
    throw new Error('portable event count mismatch');
  }
  if (
    rebuilt.firstTimestamp !== bundle.firstTimestamp ||
    rebuilt.lastTimestamp !== bundle.lastTimestamp
  ) {
    throw new Error('portable event timestamp bounds mismatch');
  }
  if (rebuilt.bundleHash !== bundle.bundleHash) {
    throw new Error('portable event bundle hash mismatch');
  }
}

export function rebuildSqliteReadModelFromPortableEventBundle(
  bundle: PortableCanonicalEventBundleV1,
  filePath: string,
): PortableReadModelRebuildResult {
  validatePortableCanonicalEventBundleV1(bundle);
  if (!filePath.trim()) throw new Error('SQLite rebuild filePath is required');

  const store = new SqliteTelemetryStore(filePath);
  try {
    const imported = store.ingestMany(bundle.events.map((record) => record.event));
    const integrity = store.integrityCheck();
    if (!integrity.ok) throw new Error('rebuilt SQLite read model failed integrity check');
    return {
      ...imported,
      runId: bundle.runId,
      bundleHash: bundle.bundleHash,
      integrity,
      localDatabaseRequiredForPortability: false,
      authority: 'NONE',
    };
  } finally {
    store.close();
  }
}

export function portableCanonicalEventsCanContainSecretValues(): false {
  return false;
}

export function portableCanonicalEventsCanRequireSourceMachinePath(): false {
  return false;
}

export function portableSqliteWalCanBeHandoffProtocol(): false {
  return false;
}

function bundleIdentity(
  input: PortableCanonicalEventBundleV1Input,
  events: readonly PortableCanonicalEventRecordV1[],
) {
  return {
    schemaVersion: 1 as const,
    repositoryIdentity: input.repositoryIdentity,
    projectId: input.projectId,
    runId: input.runId,
    exactRevision: input.exactRevision,
    events,
    eventCount: events.length,
    firstTimestamp: events.length === 0 ? null : (events[0]?.event.timestamp ?? null),
    lastTimestamp:
      events.length === 0 ? null : (events[events.length - 1]?.event.timestamp ?? null),
  };
}

function assertPortableValue(value: unknown, path: string, depth: number): void {
  if (depth > MAX_PORTABLE_VALUE_DEPTH) {
    throw new Error('portable event payload exceeds nesting limit');
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (looksLikeSecretMaterial(value)) {
      throw new Error('portable event payload contains credential-shaped material');
    }
    if (looksLikeAbsolutePath(value)) {
      throw new Error('portable event payload contains an absolute machine path');
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      assertPortableValue(entry, path + '[' + index + ']', depth + 1);
    }
    return;
  }
  if (!isRecord(value)) {
    throw new Error('portable event payload contains unsupported value at ' + path);
  }

  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey)) {
      throw new Error('portable event payload contains forbidden credential field');
    }
    assertPortableValue(entry, path + '.' + key, depth + 1);
  }
}

function looksLikeSecretMaterial(value: string): boolean {
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value) ||
    /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/i.test(value) ||
    /\bghp_[A-Za-z0-9]{20,}\b/.test(value) ||
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(value) ||
    /\bsk-[A-Za-z0-9_-]{20,}\b/.test(value)
  );
}

function looksLikeAbsolutePath(value: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value);
}

function requireTimestamp(value: string, name: string): number {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(name + ' must be a canonical ISO timestamp');
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(name + ' must be a canonical ISO timestamp');
  }
  return parsed;
}

function requireIdentifier(value: string, name: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) throw new Error(name + ' must be a bounded identifier');
}

function requireRevision(value: string, name: string): void {
  if (!GIT_REVISION_PATTERN.test(value)) throw new Error(name + ' must be a Git revision hash');
}

function requireHash(value: string, name: string): void {
  if (!HASH_PATTERN.test(value)) throw new Error(name + ' must be a SHA-256 hex hash');
}

function requireText(value: string, name: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(name + ' is required');
}

function assertExactKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) throw new Error('portable event field is not allowed: ' + key);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error('portable event field is required: ' + key);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((entry) => canonicalJson(entry)).join(',') + ']';
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
