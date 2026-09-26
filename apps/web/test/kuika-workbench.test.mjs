import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaWorkbenchSnapshotV1,
  createCoreHomeSnapshotV1,
  getFhKuikaWorkbenchModeView,
  listFhKuikaWorkbenchModes,
  workbenchModeSelectionCanGrantAuthority,
  workbenchModeSelectionCanInvokeModel,
  workbenchSnapshotCanMutateRuntime,
} from '../dist/index.js';

const now = '2026-09-26T12:00:00.000Z';

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
      state: 'HEALTHY',
      database: 'HEALTHY',
      providers: 'HEALTHY',
      continuity: 'HEALTHY',
      criticalErrorCount: 0,
    },
    currentWork: {
      classificationVersion: 1,
      runId: 'run-1',
      workItemId: 'task-1',
      workflowId: 'implementation',
      workflowVersion: '1.0.0',
      nodeId: 'implement',
      state: 'IMPLEMENTING',
      label: 'Implementation',
      humanRequired: false,
      updatedAt: now,
    },
    attention: { total: 0, critical: 0, errors: 0, warnings: 0, items: [] },
    usage: {
      window: 'TODAY',
      modelCalls: 0,
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      estimatedCostUsd: 0,
      actualCostUsd: 0,
      retries: 0,
      fallbacks: 0,
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
    roleBindings: [],
    recentRuns: [],
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
      latestFindingAt: null,
    },
    ...overrides,
  });
}

test('FH-KUIKA Workbench mode selection is non-authoritative and zero-call', () => {
  const modes = listFhKuikaWorkbenchModes();

  assert.deepEqual(
    modes.map((item) => item.mode),
    ['ASK', 'PLAN', 'EXECUTE', 'REVIEW'],
  );

  for (const mode of modes) {
    assert.equal(mode.selectionAuthority, 'NONE');
    assert.equal(mode.executionOwner, 'CONTROL_PLANE');
    assert.equal(mode.canSelect, true);
    assert.equal(mode.canInvokeModelOnSelection, false);
    assert.equal(mode.canGrantAuthority, false);
  }

  assert.equal(workbenchModeSelectionCanInvokeModel(), false);
  assert.equal(workbenchModeSelectionCanGrantAuthority(), false);
  assert.equal(workbenchSnapshotCanMutateRuntime(), false);
});

test('only Execute mode is mutation-capable and requires enabled V3 authority', () => {
  const execute = getFhKuikaWorkbenchModeView('EXECUTE');
  const ask = getFhKuikaWorkbenchModeView('ASK');
  const plan = getFhKuikaWorkbenchModeView('PLAN');
  const review = getFhKuikaWorkbenchModeView('REVIEW');

  assert.equal(execute.mutationCapable, true);
  assert.equal(execute.requiresEnabledV3Authority, true);

  for (const mode of [ask, plan, review]) {
    assert.equal(mode.mutationCapable, false);
    assert.equal(mode.requiresEnabledV3Authority, false);
  }
});

test('Workbench snapshot exposes deterministic context chips and exact revision binding', () => {
  const snapshot = buildFhKuikaWorkbenchSnapshotV1(home(), 'REVIEW');

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.projectionAuthority, 'NONE');
  assert.equal(snapshot.mode.mode, 'REVIEW');
  assert.equal(snapshot.preflight.canStartRequest, true);
  assert.equal(snapshot.preflight.exactRevisionBound, true);
  assert.equal(snapshot.preflight.sourceState, 'CURRENT');

  assert.deepEqual(
    snapshot.context.map((item) => item.kind),
    ['REPOSITORY', 'BRANCH', 'EXACT_REVISION', 'WORKFLOW', 'RUN'],
  );
  const revision = snapshot.context.find((item) => item.kind === 'EXACT_REVISION');
  assert.equal(revision?.authoritative, true);
  assert.equal(revision?.removable, false);
});

test('Workbench preflight blocks Execute in SHADOW_ONLY and review without exact revision', () => {
  const execute = buildFhKuikaWorkbenchSnapshotV1(home(), 'EXECUTE');
  assert.equal(execute.preflight.canStartRequest, false);
  assert.match(execute.preflight.blockedReason, /SHADOW_ONLY/);

  const withoutRevision = home({
    project: {
      repository: 'skonyd/freehighlander-engineering-platform',
      projectId: 'freehighlander',
      branch: 'main',
      headSha: null,
    },
  });
  const review = buildFhKuikaWorkbenchSnapshotV1(withoutRevision, 'REVIEW');
  assert.equal(review.preflight.canStartRequest, false);
  assert.match(review.preflight.blockedReason, /exact revision/i);
});

test('Workbench preflight preserves partial source state without inventing context', () => {
  const partial = home({
    sourceFreshness: {
      generatedAt: now,
      sqliteUpdatedAt: now,
      staleSources: ['provider-state'],
    },
  });

  const snapshot = buildFhKuikaWorkbenchSnapshotV1(partial, 'ASK');
  assert.equal(snapshot.preflight.sourceState, 'PARTIAL');
  assert.deepEqual(snapshot.preflight.staleSources, ['provider-state']);
  assert.equal(snapshot.preflight.canStartRequest, true);
});
