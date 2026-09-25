import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createHumanDecisionQueueEntry,
  createHumanDecisionResponseV1,
} from '../../../packages/orchestration/dist/index.js';
import {
  createHumanDecisionQueueStore,
  enqueueHumanDecision,
  humanDecisionQueueCanGrantAuthority,
  humanDecisionQueueCanStoreSecretValues,
  humanDecisionQueueFile,
  readHumanDecisionQueue,
  resolveHumanDecision,
  validateHumanDecisionQueueStateV1,
} from '../lib/human-decision-queue.mjs';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);
const H4 = '4'.repeat(64);
const H5 = '5'.repeat(64);
const H6 = '6'.repeat(64);
const H7 = '7'.repeat(64);
const REVISION = 'a'.repeat(40);

function decision(overrides = {}) {
  return createHumanDecisionQueueEntry({
    decisionId: 'decision-001',
    projectId: 'project-150',
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    workItemId: 'work-a',
    runId: 'run-150',
    nodeId: 'human-gate',
    exactRevision: REVISION,
    scopeHash: H1,
    currentness: {
      workflowHash: H2,
      runSnapshotHash: H3,
      policyHash: H4,
      catalogSnapshotHash: H5,
      bindingSnapshotHash: H6,
      dependencyGraphHash: H7,
    },
    decisionType: 'OPERATOR_APPROVAL',
    reason: 'A protected action requires a human decision.',
    choices: ['approve', 'reject'],
    consequences: ['approve resumes only the parked branch', 'reject keeps it stopped'],
    evidenceHashes: [H2, H1],
    createdAt: '2026-09-25T10:00:00.000Z',
    blockedWorkItemIds: ['work-c'],
    otherWorkContinuing: true,
    ...overrides,
  });
}

function response(entry = decision(), overrides = {}) {
  return createHumanDecisionResponseV1({
    decisionId: entry.decisionId,
    decisionHash: entry.decisionHash,
    principalId: 'human-operator-001',
    principalKind: 'HUMAN',
    selectedChoice: 'approve',
    exactRevision: entry.exactRevision,
    scopeHash: entry.scopeHash,
    respondedAt: '2026-09-25T10:05:00.000Z',
    ...overrides,
  });
}

function currentContext(entry = decision(), overrides = {}) {
  return {
    authorityVerified: true,
    exactRevision: entry.exactRevision,
    scopeHash: entry.scopeHash,
    currentness: entry.currentness,
    ...overrides,
  };
}

