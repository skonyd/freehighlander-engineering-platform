import { z } from 'zod';

import {
  enterpriseActorV1Schema,
  oidcSubjectBindingV1Schema,
  type EnterpriseActorV1,
  type OidcSubjectBindingV1,
} from './enterprise-identity.js';

const boundedIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/);
const timestampSchema = z.string().datetime({ offset: true });

export const enterpriseIdentityRuntimeModeV1Schema = z.enum(['DISABLED', 'SINGLE_TENANT_OIDC']);
export type EnterpriseIdentityRuntimeModeV1 = z.infer<typeof enterpriseIdentityRuntimeModeV1Schema>;

export const enterpriseVerifiedOidcPrincipalV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    actorId: boundedIdSchema,
    issuer: z.string().url().max(500),
    subject: z.string().trim().min(1).max(255),
    audience: z.string().trim().min(1).max(255),
    issuedAt: timestampSchema,
    notBefore: timestampSchema.nullable(),
    expiresAt: timestampSchema,
    verificationSource: z.literal('TRUSTED_CONTROL_PLANE_VERIFIER'),
    signatureVerified: z.literal(true),
    rawTokenPresent: z.literal(false),
    authority: z.literal('NONE'),
  })
  .strict();
export type EnterpriseVerifiedOidcPrincipalV1 = z.infer<
  typeof enterpriseVerifiedOidcPrincipalV1Schema
>;

export const enterpriseSessionStatusV1Schema = z.enum(['ACTIVE', 'REVOKED']);
export type EnterpriseSessionStatusV1 = z.infer<typeof enterpriseSessionStatusV1Schema>;

export const enterpriseSessionV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: boundedIdSchema,
    organizationId: boundedIdSchema,
    actorId: boundedIdSchema,
    authMethod: z.enum(['LOCAL', 'OIDC']),
    createdAt: timestampSchema,
    lastValidatedAt: timestampSchema,
    expiresAt: timestampSchema,
    status: enterpriseSessionStatusV1Schema,
    rawTokenPersisted: z.literal(false),
    authority: z.literal('NONE'),
  })
  .strict();
export type EnterpriseSessionV1 = z.infer<typeof enterpriseSessionV1Schema>;

export interface EnterpriseOidcAuthenticationInputV1 {
  readonly principal: EnterpriseVerifiedOidcPrincipalV1;
  readonly binding: OidcSubjectBindingV1;
  readonly actor: EnterpriseActorV1;
  readonly expectedIssuer: string;
  readonly expectedAudience: string;
  readonly now: string;
}

export interface EnterpriseOidcAuthenticationDecisionV1 {
  readonly schemaVersion: 1;
  readonly decision: 'AUTHENTICATED' | 'DENY';
  readonly reasons: readonly string[];
  readonly sessionEligible: boolean;
  readonly humanApprovalSatisfied: false;
  readonly systemPolicySatisfied: false;
  readonly executionAuthorized: false;
  readonly authority: 'NONE';
}

export function evaluateEnterpriseOidcAuthenticationV1(
  input: EnterpriseOidcAuthenticationInputV1,
): EnterpriseOidcAuthenticationDecisionV1 {
  const principal = enterpriseVerifiedOidcPrincipalV1Schema.parse(input.principal);
  const binding = oidcSubjectBindingV1Schema.parse(input.binding);
  const actor = enterpriseActorV1Schema.parse(input.actor);
  const nowMs = Date.parse(timestampSchema.parse(input.now));
  const reasons: string[] = [];

  if (principal.issuer !== input.expectedIssuer) reasons.push('OIDC issuer mismatch');
  if (principal.audience !== input.expectedAudience) reasons.push('OIDC audience mismatch');
  if (binding.actorId !== principal.actorId) reasons.push('OIDC actor binding mismatch');
  if (binding.issuer !== principal.issuer) reasons.push('OIDC binding issuer mismatch');
  if (binding.subject !== principal.subject) reasons.push('OIDC subject binding mismatch');
  if (binding.audience !== principal.audience) reasons.push('OIDC binding audience mismatch');
  if (actor.actorId !== principal.actorId) reasons.push('OIDC actor identity mismatch');
  if (actor.kind !== 'OIDC_USER') reasons.push('OIDC principal requires OIDC_USER actor');
  if (actor.status !== 'ACTIVE') reasons.push('OIDC actor is disabled');
  if (Date.parse(principal.issuedAt) > nowMs) reasons.push('OIDC issued-at is in the future');
  if (principal.notBefore !== null && Date.parse(principal.notBefore) > nowMs) {
    reasons.push('OIDC principal is not active yet');
  }
  if (Date.parse(principal.expiresAt) <= nowMs) reasons.push('OIDC principal is expired');

  reasons.sort();
  const sessionEligible = reasons.length === 0;
  return {
    schemaVersion: 1,
    decision: sessionEligible ? 'AUTHENTICATED' : 'DENY',
    reasons,
    sessionEligible,
    humanApprovalSatisfied: false,
    systemPolicySatisfied: false,
    executionAuthorized: false,
    authority: 'NONE',
  };
}

export interface EnterpriseSessionCurrentnessInputV1 {
  readonly session: EnterpriseSessionV1;
  readonly actor: EnterpriseActorV1;
  readonly expectedOrganizationId: string;
  readonly now: string;
}

