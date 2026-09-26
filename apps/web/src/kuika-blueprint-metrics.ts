import type { FhKuikaPublishedBlueprintV1 } from './kuika-blueprint.js';

export type FhKuikaBlueprintUsageAction =
  'CATALOG_VIEW' | 'BLUEPRINT_VIEW' | 'MATCHED' | 'DRAFT_CREATED' | 'SIMULATION_COMPLETED';

export interface FhKuikaBlueprintUsageEventV1 {
  readonly schemaVersion: 1;
  readonly timestamp: string;
  readonly action: FhKuikaBlueprintUsageAction;
  readonly blueprintId?: string;
  readonly blueprintVersion?: string;
  readonly outcome?: 'PASS' | 'BLOCKED' | 'HUMAN_REQUIRED' | 'UNKNOWN';
  readonly authority: 'NONE';
}

export interface FhKuikaBlueprintCatalogQualityV1 {
  readonly schemaVersion: 1;
  readonly totalBlueprints: number;
  readonly uniqueIntents: number;
  readonly highOrCriticalBlueprints: number;
  readonly authoritySensitiveBlueprints: number;
  readonly totalRequiredRoles: number;
  readonly totalRequiredEvidenceKinds: number;
  readonly totalSimulationFixtures: number;
  readonly blueprintsWithPassFixture: number;
  readonly blueprintsWithBlockedFixture: number;
  readonly duplicateBlueprintHashes: number;
  readonly authority: 'NONE';
}

export interface FhKuikaBlueprintUsageByBlueprintV1 {
  readonly blueprintId: string;
  readonly views: number;
  readonly matches: number;
  readonly draftsCreated: number;
  readonly simulations: number;
  readonly simulationPasses: number;
  readonly simulationBlocks: number;
}

export interface FhKuikaBlueprintUsageSummaryV1 {
  readonly schemaVersion: 1;
  readonly catalogViews: number;
  readonly blueprintViews: number;
  readonly matches: number;
  readonly draftsCreated: number;
  readonly simulations: number;
  readonly simulationPasses: number;
  readonly simulationBlocks: number;
  readonly simulationHumanRequired: number;
  readonly byBlueprint: readonly FhKuikaBlueprintUsageByBlueprintV1[];
  readonly authority: 'NONE';
}

export function measureFhKuikaBlueprintCatalogV1(
  blueprints: readonly FhKuikaPublishedBlueprintV1[],
): FhKuikaBlueprintCatalogQualityV1 {
  const intents = new Set<string>();
  const roles = new Set<string>();
  const evidence = new Set<string>();
  const hashes = new Set<string>();
  let duplicateBlueprintHashes = 0;
  let highOrCriticalBlueprints = 0;
  let authoritySensitiveBlueprints = 0;
  let totalSimulationFixtures = 0;
  let blueprintsWithPassFixture = 0;
  let blueprintsWithBlockedFixture = 0;

  for (const blueprint of blueprints) {
    for (const intent of blueprint.compatibleIntents) intents.add(intent);
    for (const role of blueprint.requiredRoles) roles.add(role);
    for (const kind of blueprint.requiredEvidence) evidence.add(kind);

    if (blueprint.defaultRiskTier === 'HIGH' || blueprint.defaultRiskTier === 'CRITICAL') {
      highOrCriticalBlueprints += 1;
    }
    if (blueprint.authoritySensitiveNodes.length > 0) {
      authoritySensitiveBlueprints += 1;
    }

    totalSimulationFixtures += blueprint.simulationFixtures.length;
    if (blueprint.simulationFixtures.some((fixture) => fixture.expectedTerminalState === 'PASS')) {
      blueprintsWithPassFixture += 1;
    }
    if (
      blueprint.simulationFixtures.some((fixture) => fixture.expectedTerminalState === 'BLOCKED')
    ) {
      blueprintsWithBlockedFixture += 1;
    }

    if (hashes.has(blueprint.blueprintHash)) {
      duplicateBlueprintHashes += 1;
    }
    hashes.add(blueprint.blueprintHash);
  }

  return {
    schemaVersion: 1,
    totalBlueprints: blueprints.length,
    uniqueIntents: intents.size,
    highOrCriticalBlueprints,
    authoritySensitiveBlueprints,
    totalRequiredRoles: roles.size,
    totalRequiredEvidenceKinds: evidence.size,
    totalSimulationFixtures,
    blueprintsWithPassFixture,
    blueprintsWithBlockedFixture,
    duplicateBlueprintHashes,
    authority: 'NONE',
  };
}

