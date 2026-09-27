import type {
  FhKuikaKnowledgeQueryV1,
  FhKuikaKnowledgeResultV1,
} from './kuika-knowledge-contract.js';
import type { FhKuikaKnowledgeRetrievalResultV1 } from './kuika-knowledge-retriever.js';

export interface FhKuikaKnowledgeAnswerPackageV1 {
  readonly schemaVersion: 1;
  readonly query: FhKuikaKnowledgeQueryV1;
  readonly results: readonly FhKuikaKnowledgeResultV1[];
  readonly authoritativeCount: number;
  readonly discoveryCount: number;
  readonly provenanceComplete: boolean;
  readonly trace: FhKuikaKnowledgeRetrievalResultV1['trace'];
  readonly authority: 'NONE';
  readonly modelInvocationRequired: false;
}

export function buildFhKuikaKnowledgeAnswerPackageV1(
  retrieval: FhKuikaKnowledgeRetrievalResultV1,
): FhKuikaKnowledgeAnswerPackageV1 {
  const authoritativeCount = retrieval.results.filter(
    (item) => item.resultClass === 'AUTHORITATIVE',
  ).length;
  const discoveryCount = retrieval.results.length - authoritativeCount;

  return {
    schemaVersion: 1,
    query: retrieval.query,
    results: retrieval.results,
    authoritativeCount,
    discoveryCount,
    provenanceComplete: retrieval.results.every(hasCompleteProvenance),
    trace: retrieval.trace,
    authority: 'NONE',
    modelInvocationRequired: false,
  };
}

export function knowledgeAnswerPackageCanGrantAuthority(): false {
  return false;
}

export function knowledgeAnswerPackageCanInvokeModel(): false {
  return false;
}

function hasCompleteProvenance(result: FhKuikaKnowledgeResultV1): boolean {
  if (!result.provenance.sourceId.trim()) return false;
  if (result.resultClass === 'DISCOVERY') {
    return result.provenance.sourceKind === 'SEMANTIC_DISCOVERY';
  }
  if (result.provenance.sourceKind === 'LINEAGE_RELATION') {
    return result.provenance.evidenceIds.length > 0;
  }
  return true;
}
