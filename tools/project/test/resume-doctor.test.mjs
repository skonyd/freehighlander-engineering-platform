import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildResumeDoctorSummary,
  inspectResumeHostCapabilities,
  parseResumeDoctorArgs,
  resumeDoctorCanCopyCredentials,
  resumeDoctorCanGrantAuthority,
} from '../lib/resume-doctor.mjs';

class FixtureRunner {
  constructor(overrides = {}) {
    this.overrides = overrides;
    this.calls = [];
  }

  run(executable, args, cwd) {
    this.calls.push({ executable, args: [...args], cwd });
    const key = [executable, ...args].join(' ');
    if (this.overrides[key]) return this.overrides[key];

    if (key === 'git --version') {
      return { exitCode: 0, stdout: 'git version 2.51.0\n', stderr: '' };
    }
    if (key === 'git worktree list --porcelain') {
      return {
        exitCode: 0,
        stdout: 'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n',
        stderr: '',
      };
    }
    if (key === 'npm --version') {
      return { exitCode: 0, stdout: '11.19.1\n', stderr: '' };
    }
    if (key === 'gh --version') {
      return { exitCode: 0, stdout: 'gh version 2.80.0 (fixture)\n', stderr: '' };
    }
    if (key === 'gh auth status') {
      return { exitCode: 0, stdout: 'authenticated\n', stderr: '' };
    }
    if (key.startsWith('gh repo view ')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'skonyd/freehighlander-engineering-platform',
          viewerPermission: 'WRITE',
          defaultBranchRef: { name: 'main' },
        }),
        stderr: '',
      };
    }
    throw new Error('unexpected fixture command: ' + key);
  }
}

function packageJson(overrides = {}) {
  return {
    engines: { node: '>=24.21.0 <25' },
    packageManager: 'npm@11.19.1',
    ...overrides,
  };
}

test('resume doctor args preserve normal doctor and parse bounded resume options', () => {
  assert.deepEqual(parseResumeDoctorArgs([]), {
    resume: false,
    projectId: null,
    secretProfileId: 'default',
    remote: 'origin',
  });
  assert.deepEqual(
    parseResumeDoctorArgs([
      '--resume',
      '--project',
      'project-151',
      '--secret-profile',
      'work-laptop',
      '--remote',
      'upstream',
    ]),
    {
      resume: true,
      projectId: 'project-151',
      secretProfileId: 'work-laptop',
      remote: 'upstream',
    },
  );

  assert.throws(() => parseResumeDoctorArgs(['--project', 'project-151']), /require --resume/);
  assert.throws(() => parseResumeDoctorArgs(['--resume', '--resume']), /duplicate --resume/);
  assert.throws(() => parseResumeDoctorArgs(['--resume', '--unknown', 'x']), /unsupported/);
});

test('resume host doctor validates git npm node GitHub auth worktree and write permission', () => {
  const runner = new FixtureRunner();
  const report = inspectResumeHostCapabilities({
    root: '/repo',
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    packageJson: packageJson(),
    runner,
    nodeVersion: '24.21.0',
  });

  assert.equal(report.ok, true);
  assert.deepEqual(
    report.checks.map((check) => [check.id, check.status]),
    [
      ['git', 'PASS'],
      ['git-worktree', 'PASS'],
      ['npm', 'PASS'],
      ['node', 'PASS'],
      ['github-cli', 'PASS'],
      ['github-auth', 'PASS'],
      ['repository-access', 'PASS'],
      ['default-branch', 'PASS'],
    ],
  );
  assert.equal(report.credentialsCopied, false);
  assert.equal(report.authority, 'NONE');
  assert.equal(
    runner.calls.some((call) => call.args.some((arg) => /token|credential/i.test(arg))),
    false,
  );
});

test('resume host doctor fails closed on runtime pin auth and repository permission gaps', () => {
  const runner = new FixtureRunner({
    'npm --version': { exitCode: 0, stdout: '11.18.0\n', stderr: '' },
    'gh auth status': { exitCode: 1, stdout: '', stderr: 'not logged in' },
    'gh repo view skonyd/freehighlander-engineering-platform --json nameWithOwner,viewerPermission,defaultBranchRef':
      {
        exitCode: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'skonyd/freehighlander-engineering-platform',
          viewerPermission: 'READ',
          defaultBranchRef: { name: 'main' },
        }),
        stderr: '',
      },
  });

  const report = inspectResumeHostCapabilities({
    root: '/repo',
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    packageJson: packageJson(),
    runner,
    nodeVersion: '23.9.0',
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.find((check) => check.id === 'npm')?.status, 'FAIL');
  assert.equal(report.checks.find((check) => check.id === 'node')?.status, 'FAIL');
  assert.equal(report.checks.find((check) => check.id === 'github-auth')?.status, 'FAIL');
  assert.equal(report.checks.find((check) => check.id === 'repository-access')?.status, 'FAIL');
});

test('resume doctor summary reports host and secret blockers without values', () => {
  const summary = buildResumeDoctorSummary({
    projectId: 'project-151',
    manifest: {
      generation: 42,
      manifestHash: '1'.repeat(64),
      branch: 'feature/resume',
      remoteHead: 'a'.repeat(40),
      requiredProviderCapabilities: {
        openai: ['reasoning', 'tool-use'],
        anthropic: ['reasoning'],
      },
      requiredSecretHandleIds: ['provider.openai.api', 'github.repo.auth'],
    },
    secretReadiness: {
      blockedHandleIds: ['provider.openai.api'],
      secretDependentWorkReady: false,
    },
    host: {
      ok: true,
      checks: [{ id: 'git', status: 'PASS', detail: 'git version 2.51.0' }],
    },
  });

  assert.equal(summary.status, 'BLOCKED_SECRET');
  assert.deepEqual(summary.requiredSecretHandleIds, ['github.repo.auth', 'provider.openai.api']);
  assert.deepEqual(summary.blockedSecretHandleIds, ['provider.openai.api']);
  assert.deepEqual(summary.requiredProviderCapabilities, {
    anthropic: ['reasoning'],
    openai: ['reasoning', 'tool-use'],
  });
  assert.equal(summary.credentialsCopied, false);
  assert.equal(summary.secretValuesPresent, false);
  assert.equal(summary.authority, 'NONE');
  assert.doesNotMatch(JSON.stringify(summary), /runtime-only-material|OPENAI_API_KEY/);
});

test('resume doctor remains credential-copy-free and authority-neutral', () => {
  assert.equal(resumeDoctorCanCopyCredentials(), false);
  assert.equal(resumeDoctorCanGrantAuthority(), false);
});
