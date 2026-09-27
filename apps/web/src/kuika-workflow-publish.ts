import { createHash } from 'node:crypto';

import {
  validateFhKuikaWorkflowDraftDefinitionV1,
  type FhKuikaCanonicalWorkflowDefinitionV1,
} from './kuika-workflow-draft.js';
import {
  buildFhKuikaWorkflowVersionDiffV1,
  type FhKuikaWorkflowVersionDiffV1,
} from './kuika-workflow-diff.js';

export interface FhKuikaWorkflowPublishCandidateV1 {
  readonly schemaVersion: 1;
  readonly workflowId: string;
  readonly version: string;
  readonly canonicalHash: string;
  readonly canonicalDefinition: FhKuikaCanonicalWorkflowDefinitionV1;
  readonly diff: FhKuikaWorkflowVersionDiffV1;
  readonly status: 'PUBLISH_CANDIDATE';
  readonly immutableAfterPublish: true;
  readonly canonicalPublishValidationRequired: true;
  readonly corePublishAuthorityRequired: true;
  readonly authority: 'NONE';
  readonly publishAuthorized: false;
  readonly executionAuthorized: false;
}

export function prepareFhKuikaWorkflowPublishCandidateV1(input: {
  readonly previous: FhKuikaCanonicalWorkflowDefinitionV1 | null;
  readonly next: FhKuikaCanonicalWorkflowDefinitionV1;
}): FhKuikaWorkflowPublishCandidateV1 {
  const validation = validateFhKuikaWorkflowDraftDefinitionV1(input.next);
  if (!validation.valid) {
    throw new Error('workflow publish candidate is invalid: ' + validation.errors.join('; '));
  }

  if (input.previous) {
    if (input.previous.id !== input.next.id) {
      throw new Error('workflow publish candidate must preserve workflow id');
    }
    if (compareSemver(input.next.version, input.previous.version) <= 0) {
      throw new Error('workflow publish candidate version must increase monotonically');
    }
  }

  const definition = clone(input.next);
  const canonicalHash = createHash('sha256').update(stableJson(definition)).digest('hex');

  return Object.freeze({
    schemaVersion: 1,
    workflowId: definition.id,
    version: definition.version,
    canonicalHash,
    canonicalDefinition: definition,
    diff: buildFhKuikaWorkflowVersionDiffV1(input.previous, definition),
    status: 'PUBLISH_CANDIDATE',
    immutableAfterPublish: true,
    canonicalPublishValidationRequired: true,
    corePublishAuthorityRequired: true,
    authority: 'NONE',
    publishAuthorized: false,
    executionAuthorized: false,
  });
}

export function workflowPublishCandidateCanPublish(): false {
  return false;
}

export function workflowPublishCandidateCanExecute(): false {
  return false;
}

export function workflowPublishCandidateCanGrantAuthority(): false {
  return false;
}

function compareSemver(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function clone(value: FhKuikaCanonicalWorkflowDefinitionV1): FhKuikaCanonicalWorkflowDefinitionV1 {
  return JSON.parse(JSON.stringify(value)) as FhKuikaCanonicalWorkflowDefinitionV1;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => JSON.stringify(key) + ':' + stableJson(child))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}
