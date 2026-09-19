import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  InMemoryEventSink,
  JsonlFileEventSink,
  TelemetryEmitter,
  createEvent,
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

  await emitter.emit('run.started', { trigger: 'test' });

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
  assert.equal(totalUsageTokens({ inputTokens: 100, cachedInputTokens: 80, totalTokens: 120 }), 120);
  assert.equal(totalUsageTokens({}), undefined);
});
