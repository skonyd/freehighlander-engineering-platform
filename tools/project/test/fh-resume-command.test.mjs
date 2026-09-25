import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  defaultPortableResumeWorkspaceRoot,
  fhResumeCanCopyCredentials,
  fhResumeCanDeleteExistingWork,
  fhResumeCanGrantAuthority,
  parseFhResumeArgs,
  runFhResume,
} from '../lib/fh-resume-command.mjs';

class FixtureRunner {
  constructor({ repositoryRoot, doctorExitCode = 0, resumeExitCode = 0, npmVersion = '11.19.1' }) {
    this.repositoryRoot = repositoryRoot;
    this.doctorExitCode = doctorExitCode;
    this.resumeExitCode = resumeExitCode;
    this.npmVersion = npmVersion;
    this.calls = [];
  }

  run(executable, args, cwd) {
    this.calls.push({ executable, args: [...args], cwd });
    const key = [executable, ...args].join(' ');

    if (key === 'git rev-parse --show-toplevel') {
      return { exitCode: 0, stdout: this.repositoryRoot + '\n', stderr: '' };
    }
    if (key === 'npm --version') {
      return { exitCode: 0, stdout: this.npmVersion + '\n', stderr: '' };
    }
    if (key === 'npm ci --no-audit --no-fund') {
      return { exitCode: 0, stdout: 'installed\n', stderr: '' };
    }
    if (key === 'npm run build') {
      return { exitCode: 0, stdout: 'built\n', stderr: '' };
    }
    if (key.startsWith('npm run project:doctor -- --resume')) {
      return {
        exitCode: this.doctorExitCode,
        stdout: this.doctorExitCode === 0 ? 'FreeHighlander doctor PASS\n' : '',
        stderr: this.doctorExitCode === 0 ? '' : 'resume providers unavailable\n',
      };
    }
    if (key.startsWith('npm run project:portable-resume -- resume')) {
      return {
        exitCode: this.resumeExitCode,
        stdout: this.resumeExitCode === 1 ? '' : '{"status":"READY"}\n',
        stderr: this.resumeExitCode === 1 ? 'resume failed\n' : '',
      };
    }
    throw new Error('unexpected fixture command: ' + key);
  }
}

function createRepo(root, name = 'repo') {
  const repositoryRoot = path.join(root, name);
  mkdirSync(path.join(repositoryRoot, '.git'), { recursive: true });
  writeFileSync(
    path.join(repositoryRoot, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      private: true,
      packageManager: 'npm@11.19.1',
    }),
    'utf8',
  );
  return repositoryRoot;
}

test('fh resume parses owner/repo and portable options deterministically', () => {
  assert.deepEqual(
    parseFhResumeArgs([
      'resume',
      'skonyd/freehighlander-engineering-platform',
      '--workspace',
      '/work',
      '--project',
      'project-151',
      '--secret-profile',
      'work-laptop',
      '--read-model',
      '/tmp/read.sqlite',
    ]),
    {
      repository: 'skonyd/freehighlander-engineering-platform',
      claim: false,
      workspaceRoot: '/work',
      directoryName: null,
      projectId: 'project-151',
      secretProfileId: 'work-laptop',
      remote: null,
      leaseId: null,
      runId: null,
      machineInstanceId: null,
      ttlMs: null,
      readModel: '/tmp/read.sqlite',
    },
  );

  assert.throws(() => parseFhResumeArgs(['resume', '../escape']), /owner\/name/);
  assert.throws(() => parseFhResumeArgs(['resume', '--workspace', '/work']), /require owner\/repo/);
  assert.throws(() => parseFhResumeArgs(['checkpoint']), /usage/);
});

