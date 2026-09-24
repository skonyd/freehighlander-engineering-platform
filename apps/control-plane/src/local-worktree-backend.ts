import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  ActivityExecutor,
  ActivityExecutorOutcome,
  ActivityRequest,
  ExecutionWorkspaceDescriptor,
} from './execution-runtime.js';

const execFileAsync = promisify(execFile);
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const SAFE_EXECUTABLE_PATTERN = /^[A-Za-z0-9._-]+$/;
const METADATA_SCHEMA_VERSION = 1 as const;

export interface LocalGitWorktreeBackendOptions {
  readonly runtimeRoot: string;
  readonly maxSnapshotBytes?: number;
}

export interface LocalWorkspaceHandle {
  readonly descriptor: ExecutionWorkspaceDescriptor;
  readonly repositoryRoot: string;
  readonly workspacePath: string;
  readonly metadataPath: string;
  readonly authority: 'NONE';
}

export interface WorkspaceUntrackedEntry {
  readonly path: string;
  readonly sizeBytes: number;
  readonly contentHash: string;
}

export interface WorkspaceSnapshotV1 {
  readonly schemaVersion: 1;
  readonly workspaceHash: string;
  readonly headRevision: string;
  readonly trackedDiff: string;
  readonly diffHash: string;
  readonly statusPorcelain: string;
  readonly untracked: readonly WorkspaceUntrackedEntry[];
  readonly snapshotHash: string;
  readonly authority: 'NONE';
}

export interface LocalCommandExecutorOptions {
  readonly allowedExecutables: readonly string[];
  readonly maxOutputBytes?: number;
  readonly inheritedEnvironmentKeys?: readonly string[];
}

interface WorkspaceMetadataV1 {
  readonly schemaVersion: 1;
  readonly descriptor: ExecutionWorkspaceDescriptor;
  readonly repositoryRoot: string;
  readonly workspacePath: string;
}

interface CommandActivityInputV1 {
  readonly schemaVersion: 1;
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
}

type FilesystemActivityInputV1 =
  | {
      readonly schemaVersion: 1;
      readonly operation: 'READ_TEXT';
      readonly path: string;
    }
  | {
      readonly schemaVersion: 1;
      readonly operation: 'WRITE_TEXT';
      readonly path: string;
      readonly content: string;
      readonly maxBytes: number;
    };

interface GitActivityInputV1 {
  readonly schemaVersion: 1;
  readonly operation: 'STATUS' | 'DIFF';
}

export class LocalGitWorktreeBackend {
  readonly #runtimeRoot: string;
  readonly #maxSnapshotBytes: number;

