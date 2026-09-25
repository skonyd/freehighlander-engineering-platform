import { spawn } from 'node:child_process';

import {
  validatePortableCanonicalEventBundleV1,
  type PortableCanonicalEventBundleV1,
} from './portable-event-bundle.js';
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

  async listProjectIds(): Promise<readonly string[]> {
    const prefix = 'refs/heads/freehighlander-state/';
    const result = await requireGitSuccess(
      this.#runner.run(['ls-remote', '--refs', this.#remote, `${prefix}*`]),
      'resume state project discovery failed',
    );
    const output = result.stdout.trim();
    if (!output) return [];

    const seen = new Set<string>();
    for (const line of output.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (
        parts.length !== 2 ||
        !GIT_OBJECT_ID_PATTERN.test(parts[0] ?? '') ||
        !parts[1]?.startsWith(prefix)
      ) {
        throw new Error('resume state project discovery returned malformed ref data');
      }
      const projectId = parts[1].slice(prefix.length);
      requireIdentifier(projectId, 'projectId');
      if (seen.has(projectId)) {
        throw new Error('resume state project discovery returned duplicate project ref');
      }
      seen.add(projectId);
    }

    return [...seen].sort();
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

  async getLatestEventBundle(
    repositoryIdentity: string,
    projectId: string,
  ): Promise<PortableCanonicalEventBundleV1 | null> {
    const manifest = await this.getLatest(repositoryIdentity, projectId);
    if (manifest === null) return null;

    const artifact = portableEventArtifactEntry(manifest);
    if (artifact === null) return null;

    const cacheRef = resumeCacheRef(projectId);
    const shown = await requireGitSuccess(
      this.#runner.run(['show', `${cacheRef}:portable-events.json`]),
      'portable event bundle read failed',
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(shown.stdout) as unknown;
    } catch {
      throw new Error('portable event bundle contains invalid JSON');
    }
    const bundle = parsed as PortableCanonicalEventBundleV1;
    validatePortableCanonicalEventBundleV1(bundle);
    assertManifestBindsEventBundle(manifest, bundle);
    if (artifact.contentHash !== bundle.bundleHash) {
      throw new Error('portable event bundle artifact hash mismatch');
    }
    return bundle;
  }

  async publishCasWithEventBundle(
    candidate: ResumeManifestV1,
    bundle: PortableCanonicalEventBundleV1,
    expectedCurrentGeneration: number | null,
  ): Promise<ResumeManifestCasDecision> {
    return this.publishCas(candidate, expectedCurrentGeneration, bundle);
  }

  async publishCas(
    candidate: ResumeManifestV1,
    expectedCurrentGeneration: number | null,
    eventBundle: PortableCanonicalEventBundleV1 | null = null,
  ): Promise<ResumeManifestCasDecision> {
    validateResumeManifestV1(candidate);
    if (eventBundle === null) {
      if (portableEventArtifactEntry(candidate) !== null) {
        throw new Error('portable resume manifest requires its bound event bundle');
      }
    } else {
      validatePortableCanonicalEventBundleV1(eventBundle);
      assertManifestBindsEventBundle(candidate, eventBundle);
    }
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

    let treeInput = `100644 blob ${blob}\tmanifest.json\n`;
    if (eventBundle !== null) {
      const eventBundleJson = JSON.stringify(eventBundle, null, 2) + '\n';
      const eventBlob = await requireObjectId(
        requireGitSuccess(
          this.#runner.run(['hash-object', '-w', '--stdin'], eventBundleJson),
          'portable event bundle blob creation failed',
        ),
        'portable event bundle blob',
      );
      treeInput += `100644 blob ${eventBlob}\tportable-events.json\n`;
    }

    const tree = await requireObjectId(
      requireGitSuccess(
        this.#runner.run(['mktree'], treeInput),
        'resume state tree creation failed',
      ),
      'resume state tree',
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
    if (eventBundle !== null) {
      const verifiedBundle = await this.getLatestEventBundle(
        candidate.repositoryIdentity,
        candidate.projectId,
      );
      if (verifiedBundle === null || verifiedBundle.bundleHash !== eventBundle.bundleHash) {
        throw new Error('portable event bundle read-back hash mismatch');
      }
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

export function portableEventArtifactId(runId: string): string {
  requireIdentifier(runId, 'runId');
  return `portable-events:${runId}`;
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

function portableEventArtifactEntry(manifest: ResumeManifestV1) {
  const entries = manifest.artifactManifest.filter((entry) =>
    entry.artifactId.startsWith('portable-events:'),
  );
  if (entries.length > 1) {
    throw new Error('portable resume manifest contains multiple event bundle artifacts');
  }
  return entries[0] ?? null;
}

function assertManifestBindsEventBundle(
  manifest: ResumeManifestV1,
  bundle: PortableCanonicalEventBundleV1,
): void {
  if (bundle.repositoryIdentity !== manifest.repositoryIdentity) {
    throw new Error('portable event bundle repository identity mismatch');
  }
  if (bundle.projectId !== manifest.projectId) {
    throw new Error('portable event bundle project identity mismatch');
  }
  if (bundle.exactRevision !== manifest.remoteHead) {
    throw new Error('portable event bundle revision mismatch');
  }

  const artifactId = portableEventArtifactId(bundle.runId);
  const artifact = manifest.artifactManifest.find((entry) => entry.artifactId === artifactId);
  if (
    artifact === undefined ||
    artifact.classification !== 'PORTABLE_REQUIRED' ||
    artifact.contentHash !== bundle.bundleHash
  ) {
    throw new Error('portable resume manifest does not bind the event bundle hash');
  }
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
