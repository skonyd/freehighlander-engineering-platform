import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { preparePortableResumeRepository } from './portable-resume-bootstrap.mjs';

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 10 * 60_000;

export class ExecFileFhResumeRunner {
  run(executable, args, cwd) {
    requireExecutable(executable);
    for (const arg of args) requireArgument(arg);
    const result = spawnSync(executable, [...args], {
      cwd,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    if (result.error) {
      return { exitCode: 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    }
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }
}

export function defaultPortableResumeWorkspaceRoot(homeDirectory = os.homedir()) {
  if (typeof homeDirectory !== 'string' || !homeDirectory.trim()) {
    throw new Error('home directory is required');
  }
  return path.join(homeDirectory, '.freehighlander', 'workspaces');
}

export function parseFhResumeArgs(argv) {
  if (!Array.isArray(argv) || argv[0] !== 'resume') {
    throw new Error('usage: fh resume [owner/repo] [options]');
  }

  let repository = null;
  const options = {};
  const flags = new Set();

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      if (repository !== null) throw new Error('multiple repository arguments are not allowed');
      requireRepository(token);
      repository = token;
      continue;
    }

    const name = token.slice(2);
    if (flags.has(name) || Object.hasOwn(options, name)) {
      throw new Error('duplicate fh resume option: ' + token);
    }
    if (name === 'claim') {
      flags.add(name);
      continue;
    }
    if (
      ![
        'workspace',
        'directory',
        'project',
        'secret-profile',
        'remote',
        'lease-id',
        'run-id',
        'machine-instance',
        'ttl-ms',
        'read-model',
      ].includes(name)
    ) {
      throw new Error('unsupported fh resume option: ' + token);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--') || !value.trim()) {
      throw new Error('fh resume option requires a value: ' + token);
    }
    options[name] = value;
    index += 1;
  }

  if (repository === null && (options.workspace !== undefined || options.directory !== undefined)) {
    throw new Error('--workspace/--directory require owner/repo bootstrap mode');
  }

  return {
    repository,
    claim: flags.has('claim'),
    workspaceRoot: options.workspace ?? null,
    directoryName: options.directory ?? null,
    projectId: options.project ?? null,
    secretProfileId: options['secret-profile'] ?? null,
    remote: options.remote ?? null,
    leaseId: options['lease-id'] ?? null,
    runId: options['run-id'] ?? null,
    machineInstanceId: options['machine-instance'] ?? null,
    ttlMs: options['ttl-ms'] ?? null,
    readModel: options['read-model'] ?? null,
  };
}

export function runFhResume({
  parsed,
  currentDirectory = process.cwd(),
  homeDirectory = os.homedir(),
  runner = new ExecFileFhResumeRunner(),
  bootstrap = preparePortableResumeRepository,
}) {
  if (!parsed || typeof parsed !== 'object')
    throw new Error('parsed fh resume request is required');

  let repositoryRoot = path.resolve(currentDirectory);
  let bootstrapResult = null;

  if (parsed.repository !== null) {
    const workspaceRoot =
      parsed.workspaceRoot === null
        ? defaultPortableResumeWorkspaceRoot(homeDirectory)
        : path.resolve(parsed.workspaceRoot);
    bootstrapResult = bootstrap({
      repository: parsed.repository,
      workspaceRoot,
      directoryName: parsed.directoryName,
      runner,
    });
    repositoryRoot = bootstrapResult.repositoryRoot;
  } else {
    const discoveredRoot = runner.run('git', ['rev-parse', '--show-toplevel'], repositoryRoot);
    if (discoveredRoot.exitCode !== 0 || !discoveredRoot.stdout.trim()) {
      throw new Error('fh resume without owner/repo must run inside a Git repository');
    }
    repositoryRoot = path.resolve(discoveredRoot.stdout.trim());
  }

  const packageFile = path.join(repositoryRoot, 'package.json');
  if (!existsSync(packageFile)) throw new Error('FreeHighlander package.json is missing');
  const packageJson = parsePackageJson(readFileSync(packageFile, 'utf8'));
  const npmPin = exactNpmPin(packageJson.packageManager);

  const npmVersion = runner.run('npm', ['--version'], repositoryRoot);
  if (npmVersion.exitCode !== 0 || npmVersion.stdout.trim() !== npmPin) {
    throw new Error(
      'FreeHighlander requires npm ' +
        npmPin +
        '; current ' +
        (npmVersion.stdout.trim() || 'unavailable'),
    );
  }

  const install = runner.run('npm', ['ci', '--no-audit', '--no-fund'], repositoryRoot);
  if (install.exitCode !== 0) throw new Error('FreeHighlander dependency bootstrap failed');

  const build = runner.run('npm', ['run', 'build'], repositoryRoot);
  if (build.exitCode !== 0) throw new Error('FreeHighlander build failed');

  const doctorArgs = ['run', 'project:doctor', '--', '--resume'];
  appendOption(doctorArgs, '--project', parsed.projectId);
  appendOption(doctorArgs, '--secret-profile', parsed.secretProfileId);
  appendOption(doctorArgs, '--remote', parsed.remote);
  const doctor = runner.run('npm', doctorArgs, repositoryRoot);
  if (parsed.claim && doctor.exitCode !== 0) {
    throw new Error('fh resume --claim requires resume doctor PASS');
  }

  const resumeArgs = ['run', 'project:portable-resume', '--', 'resume'];
  appendOption(resumeArgs, '--project', parsed.projectId);
  appendOption(resumeArgs, '--secret-profile', parsed.secretProfileId);
  appendOption(resumeArgs, '--remote', parsed.remote);
  appendOption(resumeArgs, '--lease-id', parsed.leaseId);
  appendOption(resumeArgs, '--read-model', parsed.readModel);
  if (parsed.claim) {
    resumeArgs.push('--claim');
    appendOption(resumeArgs, '--run-id', parsed.runId);
    appendOption(resumeArgs, '--machine-instance', parsed.machineInstanceId);
    appendOption(resumeArgs, '--ttl-ms', parsed.ttlMs);
  } else if (parsed.runId !== null || parsed.machineInstanceId !== null || parsed.ttlMs !== null) {
    throw new Error('--run-id/--machine-instance/--ttl-ms require --claim');
  }

  const resume = runner.run('npm', resumeArgs, repositoryRoot);

  return {
    status:
      resume.exitCode === 0 && doctor.exitCode === 0
        ? 'READY'
        : resume.exitCode === 0 || resume.exitCode === 2
          ? 'INSPECTED_WITH_BLOCKERS'
          : 'FAILED',
    repositoryRoot,
    bootstrap: bootstrapResult,
    doctor: commandSummary(doctor),
    resume: commandSummary(resume),
    credentialsCopied: false,
    destructiveCleanupPerformed: false,
    authority: 'NONE',
  };
}

export function fhResumeCanCopyCredentials() {
  return false;
}

export function fhResumeCanDeleteExistingWork() {
  return false;
}

export function fhResumeCanGrantAuthority() {
  return false;
}

function commandSummary(result) {
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function appendOption(args, name, value) {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string' || !value.trim())
    throw new Error(name + ' must be a non-empty value');
  args.push(name, value);
}

function parsePackageJson(value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid');
    }
    return parsed;
  } catch {
    throw new Error('FreeHighlander package.json is invalid');
  }
}

function exactNpmPin(value) {
  if (typeof value !== 'string') throw new Error('packageManager pin is required');
  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(value);
  if (!match) throw new Error('packageManager must pin an exact npm version');
  return match[1];
}

function requireRepository(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value)) {
    throw new Error('repository must be a bounded owner/name identifier');
  }
  const [owner, name] = value.split('/');
  if (owner === '.' || owner === '..' || name === '.' || name === '..') {
    throw new Error('repository must be a bounded owner/name identifier');
  }
}

function requireExecutable(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value)) {
    throw new Error('fh resume executable is invalid');
  }
}

function requireArgument(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\r\n\0]/.test(value)) {
    throw new Error('fh resume argument must be bounded single-line metadata');
  }
}
