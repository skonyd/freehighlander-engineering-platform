import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SqliteTelemetryStore,
  createPortableCanonicalEventBundleV1,
  indexedEngineeringEventHash,
  portableCanonicalEventsCanContainSecretValues,
  portableCanonicalEventsCanRequireSourceMachinePath,
  portableSqliteWalCanBeHandoffProtocol,
  rebuildSqliteReadModelFromPortableEventBundle,
  validatePortableCanonicalEventBundleV1,
} from '../dist/index.js';

const REPOSITORY = 'skonyd/freehighlander-engineering-platform';
const REVISION = 'a'.repeat(40);

function event(type, timestamp, overrides = {}) {
  return {
    schemaVersion: 1,
    type,
    timestamp,
    runId: 'run-portable-001',
    taskId: 'task-portable-001',
    revision: {
      repository: REPOSITORY,
      pullRequest: 151,
      branch: 'feat/portable-resume',
      baseSha: 'b'.repeat(40),
      headSha: REVISION,
    },
    workflow: {
      id: 'portable-resume',
      version: '1.0.0',
      hash: '1'.repeat(64),
    },
    payload: {},
    ...overrides,
  };
}

function bundle(events) {
  return createPortableCanonicalEventBundleV1({
    repositoryIdentity: REPOSITORY,
    projectId: 'project-151',
    runId: 'run-portable-001',
    exactRevision: REVISION,
    events,
  });
}

test('portable canonical event bundle rebuilds a missing SQLite read model idempotently', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fh-portable-events-'));
  const dbPath = path.join(root, 'read-model.sqlite');

  try {
    const portable = bundle([
      event('run.started', '2026-09-25T09:00:00.000Z'),
      event('human.required', '2026-09-25T09:00:01.000Z', {
        payload: {
          decisionId: 'decision-017',
          reasonCode: 'HUMAN_POLICY_REQUIRED',
        },
      }),
      event('run.completed', '2026-09-25T09:00:02.000Z', {
        execution: { status: 'PASSED', result: 'PASS' },
      }),
    ]);

    validatePortableCanonicalEventBundleV1(portable);
    assert.equal(portable.eventCount, 3);
    assert.equal(portable.firstTimestamp, '2026-09-25T09:00:00.000Z');
    assert.equal(portable.lastTimestamp, '2026-09-25T09:00:02.000Z');
    assert.match(portable.bundleHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(
      portable.events.map((record) => record.eventHash),
      portable.events.map((record) => indexedEngineeringEventHash(record.event)),
    );

    const first = rebuildSqliteReadModelFromPortableEventBundle(portable, dbPath);
    assert.deepEqual(
      {
        seen: first.seen,
        inserted: first.inserted,
        duplicates: first.duplicates,
        localDatabaseRequiredForPortability: first.localDatabaseRequiredForPortability,
        authority: first.authority,
      },
      {
        seen: 3,
        inserted: 3,
        duplicates: 0,
        localDatabaseRequiredForPortability: false,
        authority: 'NONE',
      },
    );
    assert.equal(first.integrity.ok, true);

    const second = rebuildSqliteReadModelFromPortableEventBundle(portable, dbPath);
    assert.equal(second.seen, 3);
    assert.equal(second.inserted, 0);
    assert.equal(second.duplicates, 3);

    const store = new SqliteTelemetryStore(dbPath);
    try {
      const run = store.getRun('run-portable-001');
      assert.ok(run);
      assert.equal(run.eventCount, 3);
      assert.equal(run.humanRequired, true);
      assert.equal(run.status, 'PASSED');
      assert.equal(store.listEvents('run-portable-001').length, 3);
    } finally {
      store.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('portable event bundle is strict hash-bound and exact-revision-bound', () => {
  const portable = bundle([
    event('run.started', '2026-09-25T09:00:00.000Z'),
    event('run.completed', '2026-09-25T09:00:01.000Z'),
  ]);

  const tampered = structuredClone(portable);
  tampered.events[0].event.payload = { changed: true };
  assert.throws(() => validatePortableCanonicalEventBundleV1(tampered), /record hash mismatch/);

  assert.throws(
    () =>
      bundle([
        event('run.started', '2026-09-25T09:00:00.000Z', {
          revision: {
            repository: REPOSITORY,
            branch: 'feat/portable-resume',
            headSha: 'c'.repeat(40),
          },
        }),
      ]),
    /exact revision mismatch/,
  );
  assert.throws(
    () =>
      bundle([
        event('run.started', '2026-09-25T09:00:00.000Z', {
          runId: 'run-other-001',
        }),
      ]),
    /runId mismatch/,
  );
});

test('portable event bundle rejects duplicates out-of-order events secrets and machine paths', () => {
  const started = event('run.started', '2026-09-25T09:00:00.000Z');
  assert.throws(() => bundle([started, started]), /duplicate event/);

  assert.throws(
    () =>
      bundle([
        event('run.started', '2026-09-25T09:00:01.000Z'),
        event('run.progress', '2026-09-25T09:00:00.000Z'),
      ]),
    /nondecreasing timestamp/,
  );

  assert.throws(
    () =>
      bundle([
        event('run.started', '2026-09-25T09:00:00.000Z', {
          payload: { apiKey: 'sk-this-is-runtime-only-secret-material-12345' },
        }),
      ]),
    /forbidden credential field/,
  );
  assert.throws(
    () =>
      bundle([
        event('run.started', '2026-09-25T09:00:00.000Z', {
          payload: { note: 'Bearer abcdefghijklmnopqrstuvwxyz' },
        }),
      ]),
    /credential-shaped material/,
  );
  assert.throws(
    () =>
      bundle([
        event('run.started', '2026-09-25T09:00:00.000Z', {
          payload: { workspace: '/home/source-user/project' },
        }),
      ]),
    /absolute machine path/,
  );
  assert.throws(
    () =>
      bundle([
        event('run.started', '2026-09-25T09:00:00.000Z', {
          payload: { workspace: 'C:\\Users\\source-user\\project' },
        }),
      ]),
    /absolute machine path/,
  );
});

test('portable event bundle never treats SQLite WAL or local paths as handoff state', () => {
  assert.equal(portableCanonicalEventsCanContainSecretValues(), false);
  assert.equal(portableCanonicalEventsCanRequireSourceMachinePath(), false);
  assert.equal(portableSqliteWalCanBeHandoffProtocol(), false);
});
