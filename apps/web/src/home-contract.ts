export type CoreHomeAuthorityMode = 'SHADOW_ONLY' | 'ENABLED' | 'UNKNOWN';

export type CoreHomeSystemHealth = 'HEALTHY' | 'DEGRADED' | 'ATTENTION' | 'UNKNOWN';

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

export type CoreHomeBindingState = 'ACTIVE' | 'FALLBACK_ACTIVE' | 'UNAVAILABLE' | 'UNKNOWN';

export interface CoreHomeFreshnessV1 {
  readonly generatedAt: string;
  readonly sqliteUpdatedAt?: string;
  readonly providerStateUpdatedAt?: string;
  readonly continuityUpdatedAt?: string;
  readonly externalCiUpdatedAt?: string;
  readonly staleSources: readonly string[];
}

export interface CoreHomeProjectContextViewV1 {
  readonly repository: string | null;
  readonly branch: string | null;
  readonly exactRevision: string | null;
}

export interface CoreHomeAuthoritySummaryViewV1 {
  readonly v3Authority: CoreHomeAuthorityMode;
  readonly authority: 'NONE';
}

export interface CoreHomeSystemHealthViewV1 {
  readonly state: CoreHomeSystemHealth;
  readonly databaseReady: boolean;
  readonly unresolvedCriticalErrors: number;
  readonly degradedSources: readonly string[];
}

