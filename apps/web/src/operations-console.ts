import type { CoreHomeRoleBindingHealthView, CoreHomeSnapshotV1 } from './home.js';
import type {
  DashboardModelAggregate,
  DashboardRunDetail,
  DashboardRuntimeError,
} from './read-model.js';

export interface OperationsConsoleReadSource {
  homeSnapshot(options?: {
    readonly now?: string;
    readonly recentRunLimit?: number;
  }): CoreHomeSnapshotV1;
  runDetail(runId: string, limit?: number): DashboardRunDetail | null;
  modelAggregates(limit?: number): readonly DashboardModelAggregate[];
}

export interface OperationsConsoleErrorView {
  readonly runId: string;
  readonly timestamp: string;
  readonly code: string;
  readonly severity: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly causeCode: string;
  readonly causeKind: string;
  readonly certainty: string;
  readonly headline: string;
  readonly sourceComponent: string;
  readonly sourceOperation: string;
  readonly failedStep: string;
  readonly rootCause: string;
  readonly observedSignal: string;
  readonly nextAction: string;
  readonly retryAt: string | null;
}

export interface OperationsConsoleRoleUsageView {
  readonly calls: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  readonly actualCostUsd: number;
  readonly averageLatencyMs: number | null;
  readonly retries: number;
  readonly fallbacks: number;
}

export interface OperationsConsoleRoutingView {
  readonly logicalRole: string;
  readonly observedAt: string | null;
  readonly state: CoreHomeRoleBindingHealthView['state'];
  readonly preferredBindingId: string | null;
  readonly preferredModel: string | null;
  readonly activeBindingId: string | null;
  readonly activeModel: string | null;
  readonly providerId: string | null;
  readonly failureKind: string | null;
  readonly nextCheckAt: string | null;
  readonly returnPolicy: 'STAY_ON_FALLBACK' | 'ASK_BEFORE_RETURN' | 'AUTO_RETURN' | null;
  readonly fallbackChain: null;
  readonly riskCompatibility: null;
  readonly usage: OperationsConsoleRoleUsageView;
}

export interface OperationsConsoleSnapshotV1 {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly sourceState: 'CURRENT' | 'PARTIAL';
  readonly staleSources: readonly string[];
  readonly v3Authority: CoreHomeSnapshotV1['authority']['v3Authority'];
  readonly attention: CoreHomeSnapshotV1['attention'];
  readonly recentRuns: CoreHomeSnapshotV1['recentRuns'];
  readonly errors: readonly OperationsConsoleErrorView[];
  readonly routing: readonly OperationsConsoleRoutingView[];
  readonly projectionAuthority: 'NONE';
}

export interface OperationsConsoleOptions {
  readonly now?: string;
  readonly recentRunLimit?: number;
  readonly errorLimitPerRun?: number;
  readonly aggregateLimit?: number;
}

export function buildOperationsConsoleSnapshot(
  source: OperationsConsoleReadSource,
  options: OperationsConsoleOptions = {},
): OperationsConsoleSnapshotV1 {
  const recentRunLimit = boundedLimit(options.recentRunLimit ?? 20, 'recentRunLimit');
  const errorLimitPerRun = boundedLimit(options.errorLimitPerRun ?? 100, 'errorLimitPerRun');
  const aggregateLimit = boundedLimit(options.aggregateLimit ?? 500, 'aggregateLimit');

  const home = source.homeSnapshot({
    ...(options.now === undefined ? {} : { now: options.now }),
    recentRunLimit,
  });
  const aggregates = source.modelAggregates(aggregateLimit);
  const errors: OperationsConsoleErrorView[] = [];

  for (const run of home.recentRuns) {
    const detail = source.runDetail(run.runId, errorLimitPerRun);
    if (!detail) continue;
    for (const error of detail.runtimeErrors) {
      errors.push(mapError(run.runId, error));
    }
  }

  errors.sort((left, right) => {
    const time = right.timestamp.localeCompare(left.timestamp);
    if (time !== 0) return time;
    const correlation = left.correlationId.localeCompare(right.correlationId);
    return correlation !== 0 ? correlation : left.code.localeCompare(right.code);
  });

  const routing = home.roleBindings
    .map((binding) => mapRouting(binding, aggregates))
    .sort((left, right) => left.logicalRole.localeCompare(right.logicalRole));

  return {
    schemaVersion: 1,
    generatedAt: home.generatedAt,
    sourceState: home.sourceFreshness.staleSources.length === 0 ? 'CURRENT' : 'PARTIAL',
    staleSources: [...home.sourceFreshness.staleSources].sort(),
    v3Authority: home.authority.v3Authority,
    attention: home.attention,
    recentRuns: home.recentRuns,
    errors,
    routing,
    projectionAuthority: 'NONE',
  };
}

