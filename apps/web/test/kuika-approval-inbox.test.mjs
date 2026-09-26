import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaApprovalInboxV1,
  fhKuikaApprovalInboxCanApproveDirectly,
  fhKuikaApprovalInboxCanGrantAuthority,
  fhKuikaApprovalInboxCanInvokeModel,
  fhKuikaApprovalInboxCanMutateRuntime,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

function run(overrides = {}) {
  return {
    runId: 'run-1',
    taskId: 'task-1',
    firstTimestamp: '2026-09-26T10:00:00.000Z',
    lastTimestamp: '2026-09-26T10:05:00.000Z',
    status: 'HUMAN_REQUIRED',
    repository: 'skonyd/freehighlander-engineering-platform',
    pullRequest: 324,
    branch: 'feat/test',
    headSha: 'abc123',
    workflowId: 'release',
    workflowVersion: '1.0.0',
    humanRequired: true,
    eventCount: 2,
    modelCallCount: 0,
    ...overrides,
  };
}

function required(timestamp = '2026-09-26T10:01:00.000Z', overrides = {}) {
  return {
    type: 'human.required',
    timestamp,
    nodeId: 'approve-release',
    nodeType: 'HUMAN',
    status: 'HUMAN_REQUIRED',
    result: null,
    failureClass: null,
    event: {
      revision: { headSha: 'abc123' },
      payload: {
        scopeHash: hash('a'),
        reviewScopeHash: hash('b'),
        runSnapshotHash: hash('c'),
      },
    },
    ...overrides,
  };
}

function source(runs, eventsByRun) {
  return {
    listRuns() {
      return runs;
    },
    listEvents(runId) {
      return eventsByRun[runId] || [];
    },
  };
}

test('approval inbox exposes exact-bound current pending approvals', () => {
  const inbox = buildFhKuikaApprovalInboxV1(source([run()], { 'run-1': [required()] }));

  assert.equal(inbox.counts.pending, 1);
  assert.equal(inbox.pending[0].currentness, 'CURRENT');
  assert.equal(inbox.pending[0].bindingState, 'EXACT_SCOPE_BOUND');
  assert.equal(inbox.pending[0].exactRevision, 'abc123');
  assert.equal(inbox.pending[0].reviewScopeHash, hash('b'));
  assert.equal(inbox.pending[0].decisionAuthority, 'CONTROL_PLANE_REQUIRED');
  assert.equal(inbox.projectionAuthority, 'NONE');
});

test('later human decision resolves matching approval deterministically', () => {
  const decision = {
    type: 'human.decision',
    timestamp: '2026-09-26T10:02:00.000Z',
    nodeId: 'approve-release',
    nodeType: 'HUMAN',
    status: 'COMPLETED',
    result: 'APPROVED',
    failureClass: null,
    event: { payload: {} },
  };
  const inbox = buildFhKuikaApprovalInboxV1(
    source([run({ status: 'PASSED', humanRequired: false })], {
      'run-1': [required(), decision],
    }),
  );

  assert.equal(inbox.counts.pending, 0);
  assert.equal(inbox.counts.resolved, 1);
  assert.equal(inbox.resolvedRecent[0].currentness, 'RESOLVED');
  assert.equal(inbox.resolvedRecent[0].decidedAt, decision.timestamp);
});

test('unmatched approval on terminal run is stale rather than actionable', () => {
  const inbox = buildFhKuikaApprovalInboxV1(
    source([run({ status: 'FAILED', humanRequired: false })], { 'run-1': [required()] }),
  );

  assert.equal(inbox.counts.pending, 0);
  assert.equal(inbox.counts.stale, 1);
  assert.equal(inbox.stale[0].currentness, 'STALE');
});

test('missing or mismatched binding evidence is explicit instead of inferred', () => {
  const partial = required('2026-09-26T10:01:00.000Z', {
    event: {
      revision: { headSha: 'different' },
      payload: {},
    },
  });
  const inbox = buildFhKuikaApprovalInboxV1(source([run()], { 'run-1': [partial] }));

  assert.equal(inbox.pending[0].bindingState, 'PARTIAL');
  assert.equal(inbox.pending[0].scopeHash, null);
  assert.equal(inbox.pending[0].reviewScopeHash, null);
});

test('approval inbox remains read-only and authority-neutral', () => {
  assert.equal(fhKuikaApprovalInboxCanInvokeModel(), false);
  assert.equal(fhKuikaApprovalInboxCanMutateRuntime(), false);
  assert.equal(fhKuikaApprovalInboxCanGrantAuthority(), false);
  assert.equal(fhKuikaApprovalInboxCanApproveDirectly(), false);
});
