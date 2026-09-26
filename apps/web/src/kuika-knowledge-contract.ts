export type FhKuikaKnowledgeQueryMode =
  'EXACT_ENTITY' | 'EXACT_REVISION' | 'LINEAGE_TRAVERSAL' | 'EVIDENCE_LOOKUP' | 'HYBRID';

export type FhKuikaKnowledgeResultClass = 'AUTHORITATIVE' | 'DISCOVERY';

export type FhKuikaKnowledgeSourceKind =
  'LINEAGE_ENTITY' | 'LINEAGE_RELATION' | 'EVIDENCE' | 'ARTIFACT' | 'SEMANTIC_DISCOVERY';

export interface FhKuikaKnowledgeRevisionRefV1 {
  readonly repository: string;
  readonly sha: string;
}

export interface FhKuikaKnowledgeQueryV1 {
  readonly schemaVersion: 1;
  readonly text: string;
  readonly mode: FhKuikaKnowledgeQueryMode;
  readonly entityId?: string;
  readonly entityVersion?: number;
  readonly revision?: FhKuikaKnowledgeRevisionRefV1;
  readonly maxDepth: number;
  readonly includeSemanticDiscovery: boolean;
  readonly resultLimit: number;
  readonly authority: 'NONE';
}

export interface FhKuikaKnowledgeProvenanceV1 {
  readonly sourceKind: FhKuikaKnowledgeSourceKind;
  readonly sourceId: string;
  readonly sourceDigest?: string;
  readonly revision?: FhKuikaKnowledgeRevisionRefV1;
  readonly evidenceIds: readonly string[];
}

export interface FhKuikaKnowledgeResultV1 {
  readonly id: string;
  readonly label: string;
  readonly resultClass: FhKuikaKnowledgeResultClass;
  readonly relationType?: string;
  readonly provenance: FhKuikaKnowledgeProvenanceV1;
  readonly semanticScore?: number;
  readonly authority: 'NONE';
}

export interface FhKuikaKnowledgeRetrievalPlanV1 {
  readonly schemaVersion: 1;
  readonly query: FhKuikaKnowledgeQueryV1;
  readonly orderedStages: readonly [
    'EXACT_LOOKUP',
    'LINEAGE_TRAVERSAL',
    'EVIDENCE_RETRIEVAL',
    'SEMANTIC_DISCOVERY',
  ];
  readonly semanticDiscoveryAuthority: 'FORBIDDEN';
  readonly projectionAuthority: 'NONE';
}

