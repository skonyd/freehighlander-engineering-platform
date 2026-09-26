import { createHash } from 'node:crypto';

import {
  validateFhKuikaWorkflowDraftDefinitionV1,
  type FhKuikaCanonicalWorkflowDefinitionV1,
  type FhKuikaWorkflowDraftValidationV1,
} from './kuika-workflow-draft.js';
import {
  buildFhKuikaWorkflowVersionDiffV1,
  type FhKuikaWorkflowVersionDiffV1,
} from './kuika-workflow-diff.js';
import { simulateFhKuikaWorkflowDraftV1 } from './kuika-workflow-simulation.js';

export interface FhKuikaWorkflowPublicationCandidateV1 {
  readonly schemaVersion: 1;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly workflowHash: string;
  readonly validation: FhKuikaWorkflowDraftValidationV1;
  readonly simulationReady: boolean;
  readonly versionDiff: FhKuikaWorkflowVersionDiffV1;
  readonly status: 'BLOCKED' | 'READY_FOR_CORE_PUBLICATION_REVIEW';
  readonly publicationAuthorized: false;
  readonly executionAuthorized: false;
  readonly authority: 'NONE';
}

export function prepareFhKuikaWorkflowPublicationCandidateV1(
  previous: FhKuikaCanonicalWorkflowDefinitionV1 | null,
  next: FhKuikaCanonicalWorkflowDefinitionV1,
): FhKuikaWorkflowPublicationCandidateV1 {
  const validation = validateFhKuikaWorkflowDraftDefinitionV1(next);
  const simulation = simulateFhKuikaWorkflowDraftV1(next);
  const versionDiff = buildFhKuikaWorkflowVersionDiffV1(previous, next);
  const workflowHash = hashWorkflowDefinition(next);

  return {
    schemaVersion: 1,
    workflowId: next.id,
    workflowVersion: next.version,
    workflowHash,
    validation,
    simulationReady: simulation.valid && simulation.terminalState === 'READY_FOR_CANONICAL_REVIEW',
    versionDiff,
    status:
      validation.valid && simulation.valid
        ? 'READY_FOR_CORE_PUBLICATION_REVIEW'
        : 'BLOCKED',
    publicationAuthorized: false,
    executionAuthorized: false,
    authority: 'NONE',
  };
}

export function workflowPublicationCandidateCanPublish(): false {
  return false;
}

export function workflowPublicationCandidateCanExecute(): false {
  return false;
}

export function workflowPublicationCandidateCanGrantAuthority(): false {
  return false;
}

function hashWorkflowDefinition(definition: FhKuikaCanonicalWorkflowDefinitionV1): string {
  return createHash('sha256').update(stableJson(normalizeDefinition(definition))).digest('hex');
}

function normalizeDefinition(
  definition: FhKuikaCanonicalWorkflowDefinitionV1,
): FhKuikaCanonicalWorkflowDefinitionV1 {
  return {
    id: definition.id,
    version: definition.version,
    nodes: [...definition.nodes]
      .map((node) => ({
        ...node,
        ...(node.requiredEvidence
          ? { requiredEvidence: [...node.requiredEvidence].sort((a, b) => a.localeCompare(b)) }
          : {}),
        ...(node.toolPermissions
          ? { toolPermissions: [...node.toolPermissions].sort((a, b) => a.localeCompare(b)) }
          : {}),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...definition.edges].sort(
      (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    ),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map((entry) => stableJson(entry)).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => JSON.stringify(key) + ':' + stableJson(entry))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}
