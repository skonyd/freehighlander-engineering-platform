import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  coreHomeSnapshotCanGrantAuthority,
  coreHomeSnapshotCanMutateRuntime,
  createCoreHomeSnapshotV1,
  dashboardRefreshCanInvokeModel,
} from '../dist/index.js';

function validSnapshotInput() {
  return {
    generatedAt: '2026-09-26T07:00:00.000Z',
    sourceFreshness: {
      generatedAt: '2026-09-26T07:00:00.000Z',
      sqliteUpdatedAt: '2026-09-26T06:59:59.000Z',
      staleSources: [],
    },
    project: {
      repository: 'skonyd/freehighlander-engineering-platform',
      branch: 'main',
      exactRevision: 'abc123',
    },
    authority: {
      v3Authority: 'SHADOW_ONLY',
      authority: 'NONE',
    },
    system: {
      state: 'HEALTHY',
      databaseReady: true,
      unresolvedCriticalErrors: 0,
      degradedSources: [],
    },
    currentWork: null,
    attention: {
      total: 1,
      critical: 0,
      error: 0,
      warning: 1,
      items: [
        {
          id: 'attention-1',
          kind: 'PROVIDER_FALLBACK',
          severity: 'WARNING',
          headline: 'Preferred provider is temporarily unavailable',
          source: 'quota-aware-failover',
          occurredAt: '2026-09-26T06:59:00.000Z',
          authority: 'NONE',
        },
      ],
    },
    usage: {
      window: 'TODAY',
      modelCalls: 3,
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 40,
      reasoningTokens: 10,
      totalTokens: 150,
      estimatedCostUsd: 0.02,
      actualCostUsd: 0.018,
      retries: 1,
      fallbacks: 1,
    },
    roleBindings: [],
    recentRuns: [],
    continuity: {
      state: 'READY',
      lastCheckpointAt: '2026-09-26T06:58:00.000Z',
    },
    findings: {
      critical: 0,
      high: 0,
      unresolved: 0,
    },
  };
}

test('Core Home snapshot is deterministic, read-only and authority-neutral', () => {
  const input = validSnapshotInput();
  const first = createCoreHomeSnapshotV1(input);
  const second = createCoreHomeSnapshotV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.authority.authority, 'NONE');
  assert.equal(dashboardRefreshCanInvokeModel(), false);
  assert.equal(coreHomeSnapshotCanGrantAuthority(), false);
  assert.equal(coreHomeSnapshotCanMutateRuntime(), false);
});

test('Core Home snapshot rejects inconsistent deterministic aggregates', () => {
  const input = validSnapshotInput();

  assert.throws(
    () =>
      createCoreHomeSnapshotV1({
        ...input,
        sourceFreshness: {
          ...input.sourceFreshness,
          generatedAt: '2026-09-26T07:00:01.000Z',
        },
      }),
    /generatedAt must match/,
  );

  assert.throws(
    () =>
      createCoreHomeSnapshotV1({
        ...input,
        attention: {
          ...input.attention,
          total: 2,
        },
      }),
    /attention total must equal/,
  );

  assert.throws(
    () =>
      createCoreHomeSnapshotV1({
        ...input,
        usage: {
          ...input.usage,
          totalTokens: -1,
        },
      }),
    /usage totalTokens must be a non-negative integer/,
  );
});

test('web source has no model-runtime or ProviderAdapter dependency path', async () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const srcDir = path.resolve(testDir, '../src');
  const files = (await readdir(srcDir)).filter((name) => name.endsWith('.ts'));

  for (const file of files) {
    const source = await readFile(path.join(srcDir, file), 'utf8');
    assert.doesNotMatch(
      source,
      /from\s+['"][^'"]*model-runtime[^'"]*['"]/,
      file + ' must not import model-runtime',
    );
    assert.doesNotMatch(
      source,
      /import\s+type[\s\S]*ProviderAdapter[\s\S]*from/,
      file + ' must not import ProviderAdapter',
    );
    assert.doesNotMatch(
      source,
      /import\s*\{[\s\S]*ProviderAdapter[\s\S]*\}\s*from/,
      file + ' must not import ProviderAdapter',
    );
  }
});
