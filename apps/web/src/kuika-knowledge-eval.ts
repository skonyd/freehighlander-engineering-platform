import type { FhKuikaKnowledgeRetrievalResultV1 } from './kuika-knowledge-retriever.js';

export interface FhKuikaKnowledgeEvalExpectationV1 {
  readonly requiredAuthoritativeIds: readonly string[];
  readonly requiredStages?: readonly string[];
  readonly requireCompleteProvenance?: boolean;
}

export interface FhKuikaKnowledgeEvalReportV1 {
  readonly schemaVersion: 1;
  readonly passed: boolean;
  readonly authoritativeRecall: number;
  readonly missingAuthoritativeIds: readonly string[];
  readonly provenanceComplete: boolean;
  readonly semanticIsolationPreserved: boolean;
  readonly missingStages: readonly string[];
  readonly authority: 'NONE';
  readonly modelInvocationRequired: false;
}

export function evaluateFhKuikaKnowledgeRetrievalV1(
  retrieval: FhKuikaKnowledgeRetrievalResultV1,
  expectation: FhKuikaKnowledgeEvalExpectationV1,
): FhKuikaKnowledgeEvalReportV1 {
  const required = [...new Set(expectation.requiredAuthoritativeIds)].sort();
  const authoritativeIds = new Set(
    retrieval.results.filter((item) => item.resultClass === 'AUTHORITATIVE').map((item) => item.id),
  );
  const missingAuthoritativeIds = required.filter((id) => !authoritativeIds.has(id));
  const authoritativeRecall =
    required.length === 0
      ? 1
      : (required.length - missingAuthoritativeIds.length) / required.length;

  const provenanceComplete = retrieval.results.every((item) => {
    if (!item.provenance.sourceId.trim()) return false;
    if (item.resultClass === 'AUTHORITATIVE' && item.provenance.sourceKind === 'LINEAGE_RELATION') {
      return item.provenance.evidenceIds.length > 0;
    }
    return true;
  });

  const semanticIsolationPreserved = retrieval.results.every(
    (item) =>
      item.provenance.sourceKind !== 'SEMANTIC_DISCOVERY' || item.resultClass === 'DISCOVERY',
  );

  const executedStages = new Set(
    retrieval.trace.filter((item) => item.executed).map((item) => item.stage),
  );
  const missingStages = (expectation.requiredStages ?? [])
    .filter((stage) => !executedStages.has(stage))
    .sort();

  const passed =
    missingAuthoritativeIds.length === 0 &&
    semanticIsolationPreserved &&
    missingStages.length === 0 &&
    (expectation.requireCompleteProvenance === false || provenanceComplete);

  return {
    schemaVersion: 1,
    passed,
    authoritativeRecall,
    missingAuthoritativeIds,
    provenanceComplete,
    semanticIsolationPreserved,
    missingStages,
    authority: 'NONE',
    modelInvocationRequired: false,
  };
}

export function knowledgeEvalCanGrantAuthority(): false {
  return false;
}

export function knowledgeEvalRequiresModelCall(): false {
  return false;
}
