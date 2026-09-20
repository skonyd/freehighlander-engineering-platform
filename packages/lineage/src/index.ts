export type LineageEntityKind =
  | 'REQUIREMENT'
  | 'ACCEPTANCE_CRITERION'
  | 'CODE_REVISION'
  | 'TEST_EVIDENCE'
  | 'SECURITY_EVIDENCE'
  | 'BUILD'
  | 'RELEASE'
  | 'DEPLOYMENT'
  | 'RUNTIME_OBSERVATION'
  | 'INCIDENT';

export type LineageRelationKind =
  | 'REFINES'
  | 'IMPLEMENTED_BY'
  | 'VERIFIED_BY'
  | 'SECURED_BY'
  | 'BUILT_FROM'
  | 'RELEASES'
  | 'DEPLOYED_AS'
  | 'OBSERVED_BY'
  | 'INVOLVED_IN'
  | 'RELATED_TO';

export type LineageRelationClass = 'AUTHORITATIVE' | 'DISCOVERY';
export type LineageEvidenceProvenance = 'TRUSTED' | 'UNTRUSTED';

export interface RevisionBinding {
  readonly repository: string;
  readonly sha: string;
}

export interface LineageEntity {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly kind: LineageEntityKind;
  readonly label: string;
  readonly digest: string;
  readonly revision?: RevisionBinding;
}

export interface EntityVersionRef {
  readonly id: string;
  readonly version: number;
}

export interface LineageEvidenceRef {
  readonly id: string;
  readonly digest: string;
  readonly provenance: LineageEvidenceProvenance;
}

export interface LineageRelation {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly kind: LineageRelationKind;
  readonly relationClass: LineageRelationClass;
  readonly from: EntityVersionRef;
  readonly to: EntityVersionRef;
  readonly evidence: readonly LineageEvidenceRef[];
}

