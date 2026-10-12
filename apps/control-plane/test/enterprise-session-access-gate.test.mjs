import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  EnterpriseDirectoryStateStore,
  createDefaultEnterpriseDirectoryStateV1,
} from '@freehighlander/persistence';

import {
  EnterpriseSessionAccessGate,
  enterpriseSessionGateCanGrantExecutionAuthority,
  enterpriseSessionGateCanVerifyOidcToken,
} from '../dist/index.js';

const NOW = '2026-10-12T10:00:00+03:00';

const organization = {
  schemaVersion: 1,
  organizationId: 'local-default',
  displayName: 'Local Enterprise',
  tenantMode: 'SINGLE_TENANT',
  authority: 'NONE',
};
const actor = {
  schemaVersion: 1,
  actorId: 'actor-oidc',
  kind: 'OIDC_USER',
  displayName: 'Verified Reviewer',
  status: 'ACTIVE',
  authority: 'NONE',
};
const oidcBinding = {
  schemaVersion: 1,
  actorId: 'actor-oidc',
  issuer: 'https://identity.example.test',
  subject: 'subject-123',
  audience: 'freehighlander',
  authority: 'NONE',
};
const membership = {
  schemaVersion: 1,
  organizationId: 'local-default',
  projectId: 'project-main',
  actorId: 'actor-oidc',
  accessRoles: ['ENGINEER'],
  authority: 'NONE',
};
const session = {
  schemaVersion: 1,
  sessionId: 'session-001',
  organizationId: 'local-default',
  actorId: 'actor-oidc',
  authMethod: 'OIDC',
  createdAt: '2026-10-12T09:00:00+03:00',
  lastValidatedAt: '2026-10-12T09:30:00+03:00',
  expiresAt: '2026-10-12T11:00:00+03:00',
  status: 'ACTIVE',
  rawTokenPersisted: false,
  authority: 'NONE',
};
const request = {
  verifiedSessionId: 'session-001',
  projectId: 'project-main',
  capability: 'REQUEST_EXECUTION',
  now: NOW,
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'fh-enterprise-access-'));
  const store = new EnterpriseDirectoryStateStore(join(directory, 'directory.json'), organization);
  const initial = createDefaultEnterpriseDirectoryStateV1(organization);
  const result = store.write(0, {
    ...initial,
    actors: [actor],
    oidcBindings: [oidcBinding],
    projectMemberships: [membership],
    sessions: [session],
  });
  assert.equal(result.status, 'WRITTEN');
  return { store, gate: new EnterpriseSessionAccessGate(store, 'SINGLE_TENANT_OIDC') };
}

function replace(store, updates) {
  const snapshot = store.read();
  const result = store.write(snapshot.generation, { ...snapshot.state, ...updates });
  assert.equal(result.status, 'WRITTEN');
}

test('local-first mode never grants execution authority', () => {
  const { store } = fixture();
  const gate = new EnterpriseSessionAccessGate(store, 'DISABLED');
  const result = gate.evaluate({ ...request, verifiedSessionId: null });
  assert.equal(result.decision, 'LOCAL_MODE');
  assert.equal(result.productAccessEligible, true);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.systemPolicySatisfied, false);
  assert.equal(result.humanApprovalSatisfied, false);
  assert.equal(enterpriseSessionGateCanGrantExecutionAuthority(), false);
  assert.equal(enterpriseSessionGateCanVerifyOidcToken(), false);
});

test('enterprise gate requires current OIDC session and exact project role', () => {
  const { gate } = fixture();
  const eligible = gate.evaluate(request);
  assert.equal(eligible.decision, 'ELIGIBLE');
  assert.deepEqual(eligible.reasons, []);
  assert.equal(eligible.productAccessEligible, true);
  assert.equal(eligible.executionAuthorized, false);
  assert.equal(eligible.authority, 'NONE');

  const wrongProject = gate.evaluate({ ...request, projectId: 'project-other' });
  assert.equal(wrongProject.decision, 'DENY');
  assert.ok(wrongProject.reasons.includes('project membership is missing'));

  const missingSession = gate.evaluate({ ...request, verifiedSessionId: null });
  assert.equal(missingSession.decision, 'DENY');
  assert.ok(missingSession.reasons.includes('verified enterprise session is missing'));
});

test('role mismatch and other-project membership never grant execution requests', () => {
  const { gate, store } = fixture();
  replace(store, { projectMemberships: [{ ...membership, accessRoles: ['VIEWER'] }] });
  assert.equal(gate.evaluate(request).decision, 'DENY');
  assert.ok(
    gate
      .evaluate(request)
      .reasons.includes('membership role is not eligible for requested capability'),
  );
  assert.equal(gate.evaluate({ ...request, capability: 'VIEW_PROJECT' }).decision, 'ELIGIBLE');

  replace(store, { projectMemberships: [{ ...membership, projectId: 'project-other' }] });
  assert.equal(gate.evaluate(request).decision, 'DENY');
});

test('revocation, disabled actors and deleted OIDC bindings deny without cached state', () => {
  const { gate, store } = fixture();
  assert.equal(gate.evaluate(request).decision, 'ELIGIBLE');

  replace(store, { sessions: [{ ...session, status: 'REVOKED' }] });
  assert.ok(gate.evaluate(request).reasons.includes('session is revoked'));

  replace(store, { sessions: [session], actors: [{ ...actor, status: 'DISABLED' }] });
  assert.ok(gate.evaluate(request).reasons.includes('session actor is disabled'));

  replace(store, { actors: [actor], oidcBindings: [] });
  assert.ok(
    gate.evaluate(request).reasons.includes('enterprise actor has no current OIDC binding'),
  );
});

test('stale session, local session or absent membership remain denied in enterprise mode', () => {
  const { gate, store } = fixture();
  replace(store, { sessions: [{ ...session, expiresAt: '2026-10-12T09:59:00+03:00' }] });
  assert.ok(gate.evaluate(request).reasons.includes('session is expired'));

  replace(store, { sessions: [{ ...session, authMethod: 'LOCAL' }] });
  assert.ok(gate.evaluate(request).reasons.includes('enterprise session must use OIDC'));

  replace(store, { sessions: [session], projectMemberships: [] });
  assert.equal(gate.evaluate(request).decision, 'DENY');
});

test('malformed directory snapshot cannot make an absent session actor eligible', () => {
  const injectedDirectory = {
    organization,
    read: () => ({ state: { sessions: [session], actors: [] } }),
  };
  const gate = new EnterpriseSessionAccessGate(injectedDirectory, 'SINGLE_TENANT_OIDC');
  const result = gate.evaluate(request);
  assert.equal(result.decision, 'DENY');
  assert.ok(result.reasons.includes('session actor is missing from enterprise directory'));
});

test('invalid input is never silently accepted', () => {
  const { gate } = fixture();
  assert.throws(() => gate.evaluate({ ...request, projectId: '../other' }), /bounded identifier/);
  assert.throws(() => gate.evaluate({ ...request, capability: 'UNSAFE' }));
  assert.throws(() => gate.evaluate({ ...request, now: 'invalid' }), /valid timestamp/);
  assert.throws(() => new EnterpriseSessionAccessGate(gate.directory, 'UNSAFE'));
});
