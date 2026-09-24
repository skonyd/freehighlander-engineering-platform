import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export type JsonScalar = string | number | boolean | null;
export type JsonValue =
  | JsonScalar
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;

export type AtomicConfigValidator = (value: unknown) => JsonValue;

export interface AtomicConfigSnapshot {
  readonly schemaVersion: 1;
  readonly generation: number;
  readonly contentHash: string;
  readonly snapshotHash: string;
  readonly payload: JsonValue;
}

export type AtomicConfigWriteStatus =
  | 'WRITTEN'
  | 'GENERATION_CONFLICT'
  | 'WRITER_CONFLICT';

export interface AtomicConfigWriteResult {
  readonly status: AtomicConfigWriteStatus;
  readonly expectedGeneration: number;
  readonly actualGeneration: number | null;
  readonly snapshot: AtomicConfigSnapshot | null;
  readonly authority: 'NONE';
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;

export class AtomicJsonConfigStore {
  readonly #lockPath: string;

  constructor(
    readonly filePath: string,
    readonly validatePayload: AtomicConfigValidator,
  ) {
    if (!filePath.trim()) throw new Error('filePath is required');
    if (typeof validatePayload !== 'function') throw new Error('validatePayload is required');
    this.#lockPath = filePath + '.lock';
  }

  read(): AtomicConfigSnapshot | null {
    if (!existsSync(this.filePath)) return null;
    return readValidatedSnapshot(this.filePath, this.validatePayload);
  }

