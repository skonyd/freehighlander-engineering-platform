import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OPERATOR_AUTHORITY_PERMISSIONS_HTML,
  authorityPermissionsPageCanForgeApprovalEvidence,
  authorityPermissionsPageRequiresControlPlane,
} from '../dist/index.js';

test('authority page is wired to the localhost control-plane and no browser-only authority state', () => {
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /http:\/\/127\.0\.0\.1:4311/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /\/v1\/authority\/session/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /\/v1\/authority\/request/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /\/v1\/authority\/approve/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /\/v1\/authority\/activate/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /\/v1\/authority\/deactivate/);
  assert.doesNotMatch(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /localStorage/);
});

test('authority page exposes independent explicit controls for all four critical capabilities', () => {
  for (const capability of [
    'GIT_WRITE',
    'RELEASE_DEPLOY',
    'INFRASTRUCTURE_MUTATION',
    'AUTOMATIC_REMEDIATION',
  ]) {
    assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, new RegExp('request-' + capability));
    assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, new RegExp('data-approve="' + capability + '"'));
    assert.match(
      OPERATOR_AUTHORITY_PERMISSIONS_HTML,
      new RegExp('data-deactivate="' + capability + '"'),
    );
  }
});

test('browser page cannot forge approval evidence and requires the control-plane', () => {
  assert.equal(authorityPermissionsPageCanForgeApprovalEvidence(), false);
  assert.equal(authorityPermissionsPageRequiresControlPlane(), true);
  assert.doesNotMatch(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /exactHumanApprovalVerified\s*:/);
  assert.doesNotMatch(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /systemPolicyHash\s*:/);
  assert.doesNotMatch(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /humanDecisionHash\s*:/);
});

test('requested authority is visibly distinct from active authority', () => {
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /Requested is not the same as active authority/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, />REQUESTED</);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, />ACTIVE</);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, />DENY</);
});