export interface LineageGraph {
  readonly schemaVersion: 1;
  readonly entities: readonly LineageEntity[];
  readonly relations: readonly LineageRelation[];
  readonly authority: 'NONE';
  readonly semanticSearchAuthority: 'FORBIDDEN';
  readonly storageModel: 'RELATIONAL_FIRST';
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface LineageProjection {
  readonly entityCount: number;
  readonly relationCount: number;
  readonly authoritativeRelationCount: number;
  readonly discoveryRelationCount: number;
  readonly revisionBoundEntityCount: number;
  readonly authority: 'NONE';
  readonly semanticSearchCanEstablishAuthority: false;
  readonly graphDatabaseRequired: false;
  readonly domainMutationAuthorized: false;
}

export interface LineageSnapshot extends LineageProjection {
  readonly schemaVersion: 1;
  readonly snapshotHash: string;
}

export interface TraversalNode {
  readonly ref: EntityVersionRef;
  readonly depth: number;
}

const revisionRequiredKinds = new Set<LineageEntityKind>([
  'CODE_REVISION',
  'BUILD',
  'RELEASE',
  'DEPLOYMENT',
]);

const authoritativeRelationKinds = new Set<LineageRelationKind>([
  'REFINES',
  'IMPLEMENTED_BY',
  'VERIFIED_BY',
  'SECURED_BY',
  'BUILT_FROM',
  'RELEASES',
  'DEPLOYED_AS',
  'OBSERVED_BY',
  'INVOLVED_IN',
]);

const endpointRules: Readonly<
  Partial<Record<LineageRelationKind, readonly [LineageEntityKind, LineageEntityKind]>>
> = {
  REFINES: ['REQUIREMENT', 'ACCEPTANCE_CRITERION'],
  IMPLEMENTED_BY: ['ACCEPTANCE_CRITERION', 'CODE_REVISION'],
  VERIFIED_BY: ['ACCEPTANCE_CRITERION', 'TEST_EVIDENCE'],
  SECURED_BY: ['CODE_REVISION', 'SECURITY_EVIDENCE'],
  BUILT_FROM: ['BUILD', 'CODE_REVISION'],
  RELEASES: ['RELEASE', 'BUILD'],
  DEPLOYED_AS: ['DEPLOYMENT', 'RELEASE'],
  OBSERVED_BY: ['DEPLOYMENT', 'RUNTIME_OBSERVATION'],
  INVOLVED_IN: ['RUNTIME_OBSERVATION', 'INCIDENT'],
};

export function validateLineageGraph(graph: LineageGraph): ValidationResult {
  const errors: string[] = [];

  if (graph.schemaVersion !== 1) errors.push('unsupported lineage graph schemaVersion');
  if (graph.authority !== 'NONE') errors.push('lineage graph authority must be NONE');
  if (graph.semanticSearchAuthority !== 'FORBIDDEN') {
    errors.push('semantic search authority must be FORBIDDEN');
  }
  if (graph.storageModel !== 'RELATIONAL_FIRST') {
    errors.push('lineage storage model must remain RELATIONAL_FIRST');
  }

  const entityKeys = new Set<string>();
  const entityByKey = new Map<string, LineageEntity>();
  const versionsById = new Map<string, Set<number>>();

  for (const entity of graph.entities) {
    if (entity.schemaVersion !== 1) errors.push(`unsupported entity schemaVersion: ${entity.id}`);
    requireText(entity.id, 'entity id', errors);
    requireText(entity.label, `entity ${entity.id} label`, errors);
    if (!Number.isInteger(entity.version) || entity.version < 1) {
      errors.push(`entity ${entity.id} version must be a positive integer`);
    }
    requireSha256(entity.digest, `entity ${entity.id} digest`, errors);

    const key = entityKey(entity);
    if (entityKeys.has(key)) errors.push(`duplicate entity version: ${key}`);
    entityKeys.add(key);
    entityByKey.set(key, entity);

    const versions = versionsById.get(entity.id) ?? new Set<number>();
    versions.add(entity.version);
    versionsById.set(entity.id, versions);

    if (revisionRequiredKinds.has(entity.kind)) {
      validateRevisionBinding(entity, errors);
    } else if (entity.revision !== undefined) {
      validateRevisionBinding(entity, errors);
    }
  }

  for (const [id, versions] of versionsById) {
    const ordered = [...versions].sort((a, b) => a - b);
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index] === ordered[index - 1]) {
        errors.push(`duplicate entity version for stable id ${id}`);
      }
    }
  }

  const relationIds = new Set<string>();
  for (const relation of graph.relations) {
    if (relation.schemaVersion !== 1) {
      errors.push(`unsupported relation schemaVersion: ${relation.id}`);
    }
    requireText(relation.id, 'relation id', errors);
    if (relationIds.has(relation.id)) errors.push(`duplicate relation id: ${relation.id}`);
    relationIds.add(relation.id);

    const fromKey = entityKey(relation.from);
    const toKey = entityKey(relation.to);
    const fromEntity = entityByKey.get(fromKey);
    const toEntity = entityByKey.get(toKey);

    if (!fromEntity) errors.push(`relation ${relation.id} missing from endpoint ${fromKey}`);
    if (!toEntity) errors.push(`relation ${relation.id} missing to endpoint ${toKey}`);

    validateRelationClass(relation, errors);
    validateRelationEvidence(relation, errors);

    const expectedKinds = endpointRules[relation.kind];
    if (expectedKinds && fromEntity && toEntity) {
      const [expectedFrom, expectedTo] = expectedKinds;
      if (fromEntity.kind !== expectedFrom || toEntity.kind !== expectedTo) {
        errors.push(
          `relation ${relation.id} ${relation.kind} must bind ${expectedFrom} -> ${expectedTo}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function lineageProjection(graph: LineageGraph): LineageProjection {
  const validation = validateLineageGraph(graph);
  if (!validation.valid) {
    throw new Error(`invalid lineage graph: ${validation.errors.join('; ')}`);
  }

  return {
    entityCount: graph.entities.length,
    relationCount: graph.relations.length,
    authoritativeRelationCount: graph.relations.filter(
      (relation) => relation.relationClass === 'AUTHORITATIVE',
    ).length,
    discoveryRelationCount: graph.relations.filter(
      (relation) => relation.relationClass === 'DISCOVERY',
    ).length,
    revisionBoundEntityCount: graph.entities.filter((entity) => entity.revision !== undefined)
      .length,
    authority: 'NONE',
    semanticSearchCanEstablishAuthority: false,
    graphDatabaseRequired: false,
    domainMutationAuthorized: false,
  };
}

export async function buildLineageSnapshot(graph: LineageGraph): Promise<LineageSnapshot> {
  const projection = lineageProjection(graph);
  const normalized = {
    ...graph,
    entities: [...graph.entities].sort((left, right) =>
      entityKey(left).localeCompare(entityKey(right)),
    ),
    relations: [...graph.relations].sort((left, right) => left.id.localeCompare(right.id)),
  };

  return {
    schemaVersion: 1,
    snapshotHash: await sha256Hex(canonicalJson(normalized)),
    ...projection,
  };
}

export function traverseLineage(
  graph: LineageGraph,
  start: EntityVersionRef,
  maxDepth: number,
): readonly TraversalNode[] {
  const validation = validateLineageGraph(graph);
  if (!validation.valid) {
    throw new Error(`invalid lineage graph: ${validation.errors.join('; ')}`);
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 10) {
    throw new Error('lineage traversal maxDepth must be an integer between 0 and 10');
  }

  const entities = new Set(graph.entities.map((entity) => entityKey(entity)));
  const startKey = entityKey(start);
  if (!entities.has(startKey)) throw new Error(`unknown lineage start entity ${startKey}`);

  const outgoing = new Map<string, EntityVersionRef[]>();
  for (const relation of [...graph.relations].sort((a, b) => a.id.localeCompare(b.id))) {
    if (relation.relationClass !== 'AUTHORITATIVE') continue;
    const fromKey = entityKey(relation.from);
    const targets = outgoing.get(fromKey) ?? [];
    targets.push(relation.to);
    outgoing.set(fromKey, targets);
  }

  const queue: TraversalNode[] = [{ ref: start, depth: 0 }];
  const result: TraversalNode[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const key = entityKey(current.ref);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(current);

    if (current.depth >= maxDepth) continue;
    const targets = [...(outgoing.get(key) ?? [])].sort((a, b) =>
      entityKey(a).localeCompare(entityKey(b)),
    );
    for (const target of targets) {
      if (!seen.has(entityKey(target))) queue.push({ ref: target, depth: current.depth + 1 });
    }
  }

  return result;
}

export function lineageCanGrantAuthority(): false {
  return false;
}

export function lineageCanMutateDomain(): false {
  return false;
}

export function semanticSearchCanEstablishLineageAuthority(): false {
  return false;
}

export function lineageRequiresGraphDatabase(): false {
  return false;
}

function validateRelationClass(relation: LineageRelation, errors: string[]): void {
  if (relation.kind === 'RELATED_TO') {
    if (relation.relationClass !== 'DISCOVERY') {
      errors.push(`relation ${relation.id} RELATED_TO must remain DISCOVERY`);
    }
    return;
  }

  if (authoritativeRelationKinds.has(relation.kind) && relation.relationClass !== 'AUTHORITATIVE') {
    errors.push(`relation ${relation.id} ${relation.kind} must be AUTHORITATIVE`);
  }
}

function validateRelationEvidence(relation: LineageRelation, errors: string[]): void {
  const evidenceIds = new Set<string>();
  for (const evidence of relation.evidence) {
    requireText(evidence.id, `relation ${relation.id} evidence id`, errors);
    requireSha256(
      evidence.digest,
      `relation ${relation.id} evidence ${evidence.id} digest`,
      errors,
    );
    if (evidenceIds.has(evidence.id)) {
      errors.push(`duplicate relation evidence id: ${relation.id}/${evidence.id}`);
    }
    evidenceIds.add(evidence.id);
  }

  if (relation.relationClass === 'AUTHORITATIVE') {
    if (relation.evidence.length === 0) {
      errors.push(`authoritative relation ${relation.id} requires evidence`);
    }
    if (relation.evidence.some((evidence) => evidence.provenance !== 'TRUSTED')) {
      errors.push(`authoritative relation ${relation.id} requires trusted provenance`);
    }
  }
}

function validateRevisionBinding(entity: LineageEntity, errors: string[]): void {
  if (!entity.revision) {
    errors.push(`entity ${entity.id} kind ${entity.kind} requires exact revision binding`);
    return;
  }
  requireText(entity.revision.repository, `entity ${entity.id} revision repository`, errors);
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(entity.revision.sha)) {
    errors.push(`entity ${entity.id} revision sha must be lowercase git sha`);
  }
}

function entityKey(ref: EntityVersionRef): string {
  return `${ref.id}@${ref.version}`;
}

function requireText(value: string, name: string, errors: string[]): void {
  if (!value.trim()) errors.push(`${name} is required`);
}

function requireSha256(value: string, name: string, errors: string[]): void {
  if (!/^[a-f0-9]{64}$/.test(value)) errors.push(`${name} must be lowercase sha256`);
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
