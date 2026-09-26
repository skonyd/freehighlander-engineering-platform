import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaPlanCandidateV1,
  createFhKuikaWorkbenchIntentV1,
  workbenchIntentPreparationCanGrantAuthority,
  workbenchIntentPreparationCanInvokeModel,
  workbenchPlanCandidateCanPublishDirectly,
} from '../dist/index.js';

const baseContext = {
  repository: 'skonyd/freehighlander-engineering-platform',
  branch: 'main',
  exactRevision: 'a'.repeat(40),
  selectedFiles: ['apps/web/src/ui.ts'],
  evidenceIds: ['evidence-1'],
  blueprintId: null,
  workflowId: null,
};

test('Workbench prepares authority-neutral ASK and PLAN intents without model calls', () => {
  const ask = createFhKuikaWorkbenchIntentV1({
    mode: 'ASK',
    request: 'Explain current state',
    context: baseContext,
    v3Authority: 'SHADOW_ONLY',
  });
  const plan = createFhKuikaWorkbenchIntentV1({
    mode: 'PLAN',
    request: 'Plan a dashboard change',
    context: baseContext,
    v3Authority: 'SHADOW_ONLY',
  });

  assert.equal(ask.disposition, 'READ_ONLY_QUERY');
  assert.equal(plan.disposition, 'CANDIDATE_PLAN');
  assert.equal(ask.selectionAuthority, 'NONE');
  assert.equal(plan.canInvokeModelOnPrepare, false);
  assert.equal(workbenchIntentPreparationCanInvokeModel(), false);
  assert.equal(workbenchIntentPreparationCanGrantAuthority(), false);
});

test('REVIEW requires exact revision and evidence binding', () => {
  const review = createFhKuikaWorkbenchIntentV1({
    mode: 'REVIEW',
    request: 'Review the current change',
    context: baseContext,
    v3Authority: 'SHADOW_ONLY',
  });

  assert.equal(review.disposition, 'INDEPENDENT_REVIEW_REQUEST');
  assert.equal(review.context.exactRevision, 'a'.repeat(40));
  assert.deepEqual(review.context.evidenceIds, ['evidence-1']);

  assert.throws(
    () =>
      createFhKuikaWorkbenchIntentV1({
        mode: 'REVIEW',
        request: 'Review',
        context: { ...baseContext, evidenceIds: [] },
        v3Authority: 'SHADOW_ONLY',
      }),
    /requires at least one evidence id/,
  );
});

test('EXECUTE remains blocked until V3 authority is enabled', () => {
  assert.throws(
    () =>
      createFhKuikaWorkbenchIntentV1({
        mode: 'EXECUTE',
        request: 'Implement change',
        context: baseContext,
        v3Authority: 'SHADOW_ONLY',
      }),
    /requires ENABLED V3 authority/,
  );

  const execute = createFhKuikaWorkbenchIntentV1({
    mode: 'EXECUTE',
    request: 'Implement change',
    context: baseContext,
    v3Authority: 'ENABLED',
  });
  assert.equal(execute.disposition, 'CONTROL_PLANE_REQUEST');
  assert.equal(execute.mutationRequested, true);
  assert.equal(execute.executionOwner, 'CONTROL_PLANE');
});

test('PLAN candidate output remains structured non-authoritative data', () => {
  const candidate = createFhKuikaPlanCandidateV1({
    exactRevision: 'a'.repeat(40),
    items: [
      {
        id: 'task-1',
        title: 'Add deterministic projection',
        kind: 'TASK',
        detail: 'Add a read-only projection with tests.',
      },
    ],
  });

  assert.equal(candidate.authority, 'NONE');
  assert.equal(candidate.publishableDirectly, false);
  assert.equal(candidate.items[0]?.authority, 'NONE');
  assert.equal(workbenchPlanCandidateCanPublishDirectly(), false);

  assert.throws(
    () =>
      createFhKuikaPlanCandidateV1({
        exactRevision: null,
        items: [
          { id: 'same', title: 'A', kind: 'TASK', detail: 'one' },
          { id: 'same', title: 'B', kind: 'TASK', detail: 'two' },
        ],
      }),
    /ids must be unique/,
  );
});
