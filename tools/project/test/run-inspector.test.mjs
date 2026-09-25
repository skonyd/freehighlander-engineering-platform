import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SqliteTelemetryStore } from '@freehighlander/persistence';

import {
  buildRunInspectorReport,
  loadRunEvents,
  runInspectorCanGrantAuthority,
  runInspectorCanPersistHiddenReasoning,
} from '../lib/run-inspector.mjs';

function spanEvent(overrides = {}) {
  return {
    schemaVersion: 1,
    type: 'orchestration.span.completed',
    timestamp: '2026-09-25T04:00:10.000Z',
    runId: 'run-001',
    node: { id: 'node-root', type: 'MODEL' },
    model: {
      logicalRole: 'controller',
      bindingId: 'binding-controller',
      provider: 'provider-a',
      model: 'model-a',
      effort: 'medium',
    },
    execution: {
      status: 'SUCCEEDED',
      result: 'PASS',
      retryCount: 0,
      fallbackCount: 0,
    },
    artifactIds: ['artifact-b', 'artifact-a'],
    evidenceIds: ['evidence-a'],
    payload: {
      kind: 'SPAN',
      traceId: 'trace-001',
      spanId: 'span-root',
      nodeId: 'node-root',
      spanKind: 'MODEL',
      status: 'SUCCEEDED',
      attempt: 1,
      durationMs: 10,
      queueMs: 2,
    },
    ...overrides,
  };
}

function summaryEvent(overrides = {}) {
  return {
    schemaVersion: 1,
    type: 'orchestration.run.summary',
    timestamp: '2026-09-25T04:00:40.000Z',
    runId: 'run-001',
    payload: {
      kind: 'RUN_SUMMARY',
      traceId: 'trace-001',
      wallClockMs: 40,
      criticalPathMs: 32,
      criticalPathSpanIds: ['span-root', 'span-a', 'span-join'],
      spanCount: 4,
      maxConcurrentSpans: 2,
      parallelismObserved: true,
    },
    ...overrides,
  };
}

function representativeEvents() {
  return [
    spanEvent(),
    spanEvent({
      timestamp: '2026-09-25T04:00:25.000Z',
      node: { id: 'node-a', type: 'MODEL' },
      payload: {
        kind: 'SPAN',
        traceId: 'trace-001',
        spanId: 'span-a',
        parentSpanId: 'span-root',
        nodeId: 'node-a',
        spanKind: 'PARALLEL_BRANCH',
        status: 'SUCCEEDED',
        attempt: 1,
        durationMs: 15,
        queueMs: 1,
      },
    }),
    spanEvent({
      timestamp: '2026-09-25T04:00:20.000Z',
      node: { id: 'node-b', type: 'COMMAND' },
      model: undefined,
      payload: {
        kind: 'SPAN',
        traceId: 'trace-001',
        spanId: 'span-b',
        parentSpanId: 'span-root',
        nodeId: 'node-b',
        spanKind: 'PARALLEL_BRANCH',
        status: 'SUCCEEDED',
        attempt: 1,
        durationMs: 10,
        queueMs: 0,
      },
    }),
    spanEvent({
      timestamp: '2026-09-25T04:00:35.000Z',
      node: { id: 'node-join', type: 'JOIN' },
      model: undefined,
      payload: {
        kind: 'SPAN',
        traceId: 'trace-001',
        spanId: 'span-join',
        parentSpanId: 'span-a',
        causationId: 'span-b',
        nodeId: 'node-join',
        spanKind: 'JOIN',
        status: 'SUCCEEDED',
        attempt: 1,
        durationMs: 5,
        queueMs: 0,
      },
    }),
    {
      schemaVersion: 1,
      type: 'reuse.diagnostic',
      timestamp: '2026-09-25T04:00:30.000Z',
      runId: 'run-001',
      node: { id: 'node-a' },
      payload: {
        status: 'REUSABLE',
        hit: true,
        reasonCode: 'EXACT_IDENTITY_MATCH',
        internalDetail: 'not-exposed',
      },
    },
    {
      schemaVersion: 1,
      type: 'policy.decision',
      timestamp: '2026-09-25T04:00:34.000Z',
      runId: 'run-001',
      node: { id: 'node-join' },
      execution: { status: 'PASS' },
      payload: {
        outcome: 'ALLOW',
        reasonCode: 'MANDATORY_JOIN_READY',
        policyHash: 'a'.repeat(64),
        internalDetail: 'not-exposed',
      },
    },
    summaryEvent(),
  ];
}

