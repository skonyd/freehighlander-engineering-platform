import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FH_KUIKA_WORKFLOW_STUDIO_HTML,
  buildFhKuikaWorkflowVersionDiffV1,
  createDashboardServer,
  simulateFhKuikaWorkflowDraftV1,
  workflowStudioSimulationCanExecute,
  workflowStudioSimulationCanGrantAuthority,
  workflowVersionDiffCanGrantAuthority,
  workflowVersionDiffCanPublish,
} from '../dist/index.js';

function definition() {
  return {
    id: 'studio-test',
    version: '1.0.0',
    nodes: [
      { id: 'plan', kind: 'MODEL', role: 'planner' },
      { id: 'implement', kind: 'COMMAND' },
      { id: 'review', kind: 'GATE' },
    ],
    edges: [
      { from: 'plan', to: 'implement' },
      { from: 'implement', to: 'review' },
    ],
  };
}

test('Workflow Studio simulation is deterministic and cannot execute or grant authority', () => {
  const first = simulateFhKuikaWorkflowDraftV1(definition());
  const second = simulateFhKuikaWorkflowDraftV1(definition());

  assert.deepEqual(first, second);
  assert.equal(first.valid, true);
  assert.equal(first.terminalState, 'READY_FOR_CANONICAL_REVIEW');
  assert.equal(first.authority, 'NONE');
  assert.equal(first.executionAuthorized, false);
  assert.deepEqual(
    first.orderedSteps.map((item) => item.nodeId),
    ['plan', 'implement', 'review'],
  );
  assert.ok(first.orderedSteps.every((item) => item.runtimeEffect === 'NONE'));
  assert.equal(workflowStudioSimulationCanExecute(), false);
  assert.equal(workflowStudioSimulationCanGrantAuthority(), false);
});

test('Workflow Studio simulation blocks invalid drafts instead of guessing execution', () => {
  const invalid = {
    id: 'invalid',
    version: '1.0.0',
    nodes: [{ id: 'loop', kind: 'LOOP' }],
    edges: [],
  };

  const result = simulateFhKuikaWorkflowDraftV1(invalid);
  assert.equal(result.valid, false);
  assert.equal(result.terminalState, 'BLOCKED');
  assert.deepEqual(result.orderedSteps, []);
  assert.ok(result.validation.errors.some((error) => error.includes('maxIterations')));
});

test('Workflow Studio UI exposes validate/simulate but no publish or execute action', () => {
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="validate"/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="simulate"/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="review-diff"/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /AUTHORITY NONE/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /no publish · no execution/i);
  assert.doesNotMatch(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="publish"/);
  assert.doesNotMatch(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="execute"/);
});

test('Workflow Studio HTTP route and canonical validation endpoints remain read-only', async () => {
  const server = createDashboardServer({ databasePath: '/tmp/fh-kuika-workflow-no-db.sqlite' });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port;
    const encoded = encodeURIComponent(JSON.stringify(definition()));

    const page = await fetch(base + '/modules/fh-kuika/build/workflows');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Workflow Studio/);

    const validation = await (
      await fetch(base + '/api/modules/fh-kuika/workflows/validate?definition=' + encoded)
    ).json();
    assert.equal(validation.valid, true);
    assert.equal(validation.requiresCanonicalPublishValidation, true);

    const simulation = await (
      await fetch(base + '/api/modules/fh-kuika/workflows/simulate?definition=' + encoded)
    ).json();
    assert.equal(simulation.valid, true);
    assert.equal(simulation.authority, 'NONE');
    assert.equal(simulation.executionAuthorized, false);

    const diff = await (
      await fetch(base + '/api/modules/fh-kuika/workflows/diff?definition=' + encoded)
    ).json();
    assert.equal(diff.authority, 'NONE');
    assert.equal(diff.publishAuthorized, false);

    const denied = await fetch(base + '/api/modules/fh-kuika/workflows/validate', {
      method: 'POST',
    });
    assert.equal(denied.status, 405);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('Workflow Studio version diff highlights authority-sensitive changes without publish authority', () => {
  const diff = buildFhKuikaWorkflowVersionDiffV1(null, definition());

  assert.equal(diff.previousVersion, null);
  assert.equal(diff.nextVersion, '1.0.0');
  assert.equal(diff.authority, 'NONE');
  assert.equal(diff.publishAuthorized, false);
  assert.equal(diff.authoritySensitiveChange, true);
  assert.ok(
    diff.nodeChanges.some((item) => item.nodeId === 'review' && item.authoritySensitive),
  );
  assert.equal(workflowVersionDiffCanPublish(), false);
  assert.equal(workflowVersionDiffCanGrantAuthority(), false);
});
