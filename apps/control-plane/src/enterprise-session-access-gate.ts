import {
  enterpriseCapabilityV1Schema,
  enterpriseIdentityRuntimeModeV1Schema,
  evaluateEnterpriseAccessPreview,
  evaluateEnterpriseSessionCurrentnessV1,
  type EnterpriseCapabilityV1,
  type EnterpriseIdentityRuntimeModeV1,
} from '@freehighlander/contracts';
import { EnterpriseDirectoryStateStore } from '@freehighlander/persistence';

/**
 * The caller MUST obtain verifiedSessionId from its trusted, server-side
 * authentication context. Request parameters, client headers and cookies
 * are not proof of authentication. This gate does not verify OIDC tokens.
 */
export interface EnterpriseSessionAccessRequestV1 {
  readonly verifiedSessionId: string | null;
  readonly projectId: string;
  readonly capability: EnterpriseCapabilityV1;
  readonly now: string;
}

export interface EnterpriseSessionAccessDecisionV1 {
  readonly schemaVersion: 1;
  readonly decision: 'LOCAL_MODE' | 'ELIGIBLE' | 'DENY';
  readonly reasons: readonly string[];
  readonly productAccessEligible: boolean;
  readonly humanApprovalSatisfied: false;
  readonly systemPolicySatisfied: false;
  readonly executionAuthorized: false;
  readonly authority: 'NONE';
}

/**
 * Product-access gate only. It cannot replace execution capability,
 * independent review, exact human approval, or SYSTEM_POLICY checks.
 * Reads the durable directory afresh on every call so revocations apply
 * immediately rather than trusting cached membership/session state.
 */
export class EnterpriseSessionAccessGate {
  readonly mode: EnterpriseIdentityRuntimeModeV1;

  constructor(
    readonly directory: EnterpriseDirectoryStateStore,
    mode: EnterpriseIdentityRuntimeModeV1,
  ) {
    this.mode = enterpriseIdentityRuntimeModeV1Schema.parse(mode);
  }

  evaluate(request: EnterpriseSessionAccessRequestV1): EnterpriseSessionAccessDecisionV1 {
    const capability = enterpriseCapabilityV1Schema.parse(request.capability);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(request.projectId)) {
      throw new Error('projectId must be a bounded identifier');
    }
    if (!Number.isFinite(Date.parse(request.now))) {
      throw new Error('now must be a valid timestamp');
    }

    if (this.mode === 'DISABLED') {
      return decision('LOCAL_MODE', []);
    }

    const snapshot = this.directory.read();
    const session = snapshot.state.sessions.find(
      (candidate) => candidate.sessionId === request.verifiedSessionId,
    );
    if (!session) return decision('DENY', ['verified enterprise session is missing']);

    const actor = snapshot.state.actors.find((candidate) => candidate.actorId === session.actorId);
    if (!actor) return decision('DENY', ['session actor is missing from enterprise directory']);

    const reasons: string[] = [];
    if (session.authMethod !== 'OIDC') {
      reasons.push('enterprise session must use OIDC');
    }
    if (actor.kind !== 'OIDC_USER') {
      reasons.push('enterprise actor must be an OIDC user');
    }
    if (!snapshot.state.oidcBindings.some((binding) => binding.actorId === actor.actorId)) {
      reasons.push('enterprise actor has no current OIDC binding');
    }

    const currentness = evaluateEnterpriseSessionCurrentnessV1({
      session,
      actor,
      expectedOrganizationId: this.directory.organization.organizationId,
      now: request.now,
    });
    reasons.push(...currentness.reasons);

    // Exact project lookup is mandatory; membership in another project
    // cannot authorize this request even if its role would otherwise qualify.
    const membership =
      snapshot.state.projectMemberships.find(
        (candidate) =>
          candidate.organizationId === this.directory.organization.organizationId &&
          candidate.projectId === request.projectId &&
          candidate.actorId === actor.actorId,
      ) ?? null;

    const access = evaluateEnterpriseAccessPreview({
      organization: snapshot.state.organization,
      actor,
      membership,
      requestedCapability: capability,
    });
    reasons.push(...access.reasons);

    const uniqueReasons = [...new Set(reasons)].sort();
    return decision(uniqueReasons.length === 0 ? 'ELIGIBLE' : 'DENY', uniqueReasons);
  }
}

export function enterpriseSessionGateCanGrantExecutionAuthority(): false {
  return false;
}

export function enterpriseSessionGateCanVerifyOidcToken(): false {
  return false;
}

function decision(
  kind: EnterpriseSessionAccessDecisionV1['decision'],
  reasons: readonly string[],
): EnterpriseSessionAccessDecisionV1 {
  return {
    schemaVersion: 1,
    decision: kind,
    reasons,
    productAccessEligible: kind !== 'DENY',
    humanApprovalSatisfied: false,
    systemPolicySatisfied: false,
    executionAuthorized: false,
    authority: 'NONE',
  };
}