test('run inspector reconstructs causal flow parallel branches and critical path', () => {
  const report = buildRunInspectorReport(representativeEvents());

  assert.equal(report.runId, 'run-001');
  assert.equal(report.traceId, 'trace-001');
  assert.equal(report.traceAvailable, true);
  assert.deepEqual(report.rootSpanIds, ['span-root']);
  assert.deepEqual(report.parallelBranchSpanIds, ['span-b', 'span-a']);
  assert.deepEqual(report.summary.criticalPathSpanIds, ['span-root', 'span-a', 'span-join']);

  const root = report.timeline.find((span) => span.spanId === 'span-root');
  const branchA = report.timeline.find((span) => span.spanId === 'span-a');
  const branchB = report.timeline.find((span) => span.spanId === 'span-b');
  const join = report.timeline.find((span) => span.spanId === 'span-join');

  assert.deepEqual(root.childSpanIds, ['span-a', 'span-b']);
  assert.equal(branchA.parentSpanId, 'span-root');
  assert.equal(branchB.parentSpanId, 'span-root');
  assert.equal(join.causationId, 'span-b');
  assert.equal(branchA.criticalPath, true);
  assert.equal(branchB.criticalPath, false);
  assert.equal(root.model.bindingId, 'binding-controller');
  assert.deepEqual(root.artifactIds, ['artifact-a', 'artifact-b']);
  assert.equal(report.reuseDiagnostics[0].status, 'REUSABLE');
  assert.equal(report.reuseDiagnostics[0].reused, true);
  assert.equal(report.gateOutcomes[0].reasonCode, 'MANDATORY_JOIN_READY');
  assert.equal(JSON.stringify(report).includes('internalDetail'), false);
  assert.equal(JSON.stringify(report).includes('not-exposed'), false);
  assert.equal(report.authority, 'NONE');
  assert.equal(report.hiddenReasoningPersisted, false);
  assert.equal(runInspectorCanGrantAuthority(), false);
  assert.equal(runInspectorCanPersistHiddenReasoning(), false);
});

test('run inspector fails closed on mixed traces missing parents and summary drift', () => {
  const mixed = representativeEvents();
  mixed[1] = spanEvent({
    ...mixed[1],
    payload: { ...mixed[1].payload, traceId: 'trace-002' },
  });
  assert.throws(() => buildRunInspectorReport(mixed), /share one traceId/);

  const missingParent = representativeEvents();
  missingParent[1] = spanEvent({
    ...missingParent[1],
    payload: { ...missingParent[1].payload, parentSpanId: 'span-missing' },
  });
  assert.throws(() => buildRunInspectorReport(missingParent), /parent is missing/);

  const summaryDrift = representativeEvents();
  summaryDrift[summaryDrift.length - 1] = summaryEvent({
    payload: { ...summaryEvent().payload, spanCount: 99 },
  });
  assert.throws(() => buildRunInspectorReport(summaryDrift), /spanCount mismatch/);
});

test('run inspector reads an existing telemetry database without mutating event order', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-run-inspector-'));
  const databasePath = path.join(root, 'telemetry.sqlite');
  const store = new SqliteTelemetryStore(databasePath);

  try {
    for (const event of representativeEvents()) store.ingest(event);
  } finally {
    store.close();
  }

  try {
    const loaded = loadRunEvents(databasePath, 'run-001');
    assert.equal(loaded.length, representativeEvents().length);
    assert.deepEqual(
      loaded.map((event) => event.type),
      representativeEvents()
        .slice()
        .sort(
          (left, right) =>
            Date.parse(left.timestamp) - Date.parse(right.timestamp),
        )
        .map((event) => event.type),
    );
    assert.equal(buildRunInspectorReport(loaded).summary.maxConcurrentSpans, 2);
    assert.deepEqual(loadRunEvents(databasePath, 'missing-run'), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('run inspector rejects invalid limits and missing databases', () => {
  assert.throws(() => loadRunEvents('/missing/telemetry.sqlite', 'run-001'), /does not exist/);
  assert.throws(() => loadRunEvents('/missing/telemetry.sqlite', 'run-001', 0), /limit/);
  assert.throws(() => buildRunInspectorReport([]), /at least one event/);
});
