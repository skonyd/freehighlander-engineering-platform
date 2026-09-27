import { createHash } from 'node:crypto';

export interface FhKuikaRolePackageReferenceV1 {
  readonly roleId: string;
  readonly version: string;
  readonly roleHash: string;
}

export interface FhKuikaRolePackManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly roles: readonly FhKuikaRolePackageReferenceV1[];
  readonly packageHash: string;
  readonly status: 'PINNED_MANIFEST';
  readonly authority: 'NONE';
  readonly installAuthorized: false;
  readonly activationAuthorized: false;
}

export interface FhKuikaSolutionPackBlueprintReferenceV1 {
  readonly blueprintId: string;
  readonly version: string;
  readonly blueprintHash: string;
}

export interface FhKuikaSolutionPackWorkflowReferenceV1 {
  readonly workflowId: string;
  readonly version: string;
  readonly workflowHash: string;
}

export interface FhKuikaSolutionPackConnectorRequirementV1 {
  readonly connectorId: string;
  readonly optional: boolean;
}

export interface FhKuikaSolutionPackManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly rolePacks: readonly {
    readonly rolePackId: string;
    readonly version: string;
    readonly packageHash: string;
  }[];
  readonly blueprints: readonly FhKuikaSolutionPackBlueprintReferenceV1[];
  readonly workflows: readonly FhKuikaSolutionPackWorkflowReferenceV1[];
  readonly connectors: readonly FhKuikaSolutionPackConnectorRequirementV1[];
  readonly packageHash: string;
  readonly status: 'PINNED_MANIFEST';
  readonly authority: 'NONE';
  readonly installAuthorized: false;
  readonly activationAuthorized: false;
}

export function createFhKuikaRolePackManifestV1(input: {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly roles: readonly FhKuikaRolePackageReferenceV1[];
}): FhKuikaRolePackManifestV1 {
  const normalized = {
    schemaVersion: 1 as const,
    id: requireId(input.id, 'role pack id'),
    version: requireSemver(input.version, 'role pack version'),
    name: requireText(input.name, 'role pack name'),
    description: requireText(input.description, 'role pack description'),
    roles: normalizeRoleReferences(input.roles),
    status: 'PINNED_MANIFEST' as const,
    authority: 'NONE' as const,
    installAuthorized: false as const,
    activationAuthorized: false as const,
  };

  return deepFreeze({
    ...normalized,
    packageHash: sha256Canonical(normalized),
  });
}

export function createFhKuikaSolutionPackManifestV1(input: {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly rolePacks: readonly {
    readonly rolePackId: string;
    readonly version: string;
    readonly packageHash: string;
  }[];
  readonly blueprints: readonly FhKuikaSolutionPackBlueprintReferenceV1[];
  readonly workflows: readonly FhKuikaSolutionPackWorkflowReferenceV1[];
  readonly connectors: readonly FhKuikaSolutionPackConnectorRequirementV1[];
}): FhKuikaSolutionPackManifestV1 {
  const normalized = {
    schemaVersion: 1 as const,
    id: requireId(input.id, 'solution pack id'),
    version: requireSemver(input.version, 'solution pack version'),
    name: requireText(input.name, 'solution pack name'),
    description: requireText(input.description, 'solution pack description'),
    rolePacks: normalizeRolePackReferences(input.rolePacks),
    blueprints: normalizeBlueprintReferences(input.blueprints),
    workflows: normalizeWorkflowReferences(input.workflows),
    connectors: normalizeConnectorRequirements(input.connectors),
    status: 'PINNED_MANIFEST' as const,
    authority: 'NONE' as const,
    installAuthorized: false as const,
    activationAuthorized: false as const,
  };

  if (
    normalized.rolePacks.length === 0 &&
    normalized.blueprints.length === 0 &&
    normalized.workflows.length === 0
  ) {
    throw new Error('solution pack must reference at least one role pack, blueprint or workflow');
  }

  return deepFreeze({
    ...normalized,
    packageHash: sha256Canonical(normalized),
  });
}

export function rolePackManifestCanGrantAuthority(): false {
  return false;
}

export function rolePackManifestCanInstall(): false {
  return false;
}

export function solutionPackManifestCanGrantAuthority(): false {
  return false;
}

export function solutionPackManifestCanActivate(): false {
  return false;
}

