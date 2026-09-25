import { spawnSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const WRITE_PERMISSIONS = new Set(['WRITE', 'MAINTAIN', 'ADMIN']);

export class ExecFileResumeDoctorRunner {
  run(executable, args, cwd = undefined) {
    requireExecutable(executable);
    for (const arg of args) requireArgument(arg);

    const result = spawnSync(executable, [...args], {
      ...(cwd ? { cwd } : {}),
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    if (result.error) {
      return {
        exitCode: 1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      };
    }
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }
}

export function parseResumeDoctorArgs(argv) {
  const options = {};
  let resume = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--resume') {
      if (resume) throw new Error('duplicate --resume');
      resume = true;
      continue;
    }
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!['project', 'secret-profile', 'remote'].includes(name)) {
      throw new Error(`unsupported doctor option: ${token}`);
    }
    if (Object.hasOwn(options, name)) throw new Error(`duplicate doctor option: ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--') || !value.trim()) {
      throw new Error(`doctor option requires a value: ${token}`);
    }
    options[name] = value;
    index += 1;
  }

  if (!resume && Object.keys(options).length > 0) {
    throw new Error('--project, --secret-profile and --remote require --resume');
  }

  return {
    resume,
    projectId: options.project ?? null,
    secretProfileId: options['secret-profile'] ?? 'default',
    remote: options.remote ?? 'origin',
  };
}

export function inspectResumeHostCapabilities({
  root,
  repositoryIdentity,
  packageJson,
  runner = new ExecFileResumeDoctorRunner(),
  nodeVersion = process.versions.node,
}) {
  if (typeof root !== 'string' || !root.trim()) throw new Error('root is required');
  requireRepository(repositoryIdentity);
  if (!packageJson || typeof packageJson !== 'object') throw new Error('packageJson is required');

  const checks = [];

  const gitVersion = runner.run('git', ['--version'], root);
  addCommandCheck(checks, 'git', gitVersion, /git version\s+\d+\.\d+/i);

  const worktree = runner.run('git', ['worktree', 'list', '--porcelain'], root);
  addCommandCheck(checks, 'git-worktree', worktree, /worktree\s+/);

  const npmPin = parseNpmPin(packageJson.packageManager);
  const npmVersion = runner.run('npm', ['--version'], root);
  if (npmVersion.exitCode !== 0) {
    checks.push(fail('npm', 'npm is unavailable'));
  } else if (npmVersion.stdout.trim() !== npmPin) {
    checks.push(fail('npm', `npm ${npmPin} required; current ${npmVersion.stdout.trim() || 'unknown'}`));
  } else {
    checks.push(pass('npm', npmPin));
  }

  if (!satisfiesNodeEngine(nodeVersion, packageJson.engines?.node)) {
    checks.push(fail('node', `Node ${packageJson.engines?.node ?? 'engine range'} required; current ${nodeVersion}`));
  } else {
    checks.push(pass('node', nodeVersion));
  }

  const ghVersion = runner.run('gh', ['--version'], root);
  addCommandCheck(checks, 'github-cli', ghVersion, /^gh version\s+\d+/im);

  const ghAuth = runner.run('gh', ['auth', 'status'], root);
  if (ghAuth.exitCode !== 0) {
    checks.push(fail('github-auth', 'GitHub CLI authentication is unavailable'));
  } else {
    checks.push(pass('github-auth', 'authenticated'));
  }

  const repoView = runner.run(
    'gh',
    ['repo', 'view', repositoryIdentity, '--json', 'nameWithOwner,viewerPermission,defaultBranchRef'],
    root,
  );
  if (repoView.exitCode !== 0) {
    checks.push(fail('repository-access', 'GitHub repository metadata lookup failed'));
  } else {
    const metadata = parseRepositoryMetadata(repoView.stdout, repositoryIdentity);
    if (!WRITE_PERMISSIONS.has(metadata.viewerPermission)) {
      checks.push(
        fail(
          'repository-access',
          `repository mutation permission required; current ${metadata.viewerPermission}`,
        ),
      );
    } else {
      checks.push(pass('repository-access', metadata.viewerPermission));
    }
    checks.push(pass('default-branch', metadata.defaultBranch));
  }

  return {
    checks,
    ok: checks.every((check) => check.status === 'PASS'),
    authority: 'NONE',
    credentialsCopied: false,
  };
}

export function buildResumeDoctorSummary({ projectId, manifest, secretReadiness, host }) {
  if (!host || typeof host !== 'object' || !Array.isArray(host.checks)) {
    throw new Error('resume doctor host report is required');
  }
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new Error('resume doctor projectId is required');
  }
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('resume doctor manifest is required');
  }
  if (!secretReadiness || typeof secretReadiness !== 'object') {
    throw new Error('resume doctor secret readiness is required');
  }

  const blockedSecretHandleIds = Array.isArray(secretReadiness.blockedHandleIds)
    ? [...secretReadiness.blockedHandleIds].sort()
    : [];
  const requiredProviderCapabilities =
    manifest.requiredProviderCapabilities &&
    typeof manifest.requiredProviderCapabilities === 'object' &&
    !Array.isArray(manifest.requiredProviderCapabilities)
      ? Object.fromEntries(
          Object.entries(manifest.requiredProviderCapabilities)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([provider, capabilities]) => [provider, [...capabilities].sort()]),
        )
      : {};

  return {
    status:
      host.ok && blockedSecretHandleIds.length === 0
        ? 'READY'
        : host.ok
          ? 'BLOCKED_SECRET'
          : 'BLOCKED_HOST',
    projectId,
    generation: manifest.generation,
    manifestHash: manifest.manifestHash,
    branch: manifest.branch,
    remoteHead: manifest.remoteHead,
    hostChecks: host.checks,
    requiredProviderCapabilities,
    requiredSecretHandleIds: [...manifest.requiredSecretHandleIds].sort(),
    blockedSecretHandleIds,
    secretDependentWorkReady: secretReadiness.secretDependentWorkReady === true,
    credentialsCopied: false,
    secretValuesPresent: false,
    authority: 'NONE',
  };
}

export function resumeDoctorCanCopyCredentials() {
  return false;
}

export function resumeDoctorCanGrantAuthority() {
  return false;
}

function addCommandCheck(checks, id, result, expectedOutput) {
  if (result.exitCode !== 0) {
    checks.push(fail(id, `${id} capability is unavailable`));
    return;
  }
  if (!expectedOutput.test(result.stdout)) {
    checks.push(fail(id, `${id} capability returned unexpected version/state output`));
    return;
  }
  checks.push(pass(id, firstLine(result.stdout)));
}

function parseNpmPin(packageManager) {
  if (typeof packageManager !== 'string') throw new Error('packageManager pin is required');
  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(packageManager);
  if (!match) throw new Error('packageManager must pin an exact npm version');
  return match[1];
}

function satisfiesNodeEngine(nodeVersion, engine) {
  if (typeof nodeVersion !== 'string' || !/^\d+\.\d+\.\d+/.test(nodeVersion)) return false;
  if (typeof engine !== 'string' || !engine.trim()) return false;
  const current = parseVersion(nodeVersion);
  for (const clause of engine.trim().split(/\s+/)) {
    const match = /^(>=|>|<=|<)(\d+(?:\.\d+){0,2})$/.exec(clause);
    if (!match) return false;
    const target = parseVersion(match[2]);
    const comparison = compareVersion(current, target);
    if (match[1] === '>=' && comparison < 0) return false;
    if (match[1] === '>' && comparison <= 0) return false;
    if (match[1] === '<=' && comparison > 0) return false;
    if (match[1] === '<' && comparison >= 0) return false;
  }
  return true;
}

function parseVersion(value) {
  const parts = value.split('.').slice(0, 3).map((part) => Number(part.replace(/\D.*$/, '')));
  while (parts.length < 3) parts.push(0);
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error('invalid semantic version');
  }
  return parts;
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function parseRepositoryMetadata(stdout, repositoryIdentity) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('GitHub repository metadata is malformed');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GitHub repository metadata is malformed');
  }
  if (parsed.nameWithOwner !== repositoryIdentity) {
    throw new Error('GitHub repository identity mismatch');
  }
  if (typeof parsed.viewerPermission !== 'string' || !parsed.viewerPermission.trim()) {
    throw new Error('GitHub repository permission metadata is missing');
  }
  const defaultBranch = parsed.defaultBranchRef?.name;
  if (typeof defaultBranch !== 'string' || !defaultBranch.trim()) {
    throw new Error('GitHub default branch metadata is missing');
  }
  return {
    viewerPermission: parsed.viewerPermission,
    defaultBranch,
  };
}

function pass(id, detail) {
  return { id, status: 'PASS', detail };
}

function fail(id, detail) {
  return { id, status: 'FAIL', detail };
}

function firstLine(value) {
  return value.trim().split(/\r?\n/, 1)[0] ?? '';
}

function requireRepository(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value)
  ) {
    throw new Error('repositoryIdentity must be a bounded owner/name identifier');
  }
}

function requireExecutable(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value)) {
    throw new Error('resume doctor executable is invalid');
  }
}

function requireArgument(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\r\n\0]/.test(value)) {
    throw new Error('resume doctor argument must be bounded single-line metadata');
  }
}
