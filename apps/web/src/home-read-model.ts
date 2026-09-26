import { createCoreHomeSnapshotV1, type CoreHomeSnapshotV1 } from './home-contract.js';
import type { DashboardRun, DashboardUsageAggregate } from './read-model.js';

export interface CoreHomeReadSource {
  health(): { readonly databaseExists: boolean; readonly schemaVersion: number | null };
  listRuns(limit?: number): readonly DashboardRun[];
  usageSince(since: string): DashboardUsageAggregate;
}

export interface CoreHomeSnapshotOptions {
  readonly now?: Date;
  readonly recentRunLimit?: number;
}

export function buildCoreHomeSnapshot(
  source: CoreHomeReadSource,
  options: CoreHomeSnapshotOptions = {},
): CoreHomeSnapshotV1 {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error('Core Home now must be a valid date');

  const generatedAt = now.toISOString();
  const recentRunLimit = options.recentRunLimit ?? 8;
  if (!Number.isInteger(recentRunLimit) || recentRunLimit < 1 || recentRunLimit > 100) {
    throw new Error('recentRunLimit must be an integer between 1 and 100');
  }

  const health = source.health();
  const runs = health.databaseExists ? source.listRuns(recentRunLimit) : [];
  const latest = runs[0] ?? null;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const usage = health.databaseExists ? source.usageSince(since) : emptyUsage();

  return createCoreHomeSnapshotV1({
    generatedAt,
    sourceFreshness: {
      generatedAt,
      ...(latest ? { sqliteUpdatedAt: latest.lastTimestamp } : {}),
      staleSources: health.databaseExists ? [] : ['sqlite'],
    },
    project: {
      repository: latest?.repository ?? null,
      branch: latest?.branch ?? null,
      exactRevision: latest?.headSha ?? null,
    },
    authority: {
      v3Authority: 'SHADOW_ONLY',
      authority: 'NONE',
    },
    system: {
      state: health.databaseExists ? 'HEALTHY' : 'UNKNOWN',
      databaseReady: health.databaseExists,
      unresolvedCriticalErrors: 0,
      degradedSources: health.databaseExists ? [] : ['sqlite'],
    },
    currentWork: null,
    attention: {
      total: 0,
      critical: 0,
      error: 0,
      warning: 0,
      items: [],
    },
    usage: {
      window: 'LAST_24_HOURS',
      ...usage,
    },
    roleBindings: [],
    recentRuns: runs.map((run) => ({
      runId: run.runId,
      status: run.status,
      workflowId: run.workflowId,
      workflowVersion: run.workflowVersion,
      branch: run.branch,
      exactRevision: run.headSha,
      updatedAt: run.lastTimestamp,
      humanRequired: run.humanRequired,
    })),
    continuity: {
      state: 'UNKNOWN',
    },
    findings: {
      critical: 0,
      high: 0,
      unresolved: 0,
    },
  });
}

function emptyUsage(): DashboardUsageAggregate {
  return {
    modelCalls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    actualCostUsd: 0,
    retries: 0,
    fallbacks: 0,
  };
}