export function operationsConsoleCanInvokeModel(): false {
  return false;
}

export function operationsConsoleCanGrantAuthority(): false {
  return false;
}

export function operationsConsoleCanExposeRawCause(): false {
  return false;
}

function mapError(runId: string, error: DashboardRuntimeError): OperationsConsoleErrorView {
  return {
    runId,
    timestamp: error.timestamp,
    code: error.code,
    severity: error.severity,
    retryable: error.retryable,
    correlationId: error.correlationId,
    causeCode: error.causeCode,
    causeKind: error.causeKind,
    certainty: error.certainty,
    headline: error.headline,
    sourceComponent: error.sourceComponent,
    sourceOperation: error.sourceOperation,
    failedStep: error.failedStep,
    rootCause: error.rootCause,
    observedSignal: error.observedSignal,
    nextAction: error.nextAction,
    retryAt: error.retryAt,
  };
}

function mapRouting(
  binding: CoreHomeRoleBindingHealthView,
  aggregates: readonly DashboardModelAggregate[],
): OperationsConsoleRoutingView {
  const matching = aggregates.filter((item) => {
    if (item.logicalRole !== binding.logicalRole) return false;
    if (binding.providerId !== null && item.provider !== binding.providerId) return false;
    if (binding.activeModel !== null && item.model !== binding.activeModel) return false;
    return true;
  });

  return {
    logicalRole: binding.logicalRole,
    observedAt: binding.observedAt,
    state: binding.state,
    preferredBindingId: binding.preferredBindingId,
    preferredModel: binding.preferredModel,
    activeBindingId: binding.activeBindingId,
    activeModel: binding.activeModel,
    providerId: binding.providerId,
    failureKind: binding.failureKind ?? null,
    nextCheckAt: binding.nextCheckAt ?? null,
    returnPolicy: binding.returnPolicy ?? null,
    fallbackChain: null,
    riskCompatibility: null,
    usage: aggregateUsage(matching),
  };
}

function aggregateUsage(
  aggregates: readonly DashboardModelAggregate[],
): OperationsConsoleRoleUsageView {
  const calls = aggregates.reduce((sum, item) => sum + item.calls, 0);
  const totalTokens = aggregates.reduce((sum, item) => sum + item.totalTokens, 0);
  const estimatedCostUsd = aggregates.reduce((sum, item) => sum + item.estimatedCostUsd, 0);
  const actualCostUsd = aggregates.reduce((sum, item) => sum + item.actualCostUsd, 0);
  const retries = aggregates.reduce((sum, item) => sum + item.retries, 0);
  const fallbacks = aggregates.reduce((sum, item) => sum + item.fallbacks, 0);
  const measured = aggregates.filter(
    (item): item is DashboardModelAggregate & { readonly averageLatencyMs: number } =>
      item.averageLatencyMs !== null && item.calls > 0,
  );
  const measuredCalls = measured.reduce((sum, item) => sum + item.calls, 0);
  const averageLatencyMs =
    measuredCalls === 0
      ? null
      : Math.round(
          measured.reduce((sum, item) => sum + item.averageLatencyMs * item.calls, 0) /
            measuredCalls,
        );

  return {
    calls,
    totalTokens,
    estimatedCostUsd,
    actualCostUsd,
    averageLatencyMs,
    retries,
    fallbacks,
  };
}

function boundedLimit(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new Error(`${field} must be an integer between 1 and 10000`);
  }
  return value;
}
