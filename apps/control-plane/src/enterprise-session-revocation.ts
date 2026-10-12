import { EnterpriseDirectoryStateStore } from '@freehighlander/persistence';

/**
 * Both identifiers must come from a trusted server-side authentication
 * context, NOT directly from client-supplied headers or request bodies.
 * This service is not an HTTP endpoint or a substitute for authentication.
 */
export interface EnterpriseSessionRevocationRequestV1 {
  readonly verifiedActorId: string;
  readonly sessionId: string;
}

export interface EnterpriseSessionRevocationResultV1 {
  readonly schemaVersion: 1;
  readonly status: 'REVOKED' | 'ALREADY_REVOKED' | 'DENY' | 'CONFLICT';
  readonly reason:
    | 'INVALID_IDENTITY'
    | 'SESSION_NOT_FOUND'
    | 'SESSION_ACTOR_MISMATCH'
    | 'SESSION_NOT_OIDC'
    | 'DIRECTORY_WRITE_CONFLICT'
    | null;
  readonly executionAuthorized: false;
  readonly humanApprovalSatisfied: false;
  readonly systemPolicySatisfied: false;
  readonly authority: 'NONE';
}

const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

/**
 * Durable, actor-bound self-revocation for enterprise OIDC sessions.
 * Revocation is a security restriction, never a privilege grant.
 * A future authenticated HTTP controller must bind verifiedActorId to
 * its trusted session context, and audit the event independently.
 */
export class EnterpriseSessionRevocationService {
  constructor(readonly directory: EnterpriseDirectoryStateStore) {}

  revoke(request: EnterpriseSessionRevocationRequestV1): EnterpriseSessionRevocationResultV1 {
    const validActor =
      typeof request.verifiedActorId === 'string' && BOUNDED_ID.test(request.verifiedActorId);
    const validSession =
      typeof request.sessionId === 'string' && BOUNDED_ID.test(request.sessionId);
    if (!validActor || !validSession) return result('DENY', 'INVALID_IDENTITY');

    // A fresh durable read makes use-time revocation independent of cached
    // product RBAC or stale browser state. Invalid store data fails closed.
    const snapshot = this.directory.read();
    const session = snapshot.state.sessions.find(
      (candidate) => candidate.sessionId === request.sessionId,
    );
    if (!session) return result('DENY', 'SESSION_NOT_FOUND');
    if (session.actorId !== request.verifiedActorId) {
      return result('DENY', 'SESSION_ACTOR_MISMATCH');
    }
    if (session.authMethod !== 'OIDC') return result('DENY', 'SESSION_NOT_OIDC');
    if (session.status === 'REVOKED') return result('ALREADY_REVOKED', null);

    const written = this.directory.write(snapshot.generation, {
      ...snapshot.state,
      sessions: snapshot.state.sessions.map((candidate) =>
        candidate.sessionId === session.sessionId
          ? { ...candidate, status: 'REVOKED' as const }
          : candidate,
      ),
    });
    if (written.status !== 'WRITTEN') {
      return result('CONFLICT', 'DIRECTORY_WRITE_CONFLICT');
    }
    return result('REVOKED', null);
  }
}

export function enterpriseSessionRevocationCanGrantAuthority(): false {
  return false;
}

function result(
  status: EnterpriseSessionRevocationResultV1['status'],
  reason: EnterpriseSessionRevocationResultV1['reason'],
): EnterpriseSessionRevocationResultV1 {
  return {
    schemaVersion: 1,
    status,
    reason,
    executionAuthorized: false,
    humanApprovalSatisfied: false,
    systemPolicySatisfied: false,
    authority: 'NONE',
  };
}
