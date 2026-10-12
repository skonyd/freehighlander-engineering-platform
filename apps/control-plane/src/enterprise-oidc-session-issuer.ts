import { randomUUID } from 'node:crypto';

import {
  enterpriseVerifiedOidcPrincipalV1Schema,
  evaluateEnterpriseOidcAuthenticationV1,
  type EnterpriseVerifiedOidcPrincipalV1,
} from '@freehighlander/contracts';
import { EnterpriseDirectoryStateStore } from '@freehighlander/persistence';

/**
 * Server-configured adapter. It MUST cryptographically validate the ID
 * token signature, trusted issuer keys, audience, validity window, nonce
 * and any OAuth/OIDC flow-specific requirements. A client-provided
 * "signatureVerified" field is NOT authentication.
 */
export interface TrustedEnterpriseOidcVerifier {
  verifyIdToken(rawIdToken: string): Promise<EnterpriseVerifiedOidcPrincipalV1>;
}

export interface EnterpriseOidcSessionIssuerOptions {
  readonly directory: EnterpriseDirectoryStateStore;
  readonly verifier: TrustedEnterpriseOidcVerifier;
  readonly expectedIssuer: string;
  readonly expectedAudience: string;
  readonly now: () => string;
}

export interface EnterpriseOidcSessionIssueResultV1 {
  readonly schemaVersion: 1;
  readonly status: 'ISSUED' | 'DENY' | 'CONFLICT';
  readonly reason:
    | 'TOKEN_INPUT_INVALID'
    | 'OIDC_VERIFICATION_FAILED'
    | 'OIDC_IDENTITY_NOT_BOUND'
    | 'OIDC_CLAIMS_REJECTED'
    | 'DIRECTORY_WRITE_CONFLICT'
    | null;
  readonly sessionId: string | null;
  readonly expiresAt: string | null;
  readonly executionAuthorized: false;
  readonly humanApprovalSatisfied: false;
  readonly systemPolicySatisfied: false;
  readonly authority: 'NONE';
}

const MAX_ID_TOKEN_BYTES = 16 * 1024;
const MAX_SESSION_MILLIS = 15 * 60 * 1000;

/**
 * The verifier is an independently provisioned trusted server component,
 * never constructed from HTTP request fields. No HTTP endpoint is installed
 * by this class and it neither grants approval nor execution authority.
 */
export class EnterpriseOidcSessionIssuer {
  constructor(readonly options: EnterpriseOidcSessionIssuerOptions) {
    if (typeof options.verifier?.verifyIdToken !== 'function') {
      throw new Error('trusted OIDC verifier is required');
    }
    if (new URL(options.expectedIssuer).protocol !== 'https:') {
      throw new Error('expectedIssuer must use HTTPS');
    }
    if (!options.expectedAudience.trim()) {
      throw new Error('expectedAudience is required');
    }
    if (typeof options.now !== 'function') throw new Error('trusted clock is required');
  }

  async issue(rawIdToken: string): Promise<EnterpriseOidcSessionIssueResultV1> {
    if (
      typeof rawIdToken !== 'string' ||
      rawIdToken.length === 0 ||
      Buffer.byteLength(rawIdToken, 'utf8') > MAX_ID_TOKEN_BYTES
    ) {
      return denied('TOKEN_INPUT_INVALID');
    }

    let principal: EnterpriseVerifiedOidcPrincipalV1;
    try {
      principal = enterpriseVerifiedOidcPrincipalV1Schema.parse(
        await this.options.verifier.verifyIdToken(rawIdToken),
      );
    } catch {
      // Never propagate verifier exceptions: they may contain raw token text.
      return denied('OIDC_VERIFICATION_FAILED');
    }

    const now = this.options.now();
    if (!Number.isFinite(Date.parse(now))) throw new Error('trusted clock returned invalid time');

    // Read after cryptographic verification; never authorize from a cached
    // directory snapshot or a client-provided actor/member assertion.
    const snapshot = this.options.directory.read();
    const binding = snapshot.state.oidcBindings.find(
      (candidate) =>
        candidate.issuer === principal.issuer &&
        candidate.audience === principal.audience &&
        candidate.subject === principal.subject &&
        candidate.actorId === principal.actorId,
    );
    const actor = snapshot.state.actors.find(
      (candidate) => candidate.actorId === principal.actorId,
    );
    if (!binding || !actor) return denied('OIDC_IDENTITY_NOT_BOUND');

    const decision = evaluateEnterpriseOidcAuthenticationV1({
      principal,
      binding,
      actor,
      expectedIssuer: this.options.expectedIssuer,
      expectedAudience: this.options.expectedAudience,
      now,
    });
    if (!decision.sessionEligible) return denied('OIDC_CLAIMS_REJECTED');

    const expiresAt = new Date(
      Math.min(Date.parse(principal.expiresAt), Date.parse(now) + MAX_SESSION_MILLIS),
    ).toISOString();
    const sessionId = 'oidc-' + randomUUID();
    const write = this.options.directory.write(snapshot.generation, {
      ...snapshot.state,
      sessions: [
        ...snapshot.state.sessions,
        {
          schemaVersion: 1,
          sessionId,
          organizationId: snapshot.state.organization.organizationId,
          actorId: actor.actorId,
          authMethod: 'OIDC',
          createdAt: now,
          lastValidatedAt: now,
          expiresAt,
          status: 'ACTIVE',
          rawTokenPersisted: false,
          authority: 'NONE',
        },
      ],
    });
    if (write.status !== 'WRITTEN') return denied('DIRECTORY_WRITE_CONFLICT', 'CONFLICT');

    return {
      schemaVersion: 1,
      status: 'ISSUED',
      reason: null,
      sessionId,
      expiresAt,
      executionAuthorized: false,
      humanApprovalSatisfied: false,
      systemPolicySatisfied: false,
      authority: 'NONE',
    };
  }
}

export function enterpriseOidcSessionIssuerCanVerifyTokensItself(): false {
  return false;
}

export function enterpriseOidcSessionIssuerCanGrantAuthority(): false {
  return false;
}

function denied(
  reason: Exclude<EnterpriseOidcSessionIssueResultV1['reason'], null>,
  status: 'DENY' | 'CONFLICT' = 'DENY',
): EnterpriseOidcSessionIssueResultV1 {
  return {
    schemaVersion: 1,
    status,
    reason,
    sessionId: null,
    expiresAt: null,
    executionAuthorized: false,
    humanApprovalSatisfied: false,
    systemPolicySatisfied: false,
    authority: 'NONE',
  };
}
