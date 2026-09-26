import {
  createFhKuikaWorkflowDraftV1,
  validateFhKuikaWorkflowDraftDefinitionV1,
  type FhKuikaCanonicalWorkflowDefinitionV1,
  type FhKuikaWorkflowDraftV1,
} from './kuika-workflow-draft.js';
import type {
  FhKuikaBlueprintSimulationFixtureV1,
  FhKuikaPublishedBlueprintV1,
} from './kuika-blueprint.js';

export interface FhKuikaBlueprintSimulationResultV1 {
  readonly fixtureId: string;
  readonly description: string;
  readonly expectedTerminalState: FhKuikaBlueprintSimulationFixtureV1['expectedTerminalState'];
  readonly draftValid: boolean;
  readonly validationErrors: readonly string[];
  readonly authority: 'NONE';
  readonly executionAuthorized: false;
}

export interface FhKuikaBlueprintPreparationV1 {
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly blueprintHash: string;
  readonly workflowTemplateRef: string;
  readonly workflowDraft: FhKuikaWorkflowDraftV1;
  readonly simulations: readonly FhKuikaBlueprintSimulationResultV1[];
  readonly authority: 'NONE';
  readonly publishAuthorized: false;
  readonly executionAuthorized: false;
}

export function prepareFhKuikaBlueprintWorkflowV1(
  blueprint: FhKuikaPublishedBlueprintV1,
): FhKuikaBlueprintPreparationV1 {
  const definition = blueprintToWorkflowDefinition(blueprint);
  const workflowDraft = createFhKuikaWorkflowDraftV1({
    draftId: 'blueprint-' + blueprint.id + '-' + blueprint.version,
    canonicalDefinition: definition,
  });
  const validation = validateFhKuikaWorkflowDraftDefinitionV1(definition);

  return {
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    blueprintHash: blueprint.blueprintHash,
    workflowTemplateRef: blueprint.workflowTemplateRef,
    workflowDraft,
    simulations: blueprint.simulationFixtures.map((fixture) => ({
      fixtureId: fixture.id,
      description: fixture.description,
      expectedTerminalState: fixture.expectedTerminalState,
      draftValid: validation.valid,
      validationErrors: validation.errors,
      authority: 'NONE',
      executionAuthorized: false,
    })),
    authority: 'NONE',
    publishAuthorized: false,
    executionAuthorized: false,
  };
}

export function blueprintPreparationCanGrantAuthority(): false {
  return false;
}

export function blueprintPreparationCanPublishDirectly(): false {
  return false;
}

export function blueprintPreparationCanExecute(): false {
  return false;
}

function blueprintToWorkflowDefinition(
  blueprint: FhKuikaPublishedBlueprintV1,
): FhKuikaCanonicalWorkflowDefinitionV1 {
  const stageNodes = blueprint.lifecycleStages.map((stage, index) => ({
    id: 'stage-' + String(index + 1).padStart(2, '0') + '-' + slug(stage),
    kind: 'SUBWORKFLOW' as const,
  }));

  const gateNodes = blueprint.authoritySensitiveNodes.map((node, index) => ({
    id: 'gate-' + String(index + 1).padStart(2, '0') + '-' + slug(node),
    kind: 'GATE' as const,
  }));

  const nodes = [...stageNodes, ...gateNodes];
  const edges = nodes.slice(1).map((node, index) => ({
    from: nodes[index]!.id,
    to: node.id,
  }));

  return {
    id: blueprint.id + '-candidate',
    version: blueprint.version,
    nodes,
    edges,
  };
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'step';
}
