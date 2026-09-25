import { spawn } from 'node:child_process';

import {
  evaluateResumeManifestCas,
  validateResumeManifestV1,
  type ResumeManifestCasDecision,
  type ResumeManifestV1,
  type ResumeStore,
} from './resume-manifest.js';

export interface GitResumeCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitResumeCommandRunner {
  run(args: readonly string[], input?: string): Promise<GitResumeCommandResult>;
}

export interface GitResumeStoreOptions {
  readonly repositoryRoot: string;
  readonly remote?: string;
  readonly runner?: GitResumeCommandRunner;
}

const GIT_OBJECT_ID_PATTERN = /^[a-f0-9]{40,64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;

export class GitResumeStore implements ResumeStore {
  readonly #remote: string;
  readonly #runner: GitResumeCommandRunner;

  constructor(readonly options: GitResumeStoreOptions) {
    if (!options.repositoryRoot.trim()) throw new Error('repositoryRoot is required');
    this.#remote = requireRemote(options.remote ?? 'origin');
    this.#runner = options.runner ?? new SpawnGitResumeCommandRunner(options.repositoryRoot);
  }

  async getLatest(repositoryIdentity: string, projectId: string): Promise<ResumeManifestV1 | null> {
    requireText(repositoryIdentity, 'repositoryIdentity');
    requireIdentifier(projectId, 'projectId');

    const stateRef = resumeStateRef(projectId);
    const remoteHead = await this.#readRemoteHead(stateRef);
    if (remoteHead === null) return null;

    const cacheRef = resumeCacheRef(projectId);
    await requireGitSuccess(
      this.#runner.run(['fetch', '--no-tags', this.#remote, `+${stateRef}:${cacheRef}`]),
      'resume state fetch failed',
    );

    const shown = await requireGitSuccess(
      this.#runner.run(['show', `${cacheRef}:manifest.json`]),
      'resume manifest read failed',
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(shown.stdout) as unknown;
    } catch {
      throw new Error('portable resume manifest contains invalid JSON');
    }
    const manifest = parsed as ResumeManifestV1;
    validateResumeManifestV1(manifest);
    if (manifest.repositoryIdentity !== repositoryIdentity) {
      throw new Error('portable resume repository identity mismatch');
    }
    if (manifest.projectId !== projectId) {
      throw new Error('portable resume project identity mismatch');
    }
    return manifest;
  }

  async publishCas(
    candidate: ResumeManifestV1,
    expectedCurrentGeneration: number | null,
  ): Promise<ResumeManifestCasDecision> {
    validateResumeManifestV1(candidate);
    const current = await this.getLatest(candidate.repositoryIdentity, candidate.projectId);
    const decision = evaluateResumeManifestCas(current, candidate, expectedCurrentGeneration);
    if (decision.status === 'CONFLICT') return decision;

    const stateRef = resumeStateRef(candidate.projectId);
    const currentHead = await this.#readRemoteHead(stateRef);
    if ((current === null) !== (currentHead === null)) {
      return conflict('remote resume state changed during publish');
    }

    const manifestJson = JSON.stringify(candidate, null, 2) + '\n';
    const blob = await requireObjectId(
      requireGitSuccess(
        this.#runner.run(['hash-object', '-w', '--stdin'], manifestJson),
        'resume manifest blob creation failed',
      ),
      'resume manifest blob',
    );
    const tree = await requireObjectId(
      requireGitSuccess(
        this.#runner.run(['mktree'], `100644 blob ${blob}\tmanifest.json\n`),
        'resume manifest tree creation failed',
      ),
      'resume manifest tree',
    );

    const commitArgs = [
      '-c',
      'user.name=FreeHighlander',
      '-c',
      'user.email=freehighlander@localhost',
      'commit-tree',
      tree,
      '-m',
      `FreeHighlander portable resume generation ${candidate.generation}`,
    ];
    if (currentHead !== null) commitArgs.push('-p', currentHead);

    const commit = await requireObjectId(
      requireGitSuccess(this.#runner.run(commitArgs), 'resume state commit creation failed'),
      'resume state commit',
    );

    const lease =
      currentHead === null
        ? `--force-with-lease=${stateRef}:`
        : `--force-with-lease=${stateRef}:${currentHead}`;
    const push = await this.#runner.run(['push', this.#remote, lease, `${commit}:${stateRef}`]);
    if (push.exitCode !== 0) {
      return conflict('remote resume state changed during publish');
    }

    const verifiedHead = await this.#readRemoteHead(stateRef);
    if (verifiedHead !== commit) {
      throw new Error('portable resume remote read-back verification failed');
    }
    const verified = await this.getLatest(candidate.repositoryIdentity, candidate.projectId);
    if (verified === null || verified.manifestHash !== candidate.manifestHash) {
      throw new Error('portable resume manifest read-back hash mismatch');
    }

    return {
      status: 'ACCEPT',
      reasons: [],
      acceptedGeneration: candidate.generation,
      authority: 'NONE',
    };
  }

  async #readRemoteHead(stateRef: string): Promise<string | null> {
    const result = await requireGitSuccess(
      this.#runner.run(['ls-remote', '--refs', this.#remote, stateRef]),
      'resume state remote lookup failed',
    );
    const line = result.stdout.trim();
    if (!line) return null;
    const parts = line.split(/\s+/);
    if (
      parts.length !== 2 ||
      parts[1] !== stateRef ||
      !GIT_OBJECT_ID_PATTERN.test(parts[0] ?? '')
    ) {
      throw new Error('resume state remote lookup returned malformed ref data');
    }
    return parts[0] as string;
  }
}

export class SpawnGitResumeCommandRunner implements GitResumeCommandRunner {
  constructor(readonly repositoryRoot: string) {
    if (!repositoryRoot.trim()) throw new Error('repositoryRoot is required');
  }

  run(args: readonly string[], input = ''): Promise<GitResumeCommandResult> {
    for (const arg of args) {
      if (arg.length > 4096 || /[\r\n\0]/.test(arg)) {
        throw new Error('git resume command argument must be bounded single-line metadata');
      }
    }

    return new Promise((resolve, reject) => {
      const child = spawn('git', [...args], {
        cwd: this.repositoryRoot,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        child.kill();
        settled = true;
        reject(new Error('git resume command timed out'));
      }, GIT_TIMEOUT_MS);

      const append = (current: string, chunk: Buffer): string => {
        const next = current + chunk.toString('utf8');
        if (Buffer.byteLength(next, 'utf8') > MAX_GIT_OUTPUT_BYTES) {
          child.kill();
          throw new Error('git resume command output exceeded limit');
        }
        return next;
      };

      child.stdout.on('data', (chunk: Buffer) => {
        try {
          stdout = append(stdout, chunk);
        } catch (error) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        try {
          stderr = append(stderr, chunk);
        } catch (error) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        }
      });
      child.stdin.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPIPE') return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });

      child.stdin.end(input);
    });
  }
}