export interface FhKuikaKnowledgeQueryValidationV1 {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function createFhKuikaKnowledgeQueryV1(input: {
  readonly text: string;
  readonly mode?: FhKuikaKnowledgeQueryMode;
  readonly entityId?: string;
  readonly entityVersion?: number;
  readonly revision?: FhKuikaKnowledgeRevisionRefV1;
  readonly maxDepth?: number;
  readonly includeSemanticDiscovery?: boolean;
  readonly resultLimit?: number;
}): FhKuikaKnowledgeQueryV1 {
  const query: FhKuikaKnowledgeQueryV1 = {
    schemaVersion: 1,
    text: input.text,
    mode: input.mode ?? 'HYBRID',
    ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
    ...(input.entityVersion === undefined ? {} : { entityVersion: input.entityVersion }),
    ...(input.revision === undefined ? {} : { revision: input.revision }),
    maxDepth: input.maxDepth ?? 4,
    includeSemanticDiscovery: input.includeSemanticDiscovery ?? false,
    resultLimit: input.resultLimit ?? 25,
    authority: 'NONE',
  };

  const validation = validateFhKuikaKnowledgeQueryV1(query);
  if (!validation.valid) {
    throw new Error('invalid FH-KUIKA knowledge query: ' + validation.errors.join('; '));
  }
  return query;
}

export function validateFhKuikaKnowledgeQueryV1(
  query: FhKuikaKnowledgeQueryV1,
): FhKuikaKnowledgeQueryValidationV1 {
  const errors: string[] = [];

  if (query.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (query.authority !== 'NONE') errors.push('query authority must be NONE');

  const text = query.text.trim();
  if (!text) errors.push('query text is required');
  if (text.length > 2_000) errors.push('query text must be at most 2000 characters');

  if (!Number.isInteger(query.maxDepth) || query.maxDepth < 0 || query.maxDepth > 10) {
    errors.push('maxDepth must be an integer between 0 and 10');
  }

  if (!Number.isInteger(query.resultLimit) || query.resultLimit < 1 || query.resultLimit > 100) {
    errors.push('resultLimit must be an integer between 1 and 100');
  }

  if (query.entityId !== undefined && !query.entityId.trim()) {
    errors.push('entityId cannot be empty');
  }
  if (
    query.entityVersion !== undefined &&
    (!Number.isInteger(query.entityVersion) || query.entityVersion < 1)
  ) {
    errors.push('entityVersion must be a positive integer');
  }
  if (query.entityVersion !== undefined && query.entityId === undefined) {
    errors.push('entityVersion requires entityId');
  }

  if (query.revision !== undefined) {
    if (!query.revision.repository.trim()) errors.push('revision repository is required');
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(query.revision.sha)) {
      errors.push('revision sha must be a lowercase git sha');
    }
  }

  if (query.mode === 'EXACT_ENTITY' && query.entityId === undefined) {
    errors.push('EXACT_ENTITY requires entityId');
  }
  if (query.mode === 'EXACT_REVISION' && query.revision === undefined) {
    errors.push('EXACT_REVISION requires revision');
  }

  return { valid: errors.length === 0, errors };
}

export function buildFhKuikaKnowledgeRetrievalPlanV1(
  query: FhKuikaKnowledgeQueryV1,
): FhKuikaKnowledgeRetrievalPlanV1 {
  const validation = validateFhKuikaKnowledgeQueryV1(query);
  if (!validation.valid) {
    throw new Error('invalid FH-KUIKA knowledge query: ' + validation.errors.join('; '));
  }

  return {
    schemaVersion: 1,
    query,
    orderedStages: [
      'EXACT_LOOKUP',
      'LINEAGE_TRAVERSAL',
      'EVIDENCE_RETRIEVAL',
      'SEMANTIC_DISCOVERY',
    ],
    semanticDiscoveryAuthority: 'FORBIDDEN',
    projectionAuthority: 'NONE',
  };
}

export function validateFhKuikaKnowledgeResultV1(result: FhKuikaKnowledgeResultV1): void {
  requireText(result.id, 'result id');
  requireText(result.label, 'result label');
  requireText(result.provenance.sourceId, 'provenance sourceId');

  if (result.authority !== 'NONE') {
    throw new Error('knowledge result authority must be NONE');
  }

  if (result.provenance.sourceKind === 'SEMANTIC_DISCOVERY' && result.resultClass !== 'DISCOVERY') {
    throw new Error('semantic discovery result must remain DISCOVERY');
  }

  if (result.resultClass === 'AUTHORITATIVE') {
    if (result.provenance.sourceKind === 'SEMANTIC_DISCOVERY') {
      throw new Error('semantic discovery cannot establish authoritative lineage');
    }
    if (
      result.provenance.sourceKind === 'LINEAGE_RELATION' &&
      result.provenance.evidenceIds.length === 0
    ) {
      throw new Error('authoritative lineage relation requires evidence');
    }
  }

  if (result.semanticScore !== undefined) {
    if (
      !Number.isFinite(result.semanticScore) ||
      result.semanticScore < 0 ||
      result.semanticScore > 1
    ) {
      throw new Error('semanticScore must be a finite number between 0 and 1');
    }
    if (result.resultClass !== 'DISCOVERY') {
      throw new Error('semanticScore is only valid for DISCOVERY results');
    }
  }

  if (result.provenance.sourceDigest !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(result.provenance.sourceDigest)) {
      throw new Error('provenance sourceDigest must be lowercase sha256');
    }
  }

  if (result.provenance.revision !== undefined) {
    requireText(result.provenance.revision.repository, 'provenance revision repository');
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(result.provenance.revision.sha)) {
      throw new Error('provenance revision sha must be a lowercase git sha');
    }
  }

  const evidenceIds = new Set<string>();
  for (const evidenceId of result.provenance.evidenceIds) {
    requireText(evidenceId, 'evidence id');
    if (evidenceIds.has(evidenceId)) throw new Error('duplicate evidence id');
    evidenceIds.add(evidenceId);
  }
}

export function knowledgeQueryCanGrantAuthority(): false {
  return false;
}

export function knowledgeRetrievalCanMutateDomain(): false {
  return false;
}

export function semanticDiscoveryCanEstablishAuthoritativeLineage(): false {
  return false;
}

export function knowledgeRetrievalRequiresModelCall(): false {
  return false;
}

function requireText(value: string, field: string): void {
  if (!value.trim()) throw new Error(field + ' is required');
}