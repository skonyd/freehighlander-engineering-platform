import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  InMemoryEventSink,
  JsonlFileEventSink,
  TelemetryEmitter,
  cachedInputShare,
  createEvent,
  createModelCatalogEvent,
  createOrchestrationTraceEvent,
  parseEvent,
  readJsonlEvents,
  serializeEvent,
  totalUsageTokens,
} from '../dist/index.js';

test('event schema is versioned and preserves run/workflow/model metadata', () => {
  const event = createEvent({
    type: 'model.call.completed',
    timestamp: '2026-09-19T20:00:00.000Z',
    runId: 'run-1',
    taskId: 'task-1',
    revision: {
      repository: 'skonyd/freehighlander-engineering-platform',
      baseSha: 'base',
      headSha: 'head',
    },
    workflow: { id: 'pr-review', version: '1.0.0', hash: 'wf-hash' },
    node: { id: 'review', type: 'MODEL' },
    model: {
      logicalRole: 'test-reviewer',
      bindingId: 'opus-medium',
      provider: 'claude-cli',
      model: 'opus',
      effort: 'medium',
    },
    context: {
      profile: 'review',
      packetId: 'ctx-1',
      packetHash: 'packet-hash',
      promptVersion: 'review:v3',
      contractHash: 'contract-hash',
      semanticReuseKey: 'reuse-key',
      cacheKeyOrPrefixVersion: 'review-prefix:v3',
    },
    execution: {
      status: 'PASS',
      durationMs: 1234,
      retryCount: 0,
      fallbackCount: 0,
    },
    usage: {
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 30,
      reasoningTokens: 10,
      totalTokens: 140,
    },
    payload: { artifactId: 'artifact-1' },
  });

  const parsed = parseEvent(serializeEvent(event));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.runId, 'run-1');
  assert.equal(parsed.model?.logicalRole, 'test-reviewer');
  assert.equal(parsed.context?.semanticReuseKey, 'reuse-key');
  assert.equal(parsed.context?.cacheKeyOrPrefixVersion, 'review-prefix:v3');
  assert.equal(parsed.usage?.reasoningTokens, 10);
});

test('event creation rejects empty run ID and invalid timestamp', () => {
  assert.throws(
    () =>
      createEvent({
        type: 'run.started',
        timestamp: '2026-09-19T20:00:00.000Z',
        runId: ' ',
        payload: {},
      }),
    /runId is required/,
  );

  assert.throws(
    () =>
      createEvent({
        type: 'run.started',
        timestamp: 'not-a-time',
        runId: 'run-1',
        payload: {},
      }),
    /timestamp/,
  );
});

test('TelemetryEmitter carries stable run context without prompt/completion content defaults', async () => {
  const sink = new InMemoryEventSink();
  const emitter = new TelemetryEmitter(
    {
      runId: 'run-1',
      taskId: 'task-1',
      workflow: { id: 'wf', version: '1.0.0', hash: 'hash' },
    },
    sink,
    { now: () => new Date('2026-09-19T20:00:00.000Z') },
  );

  await emitter.emit('context.packet.built', { itemCount: 3 });

  assert.equal(sink.events.length, 1);
  assert.equal(sink.events[0]?.timestamp, '2026-09-19T20:00:00.000Z');
  assert.equal(sink.events[0]?.taskId, 'task-1');
  assert.equal('prompt' in (sink.events[0] ?? {}), false);
  assert.equal('completion' in (sink.events[0] ?? {}), false);
});