  constructor(options: LocalGitWorktreeBackendOptions) {
    if (!path.isAbsolute(options.runtimeRoot)) {
      throw new Error('runtimeRoot must be absolute');
    }
    this.#runtimeRoot = path.resolve(options.runtimeRoot);
    this.#maxSnapshotBytes = options.maxSnapshotBytes ?? 8 * 1024 * 1024;
    if (!Number.isInteger(this.#maxSnapshotBytes) || this.#maxSnapshotBytes <= 0) {
      throw new Error('maxSnapshotBytes must be a positive integer');
    }
  }

  async create(
    descriptor: ExecutionWorkspaceDescriptor,
    repositoryRoot: string,
  ): Promise<LocalWorkspaceHandle> {
    validateBackendDescriptor(descriptor);
    const repository = await requireGitRepositoryRoot(repositoryRoot);
    const workspacePath = this.#workspacePath(descriptor.workspaceId);
    const metadataPath = this.#metadataPath(descriptor.workspaceId);

    await mkdir(path.dirname(workspacePath), { recursive: true });
    await mkdir(path.dirname(metadataPath), { recursive: true });
    await requireMissing(workspacePath, 'workspace path already exists');
    await requireMissing(metadataPath, 'workspace metadata already exists');

    await runGit(repository, ['worktree', 'add', '--detach', workspacePath, descriptor.exactRevision]);
    const observedHead = await gitHead(workspacePath);
    if (observedHead !== descriptor.exactRevision) {
      throw new Error('created worktree HEAD does not match exact revision');
    }

    const metadata: WorkspaceMetadataV1 = {
      schemaVersion: METADATA_SCHEMA_VERSION,
      descriptor,
      repositoryRoot: repository,
      workspacePath,
    };
    await atomicWriteJson(metadataPath, metadata);

    return {
      descriptor,
      repositoryRoot: repository,
      workspacePath,
      metadataPath,
      authority: 'NONE',
    };
  }

  async reattach(descriptor: ExecutionWorkspaceDescriptor): Promise<LocalWorkspaceHandle> {
    validateBackendDescriptor(descriptor);
    const metadataPath = this.#metadataPath(descriptor.workspaceId);
    const metadata = await readWorkspaceMetadata(metadataPath);

    if (metadata.descriptor.workspaceHash !== descriptor.workspaceHash) {
      throw new Error('workspace metadata descriptor hash mismatch');
    }
    if (canonicalJson(metadata.descriptor) !== canonicalJson(descriptor)) {
      throw new Error('workspace metadata descriptor mismatch');
    }

    const expectedWorkspacePath = this.#workspacePath(descriptor.workspaceId);
    if (path.resolve(metadata.workspacePath) !== expectedWorkspacePath) {
      throw new Error('workspace metadata path mismatch');
    }

    const repository = await requireGitRepositoryRoot(metadata.repositoryRoot);
    const workspace = await realpath(expectedWorkspacePath);
    if (workspace !== expectedWorkspacePath) {
      throw new Error('workspace path canonicalization mismatch');
    }

    const observedTopLevel = await gitTopLevel(workspace);
    if (observedTopLevel !== workspace) {
      throw new Error('workspace Git top-level mismatch');
    }

    const observedHead = await gitHead(workspace);
    if (observedHead !== descriptor.exactRevision) {
      throw new Error('workspace HEAD no longer matches exact revision');
    }

    return {
      descriptor,
      repositoryRoot: repository,
      workspacePath: workspace,
      metadataPath,
      authority: 'NONE',
    };
  }

  async readText(handle: LocalWorkspaceHandle, relativePath: string): Promise<string> {
    await assertHandleCurrent(handle);
    const target = await resolveWorkspacePath(handle.workspacePath, relativePath, 'READ');
    return readFile(target, 'utf8');
  }

  async writeText(
    handle: LocalWorkspaceHandle,
    relativePath: string,
    content: string,
    maxBytes: number,
  ): Promise<void> {
    if (handle.descriptor.accessMode !== 'MUTABLE_IMPLEMENTATION') {
      throw new Error('immutable review workspace cannot be mutated');
    }
    if (!Number.isInteger(maxBytes) || maxBytes < 0) {
      throw new Error('maxBytes must be a non-negative integer');
    }
    const encodedBytes = Buffer.byteLength(content, 'utf8');
    if (encodedBytes > maxBytes) {
      throw new Error('filesystem write exceeds maxBytes');
    }

    await assertHandleCurrent(handle);
    const target = await resolveWorkspacePath(handle.workspacePath, relativePath, 'WRITE');
    await writeFile(target, content, { encoding: 'utf8', flag: 'w' });
  }

  async snapshot(handle: LocalWorkspaceHandle): Promise<WorkspaceSnapshotV1> {
    await assertHandleCurrent(handle);
    const headRevision = await gitHead(handle.workspacePath);
    const trackedDiff = await runGit(handle.workspacePath, [
      'diff',
      '--no-ext-diff',
      '--binary',
      '--full-index',
      'HEAD',
      '--',
    ]);
    const statusPorcelain = await runGit(handle.workspacePath, [
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ]);
    if (
      Buffer.byteLength(trackedDiff, 'utf8') + Buffer.byteLength(statusPorcelain, 'utf8') >
      this.#maxSnapshotBytes
    ) {
      throw new Error('workspace snapshot exceeds maxSnapshotBytes');
    }

    const untrackedPaths = parseUntrackedPaths(statusPorcelain);
    const untracked: WorkspaceUntrackedEntry[] = [];
    let snapshotBytes =
      Buffer.byteLength(trackedDiff, 'utf8') + Buffer.byteLength(statusPorcelain, 'utf8');
    for (const entryPath of untrackedPaths) {
      const target = await resolveWorkspacePath(handle.workspacePath, entryPath, 'READ');
      const bytes = await readFile(target);
      snapshotBytes += bytes.byteLength;
      if (snapshotBytes > this.#maxSnapshotBytes) {
        throw new Error('workspace snapshot exceeds maxSnapshotBytes');
      }
      untracked.push({
        path: entryPath,
        sizeBytes: bytes.byteLength,
        contentHash: sha256(bytes),
      });
    }

    const normalizedUntracked = [...untracked].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
    const diffHash = sha256(
      canonicalJson({
        trackedDiff,
        untracked: normalizedUntracked,
      }),
    );
    const snapshotIdentity = {
      schemaVersion: 1,
      workspaceHash: handle.descriptor.workspaceHash,
      headRevision,
      diffHash,
      statusPorcelain,
      untracked: normalizedUntracked,
    } as const;

    return {
      ...snapshotIdentity,
      trackedDiff,
      snapshotHash: sha256(canonicalJson(snapshotIdentity)),
      authority: 'NONE',
    };
  }

  #workspacePath(workspaceId: string): string {
    validateWorkspaceId(workspaceId);
    return path.join(this.#runtimeRoot, 'workspaces', workspaceId);
  }

  #metadataPath(workspaceId: string): string {
    validateWorkspaceId(workspaceId);
    return path.join(this.#runtimeRoot, 'metadata', workspaceId + '.json');
  }
}

export function createLocalCommandActivityExecutor(
  handle: LocalWorkspaceHandle,
  options: LocalCommandExecutorOptions,
): ActivityExecutor {
  const allowedExecutables = new Set(options.allowedExecutables);
  if (allowedExecutables.size === 0) throw new Error('allowedExecutables must not be empty');
  for (const executable of allowedExecutables) validateExecutableName(executable);

  const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new Error('maxOutputBytes must be a positive integer');
  }

