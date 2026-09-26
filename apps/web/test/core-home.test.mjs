import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  coreHomeSnapshotCanGrantAuthority,
  coreHomeSnapshotCanMutateState,
  createCoreHomeSnapshotV1,
  dashboardRefreshCanInvokeModel,
} from '../dist/index.js';

function input() {
  const generatedAt = '2026-09-26T06:30:00.000Z';
  return {
    generatedAt,
    sourceFreshness: {
      generatedAt,
      sqliteUpdatedAt: generatedAt,
      staleSources: ['provider-state', 'provider-state', 'continuity'],
    },
    project: {
      repository: 'skonyd/freehighlander-engineering-platform',
      projectId: 'freehighlander',
      branch: 'main',
      headSha: 'a'.repeat(40),
    },
    authority: {
      v3Authority: 'SHADOW_ONLY',
    },
    system: {
      state: 'HEALTHY',
      database: 'HEALTHY',
      providers: 'UNKNOWN',
      continuity: 'UNKNOWN',
      criticalErrorCount: 0,
    },
    currentWork: null,
    attention: {
      total: 1,
      critical: 0,
      errors: 0,
      warnings: 1,
      items: [
        {
          id: 'attention-1',
          kind: 'PROVIDER_FALLBACK',
          severity: 'WARNING',
          headline: 'Preferred provider is temporarily unavailable',
          source: 'quota-aware-failover',
          occurredAt: generatedAt,
          authority: 'NONE',
        },
      ],
    },
    usage: {
      window: 'TODAY',
      modelCalls: 4,
      totalTokens: 1200,
      inputTokens: 900,
      cachedInputTokens: 300,
      outputTokens: 220,
      reasoningTokens: 80,
      estimatedCostUsd: 0.12,
      actualCostUsd: 0.1,
      retries: 1,
      fallbacks: 1,
    },
    economy: {
      mode: 'TOKEN_ECONOMY',
      optimizerBindingId: 'local-optimizer',
      optimizerModelId: 'local-model',
      remoteTokenTarget: 1000,
      candidateRemoteInputTokens: 2000,
      finalRemoteInputTokens: 1000,
      remoteOutputTokens: 100,
      cachedInputTokens: 200,
      reductionStages: ['REPOSITORY_JIT', 'DETERMINISTIC_REDUCTION'],
      protectedContentCount: 4,
      localOptimizationDurationMs: 400,
      remoteTokenSavingRatio: 0.5,
      bypassReason: null,
      roleEligibility: [
        {
          logicalRole: 'context-optimizer',
          riskTier: 'NORMAL',
          eligible: true,
          reason: null,
        },
      ],
      observedAt: generatedAt,
      authority: 'NONE',
    },
    roleBindings: [],
    recentRuns: [],
    continuity: {
      state: 'UNKNOWN',
      latestCheckpointAt: null,
      resumeReady: null,
      sourceRevision: null,
      warning: null,
    },
    findings: {
      state: 'UNKNOWN',
      critical: 0,
      high: 0,
      unresolved: 0,
      latestFindingAt: null,
    },
  };
}

test('Core Home snapshot is deterministic, read-only and authority-neutral', () => {
  const snapshot = createCoreHomeSnapshotV1(input());

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.projectionAuthority, 'NONE');
  assert.equal(snapshot.authority.projectionAuthority, 'NONE');
  assert.equal(snapshot.economy.mode, 'TOKEN_ECONOMY');
  assert.equal(snapshot.economy.authority, 'NONE');
  assert.deepEqual(snapshot.sourceFreshness.staleSources, ['continuity', 'provider-state']);

  assert.equal(dashboardRefreshCanInvokeModel(), false);
  assert.equal(coreHomeSnapshotCanGrantAuthority(), false);
  assert.equal(coreHomeSnapshotCanMutateState(), false);
});

test('Core Home snapshot validation fails closed for inconsistent attention counts', () => {
  const value = input();
  value.attention.total = 2;

  assert.throws(
    () => createCoreHomeSnapshotV1(value),
    /attention.total must match attention.items length/,
  );
});

test('Core Home read path cannot import model-runtime execution surfaces', async () => {
  const readPathFiles = [
    '../src/home.ts',
    '../src/read-model.ts',
    '../src/server.ts',
    '../src/ui.ts',
    '../src/management.ts',
  ];

  for (const relative of readPathFiles) {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    const source = await readFile(path, 'utf8');

    assert.doesNotMatch(
      source,
      /from\s+['"][^'"]*model-runtime[^'"]*['"]/,
      `${relative} must not import model-runtime`,
    );
    assert.doesNotMatch(
      source,
      /import\s*\(\s*['"][^'"]*model-runtime[^'"]*['"]\s*\)/,
      `${relative} must not dynamically import model-runtime`,
    );
  }

  const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.equal(packageJson.dependencies?.['@freehighlander/model-runtime'], undefined);
  assert.equal(packageJson.devDependencies?.['@freehighlander/model-runtime'], undefined);
});

test('Core Home economy summary validation fails closed on malformed metadata', () => {
  for (const mutate of [
    (value) => {
      value.economy.mode = 'INVALID';
    },
    (value) => {
      value.economy.authority = 'SYSTEM_POLICY';
    },
    (value) => {
      value.economy.remoteTokenSavingRatio = 2;
    },
    (value) => {
      value.economy.candidateRemoteInputTokens = -1;
    },
    (value) => {
      value.economy.observedAt = 'not-a-time';
    },
    (value) => {
      value.economy.reductionStages = ['REPOSITORY_JIT', 'REPOSITORY_JIT'];
    },
    (value) => {
      value.economy.roleEligibility = [
        { logicalRole: 'reviewer', riskTier: 'HIGH', eligible: true, reason: null },
        { logicalRole: 'reviewer', riskTier: 'HIGH', eligible: false, reason: 'duplicate' },
      ];
    },
  ]) {
    const value = input();
    mutate(value);
    assert.throws(() => createCoreHomeSnapshotV1(value));
  }
});
