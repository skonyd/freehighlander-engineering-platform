import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const DIRECTORY_PATTERN = /^[A-Za-z0-9_.-]{1,160}$/;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;

export class ExecFilePortableResumeBootstrapRunner {
  run(executable, args, cwd = undefined) {
    requireExecutable(executable);
    for (const arg of args) requireArgument(arg);

    const result = spawnSync(executable, [...args], {
      ...(cwd ? { cwd } : {}),
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    });
    if (result.error) throw new Error('portable resume bootstrap command failed');
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }
}

export function preparePortableResumeRepository({
  repository,
  workspaceRoot,
  directoryName = null,
  runner = new ExecFilePortableResumeBootstrapRunner(),
}) {
  requireRepository(repository);
  if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) {
    throw new Error('workspaceRoot is required');
  }

  const repositoryName = repository.split('/')[1];
  const targetName = directoryName ?? repositoryName;
  if (!DIRECTORY_PATTERN.test(targetName)) {
    throw new Error('portable resume target directory name is invalid');
  }

  const workspace = path.resolve(workspaceRoot);
  const repositoryRoot = path.resolve(workspace, targetName);
  if (path.dirname(repositoryRoot) !== workspace) {
    throw new Error('portable resume repository must remain inside workspaceRoot');
  }

  const auth = runner.run('gh', ['auth', 'status']);
  if (auth.exitCode !== 0) {
    throw new Error('GitHub CLI authentication is unavailable');
  }

  const metadataResult = runner.run('gh', [
    'repo',
    'view',
    repository,
    '--json',
    'nameWithOwner,defaultBranchRef',
  ]);
  if (metadataResult.exitCode !== 0) {
    throw new Error('GitHub repository metadata lookup failed');
  }
  const metadata = parseRepositoryMetadata(metadataResult.stdout, repository);

  mkdirSync(workspace, { recursive: true });

  if (existsSync(repositoryRoot)) {
    if (!statSync(repositoryRoot).isDirectory()) {
      throw new Error('portable resume target exists and is not a directory');
    }
    const entries = readdirSync(repositoryRoot);
    if (entries.length === 0) {
      throw new Error('portable resume target directory already exists and is empty');
    }
    if (!existsSync(path.join(repositoryRoot, '.git'))) {
      throw new Error('portable resume target exists and is not a Git repository');
    }
    assertRepositoryOrigin(runner, repositoryRoot, repository);
    return bootstrapResult(repository, repositoryRoot, metadata.defaultBranch, false);
  }

  const clone = runner.run('gh', ['repo', 'clone', repository, repositoryRoot, '--', '--no-tags']);
  if (clone.exitCode !== 0) {
    throw new Error('GitHub repository clone failed');
  }
  if (!existsSync(path.join(repositoryRoot, '.git'))) {
    throw new Error('GitHub repository clone did not produce a Git repository');
  }
  assertRepositoryOrigin(runner, repositoryRoot, repository);
  return bootstrapResult(repository, repositoryRoot, metadata.defaultBranch, true);
}

export function portableResumeBootstrapCanDeleteExistingWork() {
  return false;
}

export function portableResumeBootstrapCanCopyCredentials() {
  return false;
}

export function portableResumeBootstrapCanGrantAuthority() {
  return false;
}

function assertRepositoryOrigin(runner, repositoryRoot, repository) {
  const origin = runner.run('git', ['remote', 'get-url', 'origin'], repositoryRoot);
  if (origin.exitCode !== 0) {
    throw new Error('portable resume repository origin is unavailable');
  }
  if (!remoteMatchesGitHubRepository(origin.stdout.trim(), repository)) {
    throw new Error('portable resume repository origin mismatch');
  }
}

function parseRepositoryMetadata(stdout, repository) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('GitHub repository metadata is malformed');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GitHub repository metadata is malformed');
  }
  if (parsed.nameWithOwner !== repository) {
    throw new Error('GitHub repository identity mismatch');
  }
  const defaultBranch = parsed.defaultBranchRef?.name;
  if (
    typeof defaultBranch !== 'string' ||
    !defaultBranch ||
    defaultBranch.length > 255 ||
    /[\r\n\0~^:?*\[\\]/.test(defaultBranch)
  ) {
    throw new Error('GitHub default branch metadata is invalid');
  }
  return { defaultBranch };
}

function remoteMatchesGitHubRepository(remote, repository) {
  const normalized = remote.replace(/\.git$/, '');
  const expected = repository.toLowerCase();

  for (const prefix of [
    'https://github.com/',
    'http://github.com/',
    'ssh://git@github.com/',
    'git@github.com:',
  ]) {
    if (normalized.toLowerCase().startsWith(prefix)) {
      return normalized.slice(prefix.length).toLowerCase() === expected;
    }
  }
  return false;
}

function bootstrapResult(repository, repositoryRoot, defaultBranch, cloned) {
  return {
    status: cloned ? 'CLONED' : 'READY_EXISTING',
    repository,
    repositoryRoot,
    defaultBranch,
    cloned,
    authentication: 'GITHUB_CLI',
    destructiveCleanupPerformed: false,
    credentialsCopied: false,
    authority: 'NONE',
  };
}

function requireRepository(value) {
  if (typeof value !== 'string' || !REPOSITORY_PATTERN.test(value)) {
    throw new Error('repository must be a bounded owner/name identifier');
  }
  const [owner, name] = value.split('/');
  if (owner === '.' || owner === '..' || name === '.' || name === '..') {
    throw new Error('repository must be a bounded owner/name identifier');
  }
}

function requireExecutable(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value)) {
    throw new Error('portable resume bootstrap executable is invalid');
  }
}

function requireArgument(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\r\n\0]/.test(value)) {
    throw new Error('portable resume bootstrap argument must be bounded single-line metadata');
  }
}
