import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { validatePortableOwnershipLease } from '../../../packages/orchestration/dist/index.js';

const GIT_OBJECT_ID_PATTERN = /^[a-f0-9]{40,64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;

export class GitPortableOwnershipStore {
  #remote;
  #runner;

  constructor(repositoryRoot, remote = 'origin', runner = undefined) {
    if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) {
      throw new Error('repositoryRoot is required');
    }
    this.#remote = requireRemote(remote);
    this.#runner = runner ?? new SpawnPortableOwnershipGitRunner(repositoryRoot);
  }

  async getLatest(repositoryIdentity, projectId, workItemId) {
    requireText(repositoryIdentity, 'repositoryIdentity');
    const stateRef = portableOwnershipStateRef(projectId, workItemId);
    const remoteHead = this.#readRemoteHead(stateRef);
    if (remoteHead === null) return null;

    const cacheRef = portableOwnershipCacheRef(projectId, workItemId);
    requireGitSuccess(
      this.#runner.run(['fetch', '--no-tags', this.#remote, `+${remoteHead}:${cacheRef}`]),
      'portable ownership state fetch failed',
    );

    const shown = requireGitSuccess(
      this.#runner.run(['show', `${cacheRef}:lease.json`]),
      'portable ownership lease read failed',
    );

    let lease;
    try {
      lease = JSON.parse(shown.stdout);
    } catch {
      throw new Error('portable ownership lease contains invalid JSON');
    }
    validatePortableOwnershipLease(lease);
    if (lease.repositoryIdentity !== repositoryIdentity) {
      throw new Error('portable ownership repository identity mismatch');
    }
    if (lease.projectId !== projectId || lease.workItemId !== workItemId) {
      throw new Error('portable ownership scope mismatch');
    }

    return { lease, revision: remoteHead, authority: 'NONE' };
  }

  async publishCas(lease, expectedRevision) {
    validatePortableOwnershipLease(lease);
    if (expectedRevision !== null && !GIT_OBJECT_ID_PATTERN.test(expectedRevision)) {
      throw new Error('expectedRevision must be a Git object id or null');
    }

    const stateRef = portableOwnershipStateRef(lease.projectId, lease.workItemId);
    const currentHead = this.#readRemoteHead(stateRef);
    if (currentHead !== expectedRevision) {
      return conflict('remote portable ownership state changed during publish');
    }

    const leaseJson = JSON.stringify(lease, null, 2) + '\n';
    const blob = requireObjectId(
      requireGitSuccess(
        this.#runner.run(['hash-object', '-w', '--stdin'], leaseJson),
        'portable ownership blob creation failed',
      ),
      'portable ownership blob',
    );
    const tree = requireObjectId(
      requireGitSuccess(
        this.#runner.run(['mktree'], `100644 blob ${blob}\tlease.json\n`),
        'portable ownership tree creation failed',
      ),
      'portable ownership tree',
    );

    const commitArgs = [
      '-c',
      'user.name=FreeHighlander',
      '-c',
      'user.email=freehighlander@localhost',
      'commit-tree',
      tree,
      '-m',
      `FreeHighlander portable ownership generation ${lease.generation}`,
    ];
    if (currentHead !== null) commitArgs.push('-p', currentHead);

    const commit = requireObjectId(
      requireGitSuccess(
        this.#runner.run(commitArgs),
        'portable ownership state commit creation failed',
      ),
      'portable ownership state commit',
    );

    const forceWithLease =
      currentHead === null
        ? `--force-with-lease=${stateRef}:`
        : `--force-with-lease=${stateRef}:${currentHead}`;
    const push = this.#runner.run([
      'push',
      this.#remote,
      forceWithLease,
      `${commit}:${stateRef}`,
    ]);
    if (push.exitCode !== 0) {
      return conflict('remote portable ownership state changed during publish');
    }

    const verifiedHead = this.#readRemoteHead(stateRef);
    if (verifiedHead !== commit) {
      throw new Error('portable ownership remote read-back verification failed');
    }
    const verified = await this.getLatest(
      lease.repositoryIdentity,
      lease.projectId,
      lease.workItemId,
    );
    if (verified === null || verified.lease.leaseHash !== lease.leaseHash) {
      throw new Error('portable ownership lease read-back hash mismatch');
    }

    return { status: 'ACCEPT', revision: commit, authority: 'NONE' };
  }

  #readRemoteHead(stateRef) {
    const result = requireGitSuccess(
      this.#runner.run(['ls-remote', '--refs', this.#remote, stateRef]),
      'portable ownership remote lookup failed',
    );
    const line = result.stdout.trim();
    if (!line) return null;
    const parts = line.split(/\s+/);
    if (
      parts.length !== 2 ||
      parts[1] !== stateRef ||
      !GIT_OBJECT_ID_PATTERN.test(parts[0] ?? '')
    ) {
      throw new Error('portable ownership remote lookup returned malformed ref data');
    }
    return parts[0];
  }
}

export class SpawnPortableOwnershipGitRunner {
  constructor(repositoryRoot) {
    if (typeof repositoryRoot !== 'string' || !repositoryRoot.trim()) {
      throw new Error('repositoryRoot is required');
    }
    this.repositoryRoot = repositoryRoot;
  }

  run(args, input = '') {
    for (const arg of args) {
      if (typeof arg !== 'string' || arg.length > 4096 || /[\r\n\0]/.test(arg)) {
        throw new Error('portable ownership git argument must be bounded single-line metadata');
      }
    }

    const result = spawnSync('git', [...args], {
      cwd: this.repositoryRoot,
      input,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
    });
    if (result.error) throw new Error('portable ownership git command failed');
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }
}

export function portableOwnershipStateRef(projectId, workItemId) {
  requireIdentifier(projectId, 'projectId');
  requireIdentifier(workItemId, 'workItemId');
  return `refs/heads/freehighlander-ownership/${hashIdentifier(projectId)}/${hashIdentifier(workItemId)}`;
}

export function portableOwnershipStateCanMergeIntoProductBranches() {
  return false;
}

export function portableOwnershipStoreCanGrantAuthority() {
  return false;
}

function portableOwnershipCacheRef(projectId, workItemId) {
  requireIdentifier(projectId, 'projectId');
  requireIdentifier(workItemId, 'workItemId');
  return `refs/freehighlander/ownership-cache/${hashIdentifier(projectId)}/${hashIdentifier(workItemId)}`;
}

function hashIdentifier(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function conflict(reason) {
  return { status: 'CONFLICT', reason, revision: null, authority: 'NONE' };
}

function requireGitSuccess(result, message) {
  if (result.exitCode !== 0) throw new Error(message);
  return result;
}

function requireObjectId(result, label) {
  const value = result.stdout.trim();
  if (!GIT_OBJECT_ID_PATTERN.test(value)) {
    throw new Error(label + ' returned an invalid object id');
  }
  return value;
}

function requireRemote(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error('remote must be a bounded Git remote name');
  }
  return value;
}

function requireIdentifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(name + ' must be a bounded identifier');
  }
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(name + ' is required');
}
