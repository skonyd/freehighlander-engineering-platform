import { createHash } from 'node:crypto';

import {
  validateFhKuikaWorkflowDraftDefinitionV1,
  type FhKuikaCanonicalWorkflowDefinitionV1,
} from './kuika-workflow-draft.js';
import {
  buildFhKuikaWorkflowVersionDiffV1,
  type FhKuikaWorkflowVersionDiffV1,
} from './kuika-workflow-diff.js';

export interface FhKuikaWorkflowPublicationCandidateV1 {
  readonly schemaVersion: 1;
  readonly workflowId: string;
  readonly version: string;
  readonly workflowHash: string;
  readonly canonicalDefinition: FhKuikaCanonicalWorkflowDefinitionV1;
  readonly versionDiff: FhKuikaWorkflowVersionDiffV1;
  readonly status: 'PUBLICATION_CANDIDATE';
  readonly authority: 'NONE';
  readonly publishAuthorized: false;
  readonly executionAuthorized: false;
  readonly persistencePerformed: false;
}

export function buildFhKuikaWorkflowPublicationCandidateV1(
  previous: FhKuikaCanonicalWorkflowDefinitionV1 | null,
  next: FhKuikaCanonicalWorkflowDefinitionV1,
): FhKuikaWorkflowPublicationCandidateV1 {
  const validation = validateFhKuikaWorkflowDraftDefinitionV1(next);
  if (!validation.valid) {
    throw new Error('workflow publication candidate requires a valid canonical definition');
  }

  if (previous) {
    const previousValidation = validateFhKuikaWorkflowDraftDefinitionV1(previous);
    if (!previousValidation.valid) {
      throw new Error('previous workflow definition must be valid');
    }
    if (previous.id !== next.id) {
      throw new Error('workflow publication candidate cannot change workflow id');
    }
    if (!isStrictlyNewerSemver(next.version, previous.version)) {
      throw new Error('workflow publication candidate requires a strictly newer semantic version');
    }
  }

  const canonicalDefinition = deepFreeze(cloneDefinition(next));
  const workflowHash = createHash('sha256').update(stableJson(canonicalDefinition)).digest('hex');

  return deepFreeze({
    schemaVersion: 1,
    workflowId: canonicalDefinition.id,
    version: canonicalDefinition.version,
    workflowHash,
    canonicalDefinition,
    versionDiff: buildFhKuikaWorkflowVersionDiffV1(previous, canonicalDefinition),
    status: 'PUBLICATION_CANDIDATE',
    authority: 'NONE',
    publishAuthorized: false,
    executionAuthorized: false,
    persistencePerformed: false,
  });
}

export function workflowPublicationCandidateCanGrantAuthority(): false {
  return false;
}

export function workflowPublicationCandidateCanPublishDirectly(): false {
  return false;
}

export function workflowPublicationCandidateCanExecute(): false {
  return false;
}

export function workflowPublicationCandidateCanPersist(): false {
  return false;
}

function isStrictlyNewerSemver(next: string, previous: string): boolean {
  const nextParts = next.split('.').map(Number);
  const previousParts = previous.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (nextParts[index]! > previousParts[index]!) return true;
    if (nextParts[index]! < previousParts[index]!) return false;
  }
  return false;
}

function cloneDefinition(
  definition: FhKuikaCanonicalWorkflowDefinitionV1,
): FhKuikaCanonicalWorkflowDefinitionV1 {
  return {
    id: definition.id,
    version: definition.version,
    nodes: definition.nodes.map((node) => ({
      ...node,
      ...(node.requiredEvidence ? { requiredEvidence: [...node.requiredEvidence] } : {}),
      ...(node.toolPermissions ? { toolPermissions: [...node.toolPermissions] } : {}),
    })),
    edges: definition.edges.map((edge) => ({ ...edge })),
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
