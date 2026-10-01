import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { ActivityExecutor, ActivityExecutorOutcome, ActivityRequest } from './execution-runtime.js';
import {
  createGitWriteGatedExecutor,
  type AuthorityCapabilityExecutionGate,
} from './authority-capability-execution.js';
import type { LocalWorkspaceHandle } from './local-worktree-backend.js';

const execFileAsync = promisify(execFile);
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

export interface LocalGitWriteExecutorOptions {
  readonly authorName: string;
  readonly authorEmail: string;
  readonly maxPaths?: number;
  readonly maxOutputBytes?: number;
}

interface GitWriteActivityInputV1 {
  readonly schemaVersion: 1;
  readonly operation: 'COMMIT_CHANGESET';
  readonly branch: string;
  readonly message: string;
  readonly paths: readonly string[];
}

export function createGatedLocalGitWriteExecutor(
  gate: AuthorityCapabilityExecutionGate,
  handle: LocalWorkspaceHandle,
  options: LocalGitWriteExecutorOptions,
): ActivityExecutor {
  const authorName = requireBoundedText(options.authorName, 'authorName', 128);
  const authorEmail = requireEmail(options.authorEmail);
  const maxPaths = options.maxPaths ?? 256;
  const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
  if (!Number.isInteger(maxPaths) || maxPaths < 1 || maxPaths > 4096) {
    throw new Error('maxPaths must be an integer between 1 and 4096');
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1024) {
    throw new Error('maxOutputBytes must be an integer >= 1024');
  }

  const raw: ActivityExecutor = {
    id: 'local-git-write-v1',
    async execute(request: ActivityRequest): Promise<ActivityExecutorOutcome> {
      if (handle.descriptor.accessMode !== 'MUTABLE_IMPLEMENTATION') {
        return failed('IMMUTABLE_WORKSPACE');
      }

      let input: GitWriteActivityInputV1;
      try {
        input = parseInput(request.input, maxPaths);
      } catch {
        return failed('MALFORMED_ACTIVITY_INPUT');
      }

      try {
        await assertWorkspaceCurrent(handle, request.timeoutMs, maxOutputBytes);
      } catch {
        return failed('GIT_WRITE_WORKSPACE_INVALID');
      }

      const git = (args: readonly string[]) =>
        runGit(handle.workspacePath, args, request.timeoutMs, maxOutputBytes);

      let branchCreated = false;
      try {
        const preStaged = await git(['diff', '--cached', '--name-only', '--']);
        if (preStaged.trim()) return failed('GIT_WRITE_INDEX_NOT_CLEAN');

        await git(['add', '--', ...input.paths]);
        const staged = (await git(['diff', '--cached', '--name-only', '--'])).trim();
        if (!staged) return failed('GIT_WRITE_NO_CHANGES');

        const stagedPaths = staged.split('\n').filter(Boolean).sort();
        const allowed = new Set(input.paths);
        if (stagedPaths.some((entry) => !allowed.has(entry))) {
          await gitNoThrow(handle.workspacePath, ['reset', '--mixed', 'HEAD', '--'], request.timeoutMs);
          return failed('GIT_WRITE_SCOPE_VIOLATION');
        }

        await git(['switch', '-c', input.branch]);
        branchCreated = true;

        const hooksPath = path.join(path.dirname(handle.metadataPath), 'disabled-hooks');
        await git([
          '-c',
          'user.name=' + authorName,
          '-c',
          'user.email=' + authorEmail,
          '-c',
          'core.hooksPath=' + hooksPath,
          'commit',
          '--no-gpg-sign',
          '--no-verify',
          '-m',
          input.message,
        ]);
        const headRevision = (await git(['rev-parse', 'HEAD'])).trim();
        if (!GIT_SHA_PATTERN.test(headRevision)) {
          throw new Error('git commit did not produce a full SHA');
        }

        return {
          status: 'SUCCEEDED',
          output: JSON.stringify({
            schemaVersion: 1,
            branch: input.branch,
            headRevision,
            paths: stagedPaths,
          }),
        };
      } catch {
        await gitNoThrow(handle.workspacePath, ['reset', '--mixed', 'HEAD', '--'], request.timeoutMs);
        if (branchCreated) {
          await gitNoThrow(
            handle.workspacePath,
            ['switch', '--detach', handle.descriptor.exactRevision],
            request.timeoutMs,
          );
          await gitNoThrow(
            handle.workspacePath,
            ['branch', '-D', input.branch],
            request.timeoutMs,
          );
        }
        return failed('GIT_WRITE_FAILED');
      }
    },
  };

  return createGitWriteGatedExecutor(gate, raw);
}

