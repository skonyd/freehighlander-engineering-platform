import type { FhKuikaPublishedBlueprintV1 } from './kuika-blueprint.js';

export interface FhKuikaBlueprintCardViewV1 {
  readonly id: string;
  readonly version: string;
  readonly purpose: string;
  readonly defaultRiskTier: FhKuikaPublishedBlueprintV1['defaultRiskTier'];
  readonly lifecycleStages: readonly string[];
  readonly requiredRoles: number;
  readonly requiredEvidence: number;
  readonly independentReviewRequired: boolean;
  readonly blueprintHash: string;
  readonly authority: 'NONE';
}

export interface FhKuikaBlueprintCatalogViewV1 {
  readonly schemaVersion: 1;
  readonly authority: 'NONE';
  readonly blueprints: readonly FhKuikaBlueprintCardViewV1[];
}

export interface FhKuikaBlueprintDetailViewV1 extends FhKuikaBlueprintCardViewV1 {
  readonly compatibleIntents: readonly FhKuikaPublishedBlueprintV1['compatibleIntents'][number][];
  readonly requiredRoleIds: readonly string[];
  readonly requiredEvidenceKinds: readonly string[];
  readonly independence: FhKuikaPublishedBlueprintV1['independence'];
  readonly workflowTemplateRef: string;
  readonly parameters: FhKuikaPublishedBlueprintV1['parameters'];
  readonly authoritySensitiveNodes: readonly string[];
  readonly validationRules: readonly string[];
  readonly simulationFixtures: FhKuikaPublishedBlueprintV1['simulationFixtures'];
}

export function buildFhKuikaBlueprintCatalogViewV1(
  blueprints: readonly FhKuikaPublishedBlueprintV1[],
): FhKuikaBlueprintCatalogViewV1 {
  return {
    schemaVersion: 1,
    authority: 'NONE',
    blueprints: [...blueprints]
      .map(toCard)
      .sort(
        (left, right) =>
          left.id.localeCompare(right.id) || right.version.localeCompare(left.version),
      ),
  };
}

export function buildFhKuikaBlueprintDetailViewV1(
  blueprint: FhKuikaPublishedBlueprintV1,
): FhKuikaBlueprintDetailViewV1 {
  return {
    ...toCard(blueprint),
    compatibleIntents: [...blueprint.compatibleIntents],
    requiredRoleIds: [...blueprint.requiredRoles],
    requiredEvidenceKinds: [...blueprint.requiredEvidence],
    independence: { ...blueprint.independence },
    workflowTemplateRef: blueprint.workflowTemplateRef,
    parameters: blueprint.parameters.map((item) => ({ ...item })),
    authoritySensitiveNodes: [...blueprint.authoritySensitiveNodes],
    validationRules: [...blueprint.validationRules],
    simulationFixtures: blueprint.simulationFixtures.map((item) => ({ ...item })),
  };
}

export function blueprintCatalogViewCanInvokeModel(): false {
  return false;
}

export function blueprintCatalogViewCanGrantAuthority(): false {
  return false;
}

export function blueprintCatalogViewCanMutateBlueprint(): false {
  return false;
}

function toCard(blueprint: FhKuikaPublishedBlueprintV1): FhKuikaBlueprintCardViewV1 {
  return {
    id: blueprint.id,
    version: blueprint.version,
    purpose: blueprint.purpose,
    defaultRiskTier: blueprint.defaultRiskTier,
    lifecycleStages: [...blueprint.lifecycleStages],
    requiredRoles: blueprint.requiredRoles.length,
    requiredEvidence: blueprint.requiredEvidence.length,
    independentReviewRequired: blueprint.independence.required,
    blueprintHash: blueprint.blueprintHash,
    authority: 'NONE',
  };
}
