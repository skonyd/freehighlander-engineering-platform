import {
  validateFhKuikaKnowledgeResultV1,
  type FhKuikaKnowledgeQueryV1,
  type FhKuikaKnowledgeResultV1,
} from './kuika-knowledge-contract.js';

export interface FhKuikaKnowledgeLineageSourceV1 {
  exactEntity(entityId: string, entityVersion?: number): readonly FhKuikaKnowledgeResultV1[];
  exactRevision(repository: string, sha: string): readonly FhKuikaKnowledgeResultV1[];
  traverseAuthoritative(
    entityId: string,
    entityVersion: number | undefined,
    maxDepth: number,
  ): readonly FhKuikaKnowledgeResultV1[];
  evidenceForResults(
    results: readonly FhKuikaKnowledgeResultV1[],
  ): readonly FhKuikaKnowledgeResultV1[];
  semanticDiscover?(text: string, limit: number): readonly FhKuikaKnowledgeResultV1[];
}

export interface FhKuikaKnowledgeRetrievalTraceV1 {
  readonly stage:
    'EXACT_LOOKUP' | 'LINEAGE_TRAVERSAL' | 'EVIDENCE_RETRIEVAL' | 'SEMANTIC_DISCOVERY';
  readonly executed: boolean;
  readonly resultCount: number;
}

export interface FhKuikaKnowledgeRetrievalResultV1 {
  readonly schemaVersion: 1;
  readonly query: FhKuikaKnowledgeQueryV1;
  readonly results: readonly FhKuikaKnowledgeResultV1[];
  readonly trace: readonly FhKuikaKnowledgeRetrievalTraceV1[];
  readonly projectionAuthority: 'NONE';
  readonly semanticDiscoveryAuthority: 'FORBIDDEN';
}

export function retrieveFhKuikaKnowledgeV1(
  source: FhKuikaKnowledgeLineageSourceV1,
  query: FhKuikaKnowledgeQueryV1,
): FhKuikaKnowledgeRetrievalResultV1 {
  if (query.authority !== 'NONE') {
    throw new Error('knowledge query authority must be NONE');
  }

  const trace: FhKuikaKnowledgeRetrievalTraceV1[] = [];
  const collected: FhKuikaKnowledgeResultV1[] = [];

  const exact = executeExactStage(source, query);
  trace.push({
    stage: 'EXACT_LOOKUP',
    executed: exact.executed,
    resultCount: exact.results.length,
  });
  appendResults(collected, exact.results);

  const lineage =
    query.entityId === undefined
      ? []
      : source.traverseAuthoritative(query.entityId, query.entityVersion, query.maxDepth);
  trace.push({
    stage: 'LINEAGE_TRAVERSAL',
    executed: query.entityId !== undefined,
    resultCount: lineage.length,
  });
  appendResults(collected, lineage);

  const evidence = source.evidenceForResults(dedupeResults(collected));
  trace.push({
    stage: 'EVIDENCE_RETRIEVAL',
    executed: true,
    resultCount: evidence.length,
  });
  appendResults(collected, evidence);

  let semantic: readonly FhKuikaKnowledgeResultV1[] = [];
  const semanticEnabled =
    query.includeSemanticDiscovery === true && typeof source.semanticDiscover === 'function';

  if (semanticEnabled && source.semanticDiscover) {
    semantic = source.semanticDiscover(query.text, query.resultLimit);
    for (const item of semantic) {
      if (item.resultClass !== 'DISCOVERY') {
        throw new Error('semantic discovery returned non-discovery result');
      }
      if (item.provenance.sourceKind !== 'SEMANTIC_DISCOVERY') {
        throw new Error('semantic discovery result must identify SEMANTIC_DISCOVERY provenance');
      }
    }
    appendResults(collected, semantic);
  }

  trace.push({
    stage: 'SEMANTIC_DISCOVERY',
    executed: semanticEnabled,
    resultCount: semantic.length,
  });

  const results = dedupeResults(collected).slice(0, query.resultLimit);
  for (const result of results) validateFhKuikaKnowledgeResultV1(result);

  return {
    schemaVersion: 1,
    query,
    results,
    trace,
    projectionAuthority: 'NONE',
    semanticDiscoveryAuthority: 'FORBIDDEN',
  };
}

export function lineageFirstRetrieverCanGrantAuthority(): false {
  return false;
}

export function lineageFirstRetrieverCanPromoteSemanticResult(): false {
  return false;
}

export function lineageFirstRetrieverCanMutateDomain(): false {
  return false;
}

function executeExactStage(
  source: FhKuikaKnowledgeLineageSourceV1,
  query: FhKuikaKnowledgeQueryV1,
): { readonly executed: boolean; readonly results: readonly FhKuikaKnowledgeResultV1[] } {
  if (query.mode === 'EXACT_REVISION') {
    if (!query.revision) throw new Error('EXACT_REVISION requires revision');
    return {
      executed: true,
      results: source.exactRevision(query.revision.repository, query.revision.sha),
    };
  }

  if (query.entityId !== undefined) {
    return {
      executed: true,
      results: source.exactEntity(query.entityId, query.entityVersion),
    };
  }

  return { executed: false, results: [] };
}

function appendResults(
  target: FhKuikaKnowledgeResultV1[],
  results: readonly FhKuikaKnowledgeResultV1[],
): void {
  for (const result of results) {
    validateFhKuikaKnowledgeResultV1(result);
    target.push(result);
  }
}

function dedupeResults(
  results: readonly FhKuikaKnowledgeResultV1[],
): readonly FhKuikaKnowledgeResultV1[] {
  const seen = new Set<string>();
  const deduped: FhKuikaKnowledgeResultV1[] = [];

  for (const result of results) {
    const key = [
      result.resultClass,
      result.provenance.sourceKind,
      result.provenance.sourceId,
      result.id,
    ].join('|');

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }

  return deduped;
}
