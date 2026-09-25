import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCausalRunSummary,
  causalTracingCanGrantAuthority,
  causalTracingCanPersistHiddenReasoning,
  createCausalSpan,
} from '../dist/index.js';

function span(overrides = {}) {
  return createCausalSpan({
    traceId: 'trace-001',
    spanId: 'span-root',
    parentSpanId: null,
    causationId: null,
    nodeId: 'node-root',
    kind: 'OTHER',
    startedAtMs: 0,
    finishedAtMs: 10,
    queueMs: 0,
    attempt: 1,
    status: 'SUCCEEDED',
    ...overrides,
  });
}

test('causal summary is deterministic and identifies parallelism and critical path', () => {
  const spans = [
    span(),
    span({
      spanId: 'span-a',
      parentSpanId: 'span-root',
      nodeId: 'node-a',
      kind: 'PARALLEL_BRANCH',
      startedAtMs: 10,
      finishedAtMs: 30,
      queueMs: 5,
    }),
    span({
      spanId: 'span-b',
      parentSpanId: 'span-root',
      nodeId: 'node-b',
      kind: 'PARALLEL_BRANCH',
      startedAtMs: 10,
      finishedAtMs: 20,
      queueMs: 2,
    }),
    span({
      spanId: 'span-join',
      parentSpanId: 'span-a',
      causationId: 'span-b',
      nodeId: 'node-join',
      kind: 'JOIN',
      startedAtMs: 30,
      finishedAtMs: 35,
      queueMs: 0,
    }),
  ];

  const first = buildCausalRunSummary(spans);
  const second = buildCausalRunSummary([...spans].reverse());

  assert.deepEqual(first, second);
  assert.equal(first.wallClockMs, 35);
  assert.equal(first.criticalPathMs, 40);
  assert.deepEqual(first.criticalPathSpanIds, ['span-root', 'span-a', 'span-join']);
  assert.equal(first.maxConcurrentSpans, 2);
  assert.equal(first.parallelismObserved, true);
  assert.equal(first.authority, 'NONE');
});

test('causal summary reports failed and blocked spans without hidden reasoning persistence', () => {
  const summary = buildCausalRunSummary([
    span({ status: 'FAILED' }),
    span({
      spanId: 'span-blocked',
      parentSpanId: 'span-root',
      nodeId: 'node-blocked',
      kind: 'GATE',
      startedAtMs: 10,
      finishedAtMs: 11,
      status: 'BLOCKED',
    }),
  ]);

  assert.deepEqual(summary.failedSpanIds, ['span-root']);
  assert.deepEqual(summary.blockedSpanIds, ['span-blocked']);
  assert.equal(causalTracingCanGrantAuthority(), false);
  assert.equal(causalTracingCanPersistHiddenReasoning(), false);
});

test('causal tracing fails closed on malformed identity timing parent graph and tamper', () => {
  assert.throws(() => span({ traceId: 'x' }), /traceId/);
  assert.throws(() => span({ spanId: 'x' }), /spanId/);
  assert.throws(() => span({ nodeId: 'x' }), /nodeId/);
  assert.throws(() => span({ parentSpanId: 'span-root' }), /parent itself/);
  assert.throws(() => span({ finishedAtMs: 0 }), /greater than startedAtMs/);
  assert.throws(() => span({ queueMs: -1 }), /queueMs/);
  assert.throws(() => span({ attempt: 0 }), /attempt/);
  assert.throws(() => span({ kind: 'UNKNOWN' }), /unsupported causal span kind/);
  assert.throws(() => span({ status: 'UNKNOWN' }), /unsupported causal span status/);

  const root = span();
  const child = span({
    spanId: 'span-child',
    parentSpanId: 'span-root',
    nodeId: 'node-child',
    startedAtMs: 10,
    finishedAtMs: 12,
  });
  assert.throws(
    () => buildCausalRunSummary([{ ...root, durationMs: 999 }, child]),
    /not canonical/,
  );
  assert.throws(
    () => buildCausalRunSummary([root, { ...child, parentSpanId: 'span-missing' }]),
    /parent is missing/,
  );

  const cycleA = span({
    spanId: 'span-cycle-a',
    parentSpanId: 'span-cycle-b',
    nodeId: 'node-cycle-a',
  });
  const cycleB = span({
    spanId: 'span-cycle-b',
    parentSpanId: 'span-cycle-a',
    nodeId: 'node-cycle-b',
    startedAtMs: 10,
    finishedAtMs: 20,
  });
  assert.throws(() => buildCausalRunSummary([cycleA, cycleB]), /cycle detected/);

  assert.throws(
    () => buildCausalRunSummary([root, span({ traceId: 'trace-002', spanId: 'span-other' })]),
    /share one traceId/,
  );
});
