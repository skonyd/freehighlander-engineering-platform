export type ToolCatalogEconomyProfile = 'SMALL' | 'MEDIUM' | 'LARGE';

export interface ToolSchemaDescriptor {
  readonly id: string;
  readonly namespace: string;
  readonly keywords: readonly string[];
  readonly estimatedSchemaTokens: number;
  readonly core?: boolean;
}

export interface LazyToolExposurePlan {
  readonly schemaVersion: 1;
  readonly profile: ToolCatalogEconomyProfile;
  readonly initialSchemaToolIds: readonly string[];
  readonly indexedToolIds: readonly string[];
  readonly requiresDiscovery: boolean;
  readonly totalCatalogSchemaTokens: number;
  readonly initialSchemaTokens: number;
  readonly estimatedInitialTokensAvoided: number;
  readonly authority: 'NONE';
}

export interface ToolSchemaActivationResult {
  readonly schemaVersion: 1;
  readonly activatedToolIds: readonly string[];
  readonly matchedToolIds: readonly string[];
  readonly estimatedActivatedSchemaTokens: number;
  readonly authority: 'NONE';
}

export function buildLazyToolExposurePlan(
  tools: readonly ToolSchemaDescriptor[],
): LazyToolExposurePlan {
  const normalized = normalizeTools(tools);
  const profile = classifyCatalog(normalized.length);
  const initialSchemaToolIds =
    profile === 'SMALL'
      ? normalized.map((tool) => tool.id)
      : normalized.filter((tool) => tool.core === true).map((tool) => tool.id);
  const indexedToolIds =
    profile === 'SMALL'
      ? []
      : normalized.filter((tool) => !initialSchemaToolIds.includes(tool.id)).map((tool) => tool.id);

  const totalCatalogSchemaTokens = normalized.reduce(
    (total, tool) => total + tool.estimatedSchemaTokens,
    0,
  );
  const initialSchemaTokens = normalized
    .filter((tool) => initialSchemaToolIds.includes(tool.id))
    .reduce((total, tool) => total + tool.estimatedSchemaTokens, 0);

  return {
    schemaVersion: 1,
    profile,
    initialSchemaToolIds,
    indexedToolIds,
    requiresDiscovery: profile !== 'SMALL',
    totalCatalogSchemaTokens,
    initialSchemaTokens,
    estimatedInitialTokensAvoided: totalCatalogSchemaTokens - initialSchemaTokens,
    authority: 'NONE',
  };
}

export function activateToolSchemas(
  tools: readonly ToolSchemaDescriptor[],
  plan: LazyToolExposurePlan,
  query: string,
  maxActivated: number,
): ToolSchemaActivationResult {
  const normalized = normalizeTools(tools);
  validatePlan(plan, normalized);

  if (!Number.isInteger(maxActivated) || maxActivated < 1) {
    throw new Error('maxActivated must be an integer >= 1');
  }

  if (plan.profile === 'SMALL') {
    const initial = [...plan.initialSchemaToolIds];
    return {
      schemaVersion: 1,
      activatedToolIds: initial,
      matchedToolIds: initial,
      estimatedActivatedSchemaTokens: plan.initialSchemaTokens,
      authority: 'NONE',
    };
  }

  const terms = tokenize(query);
  if (terms.length === 0) {
    return {
      schemaVersion: 1,
      activatedToolIds: [...plan.initialSchemaToolIds],
      matchedToolIds: [],
      estimatedActivatedSchemaTokens: plan.initialSchemaTokens,
      authority: 'NONE',
    };
  }

  const byId = new Map(normalized.map((tool) => [tool.id, tool]));
  const matches = plan.indexedToolIds
    .map((id) => {
      const tool = byId.get(id)!;
      return { tool, score: scoreTool(tool, terms) };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.tool.id.localeCompare(right.tool.id))
    .slice(0, maxActivated);

  const matchedToolIds = matches.map((item) => item.tool.id);
  const activatedToolIds = [...new Set([...plan.initialSchemaToolIds, ...matchedToolIds])].sort();
  const estimatedActivatedSchemaTokens = activatedToolIds.reduce(
    (total, id) => total + byId.get(id)!.estimatedSchemaTokens,
    0,
  );

  return {
    schemaVersion: 1,
    activatedToolIds,
    matchedToolIds,
    estimatedActivatedSchemaTokens,
    authority: 'NONE',
  };
}

export function lazyToolSchemaLoadingCanGrantAuthority(): false {
  return false;
}

export function lazyToolSchemaLoadingCanHideRequiredCoreTools(): false {
  return false;
}

function classifyCatalog(count: number): ToolCatalogEconomyProfile {
  if (count <= 8) return 'SMALL';
  if (count <= 32) return 'MEDIUM';
  return 'LARGE';
}

function normalizeTools(tools: readonly ToolSchemaDescriptor[]): readonly ToolSchemaDescriptor[] {
  if (tools.length === 0) throw new Error('tool catalog requires at least one tool');

  const normalized = tools
    .map((tool) => {
      const id = normalizeText(tool.id, 'tool id');
      const namespace = normalizeText(tool.namespace, `tool ${id} namespace`).toLowerCase();
      if (!Number.isInteger(tool.estimatedSchemaTokens) || tool.estimatedSchemaTokens < 0) {
        throw new Error(`tool ${id} estimatedSchemaTokens must be a non-negative integer`);
      }
      const keywords = [...new Set(tool.keywords.map((keyword) => normalizeText(keyword, 'keyword').toLowerCase()))].sort();

      return {
        id,
        namespace,
        keywords,
        estimatedSchemaTokens: tool.estimatedSchemaTokens,
        ...(tool.core === true ? { core: true } : {}),
      } satisfies ToolSchemaDescriptor;
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const seen = new Set<string>();
  for (const tool of normalized) {
    if (seen.has(tool.id)) throw new Error(`duplicate tool id: ${tool.id}`);
    seen.add(tool.id);
  }
  return normalized;
}

function validatePlan(
  plan: LazyToolExposurePlan,
  tools: readonly ToolSchemaDescriptor[],
): void {
  if (plan.schemaVersion !== 1) throw new Error('tool exposure plan schemaVersion must be 1');
  if (plan.authority !== 'NONE') throw new Error('tool exposure plan authority must be NONE');

  const rebuilt = buildLazyToolExposurePlan(tools);
  if (JSON.stringify(rebuilt) !== JSON.stringify(plan)) {
    throw new Error('tool exposure plan does not match current catalog');
  }
}

function tokenize(query: string): readonly string[] {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9._:-]+/).filter(Boolean))].sort();
}

function scoreTool(tool: ToolSchemaDescriptor, terms: readonly string[]): number {
  let score = 0;
  for (const term of terms) {
    if (tool.id.toLowerCase() === term) score += 100;
    else if (tool.id.toLowerCase().includes(term)) score += 40;

    if (tool.namespace === term) score += 30;
    else if (tool.namespace.includes(term)) score += 15;

    if (tool.keywords.includes(term)) score += 20;
    else if (tool.keywords.some((keyword) => keyword.includes(term) || term.includes(keyword))) {
      score += 8;
    }
  }
  return score;
}

function normalizeText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}
