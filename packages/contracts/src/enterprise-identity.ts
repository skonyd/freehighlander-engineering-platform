import { z } from 'zod';

const boundedIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/);
const safeTextSchema = z.string().trim().min(1).max(200);

export const enterpriseTenantModeV1Schema = z.literal('SINGLE_TENANT');
export type EnterpriseTenantModeV1 = z.infer<typeof enterpriseTenantModeV1Schema>;

export const enterpriseActorKindV1Schema = z.enum(['LOCAL_USER', 'OIDC_USER']);
export type EnterpriseActorKindV1 = z.infer<typeof enterpriseActorKindV1Schema>;

export const enterpriseActorStatusV1Schema = z.enum(['ACTIVE', 'DISABLED']);
export type EnterpriseActorStatusV1 = z.infer<typeof enterpriseActorStatusV1Schema>;

export const enterpriseAccessRoleV1Schema = z.enum([
  'OWNER',
  'ADMIN',
  'ENGINEER',
  'REVIEWER',
  'VIEWER',
]);
export type EnterpriseAccessRoleV1 = z.infer<typeof enterpriseAccessRoleV1Schema>;

export const enterpriseCapabilityV1Schema = z.enum([
  'VIEW_PROJECT',
  'MANAGE_MEMBERSHIP',
  'REQUEST_EXECUTION',
  'REQUEST_REVIEW',
  'MANAGE_CONNECTORS',
  'MANAGE_IDENTITY',
]);
export type EnterpriseCapabilityV1 = z.infer<typeof enterpriseCapabilityV1Schema>;

export const enterpriseOrganizationV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: boundedIdSchema,
    displayName: safeTextSchema,
    tenantMode: enterpriseTenantModeV1Schema,
    authority: z.literal('NONE'),
  })
  .strict();
export type EnterpriseOrganizationV1 = z.infer<typeof enterpriseOrganizationV1Schema>;

export const enterpriseActorV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    actorId: boundedIdSchema,
    kind: enterpriseActorKindV1Schema,
    displayName: safeTextSchema,
    status: enterpriseActorStatusV1Schema,
    authority: z.literal('NONE'),
  })
  .strict();
export type EnterpriseActorV1 = z.infer<typeof enterpriseActorV1Schema>;

export const oidcSubjectBindingV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    actorId: boundedIdSchema,
    issuer: z.string().url().max(500),
    subject: z.string().trim().min(1).max(255),
    audience: z.string().trim().min(1).max(255),
    authority: z.literal('NONE'),
  })
  .strict();
export type OidcSubjectBindingV1 = z.infer<typeof oidcSubjectBindingV1Schema>;

export const enterpriseTeamV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: boundedIdSchema,
    teamId: boundedIdSchema,
    displayName: safeTextSchema,
    authority: z.literal('NONE'),
  })
  .strict();
export type EnterpriseTeamV1 = z.infer<typeof enterpriseTeamV1Schema>;

export const enterpriseProjectMembershipV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: boundedIdSchema,
    projectId: boundedIdSchema,
    actorId: boundedIdSchema,
    accessRoles: z.array(enterpriseAccessRoleV1Schema).min(1).max(5),
    authority: z.literal('NONE'),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.accessRoles).size !== value.accessRoles.length) {
      context.addIssue({
        code: 'custom',
        path: ['accessRoles'],
        message: 'accessRoles must be unique',
      });
    }
  });
export type EnterpriseProjectMembershipV1 = z.infer<typeof enterpriseProjectMembershipV1Schema>;

export const enterpriseTeamMembershipV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: boundedIdSchema,
    teamId: boundedIdSchema,
    actorId: boundedIdSchema,
    authority: z.literal('NONE'),
  })
  .strict();
export type EnterpriseTeamMembershipV1 = z.infer<typeof enterpriseTeamMembershipV1Schema>;

