import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPrivacyLifecycleManifest,
  privacyManifestCanDeleteAuditData,
  privacyManifestCanDeleteData,
  privacyManifestCanExportData,
  validatePrivacyLifecycleRecords,
  validatePrivacyLifecycleRequest,
} from '../dist/index.js';

const requestedAt = '2026-09-21T12:00:00.000Z';
const ownerKey = 'owner-alpha';

const records = [
  {
    id: 'expired-short',
    retentionClass: 'SHORT',
    createdAt: '2026-09-18T12:00:00.000Z',
    expiresAt: '2026-09-19T12:00:00.000Z',
    ownerExists: true,
    ownerKey,
    auditReferenced: false,
  },
  {
    id: 'future-short',
    retentionClass: 'SHORT',
    createdAt: '2026-09-20T12:00:00.000Z',
    expiresAt: '2026-09-22T12:00:00.000Z',
    ownerExists: true,
    ownerKey,
    auditReferenced: false,
  },
  {
    id: 'audit-record',
    retentionClass: 'AUDIT',
    createdAt: '2025-09-20T12:00:00.000Z',
    ownerExists: true,
    ownerKey,
    auditReferenced: false,
  },
  {
    id: 'audit-referenced',
    retentionClass: 'SHORT',
    createdAt: '2026-09-18T12:00:00.000Z',
    expiresAt: '2026-09-19T12:00:00.000Z',
    ownerExists: true,
    ownerKey,
    auditReferenced: true,
  },
  {
    id: 'other-owner',
    retentionClass: 'SHORT',
    createdAt: '2026-09-18T12:00:00.000Z',
    expiresAt: '2026-09-19T12:00:00.000Z',
    ownerExists: true,
    ownerKey: 'owner-beta',
    auditReferenced: false,
  },
];

function request(kind) {
  return {
    id: `privacy-${kind.toLowerCase()}-001`,
    kind,
    ownerKey,
    requestedAt,
  };
}

test('export manifest is deterministic metadata-only owner-bound planning', () => {
  const first = buildPrivacyLifecycleManifest(records, request('EXPORT'));
  const second = buildPrivacyLifecycleManifest([...records].reverse(), request('EXPORT'));

  assert.deepEqual(first, second);
  assert.equal(first.authority, 'NONE');
  assert.equal(first.exportExecutionAuthorized, false);
  assert.equal(first.deletionAuthorized, false);
  assert.equal(first.auditDeletionAuthorized, false);

  assert.deepEqual(
    first.entries.map((entry) => [entry.recordId, entry.disposition]),
    [
      ['audit-record', 'EXPORT_CANDIDATE'],
      ['audit-referenced', 'EXPORT_CANDIDATE'],
      ['expired-short', 'EXPORT_CANDIDATE'],
      ['future-short', 'EXPORT_CANDIDATE'],
    ],
  );

  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes(ownerKey), false);
  assert.match(first.ownerScopeHash, /^[a-f0-9]{64}$/);
});

test('delete manifest is derived from canonical retention decisions and never authorizes deletion', () => {
  const manifest = buildPrivacyLifecycleManifest(records, request('DELETE'));
  const entries = Object.fromEntries(manifest.entries.map((entry) => [entry.recordId, entry]));

  assert.equal(entries['expired-short'].disposition, 'DELETE_CANDIDATE');
  assert.equal(entries['future-short'].disposition, 'RETAIN');
  assert.equal(entries['audit-record'].disposition, 'PROTECTED_AUDIT');
  assert.equal(entries['audit-referenced'].disposition, 'PROTECTED_AUDIT');

  for (const entry of manifest.entries) {
    assert.equal(entry.executionAuthorized, false);
  }

  assert.equal(manifest.deletionAuthorized, false);
  assert.equal(manifest.auditDeletionAuthorized, false);
  assert.equal(privacyManifestCanDeleteData(), false);
  assert.equal(privacyManifestCanDeleteAuditData(), false);
});

test('privacy export planning never grants data-export authority', () => {
  const manifest = buildPrivacyLifecycleManifest(records, request('EXPORT'));
  assert.equal(manifest.exportExecutionAuthorized, false);
  assert.equal(privacyManifestCanExportData(), false);
});

test('owner mismatch records are excluded from both manifest kinds', () => {
  for (const kind of ['EXPORT', 'DELETE']) {
    const manifest = buildPrivacyLifecycleManifest(records, request(kind));
    assert.equal(
      manifest.entries.some((entry) => entry.recordId === 'other-owner'),
      false,
    );
  }
});

test('request validation rejects unsupported kinds missing owner scope and malformed timestamps', () => {
  assert.equal(validatePrivacyLifecycleRequest(request('EXPORT')).valid, true);

  for (const invalid of [
    { ...request('EXPORT'), id: 'x' },
    { ...request('EXPORT'), kind: 'PURGE' },
    { ...request('EXPORT'), ownerKey: '   ' },
    { ...request('EXPORT'), requestedAt: 'not-a-time' },
  ]) {
    assert.equal(validatePrivacyLifecycleRequest(invalid).valid, false);
  }
});

test('record validation binds owner presence and inherits retention fail-closed validation', () => {
  assert.equal(validatePrivacyLifecycleRecords(records).valid, true);

  const invalid = [
    {
      id: 'missing-owner',
      retentionClass: 'SHORT',
      createdAt: '2026-09-18T12:00:00.000Z',
      expiresAt: '2026-09-19T12:00:00.000Z',
      ownerExists: true,
      auditReferenced: false,
    },
    {
      id: 'orphan-with-owner',
      retentionClass: 'EPHEMERAL',
      createdAt: '2026-09-18T12:00:00.000Z',
      expiresAt: '2026-09-18T13:00:00.000Z',
      ownerExists: false,
      ownerKey: 'must-not-remain',
      auditReferenced: false,
    },
  ];

  const validation = validatePrivacyLifecycleRecords(invalid);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /requires ownerKey/);
  assert.match(validation.errors.join('\n'), /must not retain ownerKey/);
});

test('malformed privacy input throws before any manifest is produced', () => {
  assert.throws(
    () => buildPrivacyLifecycleManifest(records, { ...request('DELETE'), requestedAt: 'bad' }),
    /invalid privacy request/,
  );

  assert.throws(
    () =>
      buildPrivacyLifecycleManifest(
        [
          ...records,
          {
            ...records[0],
          },
        ],
        request('DELETE'),
      ),
    /invalid privacy records/,
  );
});
