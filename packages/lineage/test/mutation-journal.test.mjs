import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  MutationLineageJournalV1,
  mutationLineageJournalCanGrantAuthority,
  mutationLineageRecordCanAuthorizeSideEffect,
  mutationLineageSemanticSearchCanEstablishAuthority,
} from '../dist/index.js';

const revision = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const policyHash = 'c'.repeat(64);

function journal() {
  const dir = mkdtempSync(join(tmpdir(), 'fh-lineage-journal-'));
  return new MutationLineageJournalV1(join(dir, 'journal.jsonl'));
}

function base(kind, capabilities = []) {
  return {
    actionId: 'action-' + kind.toLowerCase(),
    kind,
    repository: 'skonyd/freehighlander-engineering-platform',
    revision,
    occurredAt: '2026-10-01T11:20:00.000Z',
    principalKind: 'SYSTEM',
    capabilities,
    evidenceDigest: digest,
    resultDigest: 'd'.repeat(64),
  };
}

test('journal appends and verifies a durable hash chain across restart', async () => {
  const first = journal();
  const a = await first.append(base('PLANNING_TRANSITION'));
  const b = await first.append({
    ...base('GIT_WRITE', ['GIT_WRITE']),
    policyHash,
    authorityGeneration: 3,
  });

  assert.equal(a.sequence, 1);
  assert.equal(b.sequence, 2);
  assert.equal(b.previousHash, a.entryHash);
  assert.match(b.entryHash, /^[a-f0-9]{64}$/);

  const restarted = new MutationLineageJournalV1(first.filePath);
  const read = await restarted.read();
  assert.equal(read.records.length, 2);
  assert.equal(read.headHash, b.entryHash);
  assert.equal(read.authority, 'NONE');
});

test('all B-lane action kinds can be recorded without granting authority', async () => {
  const j = journal();
  const inputs = [
    base('PLANNING_TRANSITION'),
    { ...base('GIT_WRITE', ['GIT_WRITE']), policyHash, authorityGeneration: 1 },
    base('TEST_RUN'),
    base('SECURITY_ASSESSMENT'),
    { ...base('SECURITY_WAIVER'), approvalDecisionHash: 'e'.repeat(64) },
    {
      ...base('RELEASE_MUTATION', ['RELEASE_DEPLOY']),
      policyHash,
      authorityGeneration: 2,
    },
    {
      ...base('INFRASTRUCTURE_MUTATION', ['INFRASTRUCTURE_MUTATION']),
      policyHash,
      authorityGeneration: 3,
    },
    {
      ...base('INCIDENT_REMEDIATION', [
        'AUTOMATIC_REMEDIATION',
        'INFRASTRUCTURE_MUTATION',
      ]),
      policyHash,
      authorityGeneration: 4,
    },
  ];

  for (const input of inputs) await j.append(input);
  const read = await j.read();
  assert.deepEqual(
    read.records.map((item) => item.kind),
    inputs.map((item) => item.kind),
  );
  assert.equal(mutationLineageJournalCanGrantAuthority(), false);
  assert.equal(mutationLineageRecordCanAuthorizeSideEffect(), false);
  assert.equal(mutationLineageSemanticSearchCanEstablishAuthority(), false);
});

test('critical actions fail closed without required capability policy or generation', async () => {
  const cases = [
    base('GIT_WRITE'),
    { ...base('RELEASE_MUTATION', ['RELEASE_DEPLOY']), authorityGeneration: 1 },
    { ...base('INFRASTRUCTURE_MUTATION', ['INFRASTRUCTURE_MUTATION']), policyHash },
    {
      ...base('INCIDENT_REMEDIATION', ['INFRASTRUCTURE_MUTATION']),
      policyHash,
      authorityGeneration: 1,
    },
    base('SECURITY_WAIVER'),
  ];

  for (const input of cases) {
    await assert.rejects(() => journal().append(input));
  }
});

test('journal serializes concurrent appends deterministically', async () => {
  const j = journal();
  const records = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      j.append({
        ...base('TEST_RUN'),
        actionId: 'test-run-' + index,
        occurredAt: new Date(Date.parse('2026-10-01T11:20:00.000Z') + index).toISOString(),
      }),
    ),
  );
  assert.deepEqual(
    records.map((record) => record.sequence),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test('tampering or malformed persisted records fail closed', async () => {
  const j = journal();
  await j.append(base('TEST_RUN'));
  const original = readFileSync(j.filePath, 'utf8');
  const record = JSON.parse(original.trim());
  record.resultDigest = 'f'.repeat(64);
  writeFileSync(j.filePath, JSON.stringify(record) + '\n');
  await assert.rejects(() => j.read(), /entry hash does not match/);

  writeFileSync(j.filePath, '{bad\n');
  await assert.rejects(() => j.read(), /invalid JSON/);
});

test('invalid path identities capabilities and timestamps are rejected', async () => {
  assert.throws(() => new MutationLineageJournalV1('relative.jsonl'), /absolute/);
  await assert.rejects(() =>
    journal().append({ ...base('TEST_RUN'), actionId: '!' }),
  );
  await assert.rejects(() =>
    journal().append({ ...base('TEST_RUN'), revision: 'bad' }),
  );
  await assert.rejects(() =>
    journal().append({ ...base('TEST_RUN'), occurredAt: 'bad' }),
  );
  await assert.rejects(() =>
    journal().append({ ...base('TEST_RUN'), capabilities: ['UNKNOWN'] }),
  );
  await assert.rejects(() =>
    journal().append({ ...base('TEST_RUN'), capabilities: ['GIT_WRITE', 'GIT_WRITE'] }),
  );
});