export function resumeStateRef(projectId: string): string {
  requireIdentifier(projectId, 'projectId');
  return `refs/heads/freehighlander-state/${projectId}`;
}

export function resumeStateBranchCanMergeIntoProductBranches(): false {
  return false;
}

export function gitResumeStoreCanContainSecretValues(): false {
  return false;
}

export function gitResumeStoreCanGrantAuthority(): false {
  return false;
}

function resumeCacheRef(projectId: string): string {
  requireIdentifier(projectId, 'projectId');
  return `refs/freehighlander/resume-cache/${projectId}`;
}

function conflict(reason: string): ResumeManifestCasDecision {
  return {
    status: 'CONFLICT',
    reasons: [reason],
    acceptedGeneration: null,
    authority: 'NONE',
  };
}

async function requireGitSuccess(
  promise: Promise<GitResumeCommandResult>,
  message: string,
): Promise<GitResumeCommandResult> {
  const result = await promise;
  if (result.exitCode !== 0) throw new Error(message);
  return result;
}

async function requireObjectId(
  promise: Promise<GitResumeCommandResult>,
  label: string,
): Promise<string> {
  const result = await promise;
  const value = result.stdout.trim();
  if (!GIT_OBJECT_ID_PATTERN.test(value)) {
    throw new Error(label + ' returned an invalid object id');
  }
  return value;
}

function requireRemote(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error('remote must be a bounded Git remote name');
  }
  return value;
}

function requireIdentifier(value: string, name: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(name + ' must be a bounded identifier');
  }
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(name + ' is required');
}
