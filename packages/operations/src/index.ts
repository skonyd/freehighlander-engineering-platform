export type ServiceCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ResourceKind = 'SERVICE' | 'DATABASE' | 'QUEUE' | 'CACHE' | 'STORAGE' | 'CLUSTER' | 'EXTERNAL';
export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
export type HealthEvidenceProvenance = 'TRUSTED' | 'UNTRUSTED';
export type OperationalIntentKind = 'RESTART' | 'SCALE' | 'DEPLOY' | 'ROLLBACK' | 'CONFIGURE' | 'DIAGNOSE';

export interface ResourceIdentity {
  readonly id: string;
  readonly kind: ResourceKind;
  readonly environment: string;
  readonly locator: string;
}

export interface ServiceDefinition {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly criticality: ServiceCriticality;
  readonly environment: string;
  readonly resources: readonly ResourceIdentity[];
  readonly runbookIds: readonly string[];
}

export interface HealthEvidence {
  readonly id: string;
  readonly resourceId: string;
  readonly observedAt: string;
  readonly provenance: HealthEvidenceProvenance;
  readonly digest: string;
}

export interface ResourceHealth {
  readonly resourceId: string;
  readonly status: HealthStatus;
  readonly evidenceIds: readonly string[];
  readonly observedAt: string;
}

export interface HealthSnapshot {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly serviceId: string;
  readonly environment: string;
  readonly observedAt: string;
  readonly resources: readonly ResourceHealth[];
  readonly evidence: readonly HealthEvidence[];
}

export interface Runbook {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly serviceId: string;
  readonly steps: readonly string[];
  readonly supersedesVersion?: number;
}