test('human decision queue survives process-style store re-open with exact metadata', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-human-queue-'));
  try {
    const entry = decision();
    const firstStore = createHumanDecisionQueueStore(root, entry.projectId);
    const queued = enqueueHumanDecision(firstStore, 0, entry);

    assert.equal(queued.status, 'QUEUED');
    assert.equal(queued.generation, 1);
    assert.equal(queued.decisionId, entry.decisionId);
    assert.equal(queued.authority, 'NONE');

    const reopened = createHumanDecisionQueueStore(root, entry.projectId);
    const restored = readHumanDecisionQueue(reopened, entry.projectId);
    assert.equal(restored.generation, 1);
    assert.deepEqual(restored.state.entries, [entry]);
    assert.deepEqual(restored.state.responses, []);
    assert.match(restored.snapshotHash, /^[a-f0-9]{64}$/);

    const duplicate = enqueueHumanDecision(reopened, 1, entry);
    assert.equal(duplicate.status, 'ALREADY_QUEUED');
    assert.equal(duplicate.generation, 1);
    assert.equal(readHumanDecisionQueue(reopened, entry.projectId).generation, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('human decision queue uses generation CAS and rejects decision identity reuse', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-human-queue-cas-'));
  try {
    const entry = decision();
    const store = createHumanDecisionQueueStore(root, entry.projectId);
    assert.equal(enqueueHumanDecision(store, 0, entry).status, 'QUEUED');

    const stale = enqueueHumanDecision(
      store,
      0,
      decision({ decisionId: 'decision-002', createdAt: '2026-09-25T10:01:00.000Z' }),
    );
    assert.deepEqual(stale, {
      status: 'GENERATION_CONFLICT',
      expectedGeneration: 0,
      actualGeneration: 1,
      mutated: false,
      authority: 'NONE',
    });

    assert.throws(
      () =>
        enqueueHumanDecision(
          store,
          1,
          decision({ reason: 'Same id but different immutable decision identity.' }),
        ),
      /already exists with different identity/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unauthorized or stale human response does not mutate the parked queue', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-human-queue-safe-resolve-'));
  try {
    const entry = decision();
    const store = createHumanDecisionQueueStore(root, entry.projectId);
    enqueueHumanDecision(store, 0, entry);
    const answer = response(entry);

    const unauthorized = resolveHumanDecision(store, 1, answer, {
      ...currentContext(entry),
      authorityVerified: false,
    });
    assert.equal(unauthorized.status, 'UNAUTHORIZED');
    assert.equal(unauthorized.mutated, false);

    const stale = resolveHumanDecision(store, 1, answer, {
      ...currentContext(entry),
      exactRevision: 'b'.repeat(40),
      currentness: {
        ...entry.currentness,
        policyHash: '8'.repeat(64),
      },
    });
    assert.equal(stale.status, 'STALE');
    assert.equal(stale.mutated, false);
    assert.deepEqual(stale.staleDimensions, ['policyHash', 'revision']);

    const unchanged = readHumanDecisionQueue(store, entry.projectId);
    assert.equal(unchanged.generation, 1);
    assert.deepEqual(unchanged.state.entries, [entry]);
    assert.deepEqual(unchanged.state.responses, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('exact authorized response resolves once and persists response audit metadata', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-human-queue-resolve-'));
  try {
    const entry = decision();
    const answer = response(entry);
    const store = createHumanDecisionQueueStore(root, entry.projectId);
    enqueueHumanDecision(store, 0, entry);

    const resolved = resolveHumanDecision(store, 1, answer, currentContext(entry));
    assert.equal(resolved.status, 'RESOLVED');
    assert.equal(resolved.generation, 2);
    assert.equal(resolved.decisionId, entry.decisionId);
    assert.equal(resolved.responseHash, answer.responseHash);
    assert.equal(resolved.mutated, true);
    assert.equal(resolved.authority, 'NONE');

    const reopened = createHumanDecisionQueueStore(root, entry.projectId);
    const restored = readHumanDecisionQueue(reopened, entry.projectId);
    assert.equal(restored.generation, 2);
    assert.deepEqual(restored.state.entries, []);
    assert.deepEqual(restored.state.responses, [answer]);

    assert.throws(
      () => resolveHumanDecision(reopened, 2, answer, currentContext(entry)),
      /unknown parked decision/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('human decision queue strict state rejects duplicate responses and credential-shaped material', () => {
  const entry = decision();
  const answer = response(entry);
  assert.throws(
    () =>
      validateHumanDecisionQueueStateV1({
        schemaVersion: 1,
        projectId: entry.projectId,
        entries: [],
        responses: [
          answer,
          createHumanDecisionResponseV1({
            ...answer,
            selectedChoice: 'reject',
            respondedAt: '2026-09-25T10:06:00.000Z',
          }),
        ],
        authority: 'NONE',
      }),
    /already has a persisted response/,
  );

  const credentialLikeReason = ['Bearer', 'abcdefghijklmnop'].join(' ');
  const unsafe = decision({
    decisionId: 'decision-unsafe',
    reason: credentialLikeReason,
  });
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-human-queue-secret-'));
  try {
    const store = createHumanDecisionQueueStore(root, unsafe.projectId);
    assert.throws(
      () => enqueueHumanDecision(store, 0, unsafe),
      /credential-shaped material/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('human decision queue location is local runtime state and grants no authority', () => {
  assert.equal(
    humanDecisionQueueFile('/repo', 'project-150'),
    path.join('/repo', '.freehighlander', 'runtime', 'human-decisions', 'project-150.json'),
  );
  assert.equal(humanDecisionQueueCanGrantAuthority(), false);
  assert.equal(humanDecisionQueueCanStoreSecretValues(), false);
});