function normalizeRoleReferences(
  values: readonly FhKuikaRolePackageReferenceV1[],
): readonly FhKuikaRolePackageReferenceV1[] {
  if (values.length === 0) throw new Error('role pack must contain at least one role reference');
  const seen = new Set<string>();
  return values
    .map((value) => {
      const roleId = requireId(value.roleId, 'role id');
      const version = requireSemver(value.version, 'role version');
      const roleHash = requireHash(value.roleHash, 'role hash');
      const key = roleId + '@' + version;
      if (seen.has(key)) throw new Error('role pack role references must be unique');
      seen.add(key);
      return { roleId, version, roleHash };
    })
    .sort((left, right) => left.roleId.localeCompare(right.roleId) || left.version.localeCompare(right.version));
}

function normalizeRolePackReferences(
  values: readonly {
    readonly rolePackId: string;
    readonly version: string;
    readonly packageHash: string;
  }[],
) {
  const seen = new Set<string>();
  return values
    .map((value) => {
      const rolePackId = requireId(value.rolePackId, 'role pack reference id');
      const version = requireSemver(value.version, 'role pack reference version');
      const packageHash = requireHash(value.packageHash, 'role pack reference hash');
      const key = rolePackId + '@' + version;
      if (seen.has(key)) throw new Error('solution pack role-pack references must be unique');
      seen.add(key);
      return { rolePackId, version, packageHash };
    })
    .sort((left, right) => left.rolePackId.localeCompare(right.rolePackId) || left.version.localeCompare(right.version));
}

function normalizeBlueprintReferences(
  values: readonly FhKuikaSolutionPackBlueprintReferenceV1[],
): readonly FhKuikaSolutionPackBlueprintReferenceV1[] {
  const seen = new Set<string>();
  return values
    .map((value) => {
      const blueprintId = requireId(value.blueprintId, 'blueprint reference id');
      const version = requireSemver(value.version, 'blueprint reference version');
      const blueprintHash = requireHash(value.blueprintHash, 'blueprint reference hash');
      const key = blueprintId + '@' + version;
      if (seen.has(key)) throw new Error('solution pack blueprint references must be unique');
      seen.add(key);
      return { blueprintId, version, blueprintHash };
    })
    .sort((left, right) => left.blueprintId.localeCompare(right.blueprintId) || left.version.localeCompare(right.version));
}

function normalizeWorkflowReferences(
  values: readonly FhKuikaSolutionPackWorkflowReferenceV1[],
): readonly FhKuikaSolutionPackWorkflowReferenceV1[] {
  const seen = new Set<string>();
  return values
    .map((value) => {
      const workflowId = requireId(value.workflowId, 'workflow reference id');
      const version = requireSemver(value.version, 'workflow reference version');
      const workflowHash = requireHash(value.workflowHash, 'workflow reference hash');
      const key = workflowId + '@' + version;
      if (seen.has(key)) throw new Error('solution pack workflow references must be unique');
      seen.add(key);
      return { workflowId, version, workflowHash };
    })
    .sort((left, right) => left.workflowId.localeCompare(right.workflowId) || left.version.localeCompare(right.version));
}

function normalizeConnectorRequirements(
  values: readonly FhKuikaSolutionPackConnectorRequirementV1[],
): readonly FhKuikaSolutionPackConnectorRequirementV1[] {
  const seen = new Set<string>();
  return values
    .map((value) => {
      const connectorId = requireId(value.connectorId, 'connector requirement id');
      if (seen.has(connectorId)) throw new Error('solution pack connector requirements must be unique');
      seen.add(connectorId);
      return { connectorId, optional: value.optional };
    })
    .sort((left, right) => left.connectorId.localeCompare(right.connectorId));
}

function requireId(value: string, field: string): string {
  const normalized = requireText(value, field);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new Error(field + ' must use a bounded lowercase identifier');
  }
  return normalized;
}

function requireSemver(value: string, field: string): string {
  const normalized = requireText(value, field);
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) {
    throw new Error(field + ' must be semantic version x.y.z');
  }
  return normalized;
}

function requireHash(value: string, field: string): string {
  const normalized = requireText(value, field);
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(field + ' must be lowercase sha256');
  }
  return normalized;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  if (normalized.length > 500 || /[\r\n\t]/.test(normalized)) {
    throw new Error(field + ' must be a bounded single-line value');
  }
  return normalized;
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((item) => canonicalJson(item)).join(',') + ']';
  const record = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(record)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key]))
      .join(',') +
    '}'
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
