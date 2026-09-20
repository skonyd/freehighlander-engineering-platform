import assert from 'node:assert/strict';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  inspectSqliteTelemetryFile,
  restoreSqliteTelemetryBackupToNewFile,
  SqliteTelemetryStore,
} from '../dist/index.js';

function event(type, timestamp) {
  return {
    schemaVersion: 1,
    type,
    timestamp,
    runId: 'maintenance-run',
    payload: {},
  };
}

test('integrity check and WAL checkpoint are explicit maintenance surfaces', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-sqlite-maintenance-'));
  const store = new SqliteTelemetryStore(path.join(root, 'telemetry.sqlite'));

  try {
    store.ingest(event('run.started', '2026-09-20T12:00:00.000Z'));

    const integrity = store.integrityCheck();
    assert.equal(integrity.ok, true);
    assert.equal(integrity.schemaVersion, 1);
    assert.deepEqual(integrity.messages, ['ok']);

    const checkpoint = store.walCheckpoint('PASSIVE');
    assert.equal(checkpoint.mode, 'PASSIVE');
    assert.equal(Number.isInteger(checkpoint.busy), true);
    assert.equal(Number.isInteger(checkpoint.logPages), true);
    assert.equal(Number.isInteger(checkpoint.checkpointedPages), true);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('native backup is verified and can be opened as a normal telemetry store', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-sqlite-backup-'));
  const sourcePath = path.join(root, 'source.sqlite');
  const backupPath = path.join(root, 'backups', 'source.backup.sqlite');
  const store = new SqliteTelemetryStore(sourcePath);

  try {
    store.ingest(event('run.started', '2026-09-20T12:00:00.000Z'));
    const result = await store.backupTo(backupPath);

    assert.equal(result.targetPath, backupPath);
    assert.equal(result.integrity.ok, true);
    assert.equal(result.integrity.schemaVersion, 1);
    assert.equal(result.totalPages > 0, true);
    await access(backupPath);

    const backupStore = new SqliteTelemetryStore(backupPath);
    try {
      assert.equal(backupStore.getRun('maintenance-run')?.eventCount, 1);
    } finally {
      backupStore.close();
    }

    await assert.rejects(() => store.backupTo(backupPath), /already exists/);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('restore creates a new verified file and refuses to overwrite an existing target', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-sqlite-restore-'));
  const sourcePath = path.join(root, 'source.sqlite');
  const backupPath = path.join(root, 'source.backup.sqlite');
  const restoredPath = path.join(root, 'restored', 'telemetry.sqlite');
  const store = new SqliteTelemetryStore(sourcePath);

  try {
    store.ingest(event('run.started', '2026-09-20T12:00:00.000Z'));
    await store.backupTo(backupPath);

    const restored = restoreSqliteTelemetryBackupToNewFile(backupPath, restoredPath);
    assert.equal(restored.restored, true);
    assert.equal(restored.integrity.ok, true);

    const restoredStore = new SqliteTelemetryStore(restoredPath);
    try {
      assert.equal(restoredStore.getRun('maintenance-run')?.eventCount, 1);
    } finally {
      restoredStore.close();
    }

    assert.throws(
      () => restoreSqliteTelemetryBackupToNewFile(backupPath, restoredPath),
      /never overwritten/,
    );
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('corrupt or non-FreeHighlander SQLite backups fail closed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-sqlite-invalid-'));
  const corruptPath = path.join(root, 'corrupt.sqlite');
  const restoredPath = path.join(root, 'restored.sqlite');

  try {
    await writeFile(corruptPath, 'not-a-sqlite-database', 'utf8');

    assert.throws(() => inspectSqliteTelemetryFile(corruptPath), /invalid SQLite telemetry database/);
    assert.throws(
      () => restoreSqliteTelemetryBackupToNewFile(corruptPath, restoredPath),
      /invalid SQLite telemetry database/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