export interface EnterpriseSessionCurrentnessV1 {
  readonly schemaVersion: 1;
  readonly status: 'CURRENT' | 'DENY';
  readonly reasons: readonly string[];
  readonly current: boolean;
  readonly authority: 'NONE';
}

export function evaluateEnterpriseSessionCurrentnessV1(
  input: EnterpriseSessionCurrentnessInputV1,
): EnterpriseSessionCurrentnessV1 {
  const session = enterpriseSessionV1Schema.parse(input.session);
  const actor = enterpriseActorV1Schema.parse(input.actor);
  const nowMs = Date.parse(timestampSchema.parse(input.now));
  const reasons: string[] = [];

  if (session.status !== 'ACTIVE') reasons.push('session is revoked');
  if (actor.status !== 'ACTIVE') reasons.push('session actor is disabled');
  if (session.actorId !== actor.actorId) reasons.push('session actor mismatch');
  if (session.organizationId !== input.expectedOrganizationId) {
    reasons.push('session organization mismatch');
  }
  if (Date.parse(session.createdAt) > Date.parse(session.lastValidatedAt)) {
    reasons.push('session validation chronology is invalid');
  }
  if (Date.parse(session.lastValidatedAt) > nowMs)
    reasons.push('session validation is in the future');
  if (Date.parse(session.expiresAt) <= nowMs) reasons.push('session is expired');

  reasons.sort();
  const current = reasons.length === 0;
  return {
    schemaVersion: 1,
    status: current ? 'CURRENT' : 'DENY',
    reasons,
    current,
    authority: 'NONE',
  };
}

export const approvalDelegationRuntimeStatusV1Schema = z.enum(['ACTIVE', 'REVOKED']);
export type ApprovalDelegationRuntimeStatusV1 = z.infer<
  typeof approvalDelegationRuntimeStatusV1Schema
>;

export const approvalDelegationV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: boundedIdSchema,
    delegationId: boundedIdSchema,
    delegatorActorId: boundedIdSchema,
    delegateActorId: boundedIdSchema,
    projectId: boundedIdSchema,
    actionClass: boundedIdSchema,
    validFrom: timestampSchema,
    validUntil: timestampSchema,
    status: approvalDelegationRuntimeStatusV1Schema,
    authority: z.literal('NONE'),
  })
  .strict();
export type ApprovalDelegationV1 = z.infer<typeof approvalDelegationV1Schema>;

export interface ApprovalDelegationEligibilityInputV1 {
  readonly delegation: ApprovalDelegationV1;
  readonly delegator: EnterpriseActorV1;
  readonly delegate: EnterpriseActorV1;
  readonly organizationId: string;
  readonly projectId: string;
  readonly actionClass: string;
  readonly now: string;
}

export interface ApprovalDelegationEligibilityV1 {
  readonly schemaVersion: 1;
  readonly decision: 'ELIGIBLE' | 'DENY';
  readonly reasons: readonly string[];
  readonly humanDelegateEligible: boolean;
  readonly approvalSatisfied: false;
  readonly exactBindingMayChange: false;
  readonly authority: 'NONE';
}

export function evaluateApprovalDelegationEligibilityV1(
  input: ApprovalDelegationEligibilityInputV1,
): ApprovalDelegationEligibilityV1 {
  const delegation = approvalDelegationV1Schema.parse(input.delegation);
  const delegator = enterpriseActorV1Schema.parse(input.delegator);
  const delegate = enterpriseActorV1Schema.parse(input.delegate);
  const nowMs = Date.parse(timestampSchema.parse(input.now));
  const reasons: string[] = [];

  if (delegation.status !== 'ACTIVE') reasons.push('delegation is revoked');
  if (delegation.delegatorActorId === delegation.delegateActorId) {
    reasons.push('delegation requires distinct human actors');
  }
  if (delegator.status !== 'ACTIVE') reasons.push('delegator is disabled');
  if (delegate.status !== 'ACTIVE') reasons.push('delegate is disabled');
  if (delegation.delegatorActorId !== delegator.actorId)
    reasons.push('delegator identity mismatch');
  if (delegation.delegateActorId !== delegate.actorId) reasons.push('delegate identity mismatch');
  if (delegation.organizationId !== input.organizationId)
    reasons.push('delegation organization mismatch');
  if (delegation.projectId !== input.projectId) reasons.push('delegation project mismatch');
  if (delegation.actionClass !== input.actionClass) reasons.push('delegation action mismatch');
  if (Date.parse(delegation.validFrom) >= Date.parse(delegation.validUntil)) {
    reasons.push('delegation validity window is invalid');
  }
  if (nowMs < Date.parse(delegation.validFrom)) reasons.push('delegation is not active yet');
  if (nowMs >= Date.parse(delegation.validUntil)) reasons.push('delegation is expired');

  reasons.sort();
  const humanDelegateEligible = reasons.length === 0;
  return {
    schemaVersion: 1,
    decision: humanDelegateEligible ? 'ELIGIBLE' : 'DENY',
    reasons,
    humanDelegateEligible,
    approvalSatisfied: false,
    exactBindingMayChange: false,
    authority: 'NONE',
  };
}

export function enterpriseVerifiedOidcPrincipalCanCarryRawToken(): false {
  return false;
}

export function enterpriseSessionCanGrantAuthority(): false {
  return false;
}

export function approvalDelegationCanActAsApproval(): false {
  return false;
}

export function approvalDelegationCanChangeExactBinding(): false {
  return false;
}
