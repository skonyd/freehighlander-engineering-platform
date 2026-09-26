import { createHash } from 'node:crypto';

export type FhKuikaBlueprintIntent =
  | 'FEATURE_IMPLEMENTATION'
  | 'BUG_FIX'
  | 'SECURITY_PATCH'
  | 'DEPENDENCY_UPGRADE'
  | 'DATABASE_MIGRATION'
  | 'REFACTOR'
  | 'RELEASE_PREPARATION'
  | 'HOTFIX'
  | 'INCIDENT_RESPONSE'
  | 'PERFORMANCE_REGRESSION'
  | 'PROVIDER_MODEL_MIGRATION'
  | 'ARCHITECTURE_CHANGE';

export type FhKuikaBlueprintRiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface FhKuikaBlueprintParameterV1 {
  readonly id: string;
  readonly description: string;
  readonly required: boolean;
  readonly valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'STRING_LIST';
  readonly defaultValue?: string | number | boolean | readonly string[];
}

export interface FhKuikaBlueprintIndependenceV1 {
  readonly required: boolean;
  readonly minimumDistinctReviewers: number;
  readonly forbiddenSelfReview: boolean;
}

export interface FhKuikaBlueprintSimulationFixtureV1 {
  readonly id: string;
  readonly description: string;
  readonly expectedTerminalState: 'PASS' | 'HUMAN_REQUIRED' | 'BLOCKED' | 'FAIL';
}

export interface FhKuikaBlueprintDraftV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly purpose: string;
  readonly compatibleIntents: readonly FhKuikaBlueprintIntent[];
  readonly defaultRiskTier: FhKuikaBlueprintRiskTier;
  readonly lifecycleStages: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly requiredRoles: readonly string[];
  readonly independence: FhKuikaBlueprintIndependenceV1;
  readonly workflowTemplateRef: string;
  readonly parameters: readonly FhKuikaBlueprintParameterV1[];
  readonly authoritySensitiveNodes: readonly string[];
  readonly validationRules: readonly string[];
  readonly simulationFixtures: readonly FhKuikaBlueprintSimulationFixtureV1[];
  readonly status: 'DRAFT';
  readonly authority: 'NONE';
}

export interface FhKuikaPublishedBlueprintV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly purpose: string;
  readonly compatibleIntents: readonly FhKuikaBlueprintIntent[];
  readonly defaultRiskTier: FhKuikaBlueprintRiskTier;
  readonly lifecycleStages: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly requiredRoles: readonly string[];
  readonly independence: FhKuikaBlueprintIndependenceV1;
  readonly workflowTemplateRef: string;
  readonly parameters: readonly FhKuikaBlueprintParameterV1[];
  readonly authoritySensitiveNodes: readonly string[];
  readonly validationRules: readonly string[];
  readonly simulationFixtures: readonly FhKuikaBlueprintSimulationFixtureV1[];
  readonly status: 'PUBLISHED';
  readonly authority: 'NONE';
  readonly blueprintHash: string;
}

const SEMVER = /^\d+\.\d+\.\d+$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const FORBIDDEN_PARAMETER_IDS = new Set([
  'authority',
  'authority-level',
  'authority-override',
  'policy',
  'policy-override',
  'system-policy',
  'risk-override',
  'skip-approval',
  'bypass-gate',
  'disable-evidence',
  'allow-self-review',
]);

export function validateFhKuikaBlueprintDraftV1(input: FhKuikaBlueprintDraftV1): void {
  if (input.schemaVersion !== 1) throw new Error('blueprint schemaVersion must be 1');
  requireId(input.id, 'blueprint id');
  if (!SEMVER.test(input.version)) throw new Error('blueprint version must be semantic x.y.z');
  requireText(input.purpose, 'blueprint purpose');
  if (input.status !== 'DRAFT') throw new Error('blueprint draft status must be DRAFT');
  if (input.authority !== 'NONE') throw new Error('blueprint authority must be NONE');

  requireUniqueNonEmpty(input.compatibleIntents, 'compatible intent');
  requireUniqueNonEmpty(input.lifecycleStages, 'lifecycle stage');
  requireUniqueNonEmpty(input.requiredEvidence, 'required evidence');
  requireUniqueNonEmpty(input.requiredRoles, 'required role');
  requireText(input.workflowTemplateRef, 'workflowTemplateRef');
  requireUniqueNonEmpty(input.authoritySensitiveNodes, 'authority-sensitive node');
  requireUniqueNonEmpty(input.validationRules, 'validation rule');

  if (
    !Number.isInteger(input.independence.minimumDistinctReviewers) ||
    input.independence.minimumDistinctReviewers < 0
  ) {
    throw new Error('minimumDistinctReviewers must be a non-negative integer');
  }
  if (input.independence.required && input.independence.minimumDistinctReviewers < 1) {
    throw new Error('required independence needs at least one distinct reviewer');
  }
  if (input.independence.required && !input.independence.forbiddenSelfReview) {
    throw new Error('required independence must forbid self review');
  }

  const parameterIds = new Set<string>();
  for (const parameter of input.parameters) {
    requireId(parameter.id, 'parameter id');
    if (parameterIds.has(parameter.id)) throw new Error('blueprint parameter ids must be unique');
    parameterIds.add(parameter.id);
    requireText(parameter.description, 'parameter description');

    if (FORBIDDEN_PARAMETER_IDS.has(parameter.id)) {
      throw new Error('blueprint parameters cannot override authority or policy');
    }

    if (parameter.defaultValue !== undefined) {
      validateDefaultValue(parameter);
    }
  }

  const fixtureIds = new Set<string>();
  for (const fixture of input.simulationFixtures) {
    requireId(fixture.id, 'simulation fixture id');
    if (fixtureIds.has(fixture.id)) throw new Error('simulation fixture ids must be unique');
    fixtureIds.add(fixture.id);
    requireText(fixture.description, 'simulation fixture description');
  }
}