test('JSONL sink appends concurrent events in invocation order without corrupt lines', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-telemetry-'));
  const file = path.join(root, 'state', 'events.jsonl');

  try {
    const sink = new JsonlFileEventSink(file, { durable: false });
    const events = Array.from({ length: 20 }, (_, index) =>
      createEvent({
        type: 'node.completed',
        timestamp: `2026-09-19T20:00:${String(index).padStart(2, '0')}.000Z`,
        runId: 'run-concurrent',
        node: { id: `node-${index}`, type: 'COMMAND' },
        payload: { index },
      }),
    );

    await Promise.all(events.map((event) => sink.append(event)));

    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    assert.equal(lines.length, 20);

    const restored = await readJsonlEvents(file);
    assert.deepEqual(
      restored.map((event) => event.payload.index),
      Array.from({ length: 20 }, (_, index) => index),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('JSONL read returns empty history when file does not exist', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-telemetry-empty-'));

  try {
    assert.deepEqual(await readJsonlEvents(path.join(root, 'missing.jsonl')), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('JSONL read reports the corrupt line number', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-telemetry-corrupt-'));
  const file = path.join(root, 'events.jsonl');

  try {
    const sink = new JsonlFileEventSink(file, { durable: false });
    await sink.append(
      createEvent({
        type: 'run.started',
        timestamp: '2026-09-19T20:00:00.000Z',
        runId: 'run-1',
        payload: {},
      }),
    );

    const { appendFile } = await import('node:fs/promises');
    await appendFile(file, '{broken-json}\n', 'utf8');

    await assert.rejects(() => readJsonlEvents(file), /line 2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('usage totals prefer provider total and otherwise derive known billable token fields', () => {
  assert.equal(totalUsageTokens({ inputTokens: 100, outputTokens: 20, reasoningTokens: 5 }), 125);
  assert.equal(
    totalUsageTokens({ inputTokens: 100, cachedInputTokens: 80, totalTokens: 120 }),
    120,
  );
  assert.equal(totalUsageTokens({}), undefined);
});

test('cached input share is bounded and unavailable without denominator', () => {
  assert.equal(cachedInputShare({ inputTokens: 100, cachedInputTokens: 40 }), 0.4);
  assert.equal(cachedInputShare({ inputTokens: 100, cachedInputTokens: 120 }), 1);
  assert.equal(cachedInputShare({ inputTokens: 0, cachedInputTokens: 0 }), undefined);
  assert.equal(cachedInputShare({ inputTokens: 100 }), undefined);
});

test('provider resilience telemetry is metadata-only and circuit-aware', () => {
  const event = createEvent({
    type: 'provider.circuit.opened',
    timestamp: '2026-09-19T20:00:00.000Z',
    runId: 'run-provider',
    provider: {
      id: 'qwen-local',
      available: false,
      circuitState: 'OPEN',
      failureKind: 'quota_exhausted',
      nextProbeAtMs: 5000,
      retryAfterMs: 4000,
    },
    payload: {
      reason: 'availability failure threshold reached',
    },
  });

  const restored = parseEvent(serializeEvent(event));
  assert.equal(restored.provider?.id, 'qwen-local');
  assert.equal(restored.provider?.circuitState, 'OPEN');
  assert.equal(restored.provider?.failureKind, 'quota_exhausted');
  assert.equal('prompt' in restored, false);
  assert.equal('completion' in restored, false);
});

test('model catalog telemetry accepts metadata-only refresh/binding/qualification events', () => {
  const refresh = createModelCatalogEvent({
    type: 'model.catalog.refreshed',
    timestamp: '2026-09-24T18:00:00.000Z',
    runId: 'catalog-refresh-1',
    payload: {
      action: 'REFRESH',
      providerId: 'provider-a',
      previousHash: 'a'.repeat(64),
      currentHash: 'b'.repeat(64),
      itemCount: 12,
    },
  });
  assert.equal(refresh.payload.action, 'REFRESH');
  assert.equal(refresh.payload.itemCount, 12);

  const binding = createModelCatalogEvent({
    type: 'model.binding.changed',
    timestamp: '2026-09-24T18:01:00.000Z',
    runId: 'binding-change-1',
    payload: {
      action: 'BINDING_CHANGE',
      providerId: 'provider-a',
      modelId: 'model-a',
      bindingId: 'reviewer-primary',
      logicalRole: 'reviewer',
      riskTier: 'HIGH',
      previousHash: 'b'.repeat(64),
      currentHash: 'c'.repeat(64),
      previousState: 'model-old',
      currentState: 'model-a',
    },
  });
  assert.equal(binding.payload.bindingId, 'reviewer-primary');

  const qualification = createModelCatalogEvent({
    type: 'model.qualification.changed',
    timestamp: '2026-09-24T18:02:00.000Z',
    runId: 'qualification-change-1',
    payload: {
      action: 'QUALIFICATION_CHANGE',
      providerId: 'provider-a',
      modelId: 'model-a',
      logicalRole: 'reviewer',
      riskTier: 'HIGH',
      currentHash: 'd'.repeat(64),
      previousState: 'SHADOW_VERIFIED',
      currentState: 'ELIGIBLE',
    },
  });
  assert.equal(qualification.payload.currentState, 'ELIGIBLE');
});

test('model catalog telemetry rejects secret-like extra fields and malformed metadata', () => {
  assert.throws(
    () =>
      createModelCatalogEvent({
        type: 'model.catalog.refreshed',
        timestamp: '2026-09-24T18:00:00.000Z',
        runId: 'bad-refresh',
        payload: {
          action: 'REFRESH',
          providerId: 'provider-a',
          currentHash: 'a'.repeat(64),
          apiKey: 'secret-value',
        },
      }),
    /field is not allowed: apiKey/,
  );

  assert.throws(
    () =>
      createModelCatalogEvent({
        type: 'model.catalog.refreshed',
        timestamp: '2026-09-24T18:00:00.000Z',
        runId: 'bad-refresh',
        payload: {
          action: 'REFRESH',
          providerId: 'provider-a',
          modelId: 'must-not-be-present',
          currentHash: 'a'.repeat(64),
        },
      }),
    /must remain aggregate/,
  );

  assert.throws(
    () =>
      createModelCatalogEvent({
        type: 'model.binding.changed',
        timestamp: '2026-09-24T18:00:00.000Z',
        runId: 'bad-binding',
        payload: {
          action: 'BINDING_CHANGE',
          providerId: 'provider-a',
          bindingId: 'reviewer-primary',
          currentHash: 'not-a-hash',
        },
      }),
    /currentHash/,
  );
});

test('model catalog telemetry validates bounded optional metadata branches', () => {
  const base = {
    type: 'model.binding.changed',
    timestamp: '2026-09-24T18:03:00.000Z',
    runId: 'validation-branches',
  };

  assert.throws(
    () =>
      createModelCatalogEvent({
        ...base,
        payload: {
          action: 'BINDING_CHANGE',
          providerId: '   ',
          currentHash: 'a'.repeat(64),
        },
      }),
    /providerId is required/,
  );

  for (const [field, value] of [
    ['modelId', ''],
    ['bindingId', ' '],
    ['logicalRole', ''],
    ['previousState', ' '],
    ['currentState', ''],
  ]) {
    assert.throws(
      () =>
        createModelCatalogEvent({
          ...base,
          payload: {
            action: 'BINDING_CHANGE',
            providerId: 'provider-a',
            currentHash: 'a'.repeat(64),
            [field]: value,
          },
        }),
      new RegExp(field),
    );
  }

  assert.throws(
    () =>
      createModelCatalogEvent({
        ...base,
        payload: {
          action: 'BINDING_CHANGE',
          providerId: 'provider-a',
          previousHash: 'BAD',
          currentHash: 'a'.repeat(64),
        },
      }),
    /previousHash/,
  );

  assert.throws(
    () =>
      createModelCatalogEvent({
        ...base,
        payload: {
          action: 'BINDING_CHANGE',
          providerId: 'provider-a',
          riskTier: 'INVALID',
          currentHash: 'a'.repeat(64),
        },
      }),
    /riskTier is invalid/,
  );

  for (const itemCount of [-1, 1.5]) {
    assert.throws(
      () =>
        createModelCatalogEvent({
          ...base,
          payload: {
            action: 'BINDING_CHANGE',
            providerId: 'provider-a',
            currentHash: 'a'.repeat(64),
            itemCount,
          },
        }),
      /itemCount/,
    );
  }

  assert.throws(
    () =>
      createModelCatalogEvent({
        type: 'model.catalog.refreshed',
        timestamp: base.timestamp,
        runId: base.runId,
        payload: {
          action: 'BINDING_CHANGE',
          providerId: 'provider-a',
          currentHash: 'a'.repeat(64),
        },
      }),
    /action does not match event type/,
  );
});

test('orchestration trace telemetry emits strict metadata-only span and run summary events', () => {
  const span = createOrchestrationTraceEvent({
    type: 'orchestration.span.completed',
    timestamp: '2026-09-25T04:30:00.000Z',
    runId: 'run-trace-1',
    payload: {
      kind: 'SPAN',
      traceId: 'trace-001',
      spanId: 'span-a',
      parentSpanId: 'span-root',
      causationId: 'cause-001',
      nodeId: 'node-a',
      spanKind: 'MODEL',
      status: 'SUCCEEDED',
      attempt: 1,
      durationMs: 120,
      queueMs: 8,
    },
  });
  assert.equal(span.payload.durationMs, 120);

  const summary = createOrchestrationTraceEvent({
    type: 'orchestration.run.summary',
    timestamp: '2026-09-25T04:30:01.000Z',
    runId: 'run-trace-1',
    payload: {
      kind: 'RUN_SUMMARY',
      traceId: 'trace-001',
      wallClockMs: 300,
      criticalPathMs: 240,
      criticalPathSpanIds: ['span-root', 'span-a', 'span-join'],
      spanCount: 4,
      maxConcurrentSpans: 2,
      parallelismObserved: true,
    },
  });
  assert.equal(summary.payload.parallelismObserved, true);
  assert.equal(JSON.stringify(summary).includes('prompt'), false);
});

test('orchestration trace telemetry rejects raw content mismatched kinds and malformed metrics', () => {
  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        type: 'orchestration.span.completed',
        timestamp: '2026-09-25T04:30:00.000Z',
        runId: 'run-trace-1',
        payload: {
          kind: 'SPAN',
          traceId: 'trace-001',
          spanId: 'span-a',
          nodeId: 'node-a',
          spanKind: 'MODEL',
          status: 'SUCCEEDED',
          attempt: 1,
          durationMs: 120,
          prompt: 'must-not-persist',
        },
      }),
    /field is not allowed: prompt/,
  );

  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        type: 'orchestration.run.summary',
        timestamp: '2026-09-25T04:30:01.000Z',
        runId: 'run-trace-1',
        payload: {
          kind: 'SPAN',
          traceId: 'trace-001',
          spanId: 'span-a',
          nodeId: 'node-a',
          spanKind: 'MODEL',
          status: 'SUCCEEDED',
          attempt: 1,
          durationMs: 120,
        },
      }),
    /kind does not match event type/,
  );

  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        type: 'orchestration.span.completed',
        timestamp: '2026-09-25T04:30:00.000Z',
        runId: 'run-trace-1',
        payload: {
          kind: 'SPAN',
          traceId: 'trace-001',
          spanId: 'span-a',
          nodeId: 'node-a',
          spanKind: 'MODEL',
          status: 'SUCCEEDED',
          attempt: 0,
          durationMs: -1,
        },
      }),
    /non-negative integer|attempt must be >= 1/,
  );

  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        type: 'orchestration.run.summary',
        timestamp: '2026-09-25T04:30:01.000Z',
        runId: 'run-trace-1',
        payload: {
          kind: 'RUN_SUMMARY',
          traceId: 'trace-001',
          wallClockMs: 300,
          criticalPathMs: 240,
          criticalPathSpanIds: ['span-a', 'span-a'],
          spanCount: 2,
          maxConcurrentSpans: 1,
          parallelismObserved: false,
        },
      }),
    /criticalPathSpanIds must be unique/,
  );
});