test('fh resume bootstrap mode clones or reattaches then installs builds doctors and resumes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-command-bootstrap-'));
  try {
    const repositoryRoot = createRepo(root, 'engineering');
    const runner = new FixtureRunner({ repositoryRoot });
    let bootstrapCalls = 0;

    const result = runFhResume({
      parsed: parseFhResumeArgs([
        'resume',
        'skonyd/freehighlander-engineering-platform',
        '--workspace',
        root,
        '--directory',
        'engineering',
        '--project',
        'project-151',
      ]),
      currentDirectory: root,
      homeDirectory: root,
      runner,
      bootstrap(input) {
        bootstrapCalls += 1;
        assert.equal(input.repository, 'skonyd/freehighlander-engineering-platform');
        assert.equal(input.workspaceRoot, root);
        assert.equal(input.directoryName, 'engineering');
        return {
          status: 'READY_EXISTING',
          repository: input.repository,
          repositoryRoot,
          defaultBranch: 'main',
          cloned: false,
          authentication: 'GITHUB_CLI',
          destructiveCleanupPerformed: false,
          credentialsCopied: false,
          authority: 'NONE',
        };
      },
    });

    assert.equal(bootstrapCalls, 1);
    assert.equal(result.status, 'READY');
    assert.equal(result.repositoryRoot, repositoryRoot);
    assert.equal(result.credentialsCopied, false);
    assert.equal(result.destructiveCleanupPerformed, false);
    assert.equal(result.authority, 'NONE');

    const commands = runner.calls.map((call) => [call.executable, ...call.args].join(' '));
    assert.deepEqual(commands.slice(0, 4), [
      'npm --version',
      'npm ci --no-audit --no-fund',
      'npm run build',
      'npm run project:doctor -- --resume --project project-151',
    ]);
    assert.match(commands[4], /^npm run project:portable-resume -- resume --project project-151$/);
    assert.equal(
      commands.some((command) => /token|credential/i.test(command)),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fh resume without repository discovers the current Git top-level', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-command-existing-'));
  try {
    const repositoryRoot = createRepo(root);
    const nested = path.join(repositoryRoot, 'tools', 'nested');
    mkdirSync(nested, { recursive: true });
    const runner = new FixtureRunner({ repositoryRoot });

    const result = runFhResume({
      parsed: parseFhResumeArgs(['resume']),
      currentDirectory: nested,
      homeDirectory: root,
      runner,
    });

    assert.equal(result.status, 'READY');
    assert.equal(result.repositoryRoot, repositoryRoot);
    assert.equal(runner.calls[0].executable, 'git');
    assert.deepEqual(runner.calls[0].args, ['rev-parse', '--show-toplevel']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fh resume keeps inspection available with blockers but claim requires doctor PASS', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-command-blockers-'));
  try {
    const repositoryRoot = createRepo(root);
    const inspectRunner = new FixtureRunner({
      repositoryRoot,
      doctorExitCode: 1,
      resumeExitCode: 2,
    });
    const inspected = runFhResume({
      parsed: parseFhResumeArgs(['resume']),
      currentDirectory: repositoryRoot,
      homeDirectory: root,
      runner: inspectRunner,
    });
    assert.equal(inspected.status, 'INSPECTED_WITH_BLOCKERS');
    assert.equal(
      inspectRunner.calls.some(
        (call) => call.executable === 'npm' && call.args.includes('project:portable-resume'),
      ),
      true,
    );

    const claimRunner = new FixtureRunner({ repositoryRoot, doctorExitCode: 1 });
    assert.throws(
      () =>
        runFhResume({
          parsed: parseFhResumeArgs([
            'resume',
            '--claim',
            '--run-id',
            'run-151',
            '--lease-id',
            'lease-151',
            '--machine-instance',
            'machine-151',
            '--ttl-ms',
            '60000',
          ]),
          currentDirectory: repositoryRoot,
          homeDirectory: root,
          runner: claimRunner,
        }),
      /requires resume doctor PASS/,
    );
    assert.equal(
      claimRunner.calls.some(
        (call) => call.executable === 'npm' && call.args.includes('project:portable-resume'),
      ),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fh resume fails before install when exact npm pin is unavailable', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-command-npm-'));
  try {
    const repositoryRoot = createRepo(root);
    const runner = new FixtureRunner({ repositoryRoot, npmVersion: '11.18.0' });
    assert.throws(
      () =>
        runFhResume({
          parsed: parseFhResumeArgs(['resume']),
          currentDirectory: repositoryRoot,
          homeDirectory: root,
          runner,
        }),
      /requires npm 11\.19\.1/,
    );
    assert.equal(
      runner.calls.some((call) => call.executable === 'npm' && call.args[0] === 'ci'),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fh resume default workspace and invariants are cross-platform metadata only', () => {
  assert.equal(
    defaultPortableResumeWorkspaceRoot('/home/example'),
    path.join('/home/example', '.freehighlander', 'workspaces'),
  );
  assert.equal(fhResumeCanCopyCredentials(), false);
  assert.equal(fhResumeCanDeleteExistingWork(), false);
  assert.equal(fhResumeCanGrantAuthority(), false);
});