export interface CoreHomeCurrentWorkViewV1 {
  readonly runId: string;
  readonly workItemId?: string;
  readonly workflowId?: string;
  readonly workflowVersion?: string;
  readonly nodeId?: string;
  readonly state: CoreHomeWorkState;
  readonly label: string;
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

export interface CoreHomeAttentionSummaryViewV1 {
  readonly total: number;
  readonly critical: number;
  readonly error: number;
  readonly warning: number;
  readonly items: readonly CoreHomeAttentionItemV1[];
}

export interface CoreHomeUsageWindowViewV1 {
  readonly window: 'TODAY' | 'LAST_24_HOURS' | 'LAST_7_DAYS' | 'CURRENT_RUN' | 'CURRENT_PROJECT';
  readonly modelCalls: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  readonly actualCostUsd: number;
  readonly retries: number;
  readonly fallbacks: number;
}

export interface CoreHomeRoleBindingHealthViewV1 {
  readonly logicalRole: string;
  readonly preferredBindingId: string | null;
  readonly preferredModel: string | null;
  readonly activeBindingId: string | null;
  readonly activeModel: string | null;
  readonly state: CoreHomeBindingState;
  readonly nextCheckAt?: string;
  readonly returnPolicy?: 'STAY_ON_FALLBACK' | 'ASK_BEFORE_RETURN' | 'AUTO_RETURN';
}

export interface CoreHomeRecentRunViewV1 {
  readonly runId: string;
  readonly status: string | null;
  readonly workflowId: string | null;
  readonly workflowVersion: string | null;
  readonly branch: string | null;
  readonly exactRevision: string | null;
  readonly updatedAt: string;
  readonly humanRequired: boolean;
}

export interface CoreHomeContinuitySummaryViewV1 {
  readonly state: 'READY' | 'STALE' | 'UNAVAILABLE' | 'UNKNOWN';
  readonly lastCheckpointAt?: string;
  readonly sourceRevision?: string;
  readonly detail?: string;
}

export interface CoreHomeFindingSummaryViewV1 {
  readonly critical: number;
  readonly high: number;
  readonly unresolved: number;
  readonly latestFindingAt?: string;
}

export interface CoreHomeSnapshotV1 {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly sourceFreshness: CoreHomeFreshnessV1;
  readonly project: CoreHomeProjectContextViewV1;
  readonly authority: CoreHomeAuthoritySummaryViewV1;
  readonly system: CoreHomeSystemHealthViewV1;
  readonly currentWork: CoreHomeCurrentWorkViewV1 | null;
  readonly attention: CoreHomeAttentionSummaryViewV1;
  readonly usage: CoreHomeUsageWindowViewV1;
  readonly roleBindings: readonly CoreHomeRoleBindingHealthViewV1[];
  readonly recentRuns: readonly CoreHomeRecentRunViewV1[];
  readonly continuity: CoreHomeContinuitySummaryViewV1;
  readonly findings: CoreHomeFindingSummaryViewV1;
}

export type CoreHomeSnapshotInputV1 = Omit<CoreHomeSnapshotV1, 'schemaVersion'>;

export function createCoreHomeSnapshotV1(input: CoreHomeSnapshotInputV1): CoreHomeSnapshotV1 {
  requireTimestamp(input.generatedAt, 'generatedAt');
  requireTimestamp(input.sourceFreshness.generatedAt, 'sourceFreshness.generatedAt');

  if (input.generatedAt !== input.sourceFreshness.generatedAt) {
    throw new Error('Core Home snapshot generatedAt must match source freshness generatedAt');
  }

  if (input.authority.authority !== 'NONE') {
    throw new Error('Core Home snapshot authority must be NONE');
  }

  for (const item of input.attention.items) {
    if (item.authority !== 'NONE') {
      throw new Error('Core Home attention item authority must be NONE');
    }
    requireText(item.id, 'attention item id');
    requireText(item.headline, 'attention item headline');
    requireText(item.source, 'attention item source');
    requireTimestamp(item.occurredAt, 'attention item occurredAt');
  }

  validateAttentionCounts(input.attention);
  validateUsage(input.usage);
  validateFindingCounts(input.findings);

  return {
    schemaVersion: 1,
    ...input,
  };
}

export function dashboardRefreshCanInvokeModel(): false {
  return false;
}

export function coreHomeSnapshotCanGrantAuthority(): false {
  return false;
}

export function coreHomeSnapshotCanMutateRuntime(): false {
  return false;
}

function validateAttentionCounts(value: CoreHomeAttentionSummaryViewV1): void {
  for (const [name, count] of [
    ['total', value.total],
    ['critical', value.critical],
    ['error', value.error],
    ['warning', value.warning],
  ] as const) {
    requireNonNegativeInteger(count, 'attention ' + name);
  }

  if (value.total !== value.items.length) {
    throw new Error('Core Home attention total must equal attention item count');
  }

  const severityCount = (severity: CoreHomeAttentionSeverity) =>
    value.items.filter((item) => item.severity === severity).length;

  if (value.critical !== severityCount('CRITICAL')) {
    throw new Error('Core Home attention critical count mismatch');
  }
  if (value.error !== severityCount('ERROR')) {
    throw new Error('Core Home attention error count mismatch');
  }
  if (value.warning !== severityCount('WARNING')) {
    throw new Error('Core Home attention warning count mismatch');
  }
}

function validateUsage(value: CoreHomeUsageWindowViewV1): void {
  for (const [name, count] of [
    ['modelCalls', value.modelCalls],
    ['inputTokens', value.inputTokens],
    ['cachedInputTokens', value.cachedInputTokens],
    ['outputTokens', value.outputTokens],
    ['reasoningTokens', value.reasoningTokens],
    ['totalTokens', value.totalTokens],
    ['retries', value.retries],
    ['fallbacks', value.fallbacks],
  ] as const) {
    requireNonNegativeInteger(count, 'usage ' + name);
  }

  for (const [name, cost] of [
    ['estimatedCostUsd', value.estimatedCostUsd],
    ['actualCostUsd', value.actualCostUsd],
  ] as const) {
    if (!Number.isFinite(cost) || cost < 0) {
      throw new Error('usage ' + name + ' must be a non-negative finite number');
    }
  }
}

function validateFindingCounts(value: CoreHomeFindingSummaryViewV1): void {
  requireNonNegativeInteger(value.critical, 'finding critical');
  requireNonNegativeInteger(value.high, 'finding high');
  requireNonNegativeInteger(value.unresolved, 'finding unresolved');
  if (value.latestFindingAt !== undefined) {
    requireTimestamp(value.latestFindingAt, 'latestFindingAt');
  }
}

function requireText(value: string, field: string): void {
  if (!value.trim()) throw new Error(field + ' is required');
}

function requireTimestamp(value: string, field: string): void {
  requireText(value, field);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(field + ' must be a valid timestamp');
  }
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(field + ' must be a non-negative integer');
  }
}
