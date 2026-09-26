import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaPlanCandidateV1,
  createFhKuikaWorkbenchIntentV1,
  workbenchIntentPreparationCanGrantAuthority,
  workbenchIntentPreparationCanInvokeModel,
  workbenchPlanCandidateCanPublishDirectly,
} from '../dist/index.js';

const context = {
  repository: 'skonyd/freehighlander-engineering-platform',
  branch: 'main',
  exactRevision: 'a'.repeat(40),
  selectedFiles: [],
  evidenceIds: ['evidence-1'],
  blueprintId: null,
  workflowId: 'implementation',
};

test('Workbench intent preparation is zero-call and authority-neutral', () => {
  const ask = createFhKuikaWorkbenchIntentV1({
    mode: 'ASK',
    request: 'Explain the current state',
    context,
    v3Authority: 'SHADOW_ONLY',
  });
  const plan = createFhKuikaWorkbenchIntentV1({
    mode: 'PLAN',
    request: 'Prepare a candidate plan',
    context,
    v3Authority: 'SHADOW_ONLY',
  });

  assert.equal(ask.disposition, 'READ_ONLY_QUERY');
  assert.equal(plan.disposition, 'CANDIDATE_PLAN');
  assert.equal(ask.selectionAuthority, 'NONE');
  assert.equal(plan.canInvokeModelOnPrepare, false);
  assert.equal(workbenchIntentPreparationCanInvokeModel(), false);
  assert.equal(workbenchIntentPreparationCanGrantAuthority(), false);
});

test('Review is exact-revision and evidence-bound', () => {
  const review = createFhKuikaWorkbenchIntentV1({
    mode: 'REVIEW',
    request: 'Review the exact revision',
    context,
    v3Authority: 'SHADOW_ONLY',
  });
  assert.equal(review.disposition, 'INDEPENDENT_REVIEW_REQUEST');

  assert.throws(
    () =>
      createFhKuikaWorkbenchIntentV1({
        mode: 'REVIEW',
        request: 'Review',
        context: { ...context, evidenceIds: [] },
        v3Authority: 'SHADOW_ONLY',
      }),
    /at least one evidence id/,
  );
});

test('Execute remains blocked until V3 authority is enabled', () => {
  assert.throws(
    () =>
      createFhKuikaWorkbenchIntentV1({
        mode: 'EXECUTE',
        request: 'Implement the change',
        context,
        v3Authority: 'SHADOW_ONLY',
      }),
    /requires ENABLED V3 authority/,
  );

  const execute = createFhKuikaWorkbenchIntentV1({
    mode: 'EXECUTE',
    request: 'Implement the change',
    context,
    v3Authority: 'ENABLED',
  });
  assert.equal(execute.disposition, 'CONTROL_PLANE_REQUEST');
  assert.equal(execute.mutationRequested, true);
  assert.equal(execute.executionOwner, 'CONTROL_PLANE');
});

test('Plan candidate output cannot publish directly', () => {
  const candidate = createFhKuikaPlanCandidateV1({
    exactRevision: 'a'.repeat(40),
    items: [
      {
        id: 'task-1',
        title: 'Implement read projection',
        kind: 'TASK',
        detail: 'Add deterministic projection and tests.',
      },
    ],
  });

  assert.equal(candidate.authority, 'NONE');
  assert.equal(candidate.publishableDirectly, false);
  assert.equal(candidate.items[0]?.authority, 'NONE');
  assert.equal(workbenchPlanCandidateCanPublishDirectly(), false);
});
