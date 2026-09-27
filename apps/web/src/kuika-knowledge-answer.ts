import {
  validateFhKuikaKnowledgeResultV1,
  type FhKuikaKnowledgeProvenanceV1,
  type FhKuikaKnowledgeResultV1,
} from './kuika-knowledge-contract.js';
import type { FhKuikaKnowledgeRetrievalResultV1 } from './kuika-knowledge-retriever.js';

export interface FhKuikaKnowledgeAnswerItemV1 {
  readonly id: string;
  readonly label: string;
  readonly relationType?: string;
  readonly provenance: FhKuikaKnowledgeProvenanceV1;
}

export interface FhKuikaKnowledgeAnswerPackageV1 {
  readonly schemaVersion: 1;
  readonly queryText: string;
  readonly authoritative: readonly FhKuikaKnowledgeAnswerItemV1[];
  readonly discovery: readonly (FhKuikaKnowledgeAnswerItemV1 & {
    readonly semanticScore?: number;
  })[];
  readonly authoritativeCount: number;
  readonly discoveryCount: number;
  readonly provenanceComplete: boolean;
  readonly naturalLanguageGenerated: false;
  readonly modelInvocationRequired: false;
  readonly semanticDiscoveryAuthority: 'FORBIDDEN';
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

  const authoritative: FhKuikaKnowledgeAnswerItemV1[] = [];
  const discovery: (FhKuikaKnowledgeAnswerItemV1 & {
    readonly semanticScore?: number;
  })[] = [];

  for (const result of retrieval.results) {
    validateFhKuikaKnowledgeResultV1(result);
    const item = answerItem(result);

    if (result.resultClass === 'AUTHORITATIVE') {
      authoritative.push(item);
    } else {
      discovery.push({
        ...item,
        ...(result.semanticScore === undefined ? {} : { semanticScore: result.semanticScore }),
      });
    }
  }

  return {
    schemaVersion: 1,
    queryText: retrieval.query.text,
    authoritative,
    discovery,
    authoritativeCount: authoritative.length,
    discoveryCount: discovery.length,
    provenanceComplete: [...authoritative, ...discovery].every(hasProvenance),
    naturalLanguageGenerated: false,
    modelInvocationRequired: false,
    semanticDiscoveryAuthority: 'FORBIDDEN',
    authority: 'NONE',
  };
}

export function knowledgeAnswerPackageCanGrantAuthority(): false {
  return false;
}

export function knowledgeAnswerPackageCanPromoteDiscovery(): false {
  return false;
}

export function knowledgeAnswerPackageRequiresModelCall(): false {
  return false;
}

function answerItem(result: FhKuikaKnowledgeResultV1): FhKuikaKnowledgeAnswerItemV1 {
  return {
    id: result.id,
    label: result.label,
    ...(result.relationType === undefined ? {} : { relationType: result.relationType }),
    provenance: {
      ...result.provenance,
      evidenceIds: [...result.provenance.evidenceIds],
      ...(result.provenance.revision === undefined
        ? {}
        : { revision: { ...result.provenance.revision } }),
    },
  };
}

function hasProvenance(item: FhKuikaKnowledgeAnswerItemV1): boolean {
  if (!item.provenance.sourceId.trim()) return false;
  if (item.provenance.sourceKind === 'LINEAGE_RELATION') {
    return item.provenance.evidenceIds.length > 0;
  }
  return true;
}