  write(expectedGeneration: number, payload: unknown): AtomicConfigWriteResult {
    requireGeneration(expectedGeneration, 'expectedGeneration');
    mkdirSync(dirname(this.filePath), { recursive: true });

    let lockFd: number;
    try {
      lockFd = openSync(this.#lockPath, 'wx', 0o600);
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return {
          status: 'WRITER_CONFLICT',
          expectedGeneration,
          actualGeneration: null,
          snapshot: null,
          authority: 'NONE',
        };
      }
      throw error;
    }

    try {
      const current = this.read();
      const actualGeneration = current?.generation ?? 0;
      if (actualGeneration !== expectedGeneration) {
        return {
          status: 'GENERATION_CONFLICT',
          expectedGeneration,
          actualGeneration,
          snapshot: current,
          authority: 'NONE',
        };
      }

      const normalizedPayload = cloneJson(this.validatePayload(cloneUnknown(payload)));
      const snapshot = buildSnapshot(actualGeneration + 1, normalizedPayload);
      this.#writeAtomic(snapshot);

      const verified = this.read();
      if (
        verified === null ||
        verified.generation !== snapshot.generation ||
        verified.snapshotHash !== snapshot.snapshotHash
      ) {
        throw new Error('atomic config read-back verification failed');
      }

      return {
        status: 'WRITTEN',
        expectedGeneration,
        actualGeneration: verified.generation,
        snapshot: verified,
        authority: 'NONE',
      };
    } finally {
      closeSync(lockFd);
      rmSync(this.#lockPath, { force: true });
    }
  }

  #writeAtomic(snapshot: AtomicConfigSnapshot): void {
    const parent = dirname(this.filePath);
    const tempDirectory = mkdtempSync(join(parent, '.fh-config-'));
    const tempPath = join(tempDirectory, basename(this.filePath) + '.tmp');
    let tempFd: number | null = null;

    try {
      tempFd = openSync(tempPath, 'wx', 0o600);
      writeFileSync(tempFd, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
      fsyncSync(tempFd);
      closeSync(tempFd);
      tempFd = null;

      const verifiedTemp = readValidatedSnapshot(tempPath, this.validatePayload);
      if (verifiedTemp.snapshotHash !== snapshot.snapshotHash) {
        throw new Error('temporary config verification failed');
      }

      renameSync(tempPath, this.filePath);
      fsyncDirectoryIfSupported(parent);
    } finally {
      if (tempFd !== null) closeSync(tempFd);
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

export function atomicConfigCanGrantAuthority(): false {
  return false;
}

export function atomicConfigCanBypassGenerationCas(): false {
  return false;
}

export function inFlightConfigSnapshotCanMutate(): false {
  return false;
}

function buildSnapshot(generation: number, payload: JsonValue): AtomicConfigSnapshot {
  requirePositiveGeneration(generation, 'generation');
  const contentHash = sha256(canonicalJson(payload));
  const identity = {
    schemaVersion: 1,
    generation,
    contentHash,
    payload,
  } as const;

  return freezeSnapshot({
    ...identity,
    snapshotHash: sha256(canonicalJson(identity)),
  });
}

function readValidatedSnapshot(
  filePath: string,
  validatePayload: AtomicConfigValidator,
): AtomicConfigSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown JSON parse failure';
    throw new Error('invalid atomic config JSON: ' + detail);
  }

  if (!isRecord(parsed)) throw new Error('atomic config root must be an object');
  if (parsed.schemaVersion !== 1) throw new Error('atomic config schemaVersion must be 1');
  requirePositiveGeneration(parsed.generation, 'generation');
  if (typeof parsed.contentHash !== 'string' || !HASH_PATTERN.test(parsed.contentHash)) {
    throw new Error('atomic config contentHash must be a SHA-256 hex hash');
  }
  if (typeof parsed.snapshotHash !== 'string' || !HASH_PATTERN.test(parsed.snapshotHash)) {
    throw new Error('atomic config snapshotHash must be a SHA-256 hex hash');
  }
  if (!Object.prototype.hasOwnProperty.call(parsed, 'payload')) {
    throw new Error('atomic config payload is required');
  }

  const normalizedPayload = cloneJson(validatePayload(cloneUnknown(parsed.payload)));
  if (canonicalJson(normalizedPayload) !== canonicalJson(parsed.payload)) {
    throw new Error('persisted atomic config payload is not validator-canonical');
  }

  const expectedContentHash = sha256(canonicalJson(normalizedPayload));
  if (expectedContentHash !== parsed.contentHash) {
    throw new Error('atomic config content hash mismatch');
  }

  const identity = {
    schemaVersion: 1,
    generation: parsed.generation,
    contentHash: parsed.contentHash,
    payload: normalizedPayload,
  } as const;
  const expectedSnapshotHash = sha256(canonicalJson(identity));
  if (expectedSnapshotHash !== parsed.snapshotHash) {
    throw new Error('atomic config snapshot hash mismatch');
  }

  return freezeSnapshot({
    ...identity,
    snapshotHash: parsed.snapshotHash,
  });
}

function freezeSnapshot(snapshot: AtomicConfigSnapshot): AtomicConfigSnapshot {
  return Object.freeze({
    ...snapshot,
    payload: freezeJson(snapshot.payload),
  });
}

function freezeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeJson(entry)));
  }
  if (value !== null && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freezeJson(entry)]),
      ),
    ) as JsonValue;
  }
  return value;
}

function cloneJson(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function cloneUnknown(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
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

function fsyncDirectoryIfSupported(directory: string): void {
  let directoryFd: number | null = null;
  try {
    directoryFd = openSync(directory, 'r');
    fsyncSync(directoryFd);
  } catch (error) {
    if (!isUnsupportedDirectoryFsync(error)) throw error;
  } finally {
    if (directoryFd !== null) closeSync(directoryFd);
  }
}

function isUnsupportedDirectoryFsync(error: unknown): boolean {
  if (!isNodeError(error)) return false;
  return ['EINVAL', 'ENOTSUP', 'EPERM', 'EISDIR'].includes(error.code ?? '');
}

function isAlreadyExistsError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EEXIST';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireGeneration(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(name + ' must be a non-negative integer');
  }
}

function requirePositiveGeneration(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(name + ' must be a positive integer');
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
