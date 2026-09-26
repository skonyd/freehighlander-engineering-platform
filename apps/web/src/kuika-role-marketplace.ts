import { createHash } from 'node:crypto';

export type FhKuikaMarketplaceAuthority =
  | 'ADVISORY'
  | 'CANDIDATE'
  | 'WRITER'
  | 'ADJUDICATOR'
  | 'FINAL_REVIEWER';

export type FhKuikaMarketplaceRiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface FhKuikaRolePackageManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly purpose: string;
  readonly authority: readonly FhKuikaMarketplaceAuthority[];
  readonly allowedRiskTiers: readonly FhKuikaMarketplaceRiskTier[];
  readonly allowedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly evidencePolicy: string;
  readonly sandboxPolicy: string;
  readonly independenceGroupRequired: boolean;
  readonly provenance: {
    readonly source: 'BUILT_IN_CATALOG';
    readonly pinned: true;
    readonly digest: string;
  };
  readonly installAuthority: 'NONE';
}

export interface FhKuikaSolutionPackV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly purpose: string;
  readonly roleRefs: readonly string[];
  readonly blueprintRefs: readonly string[];
  readonly connectorRefs: readonly string[];
  readonly authority: 'NONE';
}

export interface FhKuikaSolutionPackInstallPlanV1 {
  readonly schemaVersion: 1;
  readonly packId: string;
  readonly packVersion: string;
  readonly requiredRoleRefs: readonly string[];
  readonly requiredBlueprintRefs: readonly string[];
  readonly requiredConnectorRefs: readonly string[];
  readonly missingRoleRefs: readonly string[];
  readonly missingConnectorRefs: readonly string[];
  readonly readyForCoreReview: boolean;
  readonly installAuthority: 'NONE';
  readonly activationAuthorized: false;
}

const ROLE_DEFINITIONS = [
  role(
    'architecture-reviewer',
    'Review architecture changes, ADR quality and boundary compatibility.',
    ['FINAL_REVIEWER'],
    ['NORMAL', 'HIGH', 'CRITICAL'],
    ['repository.read', 'architecture.read', 'evidence.read'],
    ['repository.write', 'git.merge'],
    true,
  ),
  role(
    'implementation-agent',
    'Produce bounded implementation candidates under workflow policy.',
    ['WRITER'],
    ['NORMAL', 'HIGH'],
    ['repository.read', 'repository.write', 'test.read-results'],
    ['git.merge', 'policy.override'],
    false,
  ),
  role(
    'test-reviewer',
    'Evaluate test sufficiency for an exact revision.',
    ['FINAL_REVIEWER'],
    ['NORMAL', 'HIGH', 'CRITICAL'],
    ['repository.read', 'test.read-results', 'evidence.read'],
    ['repository.write', 'git.merge'],
    true,
  ),
  role(
    'security-reviewer',
    'Review security findings and security-sensitive changes independently.',
    ['FINAL_REVIEWER'],
    ['NORMAL', 'HIGH', 'CRITICAL'],
    ['repository.read', 'security.read-findings', 'evidence.read'],
    ['repository.write', 'git.merge', 'secrets.read'],
    true,
  ),
  role(
    'release-reviewer',
    'Review release-readiness evidence without granting release authority.',
    ['FINAL_REVIEWER'],
    ['HIGH', 'CRITICAL'],
    ['release.read', 'test.read-results', 'evidence.read'],
    ['release.execute', 'git.merge'],
    true,
  ),
  role(
    'incident-investigator',
    'Investigate incidents and produce evidence-bound remediation candidates.',
    ['ADVISORY', 'CANDIDATE'],
    ['NORMAL', 'HIGH', 'CRITICAL'],
    ['incident.read', 'telemetry.read', 'evidence.read'],
    ['production.write'],
    true,
  ),
  role(
    'dependency-upgrade-specialist',
    'Prepare dependency upgrade candidates with compatibility evidence.',
    ['CANDIDATE', 'WRITER'],
    ['NORMAL', 'HIGH'],
    ['repository.read', 'repository.write', 'dependency.read'],
    ['git.merge'],
    false,
  ),
  role(
    'kubernetes-reviewer',
    'Review Kubernetes workload and policy changes.',
    ['FINAL_REVIEWER'],
    ['NORMAL', 'HIGH', 'CRITICAL'],
    ['repository.read', 'kubernetes.read', 'security.read-findings'],
    ['kubernetes.write', 'git.merge'],
    true,
  ),
  role(
    'database-migration-reviewer',
    'Review migration, rollback and data-integrity evidence.',
    ['FINAL_REVIEWER'],
    ['HIGH', 'CRITICAL'],
    ['repository.read', 'database.read-plan', 'evidence.read'],
    ['database.write', 'git.merge'],
    true,
  ),
  role(
    'performance-reviewer',
    'Review reproducible benchmark evidence for performance changes.',
    ['ADVISORY', 'FINAL_REVIEWER'],
    ['NORMAL', 'HIGH'],
    ['repository.read', 'benchmark.read', 'evidence.read'],
    ['repository.write', 'git.merge'],
    true,
  ),
] as const;

const ROLES = Object.freeze(ROLE_DEFINITIONS.map(finalizeRole));