export function localGitWriteExecutorUsesShell(): false {
  return false;
}

export function localGitWriteExecutorCanBypassCapabilityGate(): false {
  return false;
}

function parseInput(source: string, maxPaths: number): GitWriteActivityInputV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('git write input must be valid JSON');
  }
  if (!isRecord(parsed)) throw new Error('git write input must be an object');
  const keys = Object.keys(parsed);
  const allowed = new Set(['schemaVersion', 'operation', 'branch', 'message', 'paths']);
  if (keys.some((key) => !allowed.has(key))) throw new Error('git write input contains unknown fields');
  if (parsed.schemaVersion !== 1) throw new Error('git write schemaVersion must be 1');
  if (parsed.operation !== 'COMMIT_CHANGESET') throw new Error('unsupported git write operation');
  if (typeof parsed.branch !== 'string') throw new Error('branch must be a string');
  if (typeof parsed.message !== 'string') throw new Error('message must be a string');
  if (!Array.isArray(parsed.paths) || parsed.paths.some((entry) => typeof entry !== 'string')) {
    throw new Error('paths must be a string array');
  }

  const branch = validateBranch(parsed.branch);
  const message = requireBoundedText(parsed.message, 'message', 200);
  if (message.includes('\n') || message.includes('\r')) {
    throw new Error('message must be one line');
  }
  if (parsed.paths.length < 1 || parsed.paths.length > maxPaths) {
    throw new Error('paths count is outside the configured bounds');
  }

  const unique = new Set<string>();
  const paths = parsed.paths.map((entry) => validateRepositoryPath(entry));
  for (const entry of paths) {
    if (unique.has(entry)) throw new Error('duplicate path: ' + entry);
    unique.add(entry);
  }

  return { schemaVersion: 1, operation: 'COMMIT_CHANGESET', branch, message, paths };
}

function validateBranch(value: string): string {
  if (
    !BRANCH_PATTERN.test(value) ||
    value.includes('..') ||
    value.includes('//') ||
    value.includes('@{') ||
    value.endsWith('/') ||
    value.endsWith('.') ||
    value.endsWith('.lock')
  ) {
    throw new Error('branch is not a safe Git branch name');
  }
  return value;
}

function validateRepositoryPath(value: string): string {
  if (!value.trim()) throw new Error('path is required');
  if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new Error('path must be repository-relative');
  }
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment === '.git')) {
    throw new Error('path contains a forbidden segment');
  }
  return normalized;
}

async function assertWorkspaceCurrent(
  handle: LocalWorkspaceHandle,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<void> {
  if (path.resolve(handle.workspacePath) !== handle.workspacePath) {
    throw new Error('workspace path must be canonical');
  }
  const workspace = await realpath(handle.workspacePath);
  if (workspace !== handle.workspacePath) throw new Error('workspace realpath mismatch');
  const topLevel = (
    await runGit(handle.workspacePath, ['rev-parse', '--show-toplevel'], timeoutMs, maxOutputBytes)
  ).trim();
  if (path.resolve(topLevel) !== handle.workspacePath) throw new Error('workspace Git root mismatch');
  const head = (
    await runGit(handle.workspacePath, ['rev-parse', 'HEAD'], timeoutMs, maxOutputBytes)
  ).trim();
  if (head !== handle.descriptor.exactRevision) throw new Error('workspace HEAD drifted');
}

async function runGit(
  cwd: string,
  args: readonly string[],
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd,
    timeout: timeoutMs,
    maxBuffer: maxOutputBytes,
    env: { PATH: process.env.PATH },
    windowsHide: true,
  });
  return result.stdout;
}

async function gitNoThrow(cwd: string, args: readonly string[], timeoutMs: number): Promise<void> {
  try {
    await execFileAsync('git', [...args], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH },
      windowsHide: true,
    });
  } catch {
    // Cleanup is best-effort; the operation remains failed/closed.
  }
}

function failed(failureKind: string): ActivityExecutorOutcome {
  return { status: 'FAILED', output: '', failureKind };
}

function requireBoundedText(value: string, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || value.includes('\0')) {
    throw new Error(field + ' must be non-empty bounded text');
  }
  return value.trim();
}

function requireEmail(value: string): string {
  if (typeof value !== 'string' || value.length > 254 || !EMAIL_PATTERN.test(value)) {
    throw new Error('authorEmail must be a bounded email-like identifier');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