export function aggregateFhKuikaBlueprintUsageV1(
  events: readonly FhKuikaBlueprintUsageEventV1[],
): FhKuikaBlueprintUsageSummaryV1 {
  let catalogViews = 0;
  let blueprintViews = 0;
  let matches = 0;
  let draftsCreated = 0;
  let simulations = 0;
  let simulationPasses = 0;
  let simulationBlocks = 0;
  let simulationHumanRequired = 0;
  const byBlueprint = new Map<
    string,
    {
      views: number;
      matches: number;
      draftsCreated: number;
      simulations: number;
      simulationPasses: number;
      simulationBlocks: number;
    }
  >();

  for (const event of events) {
    validateUsageEvent(event);

    if (event.action === 'CATALOG_VIEW') {
      catalogViews += 1;
      continue;
    }

    const blueprintId = event.blueprintId as string;
    const current = byBlueprint.get(blueprintId) ?? {
      views: 0,
      matches: 0,
      draftsCreated: 0,
      simulations: 0,
      simulationPasses: 0,
      simulationBlocks: 0,
    };

    switch (event.action) {
      case 'BLUEPRINT_VIEW':
        blueprintViews += 1;
        current.views += 1;
        break;
      case 'MATCHED':
        matches += 1;
        current.matches += 1;
        break;
      case 'DRAFT_CREATED':
        draftsCreated += 1;
        current.draftsCreated += 1;
        break;
      case 'SIMULATION_COMPLETED':
        simulations += 1;
        current.simulations += 1;
        if (event.outcome === 'PASS') {
          simulationPasses += 1;
          current.simulationPasses += 1;
        } else if (event.outcome === 'BLOCKED') {
          simulationBlocks += 1;
          current.simulationBlocks += 1;
        } else if (event.outcome === 'HUMAN_REQUIRED') {
          simulationHumanRequired += 1;
        }
        break;
    }

    byBlueprint.set(blueprintId, current);
  }

  return {
    schemaVersion: 1,
    catalogViews,
    blueprintViews,
    matches,
    draftsCreated,
    simulations,
    simulationPasses,
    simulationBlocks,
    simulationHumanRequired,
    byBlueprint: [...byBlueprint.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([blueprintId, value]) => ({
        blueprintId,
        ...value,
      })),
    authority: 'NONE',
  };
}

export function fhKuikaBlueprintMetricsCanInvokeModel(): false {
  return false;
}

export function fhKuikaBlueprintMetricsCanMutateRuntime(): false {
  return false;
}

export function fhKuikaBlueprintMetricsCanGrantAuthority(): false {
  return false;
}

function validateUsageEvent(event: FhKuikaBlueprintUsageEventV1): void {
  if (event.schemaVersion !== 1) {
    throw new Error('blueprint usage schemaVersion must be 1');
  }
  if (event.authority !== 'NONE') {
    throw new Error('blueprint usage event authority must be NONE');
  }
  if (Number.isNaN(Date.parse(event.timestamp))) {
    throw new Error('blueprint usage event timestamp must be valid');
  }

  if (event.action !== 'CATALOG_VIEW') {
    if (!event.blueprintId?.trim()) {
      throw new Error('blueprint usage event requires blueprintId');
    }
    if (!event.blueprintVersion?.match(/^\d+\.\d+\.\d+$/)) {
      throw new Error('blueprint usage event requires semantic blueprintVersion');
    }
  }

  if (event.action === 'SIMULATION_COMPLETED' && event.outcome === undefined) {
    throw new Error('simulation usage event requires outcome');
  }
}
