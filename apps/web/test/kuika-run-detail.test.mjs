import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaRunDetailV1,
  fhKuikaRunDetailCanExposeRawPayload,
  fhKuikaRunDetailCanGrantAuthority,
  fhKuikaRunDetailCanInvokeModel,
  fhKuikaRunDetailCanMutateRuntime,
} from '../dist/index.js';

const run = {
  runId: 'run-1',
  taskId: 'task-1',
  firstTimestamp: '2026-09-26T10:00:00.000Z',
  lastTimestamp: '2026-09-26T10:00:05.000Z',
  status: 'FAILED',
  repository: 'skonyd/freehighlander-engineering-platform',
  pullRequest: 319,
  branch: 'feat/test',
  headSha: 'a'.repeat(40),
  workflowId: 'review',
  workflowVersion: '1.0.0',
  humanRequired: false,
  eventCount: 6,
  modelCallCount: 1,
};

function source() {
  return {
    runDetail(id) {
      if (id !== 'run-1') return null;
      return {
        run,
        events: [
          {
            type: 'run.started',
            timestamp: '2026-09-26T10:00:00.000Z',
            nodeId: null,
            nodeType: null,
            status: 'RUNNING',
            result: null,
            failureClass: null,
            event: {
              schemaVersion: 1,
              type: 'run.started',
              timestamp: '2026-09-26T10:00:00.000Z',
              runId: 'run-1',
              payload: { raw: 'must-not-project' },
            },
          },
          {
            type: 'model.call.completed',
            timestamp: '2026-09-26T10:00:01.000Z',
            nodeId: 'review-node',
            nodeType: 'MODEL',
            status: 'FAILED',
            result: 'UNAVAILABLE',
            failureClass: 'quota',
            event: {
              schemaVersion: 1,
              type: 'model.call.completed',
              timestamp: '2026-09-26T10:00:01.000Z',
              runId: 'run-1',
              model: {
                logicalRole: 'reviewer',
                provider: 'openai',
                model: 'gpt',
                effort: 'medium',
              },
              artifactIds: ['artifact-2', 'artifact-1'],
              evidenceIds: ['evidence-2', 'evidence-1'],
              payload: { prompt: 'must-not-project' },
            },
          },
          {
            type: 'gate.completed',
            timestamp: '2026-09-26T10:00:02.000Z',
            nodeId: 'policy-gate',
            nodeType: 'GATE',
            status: 'COMPLETED',
            result: 'BLOCKED',
            failureClass: 'policy',
            event: {
              schemaVersion: 1,
              type: 'gate.completed',
              timestamp: '2026-09-26T10:00:02.000Z',
              runId: 'run-1',
              evidenceIds: ['evidence-1'],
              payload: {},
            },
          },
          {
            type: 'tool.call.completed',
            timestamp: '2026-09-26T10:00:03.000Z',
            nodeId: 'tool-node',
            nodeType: 'COMMAND',
            status: 'COMPLETED',
            result: 'PASS',
            failureClass: null,
            event: {
              schemaVersion: 1,
              type: 'tool.call.completed',
              timestamp: '2026-09-26T10:00:03.000Z',
              runId: 'run-1',
              artifactIds: ['artifact-3'],
              payload: { stdout: 'must-not-project' },
            },
          },
          {
            type: 'runtime.error.reported',
            timestamp: '2026-09-26T10:00:04.000Z',
            nodeId: 'review-node',
            nodeType: 'MODEL',
            status: 'FAILED',
            result: null,
            failureClass: 'quota',
            event: {
              schemaVersion: 1,
              type: 'runtime.error.reported',
              timestamp: '2026-09-26T10:00:04.000Z',
              runId: 'run-1',
              payload: { safeForUserDisplay: true },
            },
          },
        ],
        runtimeErrors: [
          {
            timestamp: '2026-09-26T10:00:04.000Z',
            nodeId: 'review-node',
            code: 'PROVIDER_QUOTA',
            severity: 'ERROR',
            retryable: true,
            correlationId: 'corr-12345678',
            causeCode: 'QUOTA_EXHAUSTED',
            causeKind: 'QUOTA_EXHAUSTED',
            certainty: 'CONFIRMED_SIGNAL',
            headline: 'Provider quota exhausted',
            sourceComponent: 'model-runtime',
            sourceOperation: 'provider-invoke',
            failedStep: 'Invoke selected provider binding',
            rootCause: 'The provider reported that quota is exhausted.',
            observedSignal: 'HTTP 429 quota_exhausted',
            nextAction: 'Use the configured fallback or retry after reset.',
            retryAt: null,
          },
        ],
        modelCalls: [
          {
            timestamp: '2026-09-26T10:00:01.000Z',
            logicalRole: 'reviewer',
            bindingId: 'reviewer-gpt',
            provider: 'openai',
            model: 'gpt',
            effort: 'medium',
            status: 'FAILED',
            result: 'UNAVAILABLE',
            durationMs: 800,
            retryCount: 0,
            fallbackCount: 1,
            failureClass: 'quota',
            inputTokens: 100,
            cachedInputTokens: 20,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 100,
            estimatedCostUsd: 0.01,
            actualCostUsd: 0.01,
          },
        ],
        artifacts: [
          {
            artifactId: 'artifact-1',
            firstSeenTimestamp: '2026-09-26T10:00:01.000Z',
            lastSeenTimestamp: '2026-09-26T10:00:01.000Z',
            state: 'CREATED',
          },
        ],
      };
    },
  };
}

test('FH-KUIKA run detail projects deterministic timeline, calls and evidence without raw payloads', () => {
  const detail = buildFhKuikaRunDetailV1(source(), 'run-1');

  assert.ok(detail);
  assert.equal(detail.schemaVersion, 1);
  assert.equal(detail.run.runId, 'run-1');
  assert.equal(detail.projectionAuthority, 'NONE');
  assert.deepEqual(
    detail.timeline.map((item) => item.kind),
    ['RUN', 'MODEL', 'GATE', 'TOOL', 'ERROR'],
  );
  assert.equal(detail.timeline[1]?.logicalRole, 'reviewer');
  assert.equal(detail.timeline[1]?.model, 'gpt');
  assert.equal(detail.timeline[2]?.result, 'BLOCKED');
  assert.deepEqual(detail.evidence.evidenceIds, ['evidence-1', 'evidence-2']);
  assert.deepEqual(detail.evidence.artifactIds, ['artifact-1', 'artifact-2', 'artifact-3']);
  assert.equal(detail.modelCalls.length, 1);
  assert.equal(detail.runtimeErrors[0]?.certainty, 'CONFIRMED_SIGNAL');
  assert.equal('event' in detail.timeline[0], false);
  assert.equal('payload' in detail.timeline[0], false);
});

test('FH-KUIKA run detail returns null for unknown runs and validates bounds', () => {
  assert.equal(buildFhKuikaRunDetailV1(source(), 'missing'), null);
  assert.throws(() => buildFhKuikaRunDetailV1(source(), '   '), /runId is required/);
  assert.throws(() => buildFhKuikaRunDetailV1(source(), 'run-1', 0), /limit/);
});

test('FH-KUIKA run detail remains read-only, zero-model and authority-neutral', () => {
  assert.equal(fhKuikaRunDetailCanInvokeModel(), false);
  assert.equal(fhKuikaRunDetailCanMutateRuntime(), false);
  assert.equal(fhKuikaRunDetailCanGrantAuthority(), false);
  assert.equal(fhKuikaRunDetailCanExposeRawPayload(), false);
});