  const inheritedEnvironmentKeys = [...(options.inheritedEnvironmentKeys ?? ['PATH'])];
  for (const key of inheritedEnvironmentKeys) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error('invalid inherited environment key');
    }
  }

  return {
    id: 'local-command-v1',
    async execute(request: ActivityRequest): Promise<ActivityExecutorOutcome> {
      if (handle.descriptor.accessMode !== 'MUTABLE_IMPLEMENTATION') {
        return {
          status: 'FAILED',
          output: '',
          failureKind: 'IMMUTABLE_WORKSPACE',
        };
      }

      let input: CommandActivityInputV1;
      try {
        input = parseCommandActivityInput(request.input);
      } catch {
        return {
          status: 'FAILED',
          output: '',
          failureKind: 'MALFORMED_ACTIVITY_INPUT',
        };
      }
      if (!allowedExecutables.has(input.executable)) {
        return {
          status: 'FAILED',
          output: '',
          failureKind: 'EXECUTABLE_NOT_ALLOWED',
        };
      }

      await assertHandleCurrent(handle);
      const cwd = input.cwd
        ? await resolveWorkspacePath(handle.workspacePath, input.cwd, 'DIRECTORY')
        : handle.workspacePath;
      const environment = pickEnvironment(inheritedEnvironmentKeys);

      try {
        const result = await execFileAsync(input.executable, [...input.args], {
          cwd,
          timeout: request.timeoutMs,
          maxBuffer: maxOutputBytes,
          env: environment,
          windowsHide: true,
        });
        return {
          status: 'SUCCEEDED',
          output: normalizeCommandOutput(result.stdout, result.stderr),
        };
      } catch (error) {
        return {
          status: 'FAILED',
          output: normalizeCommandOutput(errorOutput(error, 'stdout'), errorOutput(error, 'stderr')),
          failureKind: isKilledProcessError(error) ? 'COMMAND_TIMEOUT' : 'COMMAND_FAILED',
        };
      }
    },
  };
}

