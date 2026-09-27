import { validateFhKuikaKnowledgeResultV1 } from './kuika-knowledge-contract.js';
import type { FhKuikaKnowledgeRetrievalResultV1 } from './kuika-knowledge-retriever.js';

export interface FhKuikaKnowledgeEvalCaseV1 {
  readonly id: string;
  readonly retrieval: FhKuikaKnowledgeRetrievalResultV1;
  readonly expectedAuthoritativeResultIds?: readonly string[];
  readonly forbiddenAuthoritativeResultIds?: readonly string[];
}

export interface FhKuikaKnowledgeEvalCaseResultV1 {
  readonly id: string;
  readonly passed: boolean;
  readonly errors: readonly string[];
}

export interface FhKuikaKnowledgeEvalSuiteResultV1 {
  readonly schemaVersion: 1;
  readonly cases: readonly FhKuikaKnowledgeEvalCaseResultV1[];
  readonly totalCases: number;
  readonly passedCases: number;
  readonly failedCases: number;
  readonly semanticAuthorityViolationCount: number;
  readonly invalidProvenanceCount: number;
  readonly authority: 'NONE';
}

export function evaluateFhKuikaKnowledgeRetrievalV1(
  cases: readonly FhKuikaKnowledgeEvalCaseV1[],
): FhKuikaKnowledgeEvalSuiteResultV1 {
  const ids = new Set<string>();
  let semanticAuthorityViolationCount = 0;
  let invalidProvenanceCount = 0;

  const results = cases.map((testCase) => {
    const errors: string[] = [];
    const id = requireCaseId(testCase.id);
    if (ids.has(id)) throw new Error('knowledge eval case ids must be unique');
    ids.add(id);

    if (testCase.retrieval.projectionAuthority !== 'NONE') {
      errors.push('retrieval projection authority must remain NONE');
    }
    if (testCase.retrieval.semanticDiscoveryAuthority !== 'FORBIDDEN') {
      errors.push('semantic discovery authority must remain FORBIDDEN');
    }
    if (testCase.retrieval.results.length > testCase.retrieval.query.resultLimit) {
      errors.push('retrieval results exceed query resultLimit');
    }

    const authoritative = new Set(
      testCase.retrieval.results
        .filter((result) => result.resultClass === 'AUTHORITATIVE')
        .map((result) => result.id),
    );

    for (const result of testCase.retrieval.results) {
      try {
        validateFhKuikaKnowledgeResultV1(result);
      } catch (error) {
        invalidProvenanceCount += 1;
        errors.push(
          'invalid result ' +
            result.id +
            ': ' +
            (error instanceof Error ? error.message : 'unknown validation error'),
        );
      }

      if (
        result.provenance.sourceKind === 'SEMANTIC_DISCOVERY' &&
        result.resultClass === 'AUTHORITATIVE'
      ) {
        semanticAuthorityViolationCount += 1;
        errors.push('semantic discovery result cannot be authoritative: ' + result.id);
      }
    }

    for (const expected of testCase.expectedAuthoritativeResultIds ?? []) {
      if (!authoritative.has(expected)) {
        errors.push('missing expected authoritative result: ' + expected);
      }
    }

    for (const forbidden of testCase.forbiddenAuthoritativeResultIds ?? []) {
      if (authoritative.has(forbidden)) {
        errors.push('forbidden authoritative result present: ' + forbidden);
      }
    }

    return {
      id,
      passed: errors.length === 0,
      errors,
    };
  });

  const passedCases = results.filter((result) => result.passed).length;

  return {
    schemaVersion: 1,
    cases: results,
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    semanticAuthorityViolationCount,
    invalidProvenanceCount,
    authority: 'NONE',
  };
}

export function knowledgeEvalSuiteCanInvokeModel(): false {
  return false;
}

export function knowledgeEvalSuiteCanGrantAuthority(): false {
  return false;
}

export function knowledgeEvalSuiteCanPromoteSemanticResults(): false {
  return false;
}

function requireCaseId(value: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error('knowledge eval case id must be a bounded lowercase identifier');
  }
  return normalized;
}
