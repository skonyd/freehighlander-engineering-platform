export type CoreHomeSystemState = 'HEALTHY' | 'DEGRADED' | 'ATTENTION' | 'UNKNOWN';

export type CoreHomeWorkState =
  | 'PLANNING'
  | 'IMPLEMENTING'
  | 'TESTING'
  | 'SECURITY_REVIEW'
  | 'REVIEW'
  | 'WAITING_HUMAN'
  | 'WAITING_PROVIDER'
  | 'BLOCKED'
  | 'COMPLETE'
  | 'FAILED'
  | 'UNKNOWN';

export type CoreHomeAttentionKind =
  | 'HUMAN_APPROVAL'
  | 'RUNTIME_ERROR'
  | 'PROVIDER_FALLBACK'
  | 'QUOTA_WAIT'
  | 'BUDGET_WARNING'
  | 'BLOCKED_WORK'
  | 'SECURITY_FINDING'
  | 'CONTINUITY_RISK'
  | 'CI_FAILURE';

export type CoreHomeAttentionSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type CoreHomeUsageWindowKind =
  'TODAY' | 'LAST_24H' | 'LAST_7D' | 'CURRENT_RUN' | 'CURRENT_PROJECT';

export type CoreHomeBindingState = 'ACTIVE' | 'FALLBACK_ACTIVE' | 'UNAVAILABLE' | 'UNKNOWN';

export interface CoreHomeEconomyRoleEligibilityView {
  readonly logicalRole: string;
  readonly riskTier: 'NORMAL' | 'HIGH' | 'CRITICAL';
  readonly eligible: boolean;
  readonly reason: string | null;
}

export interface CoreHomeEconomyView {
  readonly mode: 'STANDARD' | 'TOKEN_ECONOMY' | 'UNKNOWN';
  readonly optimizerBindingId: string | null;
  readonly optimizerModelId: string | null;
  readonly remoteTokenTarget: number | null;
  readonly candidateRemoteInputTokens: number | null;
  readonly finalRemoteInputTokens: number | null;
  readonly remoteOutputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly reductionStages: readonly string[];
  readonly protectedContentCount: number | null;
  readonly localOptimizationDurationMs: number | null;
  readonly remoteTokenSavingRatio: number | null;
  readonly bypassReason: string | null;
  readonly roleEligibility: readonly CoreHomeEconomyRoleEligibilityView[];
  readonly observedAt: string | null;
  readonly authority: 'NONE';
}

export interface CoreHomeFreshness {
  readonly generatedAt: string;
  readonly sqliteUpdatedAt?: string;
  readonly providerStateUpdatedAt?: string;
  readonly continuityUpdatedAt?: string;
  readonly externalCiUpdatedAt?: string;
  readonly staleSources: readonly string[];
}

export interface CoreHomeProjectContextView {
  readonly repository: string | null;
  readonly projectId: string | null;
  readonly branch: string | null;
  readonly headSha: string | null;
}

export interface CoreHomeAuthoritySummaryView {
  readonly v3Authority: 'SHADOW_ONLY' | 'ENABLED' | 'UNKNOWN';
  readonly projectionAuthority: 'NONE';
}

export interface CoreHomeSystemHealthView {
  readonly state: CoreHomeSystemState;
  readonly database: CoreHomeSystemState;
  readonly providers: CoreHomeSystemState;
  readonly continuity: CoreHomeSystemState;
  readonly criticalErrorCount: number;
}

export interface CoreHomeCurrentWorkView {
  readonly classificationVersion: 1;
  readonly runId: string;
  readonly workItemId: string | null;
  readonly workflowId: string | null;
  readonly workflowVersion: string | null;
  readonly nodeId: string | null;
  readonly state: CoreHomeWorkState;
  readonly label: string;
  readonly humanRequired: boolean;
  readonly updatedAt: string;
}

export interface CoreHomeAttentionItemV1 {
  readonly id: string;
  readonly kind: CoreHomeAttentionKind;
  readonly severity: CoreHomeAttentionSeverity;
  readonly headline: string;
  readonly source: string;
  readonly occurredAt: string;
  readonly runId?: string;
  readonly workItemId?: string;
  readonly correlationId?: string;
  readonly nextAction?: string;
  readonly authority: 'NONE';
}

export interface CoreHomeAttentionSummaryView {
  readonly total: number;
  readonly critical: number;
  readonly errors: number;
  readonly warnings: number;
  readonly items: readonly CoreHomeAttentionItemV1[];
}

