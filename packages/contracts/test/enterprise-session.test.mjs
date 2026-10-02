import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvalDelegationCanActAsApproval,
  approvalDelegationCanChangeExactBinding,
  approvalDelegationV1Schema,
  enterpriseSessionCanGrantAuthority,
  enterpriseSessionV1Schema,
  enterpriseVerifiedOidcPrincipalCanCarryRawToken,
  enterpriseVerifiedOidcPrincipalV1Schema,
  evaluateApprovalDelegationEligibilityV1,
  evaluateEnterpriseOidcAuthenticationV1,
  evaluateEnterpriseSessionCurrentnessV1,
} from '../dist/index.js';

const NOW = '2026-10-02T10:00:00+03:00';

const oidcActor = {
  schemaVersion: 1,
  actorId: 'actor-oidc',
  kind: 'OIDC_USER',
  displayName: 'OIDC Operator',
  status: 'ACTIVE',
  authority: 'NONE',
};

const binding = {
  schemaVersion: 1,
  actorId: 'actor-oidc',
  issuer: 'https://identity.example.test',
  subject: 'subject-123',
  audience: 'freehighlander',
  authority: 'NONE',
};

const principal = enterpriseVerifiedOidcPrincipalV1Schema.parse({
  schemaVersion: 1,
  actorId: 'actor-oidc',
  issuer: 'https://identity.example.test',
  subject: 'subject-123',
  audience: 'freehighlander',
  issuedAt: '2026-10-02T09:50:00+03:00',
  notBefore: null,
  expiresAt: '2026-10-02T11:00:00+03:00',
  verificationSource: 'TRUSTED_CONTROL_PLANE_VERIFIER',
  signatureVerified: true,
  rawTokenPresent: false,
  authority: 'NONE',
});

test('verified OIDC metadata authenticates only exact current bound actor identity', () => {
  const decision = evaluateEnterpriseOidcAuthenticationV1({
    principal,
    binding,
    actor: oidcActor,
    expectedIssuer: binding.issuer,
    expectedAudience: binding.audience,
    now: NOW,
  });

  assert.equal(decision.decision, 'AUTHENTICATED');
  assert.equal(decision.sessionEligible, true);
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.humanApprovalSatisfied, false);
  assert.equal(decision.systemPolicySatisfied, false);
  assert.equal(decision.executionAuthorized, false);
  assert.equal(decision.authority, 'NONE');
});

test('OIDC authentication reports every fail-closed mismatch and temporal failure', () => {
  const decision = evaluateEnterpriseOidcAuthenticationV1({
    principal: {
      ...principal,
      actorId: 'actor-other',
      issuer: 'https://other.example.test',
      subject: 'other-subject',
      audience: 'other-audience',
      issuedAt: '2026-10-02T10:30:00+03:00',
      notBefore: '2026-10-02T10:20:00+03:00',
      expiresAt: '2026-10-02T09:59:00+03:00',
    },
    binding,
    actor: { ...oidcActor, kind: 'LOCAL_USER', status: 'DISABLED' },
    expectedIssuer: binding.issuer,
    expectedAudience: binding.audience,
    now: NOW,
  });

  assert.equal(decision.decision, 'DENY');
  assert.equal(decision.sessionEligible, false);
  for (const fragment of [
    'OIDC issuer mismatch',
    'OIDC audience mismatch',
    'OIDC actor binding mismatch',
    'OIDC binding issuer mismatch',
    'OIDC subject binding mismatch',
    'OIDC binding audience mismatch',
    'OIDC actor identity mismatch',
    'OIDC principal requires OIDC_USER actor',
    'OIDC actor is disabled',
    'OIDC issued-at is in the future',
    'OIDC principal is not active yet',
    'OIDC principal is expired',
  ]) {
    assert.equal(decision.reasons.includes(fragment), true);
  }
});

test('OIDC contract cannot contain raw tokens or unverified client trust flags', () => {
  assert.throws(
    () =>
      enterpriseVerifiedOidcPrincipalV1Schema.parse({
        ...principal,
        rawTokenPresent: true,
      }),
    /Invalid input/,
  );
  assert.throws(
    () =>
      enterpriseVerifiedOidcPrincipalV1Schema.parse({
        ...principal,
        signatureVerified: false,
      }),
    /Invalid input/,
  );
  assert.throws(
    () =>
      enterpriseVerifiedOidcPrincipalV1Schema.parse({
        ...principal,
        accessToken: 'secret',
      }),
    /Unrecognized key/,
  );
  assert.equal(enterpriseVerifiedOidcPrincipalCanCarryRawToken(), false);
});

const session = enterpriseSessionV1Schema.parse({
  schemaVersion: 1,
  sessionId: 'session-001',
  organizationId: 'local-default',
  actorId: 'actor-oidc',
  authMethod: 'OIDC',
  createdAt: '2026-10-02T09:45:00+03:00',
  lastValidatedAt: '2026-10-02T09:55:00+03:00',
  expiresAt: '2026-10-02T11:00:00+03:00',
  status: 'ACTIVE',
  rawTokenPersisted: false,
  authority: 'NONE',
});