export function createLocalFilesystemActivityExecutor(
  backend: LocalGitWorktreeBackend,
  handle: LocalWorkspaceHandle,
): ActivityExecutor {
  return {
    id: 'local-filesystem-v1',
    async execute(request: ActivityRequest): Promise<ActivityExecutorOutcome> {
      let input: FilesystemActivityInputV1;
      try {
        input = parseFilesystemActivityInput(request.input);
      } catch {
        return {
          status: 'FAILED',
          output: '',
          failureKind: 'MALFORMED_ACTIVITY_INPUT',
        };
      }
      if (input.operation === 'READ_TEXT') {
        try {
          return {
            status: 'SUCCEEDED',
            output: await backend.readText(handle, input.path),
          };
        } catch {
          return {
            status: 'FAILED',
            output: '',
            failureKind: 'FILESYSTEM_READ_FAILED',
          };
        }
      }

      try {
        await backend.writeText(handle, input.path, input.content, input.maxBytes);
        return {
          status: 'SUCCEEDED',
          output: canonicalJson({
            path: input.path,
            bytes: Buffer.byteLength(input.content, 'utf8'),
          }),
        };
      } catch {
        return {
          status: 'FAILED',
          output: '',
          failureKind: 'FILESYSTEM_WRITE_FAILED',
        };
      }
    },
  };
}

export function createLocalGitActivityExecutor(
  backend: LocalGitWorktreeBackend,
  handle: LocalWorkspaceHandle,
): ActivityExecutor {
  return {
    id: 'local-git-readonly-v1',
    async execute(request: ActivityRequest): Promise<ActivityExecutorOutcome> {
      let input: GitActivityInputV1;
      try {
        input = parseGitActivityInput(request.input);
      } catch {
        return {
          status: 'FAILED',
          output: '',
          failureKind: 'MALFORMED_ACTIVITY_INPUT',
        };
      }
      try {
        const snapshot = await backend.snapshot(handle);
        return {
          status: 'SUCCEEDED',
          output:
            input.operation === 'DIFF'
              ? canonicalJson({
                  diffHash: snapshot.diffHash,
                  trackedDiff: snapshot.trackedDiff,
                  untracked: snapshot.untracked,
                })
              : canonicalJson({
                  headRevision: snapshot.headRevision,
                  statusPorcelain: snapshot.statusPorcelain,
                  snapshotHash: snapshot.snapshotHash,
                }),
        };
      } catch {
        return {
          status: 'FAILED',
          output: '',
          failureKind: 'GIT_READ_FAILED',
        };
      }
    },
  };
}

export function localWorktreeBackendCanGrantAuthority(): false {
  return false;
}

export function localCommandExecutorUsesShell(): false {
  return false;
}

export function localWorkspaceDestroyRequiresLeaseGuard(): true {
  return true;
}

function validateBackendDescriptor(descriptor: ExecutionWorkspaceDescriptor): void {
  if (descriptor.backendId !== 'local-git-worktree') {
    throw new Error('descriptor backendId must be local-git-worktree');
  }
  validateWorkspaceId(descriptor.workspaceId);
  if (!GIT_SHA_PATTERN.test(descriptor.exactRevision)) {
    throw new Error('local worktree exactRevision must be a full Git SHA');
  }
  if (descriptor.authority !== 'NONE') {
    throw new Error('execution workspace authority must remain NONE');
  }
}

function validateWorkspaceId(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(value)) {
    throw new Error('workspaceId must be a bounded path-safe identifier');
  }
}

async function requireGitRepositoryRoot(repositoryRoot: string): Promise<string> {
  if (!path.isAbsolute(repositoryRoot)) throw new Error('repositoryRoot must be absolute');
  const canonical = await realpath(repositoryRoot);
  const observed = await gitTopLevel(canonical);
  if (observed !== canonical) throw new Error('repositoryRoot must be the Git top-level');
  return canonical;
}

async function gitTopLevel(cwd: string): Promise<string> {
  return path.resolve((await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim());
}

async function gitHead(cwd: string): Promise<string> {
  return (await runGit(cwd, ['rev-parse', 'HEAD'])).trim();
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout;
}

async function requireMissing(target: string, message: string): Promise<void> {
  try {
    await lstat(target);
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) return;
    throw error;
  }
  throw new Error(message);
}