export interface CoreHomeUsageWindowView {
  readonly window: CoreHomeUsageWindowKind;
  readonly modelCalls: number;
  readonly totalTokens: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly estimatedCostUsd: number;
  readonly actualCostUsd: number;
  readonly retries: number;
  readonly fallbacks: number;
}

export interface CoreHomeRoleBindingHealthView {
  readonly logicalRole: string;
  readonly state: CoreHomeBindingState;
  readonly preferredBindingId: string | null;
  readonly preferredModel: string | null;
  readonly activeBindingId: string | null;
  readonly activeModel: string | null;
  readonly providerId: string | null;
  readonly failureKind?: string;
  readonly nextCheckAt?: string;
  readonly returnPolicy?: 'STAY_ON_FALLBACK' | 'ASK_BEFORE_RETURN' | 'AUTO_RETURN';
}

export interface CoreHomeRecentRunView {
  readonly runId: string;
  readonly status: string | null;
  readonly workflowId: string | null;
  readonly workflowVersion: string | null;
  readonly branch: string | null;
  readonly headSha: string | null;
  readonly humanRequired: boolean;
  readonly lastTimestamp: string;
}

export interface CoreHomeContinuitySummaryView {
  readonly state: CoreHomeSystemState;
  readonly latestCheckpointAt: string | null;
  readonly resumeReady: boolean | null;
  readonly sourceRevision: string | null;
  readonly warning: string | null;
}

export interface CoreHomeFindingSummaryView {
  readonly state: CoreHomeSystemState;
  readonly critical: number;
  readonly high: number;
  readonly unresolved: number;
  readonly latestFindingAt: string | null;
}

export interface CoreHomeSnapshotV1 {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly projectionAuthority: 'NONE';
  readonly sourceFreshness: CoreHomeFreshness;
  readonly project: CoreHomeProjectContextView;
  readonly authority: CoreHomeAuthoritySummaryView;
  readonly system: CoreHomeSystemHealthView;
  readonly currentWork: CoreHomeCurrentWorkView | null;
  readonly attention: CoreHomeAttentionSummaryView;
  readonly usage: CoreHomeUsageWindowView;
  readonly economy: CoreHomeEconomyView;
  readonly roleBindings: readonly CoreHomeRoleBindingHealthView[];
  readonly recentRuns: readonly CoreHomeRecentRunView[];
  readonly continuity: CoreHomeContinuitySummaryView;
  readonly findings: CoreHomeFindingSummaryView;
}

export type CoreHomeSnapshotInput = Omit<
  CoreHomeSnapshotV1,
  'schemaVersion' | 'projectionAuthority' | 'authority'
> & {
  readonly authority: Omit<CoreHomeAuthoritySummaryView, 'projectionAuthority'>;
};

export function createCoreHomeSnapshotV1(input: CoreHomeSnapshotInput): CoreHomeSnapshotV1 {
  assertTimestamp(input.generatedAt, 'generatedAt');
  assertTimestamp(input.sourceFreshness.generatedAt, 'sourceFreshness.generatedAt');

  if (input.generatedAt !== input.sourceFreshness.generatedAt) {
    throw new Error('Core Home snapshot generatedAt must match source freshness generatedAt');
  }

  assertNonNegativeInteger(input.system.criticalErrorCount, 'system.criticalErrorCount');
  assertAttentionSummary(input.attention);
  assertUsage(input.usage);
  assertEconomy(input.economy);
  assertFindingSummary(input.findings);

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    projectionAuthority: 'NONE',
    sourceFreshness: {
      ...input.sourceFreshness,
      staleSources: uniqueSortedNonEmpty(input.sourceFreshness.staleSources, 'stale source'),
    },
    project: input.project,
    authority: {
      ...input.authority,
      projectionAuthority: 'NONE',
    },
    system: input.system,
    currentWork: input.currentWork,
    attention: {
      ...input.attention,
      items: [...input.attention.items],
    },
    usage: input.usage,
    economy: {
      ...input.economy,
      reductionStages: [...input.economy.reductionStages],
      roleEligibility: input.economy.roleEligibility.map((entry) => ({ ...entry })),
      authority: 'NONE',
    },
    roleBindings: [...input.roleBindings],
    recentRuns: [...input.recentRuns],
    continuity: input.continuity,
    findings: input.findings,
  };
}

export function dashboardRefreshCanInvokeModel(): false {
  return false;
}

export function coreHomeSnapshotCanGrantAuthority(): false {
  return false;
}

export function coreHomeSnapshotCanMutateState(): false {
  return false;
}

