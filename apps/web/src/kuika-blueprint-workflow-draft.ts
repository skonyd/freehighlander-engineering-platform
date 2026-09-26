import type {
  FhKuikaBlueprintParameterV1,
  FhKuikaPublishedBlueprintV1,
} from './kuika-blueprint.js';

export type FhKuikaBlueprintParameterValue =
  | string
  | number
  | boolean
  | readonly string[];

export interface FhKuikaBlueprintWorkflowDraftV1 {
  readonly schemaVersion: 1;
  readonly draftId: string;
  readonly repository: string;
  readonly exactRevision: string;
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly blueprintHash: string;
  readonly workflowTemplateRef: string;
  readonly defaultRiskTier: FhKuikaPublishedBlueprintV1['defaultRiskTier'];
  readonly parameterValues: Readonly<Record<string, FhKuikaBlueprintParameterValue>>;
  readonly requiredRoles: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly authoritySensitiveNodes: readonly string[];
  readonly authority: 'NONE';
  readonly publishAuthorized: false;
  readonly executionAuthorized: false;
}

export interface FhKuikaBlueprintSimulationPreviewV1 {
  readonly schemaVersion: 1;
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly blueprintHash: string;
  readonly workflowTemplateRef: string;
  readonly fixtures: readonly {
    readonly id: string;
    readonly description: string;
    readonly expectedTerminalState: 'PASS' | 'HUMAN_REQUIRED' | 'BLOCKED' | 'FAIL';
  }[];
  readonly authority: 'NONE';
  readonly executionPerformed: false;
}

export function createFhKuikaBlueprintWorkflowDraftV1(input: {
  readonly draftId: string;
  readonly repository: string;
  readonly exactRevision: string;
  readonly blueprint: FhKuikaPublishedBlueprintV1;
  readonly parameterValues: Readonly<Record<string, FhKuikaBlueprintParameterValue>>;
}): FhKuikaBlueprintWorkflowDraftV1 {
  requireText(input.draftId, 'draftId');
  requireText(input.repository, 'repository');
  requireText(input.exactRevision, 'exactRevision');

  const parameterValues = validateAndNormalizeParameters(
    input.blueprint.parameters,
    input.parameterValues,
  );

  return {
    schemaVersion: 1,
    draftId: input.draftId,
    repository: input.repository,
    exactRevision: input.exactRevision,
    blueprintId: input.blueprint.id,
    blueprintVersion: input.blueprint.version,
    blueprintHash: input.blueprint.blueprintHash,
    workflowTemplateRef: input.blueprint.workflowTemplateRef,
    defaultRiskTier: input.blueprint.defaultRiskTier,
    parameterValues,
    requiredRoles: [...input.blueprint.requiredRoles],
    requiredEvidence: [...input.blueprint.requiredEvidence],
    authoritySensitiveNodes: [...input.blueprint.authoritySensitiveNodes],
    authority: 'NONE',
    publishAuthorized: false,
    executionAuthorized: false,
  };
}

export function buildFhKuikaBlueprintSimulationPreviewV1(
  blueprint: FhKuikaPublishedBlueprintV1,
): FhKuikaBlueprintSimulationPreviewV1 {
  return {
    schemaVersion: 1,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    blueprintHash: blueprint.blueprintHash,
    workflowTemplateRef: blueprint.workflowTemplateRef,
    fixtures: blueprint.simulationFixtures.map((fixture) => ({ ...fixture })),
    authority: 'NONE',
    executionPerformed: false,
  };
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

function validateAndNormalizeParameters(
  definitions: readonly FhKuikaBlueprintParameterV1[],
  values: Readonly<Record<string, FhKuikaBlueprintParameterValue>>,
): Readonly<Record<string, FhKuikaBlueprintParameterValue>> {
  const known = new Map(definitions.map((definition) => [definition.id, definition]));

  for (const key of Object.keys(values)) {
    if (!known.has(key)) throw new Error(`unknown blueprint parameter: ${key}`);
  }

  const normalized: Record<string, FhKuikaBlueprintParameterValue> = {};
  for (const definition of [...definitions].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const supplied = values[definition.id];
    const value = supplied === undefined ? definition.defaultValue : supplied;

    if (value === undefined) {
      if (definition.required) {
        throw new Error(`required blueprint parameter is missing: ${definition.id}`);
      }
      continue;
    }

    if (!matchesType(definition.valueType, value)) {
      throw new Error(`blueprint parameter type mismatch: ${definition.id}`);
    }

    normalized[definition.id] = Array.isArray(value) ? [...value] : value;
  }

  return normalized;
}

function matchesType(
  type: FhKuikaBlueprintParameterV1['valueType'],
  value: FhKuikaBlueprintParameterValue,
): boolean {
  if (type === 'STRING') return typeof value === 'string';
  if (type === 'NUMBER') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'BOOLEAN') return typeof value === 'boolean';
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}