async function atomicWriteJson(target: string, value: unknown): Promise<void> {
  const temporary = target + '.tmp';
  await writeFile(temporary, canonicalJson(value) + '\n', {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  await rename(temporary, target);
}

async function readWorkspaceMetadata(target: string): Promise<WorkspaceMetadataV1> {
  const parsed: unknown = JSON.parse(await readFile(target, 'utf8'));
  if (!isRecord(parsed) || parsed.schemaVersion !== METADATA_SCHEMA_VERSION) {
    throw new Error('workspace metadata schema mismatch');
  }
  if (
    !isRecord(parsed.descriptor) ||
    typeof parsed.repositoryRoot !== 'string' ||
    typeof parsed.workspacePath !== 'string'
  ) {
    throw new Error('workspace metadata is malformed');
  }
  return parsed as unknown as WorkspaceMetadataV1;
}

type WorkspacePathMode = 'READ' | 'WRITE' | 'DIRECTORY';

async function resolveWorkspacePath(
  workspaceRoot: string,
  relativePath: string,
  mode: WorkspacePathMode,
): Promise<string> {
  validateRelativeWorkspacePath(relativePath);
  const root = await realpath(workspaceRoot);
  const candidate = path.resolve(root, relativePath);
  requireContainedPath(root, candidate);

  const segments = relativePath.split(/[\\/]+/).filter((segment) => segment && segment !== '.');
  let current = root;
  const inspectCount = mode === 'WRITE' ? Math.max(segments.length - 1, 0) : segments.length;
  for (let index = 0; index < inspectCount; index += 1) {
    current = path.join(current, segments[index] as string);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error('workspace path cannot traverse symbolic links');
  }

  if (mode === 'DIRECTORY') {
    const info = await stat(candidate);
    if (!info.isDirectory()) throw new Error('workspace cwd must be a directory');
  }
  if (mode === 'READ') {
    const info = await lstat(candidate);
    if (info.isSymbolicLink()) throw new Error('workspace path cannot read symbolic links');
  }
  if (mode === 'WRITE') {
    const existing = await lstat(candidate).catch((error: unknown) => {
      if (isNodeErrorCode(error, 'ENOENT')) return null;
      throw error;
    });
    if (existing?.isSymbolicLink()) throw new Error('workspace path cannot write symbolic links');
  }

  return candidate;
}

function validateRelativeWorkspacePath(value: string): void {
  if (!value.trim()) throw new Error('workspace relative path is required');
  if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new Error('workspace path must be relative');
  }
  const parts = value.split(/[\\/]+/);
  if (parts.includes('..')) throw new Error('workspace path traversal is forbidden');
  if (parts.includes('.git')) throw new Error('workspace .git mutation/read is forbidden');
}

function requireContainedPath(root: string, candidate: string): void {
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    throw new Error('workspace path escaped root');
  }
}

function parseCommandActivityInput(source: string): CommandActivityInputV1 {
  const value = parseJsonRecord(source, 'command activity input');
  assertExactKeys(value, ['schemaVersion', 'executable', 'args'], ['cwd']);
  if (value.schemaVersion !== 1) throw new Error('command activity schemaVersion must be 1');
  if (typeof value.executable !== 'string') throw new Error('command executable must be a string');
  validateExecutableName(value.executable);
  if (!Array.isArray(value.args) || value.args.some((item) => typeof item !== 'string')) {
    throw new Error('command args must be a string array');
  }
  if (value.cwd !== undefined && typeof value.cwd !== 'string') {
    throw new Error('command cwd must be a string');
  }
  return {
    schemaVersion: 1,
    executable: value.executable,
    args: value.args as string[],
    ...(value.cwd === undefined ? {} : { cwd: value.cwd as string }),
  };
}

