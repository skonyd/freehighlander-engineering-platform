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

export interface FhKuikaWorkflowPublishCandidateV1 {
  readonly schemaVersion: 1;
  readonly workflowId: string;
  readonly previousVersion: string | null;
  readonly candidateVersion: string;
  readonly definitionHash: string;
  readonly validation: FhKuikaWorkflowDraftValidationV1;
  readonly diff: FhKuikaWorkflowVersionDiffV1;
  readonly state: 'READY_FOR_CANONICAL_REVIEW' | 'BLOCKED';
  readonly immutableCandidate: true;
  readonly authority: 'NONE';
  readonly publishAuthorized: false;
  readonly executionAuthorized: false;
}

export function createFhKuikaWorkflowPublishCandidateV1(
  previous: FhKuikaCanonicalWorkflowDefinitionV1 | null,
  next: FhKuikaCanonicalWorkflowDefinitionV1,
): FhKuikaWorkflowPublishCandidateV1 {
  const validation = validateFhKuikaWorkflowDraftDefinitionV1(next);
  const errors = [...validation.errors];

  if (previous && previous.id !== next.id) {
    errors.push('previous and candidate workflow ids must match');
  }

  if (
    previous &&
    isSemver(next.version) &&
    isSemver(previous.version) &&
    compareSemver(next.version, previous.version) <= 0
  ) {
    errors.push('candidate workflow version must be greater than previous version');
  }

  const effectiveValidation: FhKuikaWorkflowDraftValidationV1 =
    errors.length === validation.errors.length
      ? validation
      : {
          valid: false,
          errors,
          issues: [
            ...validation.issues,
            ...errors
              .slice(validation.errors.length)
              .map((message) => ({
                category: 'SCHEMA' as const,
                message,
                nodeId: null,
                edgeRef: null,
              })),
          ],
          requiresCanonicalPublishValidation: true,
        };

  return {
    schemaVersion: 1,
    workflowId: next.id,
    previousVersion: previous?.version ?? null,
    candidateVersion: next.version,
    definitionHash: hashDefinition(next),
    validation: effectiveValidation,
    diff: buildFhKuikaWorkflowVersionDiffV1(previous, next),
    state: effectiveValidation.valid ? 'READY_FOR_CANONICAL_REVIEW' : 'BLOCKED',
    immutableCandidate: true,
    authority: 'NONE',
    publishAuthorized: false,
    executionAuthorized: false,
  };
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

function hashDefinition(definition: FhKuikaCanonicalWorkflowDefinitionV1): string {
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}

function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);

  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function isSemver(value: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(value);
}

function parseSemver(value: string): readonly [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error('workflow version must be semantic version x.y.z');
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
