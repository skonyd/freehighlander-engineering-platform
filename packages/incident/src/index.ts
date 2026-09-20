export type IncidentSeverity = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED' | 'CLOSED';
export type IncidentEventKind =
  | 'DECLARED'
  | 'INVESTIGATION_STARTED'
  | 'EVIDENCE_ATTACHED'
  | 'MITIGATION_PROPOSED'
  | 'MITIGATED'
  | 'RESOLVED'
  | 'CLOSED';

export interface IncidentResourceRef {
  readonly resourceId: string;
}

export interface IncidentEvidenceRef {
  readonly id: string;
  readonly digest: string;
  readonly provenance: 'TRUSTED' | 'UNTRUSTED';
}

export interface IncidentEvent {
  readonly id: string;
  readonly incidentId: string;
  readonly kind: IncidentEventKind;
  readonly occurredAt: string;
  readonly actor: string;
  readonly evidenceIds: readonly string[];
  readonly note?: string;
}

export interface IncidentRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly serviceId: string;
  readonly environment: string;
  readonly severity: IncidentSeverity;
  readonly status: IncidentStatus;
  readonly title: string;
  readonly affectedResources: readonly IncidentResourceRef[];
  readonly evidence: readonly IncidentEvidenceRef[];
  readonly timeline: readonly IncidentEvent[];
  readonly operationalIntentIds: readonly string[];
  readonly authority: 'NONE';
  readonly automaticRemediation: 'FORBIDDEN';
}

