import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  inspectTelemetryJsonlFile,
  jsonlTornTailCanBecomeEvent,
  SqliteTelemetryStore,
} from '../dist/index.js';

function event(type, timestamp, overrides = {}) {
  return {
    schemaVersion: 1,
    type,
    timestamp,
    runId: 'run-jsonl',
    payload: {},
    ...overrides,
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-jsonl-recovery-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    jsonlPath: path.join(root, 'events.jsonl'),
    dbPath: path.join(root, 'telemetry.sqlite'),
  };
}

test('recovering import reports a single truncated final tail and indexes only valid prefix', async (t) => {
  const { jsonlPath, dbPath } = await fixture(t);
  const first = event('run.started', '2026-09-24T08:00:00.000Z');
  const second = event('artifact.created', '2026-09-24T08:00:01.000Z', {
    artifactIds: ['artifact-1'],
  });
  const torn = '{"schemaVersion":1,"type":"run.completed","timestamp":"2026-09-24';

  await writeFile(
    jsonlPath,
    `${JSON.stringify(first)}\n${JSON.stringify(second)}\n${torn}`,
    'utf8',
  );

  const inspection = inspectTelemetryJsonlFile(jsonlPath);
  assert.equal(inspection.status, 'TORN_TAIL');
  assert.equal(inspection.events.length, 2);
  assert.equal(inspection.tornTail?.lineNumber, 3);
  assert.equal(inspection.tornTail?.byteLength, Buffer.byteLength(torn, 'utf8'));
  assert.match(inspection.tornTail?.contentHash ?? '', /^[a-f0-9]{64}$/);

  const store = new SqliteTelemetryStore(dbPath);
  try {
    const imported = store.importJsonlRecovering(jsonlPath);
    assert.equal(imported.recoveryStatus, 'TORN_TAIL');
    assert.equal(imported.seen, 2);
    assert.equal(imported.inserted, 2);
    assert.equal(imported.duplicates, 0);
    assert.equal(store.getRun('run-jsonl')?.eventCount, 2);
    assert.equal(store.listEvents('run-jsonl').length, 2);

    assert.throws(() => store.importJsonl(jsonlPath), /line 3/);
    assert.equal(store.getRun('run-jsonl')?.eventCount, 2);
  } finally {
    store.close();
  }
});

test('middle corruption fails closed even when the physical final line is torn', async (t) => {
  const { jsonlPath, dbPath } = await fixture(t);
  const first = event('run.started', '2026-09-24T08:00:00.000Z');

  await writeFile(jsonlPath, `${JSON.stringify(first)}\n{broken}\n{"partial":`, 'utf8');

  assert.throws(() => inspectTelemetryJsonlFile(jsonlPath), /line 2/);

  const store = new SqliteTelemetryStore(dbPath);
  try {
    assert.throws(() => store.importJsonlRecovering(jsonlPath), /line 2/);
    assert.equal(store.listRuns().length, 0);
  } finally {
    store.close();
  }
});

test('completed malformed final record is corruption rather than torn tail', async (t) => {
  const { jsonlPath } = await fixture(t);
  const first = event('run.started', '2026-09-24T08:00:00.000Z');

  await writeFile(jsonlPath, `${JSON.stringify(first)}\n{broken}\n`, 'utf8');

  assert.throws(() => inspectTelemetryJsonlFile(jsonlPath), /line 2/);
});

test('valid final JSON without a trailing newline remains CLEAN', async (t) => {
  const { jsonlPath, dbPath } = await fixture(t);
  const first = event('run.started', '2026-09-24T08:00:00.000Z');
  const second = event('run.completed', '2026-09-24T08:00:01.000Z', {
    execution: { status: 'PASSED' },
  });

  await writeFile(jsonlPath, `${JSON.stringify(first)}\n${JSON.stringify(second)}`, 'utf8');

  const inspection = inspectTelemetryJsonlFile(jsonlPath);
  assert.equal(inspection.status, 'CLEAN');
  assert.equal(inspection.tornTail, null);
  assert.equal(inspection.events.length, 2);

  const store = new SqliteTelemetryStore(dbPath);
  try {
    const imported = store.importJsonlRecovering(jsonlPath);
    assert.equal(imported.recoveryStatus, 'CLEAN');
    assert.equal(imported.tornTail, null);
    assert.equal(store.getRun('run-jsonl')?.status, 'PASSED');
  } finally {
    store.close();
  }
});

test('syntactically complete but schema-invalid final JSON fails instead of becoming torn tail', async (t) => {
  const { jsonlPath } = await fixture(t);
  const first = event('run.started', '2026-09-24T08:00:00.000Z');

  await writeFile(
    jsonlPath,
    `${JSON.stringify(first)}\n${JSON.stringify({ hello: 'world' })}`,
    'utf8',
  );

  assert.throws(() => inspectTelemetryJsonlFile(jsonlPath), /line 2.*schemaVersion/);
});

test('empty and blank JSONL is clean and torn tail can never become an event', async (t) => {
  const { jsonlPath } = await fixture(t);

  await writeFile(jsonlPath, ' \n\n', 'utf8');
  const inspection = inspectTelemetryJsonlFile(jsonlPath);

  assert.deepEqual(inspection, {
    status: 'CLEAN',
    events: [],
    tornTail: null,
  });
  assert.equal(jsonlTornTailCanBecomeEvent(), false);
});
