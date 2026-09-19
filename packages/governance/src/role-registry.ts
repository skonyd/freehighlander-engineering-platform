import { createHash } from 'node:crypto';

import {
  rolePackageSchema,
  type AuthorityLevel,
  type RiskTier,
  type RolePackage,
} from '@freehighlander/contracts';
import YAML from 'yaml';

export type RolePrincipalKind = 'MODEL' | 'HUMAN' | 'SYSTEM';
export type ToolPermission = 'ALLOW' | 'DENY';

export interface RoleRegistrationPolicy {
  readonly principalKind: RolePrincipalKind;
  readonly allowedAuthorities: readonly AuthorityLevel[];
}

export interface RoleSnapshot {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly hash: string;
  readonly authority: readonly AuthorityLevel[];
  readonly allowedRiskTiers: readonly RiskTier[];
  readonly independenceGroupRequired: boolean;
  readonly promptContract: string;
  readonly inputContract: string;
  readonly outputContract: string;
  readonly evidencePolicy: string;
  readonly sandboxPolicy: string;
  readonly authorityGrantedByRegistry: false;
}

export class RoleRegistry {
  readonly #roles = new Map<string, RolePackage>();

  register(role: RolePackage, policy: RoleRegistrationPolicy): RoleSnapshot {
    const parsed = rolePackageSchema.parse(role);
    validateAuthorityPolicy(parsed, policy);

    const key = roleKey(parsed.id, parsed.version);
    if (this.#roles.has(key)) throw new Error(`duplicate role package: ${key}`);

    this.#roles.set(key, parsed);
    return snapshotRole(parsed);
  }

  registerYaml(source: string, policy: RoleRegistrationPolicy): RoleSnapshot {
    if (!source.trim()) throw new Error('role package YAML is required');

    const decoded: unknown = YAML.parse(source);
    const parsed = rolePackageSchema.parse(decoded);
    return this.register(parsed, policy);
  }

  get(id: string, version: string): RolePackage {
    const role = this.#roles.get(roleKey(id, version));
    if (!role) throw new Error(`unknown role package: ${roleKey(id, version)}`);
    return role;
  }

  snapshot(id: string, version: string): RoleSnapshot {
    return snapshotRole(this.get(id, version));
  }
}

export function toolPermission(role: RolePackage, action: string): ToolPermission {
  if (!action.trim()) return 'DENY';
  if (role.forbiddenActions.includes(action)) return 'DENY';
  return role.allowedActions.includes(action) ? 'ALLOW' : 'DENY';
}

export function roleSupportsRiskTier(role: RolePackage, riskTier: RiskTier): boolean {
  return role.allowedRiskTiers.includes(riskTier);
}

export function roleRegistryCanGrantAuthority(): false {
  return false;
}

function validateAuthorityPolicy(role: RolePackage, policy: RoleRegistrationPolicy): void {
  const allowed = new Set(policy.allowedAuthorities);

  for (const authority of role.authority) {
    if (!allowed.has(authority)) {
      throw new Error(
        `role ${role.id}@${role.version} authority ${authority} exceeds registration policy`,
      );
    }

    if (authority === 'HUMAN_APPROVER' && policy.principalKind !== 'HUMAN') {
      throw new Error('HUMAN_APPROVER requires a human principal');
    }

    if (authority === 'SYSTEM_POLICY' && policy.principalKind !== 'SYSTEM') {
      throw new Error('SYSTEM_POLICY requires a system principal');
    }
  }
}

function snapshotRole(role: RolePackage): RoleSnapshot {
  const identity = {
    schemaVersion: 1,
    id: role.id,
    version: role.version,
    purpose: role.purpose,
    authority: [...role.authority].sort(),
    allowedActions: [...role.allowedActions].sort(),
    forbiddenActions: [...role.forbiddenActions].sort(),
    allowedRiskTiers: [...role.allowedRiskTiers].sort(),
    promptContract: role.promptContract,
    inputContract: role.inputContract,
    outputContract: role.outputContract,
    evidencePolicy: role.evidencePolicy,
    sandboxPolicy: role.sandboxPolicy,
    independenceGroupRequired: role.independenceGroupRequired,
  } as const;

  return {
    schemaVersion: 1,
    id: role.id,
    version: role.version,
    hash: sha256Canonical(identity),
    authority: role.authority,
    allowedRiskTiers: role.allowedRiskTiers,
    independenceGroupRequired: role.independenceGroupRequired,
    promptContract: role.promptContract,
    inputContract: role.inputContract,
    outputContract: role.outputContract,
    evidencePolicy: role.evidencePolicy,
    sandboxPolicy: role.sandboxPolicy,
    authorityGrantedByRegistry: false,
  };
}

function roleKey(id: string, version: string): string {
  if (!id.trim()) throw new Error('role id is required');
  if (!version.trim()) throw new Error('role version is required');
  return `${id}@${version}`;
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
