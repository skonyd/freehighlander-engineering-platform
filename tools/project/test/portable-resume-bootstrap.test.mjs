import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  portableResumeBootstrapCanCopyCredentials,
  portableResumeBootstrapCanDeleteExistingWork,
  portableResumeBootstrapCanGrantAuthority,
  preparePortableResumeRepository,
} from '../lib/portable-resume-bootstrap.mjs';

class FakeRunner {
  calls = [];
  authExitCode = 0;
  metadata = {
    nameWithOwner: 'skonyd/freehighlander-engineering-platform',
    defaultBranchRef: { name: 'main' },
  };
  origin = 'git@github.com:skonyd/freehighlander-engineering-platform.git';
  cloneExitCode = 0;

  run(executable, args, cwd = undefined) {
    this.calls.push({ executable, args: [...args], cwd });
    const key = [executable, ...args].join(' ');

    if (key === 'gh auth status') {
      return { exitCode: this.authExitCode, stdout: '', stderr: '' };
    }
    if (key.startsWith('gh repo view ')) {
      return { exitCode: 0, stdout: JSON.stringify(this.metadata), stderr: '' };
    }
    if (key.startsWith('gh repo clone ')) {
      if (this.cloneExitCode !== 0) {
        return { exitCode: this.cloneExitCode, stdout: '', stderr: '' };
      }
      const target = args[3];
      mkdirSync(path.join(target, '.git'), { recursive: true });
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    if (key === 'git remote get-url origin') {
      return { exitCode: 0, stdout: this.origin + '\n', stderr: '' };
    }
    throw new Error('unexpected command: ' + key);
  }
}

test('portable resume bootstrap clones through existing GitHub CLI auth and verifies origin', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-resume-bootstrap-'));
  try {
    const runner = new FakeRunner();
    const result = preparePortableResumeRepository({
      repository: 'skonyd/freehighlander-engineering-platform',
      workspaceRoot: root,
      runner,
    });

    assert.equal(result.status, 'CLONED');
    assert.equal(result.repository, 'skonyd/freehighlander-engineering-platform');
    assert.equal(result.repositoryRoot, path.join(root, 'freehighlander-engineering-platform'));
    assert.equal(result.defaultBranch, 'main');
    assert.equal(result.cloned, true);
    assert.equal(result.authentication, 'GITHUB_CLI');
    assert.equal(result.destructiveCleanupPerformed, false);
    assert.equal(result.credentialsCopied, false);
    assert.equal(result.authority, 'NONE');

    const cloneCall = runner.calls.find(
      (call) => call.executable === 'gh' && call.args[0] === 'repo' && call.args[1] === 'clone',
    );
    assert.deepEqual(cloneCall.args, [
      'repo',
      'clone',
      'skonyd/freehighlander-engineering-platform',
      path.join(root, 'freehighlander-engineering-platform'),
      '--',
      '--no-tags',
    ]);
    assert.equal(
      runner.calls.some((call) => call.args.includes('token')),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('portable resume bootstrap reattaches an existing matching repository without cleanup', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-resume-existing-'));
  const target = path.join(root, 'engineering');
  try {
    mkdirSync(path.join(target, '.git'), { recursive: true });
    writeFileSync(path.join(target, 'local-work.txt'), 'preserve me', 'utf8');

    const runner = new FakeRunner();
    const result = preparePortableResumeRepository({
      repository: 'skonyd/freehighlander-engineering-platform',
      workspaceRoot: root,
      directoryName: 'engineering',
      runner,
    });

    assert.equal(result.status, 'READY_EXISTING');
    assert.equal(result.cloned, false);
    assert.equal(result.destructiveCleanupPerformed, false);
    assert.equal(
      runner.calls.some((call) => call.executable === 'gh' && call.args[1] === 'clone'),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('portable resume bootstrap fails closed for auth metadata origin and target conflicts', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-resume-bootstrap-fail-'));
  try {
    const authRunner = new FakeRunner();
    authRunner.authExitCode = 1;
    assert.throws(
      () =>
        preparePortableResumeRepository({
          repository: 'skonyd/freehighlander-engineering-platform',
          workspaceRoot: root,
          directoryName: 'auth-fail',
          runner: authRunner,
        }),
      /authentication is unavailable/,
    );

    const metadataRunner = new FakeRunner();
    metadataRunner.metadata = {
      nameWithOwner: 'skonyd/other-repository',
      defaultBranchRef: { name: 'main' },
    };
    assert.throws(
      () =>
        preparePortableResumeRepository({
          repository: 'skonyd/freehighlander-engineering-platform',
          workspaceRoot: root,
          directoryName: 'metadata-fail',
          runner: metadataRunner,
        }),
      /identity mismatch/,
    );

    const existing = path.join(root, 'wrong-origin');
    mkdirSync(path.join(existing, '.git'), { recursive: true });
    const originRunner = new FakeRunner();
    originRunner.origin = 'https://github.com/skonyd/other-repository.git';
    assert.throws(
      () =>
        preparePortableResumeRepository({
          repository: 'skonyd/freehighlander-engineering-platform',
          workspaceRoot: root,
          directoryName: 'wrong-origin',
          runner: originRunner,
        }),
      /origin mismatch/,
    );

    const nonRepo = path.join(root, 'not-a-repo');
    mkdirSync(nonRepo, { recursive: true });
    writeFileSync(path.join(nonRepo, 'keep.txt'), 'keep', 'utf8');
    assert.throws(
      () =>
        preparePortableResumeRepository({
          repository: 'skonyd/freehighlander-engineering-platform',
          workspaceRoot: root,
          directoryName: 'not-a-repo',
          runner: new FakeRunner(),
        }),
      /not a Git repository/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('portable resume bootstrap invariants remain credential-copy-free and authority-neutral', () => {
  assert.equal(portableResumeBootstrapCanDeleteExistingWork(), false);
  assert.equal(portableResumeBootstrapCanCopyCredentials(), false);
  assert.equal(portableResumeBootstrapCanGrantAuthority(), false);

  assert.throws(
    () =>
      preparePortableResumeRepository({
        repository: '../escape',
        workspaceRoot: '/tmp',
        runner: new FakeRunner(),
      }),
    /owner\/name/,
  );
  assert.throws(
    () =>
      preparePortableResumeRepository({
        repository: 'skonyd/freehighlander-engineering-platform',
        workspaceRoot: '/tmp',
        directoryName: '../escape',
        runner: new FakeRunner(),
      }),
    /target directory name is invalid/,
  );
});
