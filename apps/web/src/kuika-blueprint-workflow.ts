import type { FhKuikaPublishedBlueprintV1 } from './kuika-blueprint.js';
import {
  createFhKuikaWorkflowDraftV1,
  validateFhKuikaWorkflowDraftDefinitionV1,
  type FhKuikaCanonicalWorkflowDefinitionV1,
  type FhKuikaWorkflowDraftV1,
} from './kuika-workflow-draft.js';

export interface FhKuikaBlueprintWorkflowTemplateV1 {
  readonly ref: string;
  readonly canonicalDefinition: FhKuikaCanonicalWorkflowDefinitionV1;
}

export interface FhKuikaBlueprintWorkflowPreparationV1 {
  readonly schemaVersion: 1;
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly blueprintHash: string;
  readonly workflowTemplateRef: string;
  readonly workflowDraft: FhKuikaWorkflowDraftV1;
  readonly validation: ReturnType<typeof validateFhKuikaWorkflowDraftDefinitionV1>;
  readonly authority: 'NONE';
  readonly executionAuthorized: false;
  readonly publishAuthorized: false;
}

export interface FhKuikaBlueprintSimulationPreparationV1 {
  readonly schemaVersion: 1;
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly workflowDraftId: string;
  readonly workflowValid: boolean;
  readonly workflowValidationErrors: readonly string[];
  readonly fixtures: readonly {
    readonly id: string;
    readonly description: string;
    readonly expectedTerminalState: 'PASS' | 'HUMAN_REQUIRED' | 'BLOCKED' | 'FAIL';
    readonly state: 'NOT_EXECUTED';
  }[];
  readonly authority: 'NONE';
  readonly executionAuthorized: false;
}

export function prepareFhKuikaBlueprintWorkflowV1(
  blueprint: FhKuikaPublishedBlueprintV1,
  template: FhKuikaBlueprintWorkflowTemplateV1,
): FhKuikaBlueprintWorkflowPreparationV1 {
  if (template.ref !== blueprint.workflowTemplateRef) {
    throw new Error('workflow template ref does not match blueprint workflowTemplateRef');
  }

  const expected = parseWorkflowTemplateRef(blueprint.workflowTemplateRef);
  if (
    template.canonicalDefinition.id !== expected.id ||
    template.canonicalDefinition.version !== expected.version
  ) {
    throw new Error('canonical workflow identity does not match blueprint workflowTemplateRef');
  }

  const validation = validateFhKuikaWorkflowDraftDefinitionV1(template.canonicalDefinition);
  if (!validation.valid) {
    throw new Error('blueprint workflow template is invalid: ' + validation.errors.join('; '));
  }

  const workflowDraft = createFhKuikaWorkflowDraftV1({
    draftId: deterministicDraftId(blueprint),
    canonicalDefinition: template.canonicalDefinition,
  });

  return {
    schemaVersion: 1,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    blueprintHash: blueprint.blueprintHash,
    workflowTemplateRef: blueprint.workflowTemplateRef,
    workflowDraft,
    validation,
    authority: 'NONE',
    executionAuthorized: false,
    publishAuthorized: false,
  };
}

export function prepareFhKuikaBlueprintSimulationV1(
  preparation: FhKuikaBlueprintWorkflowPreparationV1,
  blueprint: FhKuikaPublishedBlueprintV1,
): FhKuikaBlueprintSimulationPreparationV1 {
  if (
    preparation.blueprintId !== blueprint.id ||
    preparation.blueprintVersion !== blueprint.version ||
    preparation.blueprintHash !== blueprint.blueprintHash
  ) {
    throw new Error('simulation preparation must be exact-bound to the blueprint');
  }

  const validation = validateFhKuikaWorkflowDraftDefinitionV1(
    preparation.workflowDraft.canonicalDefinition,
  );

  return {
    schemaVersion: 1,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    workflowDraftId: preparation.workflowDraft.draftId,
    workflowValid: validation.valid,
    workflowValidationErrors: [...validation.errors],
    fixtures: blueprint.simulationFixtures.map((fixture) => ({
      id: fixture.id,
      description: fixture.description,
      expectedTerminalState: fixture.expectedTerminalState,
      state: 'NOT_EXECUTED' as const,
    })),
    authority: 'NONE',
    executionAuthorized: false,
  };
}

export function blueprintWorkflowPreparationCanInvokeModel(): false {
  return false;
}

export function blueprintWorkflowPreparationCanExecute(): false {
  return false;
}

export function blueprintWorkflowPreparationCanPublishDirectly(): false {
  return false;
}

function parseWorkflowTemplateRef(value: string): { readonly id: string; readonly version: string } {
  const match = /^workflow:([a-z0-9][a-z0-9-]*)@(\d+\.\d+\.\d+)$/.exec(value);
  if (!match?.[1] || !match[2]) {
    throw new Error('workflowTemplateRef must use workflow:<id>@<semver>');
  }
  return { id: match[1], version: match[2] };
}

function deterministicDraftId(blueprint: FhKuikaPublishedBlueprintV1): string {
  return 'blueprint-' + blueprint.id + '-' + blueprint.version + '-' + blueprint.blueprintHash.slice(0, 12);
}