export interface OperationalIntent {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly serviceId: string;
  readonly environment: string;
  readonly kind: OperationalIntentKind;
  readonly targetResourceIds: readonly string[];
  readonly reason: string;
  readonly sideEffects: 'FORBIDDEN';
  readonly authority: 'NONE';
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface OperationsProjection {
  readonly serviceId: string;
  readonly environment: string;
  readonly status: HealthStatus;
  readonly totalResources: number;
  readonly healthyResources: number;
  readonly degradedResources: number;
  readonly unhealthyResources: number;
  readonly unknownResources: number;
  readonly trustedEvidenceItems: number;
  readonly authority: 'NONE';
  readonly mutationAuthorized: false;
  readonly operationalIntentExecutionAuthorized: false;
}

export interface OperationsSnapshot extends OperationsProjection {
  readonly schemaVersion: 1;
  readonly healthSnapshotId: string;
  readonly snapshotHash: string;
}

export function validateServiceDefinition(service: ServiceDefinition): ValidationResult {
  const errors: string[] = [];

  if (service.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  requireText(service.id, 'service id', errors);
  requireText(service.name, 'service name', errors);
  requireText(service.environment, 'service environment', errors);

  uniqueNonEmpty(
    service.resources.map((resource) => resource.id),
    'resource id',
    errors,
  );
  if (service.resources.length === 0) errors.push('service requires at least one resource');

  for (const resource of service.resources) {
    requireText(resource.environment, `resource ${resource.id} environment`, errors);
    requireText(resource.locator, `resource ${resource.id} locator`, errors);
    if (resource.environment !== service.environment) {
      errors.push(`resource ${resource.id} environment must match service environment`);
    }
  }

  uniqueNonEmpty(service.runbookIds, 'runbook id', errors);
  return { valid: errors.length === 0, errors };
}

export function validateRunbook(service: ServiceDefinition, runbook: Runbook): ValidationResult {
  const errors = [...validateServiceDefinition(service).errors];

  if (runbook.schemaVersion !== 1) errors.push('unsupported runbook schemaVersion');
  requireText(runbook.id, 'runbook id', errors);
  requireText(runbook.title, 'runbook title', errors);
  if (runbook.serviceId !== service.id) errors.push('runbook serviceId must match service id');
  if (!Number.isInteger(runbook.version) || runbook.version < 1) {
    errors.push('runbook version must be a positive integer');
  }
  uniqueNonEmpty(runbook.steps, 'runbook step', errors);
  if (runbook.steps.length === 0) errors.push('runbook requires at least one step');
  if (
    runbook.supersedesVersion !== undefined &&
    (!Number.isInteger(runbook.supersedesVersion) ||
      runbook.supersedesVersion < 1 ||
      runbook.supersedesVersion >= runbook.version)
  ) {
    errors.push('runbook supersedesVersion must precede version');
  }

  return { valid: errors.length === 0, errors };
}

export function validateHealthSnapshot(
  service: ServiceDefinition,
  snapshot: HealthSnapshot,
): ValidationResult {
  const errors = [...validateServiceDefinition(service).errors];

  if (snapshot.schemaVersion !== 1) errors.push('unsupported health snapshot schemaVersion');
  requireText(snapshot.id, 'health snapshot id', errors);
  if (snapshot.serviceId !== service.id) errors.push('health snapshot serviceId must match service id');
  if (snapshot.environment !== service.environment) {
    errors.push('health snapshot environment must match service environment');
  }
  requireTimestamp(snapshot.observedAt, 'health snapshot observedAt', errors);

  const knownResources = new Set(service.resources.map((resource) => resource.id));
  const healthResourceIds = uniqueNonEmpty(
    snapshot.resources.map((resource) => resource.resourceId),
    'health resource id',
    errors,
  );

  for (const resourceId of knownResources) {
    if (!healthResourceIds.has(resourceId)) {
      errors.push(`missing health state for resource ${resourceId}`);
    }
  }
  for (const resourceId of healthResourceIds) {
    if (!knownResources.has(resourceId)) errors.push(`unknown health resource ${resourceId}`);
  }

  const evidenceIds = uniqueNonEmpty(
    snapshot.evidence.map((evidence) => evidence.id),
    'health evidence id',
    errors,
  );
  for (const evidence of snapshot.evidence) {
    if (!knownResources.has(evidence.resourceId)) {
      errors.push(`health evidence ${evidence.id} references unknown resource ${evidence.resourceId}`);
    }
    requireTimestamp(evidence.observedAt, `health evidence ${evidence.id} observedAt`, errors);
    requireSha256(evidence.digest, `health evidence ${evidence.id} digest`, errors);
  }

  for (const resource of snapshot.resources) {
    requireTimestamp(resource.observedAt, `resource health ${resource.resourceId} observedAt`, errors);
    for (const evidenceId of resource.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        errors.push(`resource health ${resource.resourceId} references unknown evidence ${evidenceId}`);
      }
    }
    if (resource.status !== 'UNKNOWN' && resource.evidenceIds.length === 0) {
      errors.push(`resource health ${resource.resourceId} requires evidence`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateOperationalIntent(
  service: ServiceDefinition,
  intent: OperationalIntent,
): ValidationResult {
  const errors = [...validateServiceDefinition(service).errors];

  if (intent.schemaVersion !== 1) errors.push('unsupported operational intent schemaVersion');
  requireText(intent.id, 'operational intent id', errors);
  requireText(intent.reason, 'operational intent reason', errors);
  if (intent.serviceId !== service.id) errors.push('operational intent serviceId must match service id');
  if (intent.environment !== service.environment) {
    errors.push('operational intent environment must match service environment');
  }
  if (intent.sideEffects !== 'FORBIDDEN') {
    errors.push('operational intent sideEffects must be FORBIDDEN');
  }
  if (intent.authority !== 'NONE') errors.push('operational intent authority must be NONE');

  const knownResources = new Set(service.resources.map((resource) => resource.id));
  const targets = uniqueNonEmpty(intent.targetResourceIds, 'operational intent target', errors);
  if (targets.size === 0) errors.push('operational intent requires at least one target');
  for (const target of targets) {
    if (!knownResources.has(target)) errors.push(`operational intent references unknown resource ${target}`);
  }

  return { valid: errors.length === 0, errors };
}

export function operationsProjection(
  service: ServiceDefinition,
  snapshot: HealthSnapshot,
): OperationsProjection {
  const validation = validateHealthSnapshot(service, snapshot);
  if (!validation.valid) {
    throw new Error(`invalid operations evidence: ${validation.errors.join('; ')}`);
  }

  const count = (status: HealthStatus) =>
    snapshot.resources.filter((resource) => resource.status === status).length;
  const unhealthyResources = count('UNHEALTHY');
  const degradedResources = count('DEGRADED');
  const unknownResources = count('UNKNOWN');
  const status: HealthStatus =
    unhealthyResources > 0
      ? 'UNHEALTHY'
      : degradedResources > 0
        ? 'DEGRADED'
        : unknownResources > 0
          ? 'UNKNOWN'
          : 'HEALTHY';

  return {
    serviceId: service.id,
    environment: service.environment,
    status,
    totalResources: snapshot.resources.length,
    healthyResources: count('HEALTHY'),
    degradedResources,
    unhealthyResources,
    unknownResources,
    trustedEvidenceItems: snapshot.evidence.filter((item) => item.provenance === 'TRUSTED').length,
    authority: 'NONE',
    mutationAuthorized: false,
    operationalIntentExecutionAuthorized: false,
  };
}

export async function buildOperationsSnapshot(
  service: ServiceDefinition,
  snapshot: HealthSnapshot,
): Promise<OperationsSnapshot> {
  const projection = operationsProjection(service, snapshot);
  const snapshotHash = await sha256Hex(canonicalJson({ service, snapshot }));
  return {
    schemaVersion: 1,
    healthSnapshotId: snapshot.id,
    snapshotHash,
    ...projection,
  };
}

export function operationsCanGrantAuthority(): false {
  return false;
}

export function operationsCanMutateInfrastructure(): false {
  return false;
}

export function operationsCanExecuteIntent(): false {
  return false;
}

function uniqueNonEmpty(values: readonly string[], kind: string, errors: string[]): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.trim()) {
      errors.push(`${kind} must not be empty`);
      continue;
    }
    if (seen.has(value)) errors.push(`duplicate ${kind}: ${value}`);
    seen.add(value);
  }
  return seen;
}

function requireText(value: string, name: string, errors: string[]): void {
  if (!value.trim()) errors.push(`${name} is required`);
}

function requireSha256(value: string, name: string, errors: string[]): void {
  if (!/^[a-f0-9]{64}$/.test(value)) errors.push(`${name} must be lowercase sha256`);
}

function requireTimestamp(value: string, name: string, errors: string[]): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) errors.push(`${name} must be an ISO timestamp`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
