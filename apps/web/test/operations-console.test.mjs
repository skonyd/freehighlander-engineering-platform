import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOperationsConsoleSnapshot,
  createCoreHomeSnapshotV1,
  operationsConsoleCanExposeRawCause,
  operationsConsoleCanGrantAuthority,
  operationsConsoleCanInvokeModel,
  FH_KUIKA_OPERATIONS_HTML,
} from '../dist/index.js';

const now = '2026-09-26T09:30:00.000Z';

function home(overrides = {}) {
  return createCoreHomeSnapshotV1({
    generatedAt: now,
    sourceFreshness: {
      generatedAt: now,
      sqliteUpdatedAt: now,
      staleSources: [],
    },
    project: {
      repository: 'skonyd/freehighlander-engineering-platform',
      projectId: 'freehighlander',
      branch: 'main',
      headSha: 'a'.repeat(40),
    },
    authority: { v3Authority: 'SHADOW_ONLY' },
    system: {
      state: 'DEGRADED',
      database: 'HEALTHY',
      providers: 'DEGRADED',
      continuity: 'HEALTHY',
      criticalErrorCount: 0,
    },
    currentWork: null,
    attention: { total: 0, critical: 0, errors: 0, warnings: 0, items: [] },
    usage: {
      window: 'TODAY',
      modelCalls: 2,
      totalTokens: 300,
      inputTokens: 200,
      cachedInputTokens: 50,
      outputTokens: 80,
      reasoningTokens: 20,
      estimatedCostUsd: 0.03,
      actualCostUsd: 0.02,
      retries: 1,
      fallbacks: 1,
    },
    economy: {
      mode: 'STANDARD',
      optimizerBindingId: null,
      optimizerModelId: null,
      remoteTokenTarget: null,
      candidateRemoteInputTokens: null,
      finalRemoteInputTokens: null,
      remoteOutputTokens: null,
      cachedInputTokens: null,
      reductionStages: [],
      protectedContentCount: null,
      localOptimizationDurationMs: null,
      remoteTokenSavingRatio: null,
      bypassReason: null,
      roleEligibility: [],
      observedAt: null,
      authority: 'NONE',
    },
    roleBindings: [
      {
        logicalRole: 'security-reviewer',
        observedAt: now,
        state: 'FALLBACK_ACTIVE',
        preferredBindingId: 'security-opus',
        preferredModel: 'opus',
        activeBindingId: 'security-gpt',
        activeModel: 'gpt',
        providerId: 'openai',
        failureKind: 'quota',
        nextCheckAt: '2026-09-26T10:00:00.000Z',
        returnPolicy: 'ASK_BEFORE_RETURN',
      },
      {
        logicalRole: 'test-reviewer',
        observedAt: null,
        state: 'UNKNOWN',
        preferredBindingId: null,
        preferredModel: null,
        activeBindingId: null,
        activeModel: null,
        providerId: null,
      },
    ],
    recentRuns: [
      {
        runId: 'run-2',
        status: 'FAILED',
        workflowId: 'review',
        workflowVersion: '1.0.0',
        branch: 'main',
        headSha: 'a'.repeat(40),
        humanRequired: false,
        lastTimestamp: now,
      },
      {
        runId: 'run-1',
        status: 'PASSED',
        workflowId: 'review',
        workflowVersion: '1.0.0',
        branch: 'main',
        headSha: 'a'.repeat(40),
        humanRequired: false,
        lastTimestamp: '2026-09-26T09:00:00.000Z',
      },
    ],
    continuity: {
      state: 'HEALTHY',
      latestCheckpointAt: now,
      resumeReady: true,
      sourceRevision: 'a'.repeat(40),
      warning: null,
    },
    findings: {
      state: 'HEALTHY',
      critical: 0,
      high: 0,
      unresolved: 0,
      latestFindingAt: now,
    },
    ...overrides,
  });
}

function diagnosedError(overrides = {}) {
  return {
    timestamp: '2026-09-26T09:29:00.000Z',
    nodeId: 'review-node',
    code: 'PROVIDER_QUOTA',
    severity: 'ERROR',
    retryable: true,
    correlationId: 'corr-12345678',
    causeCode: 'QUOTA_EXHAUSTED',
    causeKind: 'QUOTA_EXHAUSTED',
    certainty: 'CONFIRMED_SIGNAL',
    headline: 'Preferred provider quota exhausted',
    sourceComponent: 'model-runtime',
    sourceOperation: 'provider-invoke',
    failedStep: 'Invoke selected provider binding',
    rootCause: 'The provider rejected the request because quota is exhausted.',
    observedSignal: 'HTTP 429 quota_exhausted',
    nextAction: 'Use the configured fallback or retry after reset.',
    retryAt: '2026-09-26T10:00:00.000Z',
    ...overrides,
  };
}

function source(homeSnapshot = home()) {
  return {
    homeSnapshot() {
      return homeSnapshot;
    },
    runDetail(runId) {
      if (runId === 'run-2') {
        return {
          run: {},
          events: [],
          runtimeErrors: [diagnosedError()],
          modelCalls: [],
          artifacts: [],
        };
      }
      return {
        run: {},
        events: [],
        runtimeErrors: [],
        modelCalls: [],
        artifacts: [],
      };
    },
    modelAggregates() {
      return [
        {
          logicalRole: 'security-reviewer',
          provider: 'openai',
          model: 'gpt',
          effort: 'medium',
          calls: 2,
          totalTokens: 250,
          estimatedCostUsd: 0.025,
          actualCostUsd: 0.02,
          averageLatencyMs: 1000,
          retries: 1,
          fallbacks: 1,
        },
        {
          logicalRole: 'security-reviewer',
          provider: 'other',
          model: 'other',
          effort: 'low',
          calls: 99,
          totalTokens: 9999,
          estimatedCostUsd: 99,
          actualCostUsd: 99,
          averageLatencyMs: 9999,
          retries: 99,
          fallbacks: 99,
        },
      ];
    },
  };
}

