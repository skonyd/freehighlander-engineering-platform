import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvalDelegationDraftCanActAsApproval,
  approvalDelegationDraftV1Schema,
  enterpriseIdentityCanGrantAuthority,
  enterpriseIdentitySupportsMultiTenantPersistence,
  enterpriseMembershipCanSatisfyHumanApproval,
  enterpriseOrganizationV1Schema,
  enterpriseProjectMembershipV1Schema,
  enterpriseRbacCanSatisfySystemPolicy,
  evaluateEnterpriseAccessPreview,
} from '../dist/index.js';

const organization = enterpriseOrganizationV1Schema.parse({
  schemaVersion: 1,
  organizationId: 'local-default',
  displayName: 'Local Organization',
  tenantMode: 'SINGLE_TENANT',
  authority: 'NONE',
});

const activeActor = {
  schemaVersion: 1,
  actorId: 'user-local',
  kind: 'LOCAL_USER',
  displayName: 'Local Operator',
  status: 'ACTIVE',
  authority: 'NONE',
};

test('enterprise RBAC only previews product eligibility and never grants runtime authority', () => {
  const membership = enterpriseProjectMembershipV1Schema.parse({
    schemaVersion: 1,
    organizationId: 'local-default',
    projectId: 'project-main',
    actorId: 'user-local',
    accessRoles: ['ENGINEER'],
    authority: 'NONE',
  });

  const preview = evaluateEnterpriseAccessPreview({
    organization,
    actor: activeActor,
    membership,
    requestedCapability: 'REQUEST_EXECUTION',
  });

  assert.equal(preview.decision, 'ELIGIBLE');
  assert.equal(preview.productAccessEligible, true);
  assert.equal(preview.executionAuthorized, false);
  assert.equal(preview.humanApprovalSatisfied, false);
  assert.equal(preview.systemPolicySatisfied, false);
  assert.equal(preview.logicalRoleAuthorityGranted, false);
  assert.equal(preview.authority, 'NONE');
});

test('missing membership and disabled actors fail closed', () => {
  const missing = evaluateEnterpriseAccessPreview({
    organization,
    actor: activeActor,
    membership: null,
    requestedCapability: 'VIEW_PROJECT',
  });
  assert.equal(missing.decision, 'DENY');
  assert.deepEqual(missing.reasons, ['project membership is missing']);

  const disabled = evaluateEnterpriseAccessPreview({
    organization,
    actor: { ...activeActor, status: 'DISABLED' },
    membership: {
      schemaVersion: 1,
      organizationId: 'local-default',
      projectId: 'project-main',
      actorId: 'user-local',
      accessRoles: ['OWNER'],
      authority: 'NONE',
    },
    requestedCapability: 'MANAGE_IDENTITY',
  });
  assert.equal(disabled.decision, 'DENY');
  assert.equal(disabled.reasons.includes('actor is disabled'), true);
});

test('organization boundary mismatch is denied even for owner membership', () => {
  const preview = evaluateEnterpriseAccessPreview({
    organization,
    actor: activeActor,
    membership: {
      schemaVersion: 1,
      organizationId: 'other-org',
      projectId: 'project-main',
      actorId: 'user-local',
      accessRoles: ['OWNER'],
      authority: 'NONE',
    },
    requestedCapability: 'MANAGE_MEMBERSHIP',
  });

  assert.equal(preview.decision, 'DENY');
  assert.deepEqual(preview.reasons, ['organization boundary mismatch']);
});

test('membership belonging to a different actor is denied', () => {
  const preview = evaluateEnterpriseAccessPreview({
    organization,
    actor: activeActor,
    membership: {
      schemaVersion: 1,
      organizationId: 'local-default',
      projectId: 'project-main',
      actorId: 'user-other',
      accessRoles: ['OWNER'],
      authority: 'NONE',
    },
    requestedCapability: 'MANAGE_MEMBERSHIP',
  });

  assert.equal(preview.decision, 'DENY');
  assert.deepEqual(preview.reasons, ['actor membership mismatch']);
});

test('access-role eligibility is capability-specific', () => {
  const preview = evaluateEnterpriseAccessPreview({
    organization,
    actor: activeActor,
    membership: {
      schemaVersion: 1,
      organizationId: 'local-default',
      projectId: 'project-main',
      actorId: 'user-local',
      accessRoles: ['VIEWER'],
      authority: 'NONE',
    },
    requestedCapability: 'REQUEST_EXECUTION',
  });

  assert.equal(preview.decision, 'DENY');
  assert.deepEqual(preview.reasons, [
    'membership role is not eligible for requested capability',
  ]);
});

test('delegation remains a draft and cannot self-delegate or invert its time window', () => {
  const valid = approvalDelegationDraftV1Schema.parse({
    schemaVersion: 1,
    organizationId: 'local-default',
    delegationId: 'delegation-001',
    delegatorActorId: 'human-owner',
    delegateActorId: 'human-reviewer',
    projectId: 'project-main',
    actionClass: 'review-approval',
    validFrom: '2026-09-28T08:00:00+03:00',
    validUntil: '2026-09-28T18:00:00+03:00',
    status: 'DRAFT',
    authority: 'NONE',
  });
  assert.equal(valid.status, 'DRAFT');

  assert.throws(
    () =>
      approvalDelegationDraftV1Schema.parse({
        ...valid,
        delegateActorId: valid.delegatorActorId,
      }),
    /distinct human actors/,
  );

  assert.throws(
    () =>
      approvalDelegationDraftV1Schema.parse({
        ...valid,
        validUntil: '2026-09-28T07:00:00+03:00',
      }),
    /validUntil must be after validFrom/,
  );
});

test('enterprise preparation preserves all authority boundaries', () => {
  assert.equal(enterpriseIdentityCanGrantAuthority(), false);
  assert.equal(enterpriseMembershipCanSatisfyHumanApproval(), false);
  assert.equal(enterpriseRbacCanSatisfySystemPolicy(), false);
  assert.equal(enterpriseIdentitySupportsMultiTenantPersistence(), false);
  assert.equal(approvalDelegationDraftCanActAsApproval(), false);
});