test('session currentness requires active exact organization and actor binding', () => {
  const decision = evaluateEnterpriseSessionCurrentnessV1({
    session,
    actor: oidcActor,
    expectedOrganizationId: 'local-default',
    now: NOW,
  });

  assert.equal(decision.status, 'CURRENT');
  assert.equal(decision.current, true);
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.authority, 'NONE');
  assert.equal(enterpriseSessionCanGrantAuthority(), false);
});

test('revoked stale or malformed-currentness session fails closed', () => {
  const decision = evaluateEnterpriseSessionCurrentnessV1({
    session: {
      ...session,
      organizationId: 'other-org',
      actorId: 'actor-other',
      createdAt: '2026-10-02T10:40:00+03:00',
      lastValidatedAt: '2026-10-02T10:30:00+03:00',
      expiresAt: '2026-10-02T09:59:00+03:00',
      status: 'REVOKED',
    },
    actor: { ...oidcActor, status: 'DISABLED' },
    expectedOrganizationId: 'local-default',
    now: NOW,
  });

  assert.equal(decision.status, 'DENY');
  assert.equal(decision.current, false);
  for (const fragment of [
    'session is revoked',
    'session actor is disabled',
    'session actor mismatch',
    'session organization mismatch',
    'session validation chronology is invalid',
    'session validation is in the future',
    'session is expired',
  ]) {
    assert.equal(decision.reasons.includes(fragment), true);
  }
});

test('session schema structurally forbids raw token persistence', () => {
  assert.throws(
    () => enterpriseSessionV1Schema.parse({ ...session, rawTokenPersisted: true }),
    /Invalid input/,
  );
  assert.throws(
    () => enterpriseSessionV1Schema.parse({ ...session, refreshToken: 'secret' }),
    /Unrecognized key/,
  );
});

const delegator = {
  schemaVersion: 1,
  actorId: 'human-owner',
  kind: 'OIDC_USER',
  displayName: 'Owner',
  status: 'ACTIVE',
  authority: 'NONE',
};

const delegate = {
  schemaVersion: 1,
  actorId: 'human-reviewer',
  kind: 'OIDC_USER',
  displayName: 'Reviewer',
  status: 'ACTIVE',
  authority: 'NONE',
};

const delegation = approvalDelegationV1Schema.parse({
  schemaVersion: 1,
  organizationId: 'local-default',
  delegationId: 'delegation-001',
  delegatorActorId: 'human-owner',
  delegateActorId: 'human-reviewer',
  projectId: 'project-main',
  actionClass: 'review-approval',
  validFrom: '2026-10-02T09:00:00+03:00',
  validUntil: '2026-10-02T11:00:00+03:00',
  status: 'ACTIVE',
  authority: 'NONE',
});

test('active exact human delegation is eligibility only and never approval', () => {
  const decision = evaluateApprovalDelegationEligibilityV1({
    delegation,
    delegator,
    delegate,
    organizationId: 'local-default',
    projectId: 'project-main',
    actionClass: 'review-approval',
    now: NOW,
  });

  assert.equal(decision.decision, 'ELIGIBLE');
  assert.equal(decision.humanDelegateEligible, true);
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.approvalSatisfied, false);
  assert.equal(decision.exactBindingMayChange, false);
  assert.equal(decision.authority, 'NONE');
  assert.equal(approvalDelegationCanActAsApproval(), false);
  assert.equal(approvalDelegationCanChangeExactBinding(), false);
});

test('delegation revalidation fails closed on identity scope time and revocation drift', () => {
  const decision = evaluateApprovalDelegationEligibilityV1({
    delegation: {
      ...delegation,
      organizationId: 'other-org',
      delegatorActorId: 'same-human',
      delegateActorId: 'same-human',
      projectId: 'other-project',
      actionClass: 'other-action',
      validFrom: '2026-10-02T11:00:00+03:00',
      validUntil: '2026-10-02T10:30:00+03:00',
      status: 'REVOKED',
    },
    delegator: { ...delegator, status: 'DISABLED' },
    delegate: { ...delegate, status: 'DISABLED' },
    organizationId: 'local-default',
    projectId: 'project-main',
    actionClass: 'review-approval',
    now: NOW,
  });

  assert.equal(decision.decision, 'DENY');
  assert.equal(decision.humanDelegateEligible, false);
  for (const fragment of [
    'delegation is revoked',
    'delegation requires distinct human actors',
    'delegator is disabled',
    'delegate is disabled',
    'delegator identity mismatch',
    'delegate identity mismatch',
    'delegation organization mismatch',
    'delegation project mismatch',
    'delegation action mismatch',
    'delegation validity window is invalid',
    'delegation is not active yet',
  ]) {
    assert.equal(decision.reasons.includes(fragment), true);
  }
});

test('expired otherwise well-formed delegation is denied at use time', () => {
  const decision = evaluateApprovalDelegationEligibilityV1({
    delegation: {
      ...delegation,
      validFrom: '2026-10-02T08:00:00+03:00',
      validUntil: '2026-10-02T09:00:00+03:00',
    },
    delegator,
    delegate,
    organizationId: 'local-default',
    projectId: 'project-main',
    actionClass: 'review-approval',
    now: NOW,
  });

  assert.equal(decision.decision, 'DENY');
  assert.deepEqual(decision.reasons, ['delegation is expired']);
});