export function publishFhKuikaBlueprintV1(
  input: FhKuikaBlueprintDraftV1,
): FhKuikaPublishedBlueprintV1 {
  validateFhKuikaBlueprintDraftV1(input);

  const normalized = {
    schemaVersion: 1 as const,
    id: input.id,
    version: input.version,
    purpose: input.purpose.trim(),
    compatibleIntents: sortedUnique(input.compatibleIntents),
    defaultRiskTier: input.defaultRiskTier,
    lifecycleStages: normalizedStrings(input.lifecycleStages),
    requiredEvidence: normalizedStrings(input.requiredEvidence),
    requiredRoles: normalizedStrings(input.requiredRoles),
    independence: {
      required: input.independence.required,
      minimumDistinctReviewers: input.independence.minimumDistinctReviewers,
      forbiddenSelfReview: input.independence.forbiddenSelfReview,
    },
    workflowTemplateRef: input.workflowTemplateRef.trim(),
    parameters: [...input.parameters]
      .map((parameter) => ({
        id: parameter.id,
        description: parameter.description.trim(),
        required: parameter.required,
        valueType: parameter.valueType,
        ...(parameter.defaultValue === undefined
          ? {}
          : { defaultValue: cloneDefaultValue(parameter.defaultValue) }),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    authoritySensitiveNodes: normalizedStrings(input.authoritySensitiveNodes),
    validationRules: normalizedStrings(input.validationRules),
    simulationFixtures: [...input.simulationFixtures]
      .map((fixture) => ({
        id: fixture.id,
        description: fixture.description.trim(),
        expectedTerminalState: fixture.expectedTerminalState,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    status: 'PUBLISHED' as const,
    authority: 'NONE' as const,
  };

  const blueprintHash = createHash('sha256')
    .update(stableJson(normalized))
    .digest('hex');

  return deepFreeze({
    ...normalized,
    blueprintHash,
  });
}

export function blueprintPublicationCanGrantAuthority(): false {
  return false;
}

export function blueprintSuggestionCanModifyPublishedBlueprint(): false {
  return false;
}

function validateDefaultValue(parameter: FhKuikaBlueprintParameterV1): void {
  const value = parameter.defaultValue;
  const valid =
    (parameter.valueType === 'STRING' && typeof value === 'string') ||
    (parameter.valueType === 'NUMBER' && typeof value === 'number' && Number.isFinite(value)) ||
    (parameter.valueType === 'BOOLEAN' && typeof value === 'boolean') ||
    (parameter.valueType === 'STRING_LIST' &&
      Array.isArray(value) &&
      value.every((entry) => typeof entry === 'string'));

  if (!valid) throw new Error('parameter defaultValue does not match valueType');
}

function requireId(value: string, field: string): void {
  if (!ID.test(value)) throw new Error(field + ' must use lowercase kebab-case');
}

function requireText(value: string, field: string): void {
  if (!value.trim()) throw new Error(field + ' is required');
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (!values.length) throw new Error(field + ' list must not be empty');
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => !value)) throw new Error(field + ' must not be empty');
  if (new Set(normalized).size !== normalized.length) throw new Error(field + ' values must be unique');
}

function normalizedStrings(values: readonly string[]): readonly string[] {
  return [...values].map((value) => value.trim()).sort((a, b) => a.localeCompare(b));
}

function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function cloneDefaultValue(
  value: string | number | boolean | readonly string[],
): string | number | boolean | readonly string[] {
  return Array.isArray(value) ? [...value] : value;
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
