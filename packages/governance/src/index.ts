export {
  RoleRegistry,
  roleRegistryCanGrantAuthority,
  roleSupportsRiskTier,
  toolPermission,
  type RolePrincipalKind,
  type RoleRegistrationPolicy,
  type RoleSnapshot,
  type ToolPermission,
} from './role-registry.js';

export type AuthorityLevel =
  | 'ADVISORY'
  | 'CANDIDATE'
  | 'WRITER'
  | 'ADJUDICATOR'
  | 'FINAL_REVIEWER'
  | 'HUMAN_APPROVER'
  | 'SYSTEM_POLICY';

export type PrincipalKind = 'MODEL' | 'HUMAN' | 'SYSTEM';

export interface AuthorityDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

export function evaluateAuthority(
  principal: PrincipalKind,
  requestedAuthority: AuthorityLevel,
): AuthorityDecision {
  if (requestedAuthority === 'HUMAN_APPROVER' && principal !== 'HUMAN') {
    return { allowed: false, reason: 'HUMAN_APPROVER requires a human principal' };
  }

  if (requestedAuthority === 'SYSTEM_POLICY' && principal !== 'SYSTEM') {
    return { allowed: false, reason: 'SYSTEM_POLICY requires a system principal' };
  }

  return { allowed: true, reason: 'authority is compatible with the principal kind' };
}

export function canFallbackAfterFailure(
  failure:
    | 'quota_exhausted'
    | 'rate_limited'
    | 'auth_unavailable'
    | 'provider_unavailable'
    | 'transport_failure'
    | 'semantic_failure'
    | 'malformed_output',
): boolean {
  return new Set([
    'quota_exhausted',
    'rate_limited',
    'auth_unavailable',
    'provider_unavailable',
    'transport_failure',
  ]).has(failure);
}
