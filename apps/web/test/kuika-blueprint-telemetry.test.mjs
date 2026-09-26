import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blueprintTelemetryCanGrantAuthority,
  blueprintTelemetryCanInvokeModel,
  blueprintTelemetryCanModifyBlueprint,
  buildFhKuikaBlueprintTelemetryV1,
  collectFhKuikaBlueprintUsageObservationsV1,
} from '../dist/index.js';

const run = {
  runId: 'run-1',
  taskId: 'task-1',
  firstTimestamp: '2026-09-26T08:00:00.000Z',
  lastTimestamp: '2026-09-26T08:10:00.000Z',
  status: 'PASSED',
  repository: 'skonyd/freehighlander-engineering-platform',
  pullRequest: null,
  branch: 'main',
  headSha: 'a'.repeat(40),
  workflowId: 'feature-implementation',
  workflowVersion: '1.0.0',
  humanRequired: false,
  eventCount: 2,
  modelCallCount: 0,
};

function event(timestamp, outcome) {
  return {
    type: 'blueprint.observed',
    timestamp,
    nodeId: null,
    nodeType: null,
    status: null,
    result: null,
    failureClass: null,
    event: {
      payload: {
        blueprintId: 'feature-implementation',
        blueprintVersion: '1.0.0',
        blueprintOutcome: outcome,
      },
    },
  };
}

test('blueprint telemetry derives one latest explicit observation per run', () => {
  const source = {
    listRuns: () => [run],
    listEvents: () => [
      event('2026-09-26T08:05:00.000Z', 'UNKNOWN'),
      event('2026-09-26T08:10:00.000Z', 'PASS'),
    ],
  };

  const observations = collectFhKuikaBlueprintUsageObservationsV1(source);

  assert.equal(observations.length, 1);
  assert.equal(observations[0].runId, 'run-1');
  assert.equal(observations[0].outcome, 'PASS');
  assert.equal(observations[0].observedAt, '2026-09-26T08:10:00.000Z');
});

test('blueprint telemetry reports measured counts without inventing a score', () => {
  const telemetry = buildFhKuikaBlueprintTelemetryV1('feature-implementation', '1.0.0', [
    {
      blueprintId: 'feature-implementation',
      blueprintVersion: '1.0.0',
      runId: 'run-pass',
      observedAt: '2026-09-26T08:00:00.000Z',
      outcome: 'PASS',
    },
    {
      blueprintId: 'feature-implementation',
      blueprintVersion: '1.0.0',
      runId: 'run-blocked',
      observedAt: '2026-09-26T09:00:00.000Z',
      outcome: 'BLOCKED',
    },
    {
      blueprintId: 'feature-implementation',
      blueprintVersion: '1.0.0',
      runId: 'run-unknown',
      observedAt: '2026-09-26T10:00:00.000Z',
      outcome: 'UNKNOWN',
    },
  ]);

  assert.equal(telemetry.observedRuns, 3);
  assert.equal(telemetry.resolvedRuns, 2);
  assert.equal(telemetry.passedRuns, 1);
  assert.equal(telemetry.blockedRuns, 1);
  assert.equal(telemetry.unknownRuns, 1);
  assert.equal(telemetry.passRate, 0.5);
  assert.equal(telemetry.dataState, 'PARTIAL');
  assert.equal(telemetry.authority, 'NONE');
});

test('blueprint telemetry exposes no-data explicitly instead of fabricating quality', () => {
  const telemetry = buildFhKuikaBlueprintTelemetryV1('security-patch', '1.0.0', []);

  assert.equal(telemetry.observedRuns, 0);
  assert.equal(telemetry.passRate, null);
  assert.equal(telemetry.latestObservedAt, null);
  assert.equal(telemetry.dataState, 'NO_DATA');

  assert.equal(blueprintTelemetryCanInvokeModel(), false);
  assert.equal(blueprintTelemetryCanGrantAuthority(), false);
  assert.equal(blueprintTelemetryCanModifyBlueprint(), false);
});

test('blueprint telemetry ignores events without explicit bounded blueprint metadata', () => {
  const source = {
    listRuns: () => [run],
    listEvents: () => [
      {
        ...event('2026-09-26T08:00:00.000Z', 'PASS'),
        event: { payload: { blueprintId: 'Feature Implementation' } },
      },
      {
        ...event('2026-09-26T08:01:00.000Z', 'PASS'),
        event: { payload: { blueprintId: 'feature-implementation', blueprintVersion: '1.0' } },
      },
      {
        ...event('2026-09-26T08:02:00.000Z', 'PASS'),
        event: { payload: { blueprintId: 'feature-implementation', blueprintVersion: '1.0.0' } },
      },
    ],
  };

  assert.deepEqual(collectFhKuikaBlueprintUsageObservationsV1(source), []);
});
