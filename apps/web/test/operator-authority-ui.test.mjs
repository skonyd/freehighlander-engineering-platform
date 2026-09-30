import assert from 'node:assert/strict';
import test from 'node:test';

import { OPERATOR_AUTHORITY_PERMISSIONS_HTML } from '../dist/operator-authority-permissions-ui.js';

test('authority UI uses the control-plane as source of truth', () => {
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /\/v1\/authority\/session/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /\/v1\/authority\/request/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /\/v1\/authority\/approve/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /\/v1\/authority\/activate/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /\/v1\/authority\/deactivate/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /x-freehighlander-csrf/);
  assert.doesNotMatch(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /localStorage/);
  assert.doesNotMatch(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /exactHumanApprovalVerified/);
});

test('authority UI keeps all four critical capabilities independently controllable', () => {
  for (const capability of [
    'GIT_WRITE',
    'RELEASE_DEPLOY',
    'INFRASTRUCTURE_MUTATION',
    'AUTOMATIC_REMEDIATION',
  ]) {
    assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, new RegExp('data-capability="'+capability+'"'));
  }

  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /Approve &amp; activate/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /Reset all to DENY/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /REQUESTED · inactive/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /ACTIVE/);
  assert.match(OPERATOR_AUTHORITY_PERMISSIONS_HTML, /DENY/);
});
