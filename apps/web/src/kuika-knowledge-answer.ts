import {
  validateFhKuikaKnowledgeResultV1,
  type FhKuikaKnowledgeQueryV1,
  type FhKuikaKnowledgeResultV1,
} from './kuika-knowledge-contract.js';
import type { FhKuikaKnowledgeRetrievalResultV1 } from './kuika-knowledge-retriever.js';

export interface FhKuikaKnowledgeAnswerPackageV1 {
  readonly schemaVersion: 1;
  readonly query: FhKuikaKnowledgeQueryV1;
  readonly authoritativeResults: readonly FhKuikaKnowledgeResultV1[];
  readonly discoveryResults: readonly FhKuikaKnowledgeResultV1[];
  readonly resultCount: number;
  readonly revisionBoundResultCount: number;
  readonly evidenceBoundResultCount: number;
  readonly incompleteProvenanceResultIds: readonly string[];
  readonly modelInvocationPerformed: false;
  readonly naturalLanguageAnswerGenerated: false;
  readonly semanticResultsCanEstablishAuthority: false;
  readonly authority: 'NONE';
}

export function buildFhKuikaKnowledgeAnswerPackageV1(
  retrieval: FhKuikaKnowledgeRetrievalResultV1,
): FhKuikaKnowledgeAnswerPackageV1 {
  if (retrieval.projectionAuthority !== 'NONE') {
    throw new Error('knowledge retrieval projection authority must remain NONE');
  }
  if (retrieval.semanticDiscoveryAuthority !== 'FORBIDDEN') {
    throw new Error('semantic discovery authority must remain FORBIDDEN');
  }

  for (const result of retrieval.results) validateFhKuikaKnowledgeResultV1(result);

  const authoritativeResults = retrieval.results.filter(
    (result) => result.resultClass === 'AUTHORITATIVE',
  );
  const discoveryResults = retrieval.results.filter((result) => result.resultClass === 'DISCOVERY');

  const incompleteProvenanceResultIds = retrieval.results
    .filter((result) => !provenanceIsComplete(result))
    .map((result) => result.id)
    .sort();

  return {
    schemaVersion: 1,
    query: retrieval.query,
    authoritativeResults,
    discoveryResults,
    resultCount: retrieval.results.length,
    revisionBoundResultCount: retrieval.results.filter(
      (result) => result.provenance.revision !== undefined,
    ).length,
    evidenceBoundResultCount: retrieval.results.filter(
      (result) => result.provenance.evidenceIds.length > 0,
    ).length,
    incompleteProvenanceResultIds,
    modelInvocationPerformed: false,
    naturalLanguageAnswerGenerated: false,
    semanticResultsCanEstablishAuthority: false,
    authority: 'NONE',
  };
}

export function knowledgeAnswerPackageCanInvokeModel(): false {
  return false;
}

export function knowledgeAnswerPackageCanGenerateUngroundedClaims(): false {
  return false;
}

export function knowledgeAnswerPackageCanGrantAuthority(): false {
  return false;
}

function provenanceIsComplete(result: FhKuikaKnowledgeResultV1): boolean {
  if (result.resultClass === 'DISCOVERY') {
    return result.provenance.sourceId.trim().length > 0;
  }

  if (result.provenance.sourceKind === 'LINEAGE_RELATION') {
    return (
      result.provenance.sourceId.trim().length > 0 &&
      result.provenance.evidenceIds.length > 0
    );
  }

  return result.provenance.sourceId.trim().length > 0;
}
