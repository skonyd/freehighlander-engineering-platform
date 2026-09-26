import type { FhKuikaPublishedBlueprintV1 } from './kuika-blueprint.js';
import {
  createFhKuikaWorkflowDraftV1,
  validateFhKuikaWorkflowDraftDefinitionV1,
  type FhKuikaWorkflowDraftV1,
  type FhKuikaWorkflowDraftValidationV1,
} from './kuika-workflow-draft.js';

export interface FhKuikaBlueprintWorkflowDraftV1 {
  readonly schemaVersion: 1;
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly blueprintHash: string;
  readonly workflowTemplateRef: string;
  readonly templateResolution: 'REQUIRED';
  readonly draft: FhKuikaWorkflowDraftV1;
  readonly authority: 'NONE';
  readonly publishAuthorized: false;
  readonly executionAuthorized: false;
}

export interface FhKuikaBlueprintSimulationFixtureResultV1 {
  readonly fixtureId: string;
  readonly description: string;
  readonly expectedTerminalState: 'PASS' | 'HUMAN_REQUIRED' | 'BLOCKED' | 'FAIL';
  readonly resultKind: 'EXPECTED_ONLY';
}

export interface FhKuikaBlueprintSimulationPreviewV1 {
  readonly schemaVersion: 1;
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly blueprintHash: string;
  readonly workflowTemplateRef: string;
  readonly draftValidation: FhKuikaWorkflowDraftValidationV1;
  readonly fixtures: readonly FhKuikaBlueprintSimulationFixtureResultV1[];
  readonly executionPerformed: false;
  readonly authority: 'NONE';
  readonly publishAuthorized: false;
  readonly executionAuthorized: false;
}

export function createFhKuikaBlueprintWorkflowDraftV1(
  blueprint: FhKuikaPublishedBlueprintV1,
): FhKuikaBlueprintWorkflowDraftV1 {
  const draft = createFhKuikaWorkflowDraftV1({
    draftId: `${blueprint.id}@${blueprint.version}:template-preview`,
    canonicalDefinition: {
      id: blueprint.id,
      version: blueprint.version,
      nodes: [{ id: 'template', kind: 'SUBWORKFLOW' }],
      edges: [],
    },
  });

  return {
    schemaVersion: 1,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    blueprintHash: blueprint.blueprintHash,
    workflowTemplateRef: blueprint.workflowTemplateRef,
    templateResolution: 'REQUIRED',
    draft,
    authority: 'NONE',
    publishAuthorized: false,
    executionAuthorized: false,
  };
}

export function simulateFhKuikaBlueprintV1(
  blueprint: FhKuikaPublishedBlueprintV1,
): FhKuikaBlueprintSimulationPreviewV1 {
  const draft = createFhKuikaBlueprintWorkflowDraftV1(blueprint);
  const draftValidation = validateFhKuikaWorkflowDraftDefinitionV1(
    draft.draft.canonicalDefinition,
  );

  return {
    schemaVersion: 1,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    blueprintHash: blueprint.blueprintHash,
    workflowTemplateRef: blueprint.workflowTemplateRef,
    draftValidation,
    fixtures: blueprint.simulationFixtures.map((fixture) => ({
      fixtureId: fixture.id,
      description: fixture.description,
      expectedTerminalState: fixture.expectedTerminalState,
      resultKind: 'EXPECTED_ONLY',
    })),
    executionPerformed: false,
    authority: 'NONE',
    publishAuthorized: false,
    executionAuthorized: false,
  };
}

export function blueprintWorkflowDraftCanGrantAuthority(): false {
  return false;
}

export function blueprintWorkflowDraftCanPublish(): false {
  return false;
}

export function blueprintWorkflowDraftCanExecute(): false {
  return false;
}

export function blueprintSimulationPreviewCanExecute(): false {
  return false;
}
