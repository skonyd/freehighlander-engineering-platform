import {
  validateFhKuikaKnowledgeResultV1,
  type FhKuikaKnowledgeResultV1,
} from './kuika-knowledge-contract.js';

export interface FhKuikaLocalSemanticDocumentV1 {
  readonly id: string;
  readonly label: string;
  readonly sourceId: string;
  readonly sourceDigest?: string;
  readonly revision?: {
    readonly repository: string;
    readonly sha: string;
  };
  readonly evidenceIds: readonly string[];
  readonly vector: readonly number[];
}

export interface FhKuikaLocalSemanticIndexOptionsV1 {
  readonly dimensions: number;
  readonly maxDocuments?: number;
}

export class FhKuikaLocalSemanticIndexV1 {
  readonly dimensions: number;
  readonly maxDocuments: number;
  readonly #documents: readonly FhKuikaLocalSemanticDocumentV1[];

  constructor(
    documents: readonly FhKuikaLocalSemanticDocumentV1[],
    options: FhKuikaLocalSemanticIndexOptionsV1,
  ) {
    if (
      !Number.isInteger(options.dimensions) ||
      options.dimensions < 1 ||
      options.dimensions > 4096
    ) {
      throw new Error('semantic index dimensions must be an integer between 1 and 4096');
    }

    const maxDocuments = options.maxDocuments ?? 10_000;
    if (!Number.isInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 100_000) {
      throw new Error('semantic index maxDocuments must be an integer between 1 and 100000');
    }
    if (documents.length > maxDocuments) {
      throw new Error('semantic index document count exceeds maxDocuments');
    }

    const ids = new Set<string>();
    const normalized = documents.map((document) => {
      validateDocument(document, options.dimensions);
      if (ids.has(document.id)) throw new Error('duplicate semantic document id: ' + document.id);
      ids.add(document.id);
      return {
        ...document,
        vector: normalizeVector(document.vector),
      };
    });

    this.dimensions = options.dimensions;
    this.maxDocuments = maxDocuments;
    this.#documents = normalized;
  }

  search(queryVector: readonly number[], limit = 10): readonly FhKuikaKnowledgeResultV1[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('semantic search limit must be an integer between 1 and 100');
    }
    validateVector(queryVector, this.dimensions, 'query vector');
    const normalizedQuery = normalizeVector(queryVector);

    const ranked = this.#documents
      .map((document) => ({
        document,
        score: dot(normalizedQuery, document.vector),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.document.id.localeCompare(right.document.id);
      })
      .slice(0, limit);

    return ranked.map(({ document, score }) => {
      const result: FhKuikaKnowledgeResultV1 = {
        id: 'semantic:' + document.id,
        label: document.label,
        resultClass: 'DISCOVERY',
        provenance: {
          sourceKind: 'SEMANTIC_DISCOVERY',
          sourceId: document.sourceId,
          ...(document.sourceDigest === undefined ? {} : { sourceDigest: document.sourceDigest }),
          ...(document.revision === undefined ? {} : { revision: document.revision }),
          evidenceIds: document.evidenceIds,
        },
        semanticScore: clampScore(score),
        authority: 'NONE',
      };
      validateFhKuikaKnowledgeResultV1(result);
      return result;
    });
  }
}

export function localSemanticIndexCanGrantAuthority(): false {
  return false;
}

export function localSemanticIndexCanInvokeModel(): false {
  return false;
}

export function localSemanticIndexCanUseRemoteProvider(): false {
  return false;
}

export function localSemanticIndexCanCreateAuthoritativeLineage(): false {
  return false;
}

function validateDocument(document: FhKuikaLocalSemanticDocumentV1, dimensions: number): void {
  requireText(document.id, 'semantic document id');
  requireText(document.label, 'semantic document label');
  requireText(document.sourceId, 'semantic document sourceId');

  if (document.sourceDigest !== undefined && !/^[a-f0-9]{64}$/.test(document.sourceDigest)) {
    throw new Error('semantic document sourceDigest must be lowercase sha256');
  }

  if (document.revision !== undefined) {
    requireText(document.revision.repository, 'semantic document revision repository');
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(document.revision.sha)) {
      throw new Error('semantic document revision sha must be a lowercase git sha');
    }
  }

  const evidence = new Set<string>();
  for (const evidenceId of document.evidenceIds) {
    requireText(evidenceId, 'semantic document evidence id');
    if (evidence.has(evidenceId)) throw new Error('duplicate semantic document evidence id');
    evidence.add(evidenceId);
  }

  validateVector(document.vector, dimensions, 'semantic document vector');
}

function validateVector(vector: readonly number[], dimensions: number, field: string): void {
  if (vector.length !== dimensions) {
    throw new Error(field + ' dimensions must equal configured dimensions');
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error(field + ' values must be finite numbers');
  }
  if (vector.every((value) => value === 0)) {
    throw new Error(field + ' must not be the zero vector');
  }
}

function normalizeVector(vector: readonly number[]): readonly number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / magnitude);
}

function dot(left: readonly number[], right: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return sum;
}

function clampScore(score: number): number {
  const cosine = Math.max(-1, Math.min(1, score));
  return (cosine + 1) / 2;
}

function requireText(value: string, field: string): void {
  if (!value.trim()) throw new Error(field + ' is required');
}
