import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaRolePackManifestV1,
  createFhKuikaSolutionPackManifestV1,
  rolePackManifestCanGrantAuthority,
  rolePackManifestCanInstall,
  solutionPackManifestCanActivate,
  solutionPackManifestCanGrantAuthority,
} from '../dist/index.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

test('FH-KUIKA role pack manifest is deterministic, pinned and authority-neutral', () => {
  const input = {
    id: 'security-review-pack',
    version: '1.0.0',
    name: 'Security Review Pack',
    description: 'Pinned reusable reviewer roles.',
    roles: [
      { roleId: 'security-reviewer', version: '1.2.0', roleHash: HASH_A },
      { roleId: 'test-reviewer', version: '3.0.0', roleHash: HASH_B },
    ],
  };

  const first = createFhKuikaRolePackManifestV1(input);
  const second = createFhKuikaRolePackManifestV1(input);

  assert.deepEqual(first, second);
  assert.match(first.packageHash, /^[a-f0-9]{64}$/);
  assert.equal(first.status, 'PINNED_MANIFEST');
  assert.equal(first.authority, 'NONE');
  assert.equal(first.installAuthorized, false);
  assert.equal(first.activationAuthorized, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.roles), true);
  assert.equal(rolePackManifestCanGrantAuthority(), false);
  assert.equal(rolePackManifestCanInstall(), false);
});

test('FH-KUIKA solution pack references pinned role, blueprint and workflow identities', () => {
  const rolePack = createFhKuikaRolePackManifestV1({
    id: 'pr-quality',
    version: '1.0.0',
    name: 'PR Quality',
    description: 'Review roles for pull requests.',
    roles: [{ roleId: 'test-reviewer', version: '3.0.0', roleHash: HASH_A }],
  });

  const pack = createFhKuikaSolutionPackManifestV1({
    id: 'release-readiness',
    version: '1.0.0',
    name: 'Release Readiness',
    description: 'Pinned release-readiness composition.',
    rolePacks: [
      {
        rolePackId: rolePack.id,
        version: rolePack.version,
        packageHash: rolePack.packageHash,
      },
    ],
    blueprints: [
      {
        blueprintId: 'release-preparation',
        version: '1.0.0',
        blueprintHash: HASH_B,
      },
    ],
    workflows: [
      {
        workflowId: 'release-readiness',
        version: '1.0.0',
        workflowHash: HASH_C,
      },
    ],
    connectors: [{ connectorId: 'github', optional: false }],
  });

  assert.match(pack.packageHash, /^[a-f0-9]{64}$/);
  assert.equal(pack.authority, 'NONE');
  assert.equal(pack.installAuthorized, false);
  assert.equal(pack.activationAuthorized, false);
  assert.equal(solutionPackManifestCanGrantAuthority(), false);
  assert.equal(solutionPackManifestCanActivate(), false);
});

test('FH-KUIKA package manifests fail closed on unpinned or duplicate references', () => {
  assert.throws(
    () =>
      createFhKuikaRolePackManifestV1({
        id: 'bad-pack',
        version: '1.0.0',
        name: 'Bad Pack',
        description: 'Bad role hash.',
        roles: [{ roleId: 'reviewer', version: '1.0.0', roleHash: 'not-a-hash' }],
      }),
    /lowercase sha256/,
  );

  assert.throws(
    () =>
      createFhKuikaRolePackManifestV1({
        id: 'dupe-pack',
        version: '1.0.0',
        name: 'Duplicate Pack',
        description: 'Duplicate role refs.',
        roles: [
          { roleId: 'reviewer', version: '1.0.0', roleHash: HASH_A },
          { roleId: 'reviewer', version: '1.0.0', roleHash: HASH_B },
        ],
      }),
    /role references must be unique/,
  );

  assert.throws(
    () =>
      createFhKuikaSolutionPackManifestV1({
        id: 'empty-pack',
        version: '1.0.0',
        name: 'Empty Pack',
        description: 'No executable composition.',
        rolePacks: [],
        blueprints: [],
        workflows: [],
        connectors: [{ connectorId: 'github', optional: true }],
      }),
    /must reference at least one role pack, blueprint or workflow/,
  );
});