test('orchestration trace telemetry covers required-field and scalar validation guards', () => {
  const baseSpan = {
    type: 'orchestration.span.completed',
    timestamp: '2026-09-25T04:30:00.000Z',
    runId: 'run-trace-guards',
    payload: {
      kind: 'SPAN',
      traceId: 'trace-guards',
      spanId: 'span-a',
      nodeId: 'node-a',
      spanKind: 'MODEL',
      status: 'SUCCEEDED',
      attempt: 1,
      durationMs: 1,
    },
  };

  const { durationMs: _durationMs, ...spanWithoutDuration } = baseSpan.payload;
  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        ...baseSpan,
        payload: spanWithoutDuration,
      }),
    /requires durationMs/,
  );

  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        ...baseSpan,
        payload: { ...baseSpan.payload, nodeId: '' },
      }),
    /nodeId must not be empty/,
  );

  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        ...baseSpan,
        payload: { ...baseSpan.payload, traceId: '' },
      }),
    /traceId must not be empty|traceId is required/,
  );

  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        ...baseSpan,
        payload: { ...baseSpan.payload, queueMs: 1.5 },
      }),
    /queueMs must be a non-negative integer/,
  );

  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        ...baseSpan,
        payload: { ...baseSpan.payload, attempt: 0 },
      }),
    /attempt must be >= 1/,
  );

  const baseSummary = {
    type: 'orchestration.run.summary',
    timestamp: '2026-09-25T04:30:01.000Z',
    runId: 'run-trace-guards',
    payload: {
      kind: 'RUN_SUMMARY',
      traceId: 'trace-guards',
      wallClockMs: 10,
      criticalPathMs: 8,
      criticalPathSpanIds: ['span-a'],
      spanCount: 1,
      maxConcurrentSpans: 1,
      parallelismObserved: false,
    },
  };

  const { maxConcurrentSpans: _maxConcurrentSpans, ...summaryWithoutConcurrency } =
    baseSummary.payload;
  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        ...baseSummary,
        payload: summaryWithoutConcurrency,
      }),
    /requires maxConcurrentSpans/,
  );

  assert.throws(
    () =>
      createOrchestrationTraceEvent({
        ...baseSummary,
        payload: { ...baseSummary.payload, criticalPathSpanIds: [''] },
      }),
    /criticalPathSpanIds must not be empty/,
  );
});