function parseFilesystemActivityInput(source: string): FilesystemActivityInputV1 {
  const value = parseJsonRecord(source, 'filesystem activity input');
  if (value.schemaVersion !== 1) throw new Error('filesystem activity schemaVersion must be 1');
  if (value.operation === 'READ_TEXT') {
    assertExactKeys(value, ['schemaVersion', 'operation', 'path']);
    if (typeof value.path !== 'string') throw new Error('filesystem path must be a string');
    return { schemaVersion: 1, operation: 'READ_TEXT', path: value.path };
  }
  if (value.operation === 'WRITE_TEXT') {
    assertExactKeys(value, ['schemaVersion', 'operation', 'path', 'content', 'maxBytes']);
    if (typeof value.path !== 'string') throw new Error('filesystem path must be a string');
    if (typeof value.content !== 'string') throw new Error('filesystem content must be a string');
    if (!Number.isInteger(value.maxBytes) || (value.maxBytes as number) < 0) {
      throw new Error('filesystem maxBytes must be a non-negative integer');
    }
    return {
      schemaVersion: 1,
      operation: 'WRITE_TEXT',
      path: value.path,
      content: value.content,
      maxBytes: value.maxBytes as number,
    };
  }
  throw new Error('unsupported filesystem activity operation');
}

function parseGitActivityInput(source: string): GitActivityInputV1 {
  const value = parseJsonRecord(source, 'git activity input');
  assertExactKeys(value, ['schemaVersion', 'operation']);
  if (value.schemaVersion !== 1) throw new Error('git activity schemaVersion must be 1');
  if (value.operation !== 'STATUS' && value.operation !== 'DIFF') {
    throw new Error('unsupported git activity operation');
  }
  return { schemaVersion: 1, operation: value.operation };
}

function parseJsonRecord(source: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(label + ' must be valid JSON');
  }
  if (!isRecord(parsed)) throw new Error(label + ' must be an object');
  return parsed;
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error('activity input missing field: ' + key);
    }
  }
  if (keys.some((key) => !allowed.has(key))) {
    throw new Error('activity input contains unknown fields');
  }
}

function validateExecutableName(value: string): void {
  if (!SAFE_EXECUTABLE_PATTERN.test(value)) {
    throw new Error('executable must be a path-free command name');
  }
}

function pickEnvironment(keys: readonly string[]): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) output[key] = value;
  }
  return output;
}

function normalizeCommandOutput(stdout: string, stderr: string): string {
  return canonicalJson({ stdout, stderr });
}

function errorOutput(error: unknown, key: 'stdout' | 'stderr'): string {
  if (!isRecord(error)) return '';
  const value = error[key];
  return typeof value === 'string' ? value : '';
}

function isKilledProcessError(error: unknown): boolean {
  return isRecord(error) && error.killed === true;
}

function parseUntrackedPaths(statusPorcelain: string): readonly string[] {
  return statusPorcelain
    .split('\0')
    .filter((entry) => entry.startsWith('?? '))
    .map((entry) => entry.slice(3))
    .sort();
}

async function assertHandleCurrent(handle: LocalWorkspaceHandle): Promise<void> {
  if (handle.descriptor.backendId !== 'local-git-worktree') {
    throw new Error('workspace handle backend mismatch');
  }
  if (path.resolve(handle.workspacePath) !== handle.workspacePath) {
    throw new Error('workspace handle path must be canonical');
  }

  const metadata = await readWorkspaceMetadata(handle.metadataPath);
  if (
    metadata.descriptor.workspaceHash !== handle.descriptor.workspaceHash ||
    canonicalJson(metadata.descriptor) !== canonicalJson(handle.descriptor) ||
    path.resolve(metadata.workspacePath) !== handle.workspacePath ||
    path.resolve(metadata.repositoryRoot) !== handle.repositoryRoot
  ) {
    throw new Error('workspace handle metadata mismatch');
  }

  const observedHead = await gitHead(handle.workspacePath);
  if (observedHead !== handle.descriptor.exactRevision) {
    throw new Error('workspace handle HEAD drifted from exact revision');
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return (
    '{' +
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => JSON.stringify(key) + ':' + canonicalJson(nested))
      .join(',') +
    '}'
  );
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}