const PACKS = Object.freeze([
  pack(
    'pull-request-quality',
    'Pull Request Quality Pack',
    ['implementation-agent@1.0.0', 'test-reviewer@1.0.0', 'architecture-reviewer@1.0.0'],
    ['feature-implementation@1.0.0', 'bug-fix@1.0.0'],
    ['github'],
  ),
  pack(
    'security-review',
    'Security Review Pack',
    ['security-reviewer@1.0.0', 'test-reviewer@1.0.0'],
    ['security-patch@1.0.0'],
    ['github', 'trivy-mcp'],
  ),
  pack(
    'release-readiness',
    'Release Readiness Pack',
    ['release-reviewer@1.0.0', 'security-reviewer@1.0.0', 'test-reviewer@1.0.0'],
    ['release-preparation@1.0.0'],
    ['github'],
  ),
  pack(
    'incident-response',
    'Incident Response Pack',
    ['incident-investigator@1.0.0', 'implementation-agent@1.0.0', 'test-reviewer@1.0.0'],
    ['incident-response@1.0.0'],
    ['prometheus-mcp'],
  ),
  pack(
    'dependency-upgrade',
    'Dependency Upgrade Pack',
    ['dependency-upgrade-specialist@1.0.0', 'test-reviewer@1.0.0'],
    ['dependency-upgrade@1.0.0'],
    ['github'],
  ),
]);

export function listFhKuikaMarketplaceRolesV1(): readonly FhKuikaRolePackageManifestV1[] {
  return ROLES.map(cloneRole);
}

export function getFhKuikaMarketplaceRoleV1(
  id: string,
  version = '1.0.0',
): FhKuikaRolePackageManifestV1 | null {
  const found = ROLES.find((item) => item.id === id && item.version === version);
  return found ? cloneRole(found) : null;
}

export function listFhKuikaSolutionPacksV1(): readonly FhKuikaSolutionPackV1[] {
  return PACKS.map((item) => ({
    ...item,
    roleRefs: [...item.roleRefs],
    blueprintRefs: [...item.blueprintRefs],
    connectorRefs: [...item.connectorRefs],
  }));
}

export function getFhKuikaSolutionPackV1(
  id: string,
  version = '1.0.0',
): FhKuikaSolutionPackV1 | null {
  return (
    listFhKuikaSolutionPacksV1().find((item) => item.id === id && item.version === version) ?? null
  );
}

export function buildFhKuikaSolutionPackInstallPlanV1(
  pack: FhKuikaSolutionPackV1,
  availableRoleRefs: readonly string[],
  availableConnectorRefs: readonly string[],
): FhKuikaSolutionPackInstallPlanV1 {
  const roles = new Set(availableRoleRefs);
  const connectors = new Set(availableConnectorRefs);
  const missingRoleRefs = pack.roleRefs.filter((ref) => !roles.has(ref)).sort();
  const missingConnectorRefs = pack.connectorRefs.filter((ref) => !connectors.has(ref)).sort();

  return {
    schemaVersion: 1,
    packId: pack.id,
    packVersion: pack.version,
    requiredRoleRefs: [...pack.roleRefs],
    requiredBlueprintRefs: [...pack.blueprintRefs],
    requiredConnectorRefs: [...pack.connectorRefs],
    missingRoleRefs,
    missingConnectorRefs,
    readyForCoreReview: missingRoleRefs.length === 0 && missingConnectorRefs.length === 0,
    installAuthority: 'NONE',
    activationAuthorized: false,
  };
}

export function roleMarketplaceCanInstallDirectly(): false {
  return false;
}

export function roleMarketplaceCanGrantAuthority(): false {
  return false;
}

export function solutionPackPlanCanActivate(): false {
  return false;
}

function role(
  id: string,
  purpose: string,
  authority: readonly FhKuikaMarketplaceAuthority[],
  allowedRiskTiers: readonly FhKuikaMarketplaceRiskTier[],
  allowedActions: readonly string[],
  forbiddenActions: readonly string[],
  independenceGroupRequired: boolean,
) {
  return {
    id,
    version: '1.0.0',
    purpose,
    authority,
    allowedRiskTiers,
    allowedActions,
    forbiddenActions,
    evidencePolicy: 'exact-revision-evidence-v1',
    sandboxPolicy: authority.includes('WRITER') ? 'writer-bounded-v1' : 'reviewer-readonly-v1',
    independenceGroupRequired,
  } as const;
}

function finalizeRole(input: ReturnType<typeof role>): FhKuikaRolePackageManifestV1 {
  const identity = {
    schemaVersion: 1,
    ...input,
    provenance: {
      source: 'BUILT_IN_CATALOG' as const,
      pinned: true as const,
    },
    installAuthority: 'NONE' as const,
  };
  const digest = createHash('sha256').update(stableJson(identity)).digest('hex');

  return Object.freeze({
    ...identity,
    provenance: {
      ...identity.provenance,
      digest,
    },
  });
}

function cloneRole(role: FhKuikaRolePackageManifestV1): FhKuikaRolePackageManifestV1 {
  return {
    ...role,
    authority: [...role.authority],
    allowedRiskTiers: [...role.allowedRiskTiers],
    allowedActions: [...role.allowedActions],
    forbiddenActions: [...role.forbiddenActions],
    provenance: { ...role.provenance },
  };
}

function pack(
  id: string,
  purpose: string,
  roleRefs: readonly string[],
  blueprintRefs: readonly string[],
  connectorRefs: readonly string[],
): FhKuikaSolutionPackV1 {
  return Object.freeze({
    schemaVersion: 1,
    id,
    version: '1.0.0',
    purpose,
    roleRefs: Object.freeze([...roleRefs]),
    blueprintRefs: Object.freeze([...blueprintRefs]),
    connectorRefs: Object.freeze([...connectorRefs]),
    authority: 'NONE',
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => JSON.stringify(key) + ':' + stableJson(child))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}