test('Operations Console projects safe errors, routing and matching usage deterministically', () => {
  const snapshot = buildOperationsConsoleSnapshot(source());

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.generatedAt, now);
  assert.equal(snapshot.sourceState, 'CURRENT');
  assert.equal(snapshot.projectionAuthority, 'NONE');
  assert.equal(snapshot.v3Authority, 'SHADOW_ONLY');
  assert.equal(snapshot.attention.total, 0);
  assert.equal(snapshot.recentRuns.length, 2);
  assert.equal(snapshot.recentRuns[0]?.runId, 'run-2');

  assert.equal(snapshot.errors.length, 1);
  assert.equal(snapshot.errors[0]?.runId, 'run-2');
  assert.equal(snapshot.errors[0]?.certainty, 'CONFIRMED_SIGNAL');
  assert.equal(snapshot.errors[0]?.observedSignal, 'HTTP 429 quota_exhausted');

  assert.deepEqual(
    snapshot.routing.map((item) => item.logicalRole),
    ['security-reviewer', 'test-reviewer'],
  );
  const security = snapshot.routing[0];
  assert.equal(security?.state, 'FALLBACK_ACTIVE');
  assert.equal(security?.preferredBindingId, 'security-opus');
  assert.equal(security?.activeBindingId, 'security-gpt');
  assert.equal(security?.failureKind, 'quota');
  assert.equal(security?.returnPolicy, 'ASK_BEFORE_RETURN');
  assert.equal(security?.fallbackChain, null);
  assert.equal(security?.riskCompatibility, null);
  assert.equal(security?.usage.calls, 2);
  assert.equal(security?.usage.totalTokens, 250);
  assert.equal(security?.usage.averageLatencyMs, 1000);
});

test('Operations Console reports partial currentness and keeps unsupported routing evidence unknown', () => {
  const partial = home({
    sourceFreshness: {
      generatedAt: now,
      sqliteUpdatedAt: now,
      staleSources: ['provider-state', 'runtime-attention'],
    },
  });
  const snapshot = buildOperationsConsoleSnapshot(source(partial));

  assert.equal(snapshot.sourceState, 'PARTIAL');
  assert.deepEqual(snapshot.staleSources, ['provider-state', 'runtime-attention']);

  const unknown = snapshot.routing.find((item) => item.logicalRole === 'test-reviewer');
  assert.ok(unknown);
  assert.equal(unknown.failureKind, null);
  assert.equal(unknown.nextCheckAt, null);
  assert.equal(unknown.returnPolicy, null);
  assert.equal(unknown.fallbackChain, null);
  assert.equal(unknown.riskCompatibility, null);
  assert.equal(unknown.usage.calls, 0);
  assert.equal(unknown.usage.averageLatencyMs, null);
});

test('Operations Console preserves unresolved diagnosis instead of inventing a root cause', () => {
  const unresolved = diagnosedError({
    causeCode: 'UNKNOWN',
    causeKind: 'UNKNOWN',
    certainty: 'UNRESOLVED',
    rootCause: 'The exact root cause could not be determined from available safe signals.',
    observedSignal: 'No deterministic provider failure signal was available.',
  });
  const custom = source();
  custom.runDetail = (runId) => ({
    run: {},
    events: [],
    runtimeErrors: runId === 'run-2' ? [unresolved] : [],
    modelCalls: [],
    artifacts: [],
  });

  const snapshot = buildOperationsConsoleSnapshot(custom);
  assert.equal(snapshot.errors[0]?.certainty, 'UNRESOLVED');
  assert.equal(
    snapshot.errors[0]?.rootCause,
    'The exact root cause could not be determined from available safe signals.',
  );
});

test('Operations Console is bounded, read-only and authority-neutral', () => {
  assert.equal(operationsConsoleCanInvokeModel(), false);
  assert.equal(operationsConsoleCanGrantAuthority(), false);
  assert.equal(operationsConsoleCanExposeRawCause(), false);

  assert.throws(
    () => buildOperationsConsoleSnapshot(source(), { recentRunLimit: 0 }),
    /recentRunLimit/,
  );
  assert.throws(
    () => buildOperationsConsoleSnapshot(source(), { errorLimitPerRun: 10001 }),
    /errorLimitPerRun/,
  );
});

test('FH-KUIKA Operations UI keeps filters local, persistent and accessible', () => {
  assert.match(FH_KUIKA_OPERATIONS_HTML, /id="attention-severity"/);
  assert.match(FH_KUIKA_OPERATIONS_HTML, /id="binding-state"/);
  assert.match(FH_KUIKA_OPERATIONS_HTML, /aria-label="Operations filters"/);
  assert.match(FH_KUIKA_OPERATIONS_HTML, /fh-kuika-operate-filters-v1/);
  assert.match(FH_KUIKA_OPERATIONS_HTML, /localStorage\.setItem/);
  assert.match(FH_KUIKA_OPERATIONS_HTML, /Filters are local UI state only/);
});