export const approvalDelegationDraftV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: boundedIdSchema,
    delegationId: boundedIdSchema,
    delegatorActorId: boundedIdSchema,
    delegateActorId: boundedIdSchema,
    projectId: boundedIdSchema,
    actionClass: boundedIdSchema,
    validFrom: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }),
    status: z.literal('DRAFT'),
    authority: z.literal('NONE'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.delegatorActorId === value.delegateActorId) {
      context.addIssue({
        code: 'custom',
        path: ['delegateActorId'],
        message: 'delegation requires two distinct human actors',
      });
    }
    if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) {
      context.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'validUntil must be after validFrom',
      });
    }
  });
export type ApprovalDelegationDraftV1 = z.infer<typeof approvalDelegationDraftV1Schema>;

export interface EnterpriseAccessPreviewInput {
  readonly organization: EnterpriseOrganizationV1;
  readonly actor: EnterpriseActorV1;
  readonly membership: EnterpriseProjectMembershipV1 | null;
  readonly requestedCapability: EnterpriseCapabilityV1;
}

export interface EnterpriseAccessPreviewV1 {
  readonly schemaVersion: 1;
  readonly decision: 'ELIGIBLE' | 'DENY';
  readonly reasons: readonly string[];
  readonly productAccessEligible: boolean;
  readonly executionAuthorized: false;
  readonly humanApprovalSatisfied: false;
  readonly systemPolicySatisfied: false;
  readonly logicalRoleAuthorityGranted: false;
  readonly authority: 'NONE';
}

const CAPABILITY_ROLES: Readonly<
  Record<EnterpriseCapabilityV1, readonly EnterpriseAccessRoleV1[]>
> = {
  VIEW_PROJECT: ['OWNER', 'ADMIN', 'ENGINEER', 'REVIEWER', 'VIEWER'],
  MANAGE_MEMBERSHIP: ['OWNER', 'ADMIN'],
  REQUEST_EXECUTION: ['OWNER', 'ADMIN', 'ENGINEER'],
  REQUEST_REVIEW: ['OWNER', 'ADMIN', 'ENGINEER', 'REVIEWER'],
  MANAGE_CONNECTORS: ['OWNER', 'ADMIN'],
  MANAGE_IDENTITY: ['OWNER', 'ADMIN'],
};

export function evaluateEnterpriseAccessPreview(
  input: EnterpriseAccessPreviewInput,
): EnterpriseAccessPreviewV1 {
  const organization = enterpriseOrganizationV1Schema.parse(input.organization);
  const actor = enterpriseActorV1Schema.parse(input.actor);
  const capability = enterpriseCapabilityV1Schema.parse(input.requestedCapability);
  const membership =
    input.membership === null ? null : enterpriseProjectMembershipV1Schema.parse(input.membership);

  const reasons: string[] = [];

  if (organization.tenantMode !== 'SINGLE_TENANT') {
    reasons.push('unsupported tenant mode');
  }
  if (actor.status !== 'ACTIVE') {
    reasons.push('actor is disabled');
  }
  if (membership === null) {
    reasons.push('project membership is missing');
  } else {
    if (membership.organizationId !== organization.organizationId) {
      reasons.push('organization boundary mismatch');
    }
    if (membership.actorId !== actor.actorId) {
      reasons.push('actor membership mismatch');
    }
    const allowedRoles = CAPABILITY_ROLES[capability];
    if (!membership.accessRoles.some((role) => allowedRoles.includes(role))) {
      reasons.push('membership role is not eligible for requested capability');
    }
  }

  reasons.sort();
  const productAccessEligible = reasons.length === 0;

  return {
    schemaVersion: 1,
    decision: productAccessEligible ? 'ELIGIBLE' : 'DENY',
    reasons,
    productAccessEligible,
    executionAuthorized: false,
    humanApprovalSatisfied: false,
    systemPolicySatisfied: false,
    logicalRoleAuthorityGranted: false,
    authority: 'NONE',
  };
}

export function enterpriseIdentityCanGrantAuthority(): false {
  return false;
}

export function enterpriseMembershipCanSatisfyHumanApproval(): false {
  return false;
}

export function enterpriseRbacCanSatisfySystemPolicy(): false {
  return false;
}

export function enterpriseIdentitySupportsMultiTenantPersistence(): false {
  return false;
}

export function approvalDelegationDraftCanActAsApproval(): false {
  return false;
}