function assertAttentionSummary(value: CoreHomeAttentionSummaryView): void {
  for (const [name, count] of [
    ['attention.total', value.total],
    ['attention.critical', value.critical],
    ['attention.errors', value.errors],
    ['attention.warnings', value.warnings],
  ] as const) {
    assertNonNegativeInteger(count, name);
  }

  if (value.total !== value.items.length) {
    throw new Error('attention.total must match attention.items length');
  }

  const ids = new Set<string>();
  for (const item of value.items) {
    if (!item.id.trim()) throw new Error('attention item id is required');
    if (ids.has(item.id)) throw new Error('attention item ids must be unique');
    ids.add(item.id);
    if (!item.headline.trim()) throw new Error('attention headline is required');
    if (!item.source.trim()) throw new Error('attention source is required');
    assertTimestamp(item.occurredAt, 'attention.occurredAt');
    if (item.authority !== 'NONE') throw new Error('attention authority must be NONE');
  }
}

function assertUsage(value: CoreHomeUsageWindowView): void {
  for (const [name, count] of [
    ['usage.modelCalls', value.modelCalls],
    ['usage.totalTokens', value.totalTokens],
    ['usage.inputTokens', value.inputTokens],
    ['usage.cachedInputTokens', value.cachedInputTokens],
    ['usage.outputTokens', value.outputTokens],
    ['usage.reasoningTokens', value.reasoningTokens],
    ['usage.retries', value.retries],
    ['usage.fallbacks', value.fallbacks],
  ] as const) {
    assertNonNegativeInteger(count, name);
  }

  for (const [name, amount] of [
    ['usage.estimatedCostUsd', value.estimatedCostUsd],
    ['usage.actualCostUsd', value.actualCostUsd],
  ] as const) {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`${name} must be a non-negative finite number`);
    }
  }
}

function assertEconomy(value: CoreHomeEconomyView): void {
  if (!['STANDARD', 'TOKEN_ECONOMY', 'UNKNOWN'].includes(value.mode)) {
    throw new Error('economy.mode is invalid');
  }
  if (value.authority !== 'NONE') throw new Error('economy authority must be NONE');

  for (const [name, count] of [
    ['economy.remoteTokenTarget', value.remoteTokenTarget],
    ['economy.candidateRemoteInputTokens', value.candidateRemoteInputTokens],
    ['economy.finalRemoteInputTokens', value.finalRemoteInputTokens],
    ['economy.remoteOutputTokens', value.remoteOutputTokens],
    ['economy.cachedInputTokens', value.cachedInputTokens],
    ['economy.protectedContentCount', value.protectedContentCount],
    ['economy.localOptimizationDurationMs', value.localOptimizationDurationMs],
  ] as const) {
    if (count !== null) assertNonNegativeInteger(count, name);
  }

  if (
    value.remoteTokenSavingRatio !== null &&
    (!Number.isFinite(value.remoteTokenSavingRatio) ||
      value.remoteTokenSavingRatio < 0 ||
      value.remoteTokenSavingRatio > 1)
  ) {
    throw new Error('economy.remoteTokenSavingRatio must be between 0 and 1');
  }

  if (value.observedAt !== null) assertTimestamp(value.observedAt, 'economy.observedAt');

  const stages = uniqueSortedNonEmpty(value.reductionStages, 'economy reduction stage');
  if (stages.length !== value.reductionStages.length) {
    throw new Error('economy reduction stages must be unique');
  }

  const roles = new Set<string>();
  for (const entry of value.roleEligibility) {
    if (!entry.logicalRole.trim()) throw new Error('economy role logicalRole is required');
    if (!['NORMAL', 'HIGH', 'CRITICAL'].includes(entry.riskTier)) {
      throw new Error('economy role riskTier is invalid');
    }
    const key = entry.logicalRole + ':' + entry.riskTier;
    if (roles.has(key)) throw new Error('economy role eligibility entries must be unique');
    roles.add(key);
  }
}

function assertFindingSummary(value: CoreHomeFindingSummaryView): void {
  for (const [name, count] of [
    ['findings.critical', value.critical],
    ['findings.high', value.high],
    ['findings.unresolved', value.unresolved],
  ] as const) {
    assertNonNegativeInteger(count, name);
  }

  if (value.latestFindingAt !== null) {
    assertTimestamp(value.latestFindingAt, 'findings.latestFindingAt');
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function assertTimestamp(value: string, name: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be a valid timestamp`);
  }
}

function uniqueSortedNonEmpty(values: readonly string[], name: string): readonly string[] {
  const result = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) throw new Error(`${name} must not be empty`);
    result.add(normalized);
  }
  return [...result].sort();
}