export interface IncidentServiceBinding {
  readonly serviceId: string;
  readonly environment: string;
  readonly resourceIds: readonly string[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface IncidentProjection {
  readonly incidentId: string;
  readonly serviceId: string;
  readonly environment: string;
  readonly severity: IncidentSeverity;
  readonly status: IncidentStatus;
  readonly affectedResourceCount: number;
  readonly trustedEvidenceCount: number;
  readonly eventCount: number;
  readonly authority: 'NONE';
  readonly infrastructureMutationAuthorized: false;
  readonly operationalIntentExecutionAuthorized: false;
  readonly automaticRemediationAuthorized: false;
}

export interface IncidentSnapshot extends IncidentProjection {
  readonly schemaVersion: 1;
  readonly snapshotHash: string;
}

const allowedTransitions: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  OPEN: ['INVESTIGATING'],
  INVESTIGATING: ['MITIGATED', 'RESOLVED'],
  MITIGATED: ['INVESTIGATING', 'RESOLVED'],
  RESOLVED: ['INVESTIGATING', 'CLOSED'],
  CLOSED: [],
};

export function incidentTransitionAllowed(from: IncidentStatus, to: IncidentStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function validateIncident(
  binding: IncidentServiceBinding,
  incident: IncidentRecord,
): ValidationResult {
  const errors: string[] = [];

  if (incident.schemaVersion !== 1) errors.push('unsupported incident schemaVersion');
  requireText(incident.id, 'incident id', errors);
  requireText(incident.title, 'incident title', errors);
  if (incident.serviceId !== binding.serviceId) {
    errors.push('incident serviceId must match bound service');
  }
  if (incident.environment !== binding.environment) {
    errors.push('incident environment must match bound environment');
  }
  if (incident.authority !== 'NONE') errors.push('incident authority must be NONE');
  if (incident.automaticRemediation !== 'FORBIDDEN') {
    errors.push('incident automaticRemediation must be FORBIDDEN');
  }

  const knownResources = new Set(binding.resourceIds);
  const affected = uniqueNonEmpty(
    incident.affectedResources.map((resource) => resource.resourceId),
    'affected resource',
    errors,
  );
  for (const resourceId of affected) {
    if (!knownResources.has(resourceId)) errors.push(`unknown affected resource ${resourceId}`);
  }

  const evidenceIds = uniqueNonEmpty(
    incident.evidence.map((evidence) => evidence.id),
    'incident evidence id',
    errors,
  );
  for (const evidence of incident.evidence) {
    requireSha256(evidence.digest, `incident evidence ${evidence.id} digest`, errors);
  }

  const eventIds = uniqueNonEmpty(
    incident.timeline.map((event) => event.id),
    'incident event id',
    errors,
  );
  if (eventIds.size === 0) errors.push('incident timeline must not be empty');

  let previousAt = '';
  for (const event of incident.timeline) {
    if (event.incidentId !== incident.id) {
      errors.push(`incident event ${event.id} incidentId must match incident id`);
    }
    requireTimestamp(event.occurredAt, `incident event ${event.id} occurredAt`, errors);
    if (previousAt && event.occurredAt < previousAt) {
      errors.push('incident timeline must be ordered by occurredAt');
    }
    previousAt = event.occurredAt;
    for (const evidenceId of event.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        errors.push(`incident event ${event.id} references unknown evidence ${evidenceId}`);
      }
    }
  }

  const derived = deriveStatus(incident.timeline, errors);
  if (derived !== incident.status) {
    errors.push(
      `incident status ${incident.status} does not match timeline-derived status ${derived}`,
    );
  }

  return { valid: errors.length === 0, errors };
}

export function incidentProjection(
  binding: IncidentServiceBinding,
  incident: IncidentRecord,
): IncidentProjection {
  const validation = validateIncident(binding, incident);
  if (!validation.valid) {
    throw new Error(`invalid incident: ${validation.errors.join('; ')}`);
  }

  return {
    incidentId: incident.id,
    serviceId: incident.serviceId,
    environment: incident.environment,
    severity: incident.severity,
    status: incident.status,
    affectedResourceCount: incident.affectedResources.length,
    trustedEvidenceCount: incident.evidence.filter((item) => item.provenance === 'TRUSTED').length,
    eventCount: incident.timeline.length,
    authority: 'NONE',
    infrastructureMutationAuthorized: false,
    operationalIntentExecutionAuthorized: false,
    automaticRemediationAuthorized: false,
  };
}

export async function buildIncidentSnapshot(
  binding: IncidentServiceBinding,
  incident: IncidentRecord,
): Promise<IncidentSnapshot> {
  const projection = incidentProjection(binding, incident);
  return {
    schemaVersion: 1,
    snapshotHash: await sha256Hex(canonicalJson({ binding, incident })),
    ...projection,
  };
}

export function incidentCanGrantAuthority(): false {
  return false;
}

export function incidentCanMutateInfrastructure(): false {
  return false;
}

export function incidentCanExecuteOperationalIntent(): false {
  return false;
}

export function incidentCanAutomaticallyRemediate(): false {
  return false;
}

function deriveStatus(timeline: readonly IncidentEvent[], errors: string[]): IncidentStatus {
  let status: IncidentStatus = 'OPEN';
  let declared = false;

  for (const event of timeline) {
    if (!declared) {
      if (event.kind !== 'DECLARED') errors.push('incident timeline must start with DECLARED');
      declared = true;
      continue;
    }

    const next = eventStatus(event.kind, status);
    if (next !== status && !incidentTransitionAllowed(status, next)) {
      errors.push(`invalid incident transition ${status} -> ${next}`);
      continue;
    }
    status = next;
  }

  return status;
}

function eventStatus(kind: IncidentEventKind, current: IncidentStatus): IncidentStatus {
  switch (kind) {
    case 'DECLARED':
    case 'EVIDENCE_ATTACHED':
    case 'MITIGATION_PROPOSED':
      return current;
    case 'INVESTIGATION_STARTED':
      return 'INVESTIGATING';
    case 'MITIGATED':
      return 'MITIGATED';
    case 'RESOLVED':
      return 'RESOLVED';
    case 'CLOSED':
      return 'CLOSED';
  }
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
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    errors.push(`${name} must be an ISO timestamp`);
  }
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
