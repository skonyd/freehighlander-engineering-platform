import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateSandboxPermission,
  isWithinRepository,
  modelIdentityCanExpandSandboxPermissions,
  parseSandboxPolicyYaml,
  promptCanExpandSandboxPermissions,
  sandboxPolicyCanGrantAuthority,
  validateSandboxPolicy,
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const policySource = fs.readFileSync(
  path.join(root, '.freehighlander', 'sandbox-policy.yaml'),
  'utf8',
);
const policy = parseSandboxPolicyYaml(policySource);

const baseRequest = {
  repositoryRoot: '/workspace/repository',
  roleAllows: true,
  workflowAllows: true,
};

test('canonical sandbox policy validates and remains authority-neutral', () => {
  assert.equal(validateSandboxPolicy(policy).valid, true);
  assert.equal(sandboxPolicyCanGrantAuthority(), false);
  assert.equal(promptCanExpandSandboxPermissions(), false);
  assert.equal(modelIdentityCanExpandSandboxPermissions(), false);
});

test('filesystem access is repository-scoped and rejects traversal', () => {
  assert.equal(isWithinRepository('/workspace/repository', 'src/index.ts'), true);
  assert.equal(isWithinRepository('/workspace/repository', '../secret.txt'), false);

  const allowed = evaluateSandboxPermission(policy, {
    ...baseRequest,
    capability: 'FILESYSTEM_WRITE',
    targetPath: 'src/index.ts',
  });
  assert.equal(allowed.allowed, true);

  const traversal = evaluateSandboxPermission(policy, {
    ...baseRequest,
    capability: 'FILESYSTEM_READ',
    targetPath: '../outside.txt',
  });
  assert.equal(traversal.allowed, false);
  assert.match(traversal.reason, /outside repository/);
});

test('command execution requires role, workflow, repository cwd, timeout and env allowlist', () => {
  assert.equal(
    evaluateSandboxPermission(policy, {
      ...baseRequest,
      capability: 'COMMAND_EXECUTE',
      cwd: '/workspace/repository',
      envAllowlist: [],
    }).allowed,
    false,
  );

  assert.equal(
    evaluateSandboxPermission(policy, {
      ...baseRequest,
      capability: 'COMMAND_EXECUTE',
      cwd: '/workspace/repository',
      timeoutMs: 30_000,
    }).allowed,
    false,
  );

  const allowed = evaluateSandboxPermission(policy, {
    ...baseRequest,
    capability: 'COMMAND_EXECUTE',
    cwd: '/workspace/repository',
    timeoutMs: 30_000,
    envAllowlist: ['PATH'],
  });
  assert.equal(allowed.allowed, true);

  const outside = evaluateSandboxPermission(policy, {
    ...baseRequest,
    capability: 'COMMAND_EXECUTE',
    cwd: '/tmp',
    timeoutMs: 30_000,
    envAllowlist: [],
  });
  assert.equal(outside.allowed, false);
});

test('network and secret access require intersection of role and workflow permission', () => {
  for (const capability of ['NETWORK_OUTBOUND', 'SECRET_ACCESS']) {
    assert.equal(
      evaluateSandboxPermission(policy, {
        ...baseRequest,
        capability,
        roleAllows: false,
      }).allowed,
      false,
    );
    assert.equal(
      evaluateSandboxPermission(policy, {
        ...baseRequest,
        capability,
        workflowAllows: false,
      }).allowed,
      false,
    );
    assert.equal(
      evaluateSandboxPermission(policy, {
        ...baseRequest,
        capability,
      }).allowed,
      true,
    );
  }
});

test('destructive actions require explicit human approval', () => {
  const denied = evaluateSandboxPermission(policy, {
    ...baseRequest,
    capability: 'DESTRUCTIVE_ACTION',
  });
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /human approval/);

  const allowed = evaluateSandboxPermission(policy, {
    ...baseRequest,
    capability: 'DESTRUCTIVE_ACTION',
    humanApproved: true,
  });
  assert.equal(allowed.allowed, true);
});

test('unknown capability and prompt/model expansion fail closed', () => {
  assert.equal(
    evaluateSandboxPermission(policy, {
      ...baseRequest,
      capability: 'UNKNOWN',
    }).allowed,
    false,
  );

  assert.equal(
    evaluateSandboxPermission(policy, {
      ...baseRequest,
      capability: 'NETWORK_OUTBOUND',
      promptRequestedExpansion: true,
    }).allowed,
    false,
  );

  assert.equal(
    evaluateSandboxPermission(policy, {
      ...baseRequest,
      capability: 'NETWORK_OUTBOUND',
      modelIdentityRequestedExpansion: true,
    }).allowed,
    false,
  );
});

test('weakened sandbox invariants are rejected', () => {
  const weakened = structuredClone(policy);
  weakened.default.filesystem.outside_repository = 'allow';
  weakened.rules.unknown_permission = 'ALLOW';

  const validation = validateSandboxPolicy(weakened);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /outside-repository/);
  assert.match(validation.errors.join('\n'), /unknown sandbox permission/);
});
