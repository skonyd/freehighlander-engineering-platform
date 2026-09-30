import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOperatorAuthorityProfileV1,
  evaluateOperatorAuthorityCapabilityV1,
  operatorAuthorityProfileCanGrantAuthority,
} from '../dist/index.js';

test('operator authority profile defaults every capability to DENY', () => {
  const profile = createOperatorAuthorityProfileV1();

  assert.equal(profile.defaultDeny, true);
  assert.deepEqual(profile.requestedCapabilities, []);
  assert.equal(profile.gitWrite, false);
  assert.equal(profile.releaseDeploy, false);
  assert.equal(profile.infrastructureMutation, false);
  assert.equal(profile.automaticRemediation, false);
  assert.equal(profile.authority, 'NONE');
  assert.equal(operatorAuthorityProfileCanGrantAuthority(), false);
});

test('operator can independently select each authority capability', () => {
  const profile = createOperatorAuthorityProfileV1({
    gitWrite: true,
    automaticRemediation: true,
  });

  assert.deepEqual(profile.requestedCapabilities, ['GIT_WRITE', 'AUTOMATIC_REMEDIATION']);
  assert.equal(profile.releaseDeploy, false);
  assert.equal(profile.infrastructureMutation, false);
});

test('selected capability remains blocked until every authority gate passes', () => {
  const profile = createOperatorAuthorityProfileV1({ gitWrite: true });

  const blocked = evaluateOperatorAuthorityCapabilityV1(profile, 'GIT_WRITE', {
    v3AuthorityEnabled: false,
    exactHumanApprovalVerified: true,
    systemPolicyEffect: 'ALLOW',
  });
  assert.equal(blocked.status, 'BLOCKED');
  assert.match(blocked.reasons.join(' '), /V3 authority/);

  const active = evaluateOperatorAuthorityCapabilityV1(profile, 'GIT_WRITE', {
    v3AuthorityEnabled: true,
    exactHumanApprovalVerified: true,
    systemPolicyEffect: 'ALLOW',
  });
  assert.equal(active.status, 'ACTIVE');
  assert.deepEqual(active.reasons, []);
});

test('unselected capability cannot become active even if policy allows it', () => {
  const profile = createOperatorAuthorityProfileV1({ gitWrite: true });
  const decision = evaluateOperatorAuthorityCapabilityV1(profile, 'RELEASE_DEPLOY', {
    v3AuthorityEnabled: true,
    exactHumanApprovalVerified: true,
    systemPolicyEffect: 'ALLOW',
  });

  assert.equal(decision.status, 'BLOCKED');
  assert.match(decision.reasons.join(' '), /not selected/);
});
