import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaWorkflowDraftV1,
  fhKuikaBlueprintWorkflowDraftCanGrantAuthority,
  fhKuikaBlueprintWorkflowDraftCanInvokeModel,
  fhKuikaBlueprintWorkflowDraftCanMutateRuntime,
  getFhKuikaCuratedBlueprintV1,
  simulateFhKuikaBlueprintDraftV1,
} from '../dist/index.js';

test('blueprint creates deterministic authority-neutral canonical-shape workflow draft', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('security-patch');
  assert.ok(blueprint);

  const input = {
    blueprint,
    exactRevision: 'abcdef1234567890',
    availableEvidence: [...blueprint.requiredEvidence],
  };

  const first = createFhKuikaWorkflowDraftV1(input);
  const second = createFhKuikaWorkflowDraftV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.status, 'CANDIDATE');
  assert.equal(first.authority, 'NONE');
  assert.equal(first.workflow.id, 'fh-kuika-security-patch');
  assert.equal(first.workflow.version, blueprint.version);
  assert.equal(first.workflowHash.length, 64);
  assert.equal(first.unresolvedEvidence.length, 0);
  assert.ok(first.workflow.nodes.some((node) => node.kind === 'GATE'));
  assert.ok(first.workflow.nodes.some((node) => node.role === 'security-reviewer'));
  assert.equal(first.workflow.edges.length, first.workflow.nodes.length - 1);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.workflow), true);

  assert.equal(fhKuikaBlueprintWorkflowDraftCanInvokeModel(), false);
  assert.equal(fhKuikaBlueprintWorkflowDraftCanMutateRuntime(), false);
  assert.equal(fhKuikaBlueprintWorkflowDraftCanGrantAuthority(), false);
});

test('blueprint workflow simulation passes standard fixture only with required evidence', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('feature-implementation');
  assert.ok(blueprint);

  const ready = createFhKuikaWorkflowDraftV1({
    blueprint,
    exactRevision: 'abcdef1234567890',
    availableEvidence: [...blueprint.requiredEvidence],
  });
  const pass = simulateFhKuikaBlueprintDraftV1(ready, 'standard-pass', blueprint);

  assert.equal(pass.expectedTerminalState, 'PASS');
  assert.equal(pass.observedTerminalState, 'PASS');
  assert.equal(pass.passed, true);
  assert.ok(pass.checks.every((check) => check.passed));
  assert.equal(pass.authority, 'NONE');

  const incomplete = createFhKuikaWorkflowDraftV1({
    blueprint,
    exactRevision: 'abcdef1234567890',
    availableEvidence: [],
  });
  const blocked = simulateFhKuikaBlueprintDraftV1(incomplete, 'missing-evidence', blueprint);

  assert.equal(blocked.expectedTerminalState, 'BLOCKED');
  assert.equal(blocked.observedTerminalState, 'BLOCKED');
  assert.equal(blocked.passed, true);
  assert.ok(blocked.checks.some((check) => check.id === 'required-evidence' && !check.passed));
});

test('workflow draft and simulation fail closed on revision, fixture and blueprint mismatch', () => {
  const feature = getFhKuikaCuratedBlueprintV1('feature-implementation');
  const bugfix = getFhKuikaCuratedBlueprintV1('bug-fix');
  assert.ok(feature);
  assert.ok(bugfix);

  assert.throws(
    () =>
      createFhKuikaWorkflowDraftV1({
        blueprint: feature,
        exactRevision: 'not-a-revision',
      }),
    /exactRevision/,
  );

  const draft = createFhKuikaWorkflowDraftV1({
    blueprint: feature,
    exactRevision: 'abcdef1234567890',
  });

  assert.throws(
    () => simulateFhKuikaBlueprintDraftV1(draft, 'unknown-fixture', feature),
    /unknown blueprint simulation fixture/,
  );
  assert.throws(
    () => simulateFhKuikaBlueprintDraftV1(draft, 'standard-pass', bugfix),
    /not bound to the supplied blueprint/,
  );
});

test('workflow draft role mapping remains deterministic across specialist blueprints', () => {
  const cases = [
    ['database-migration', 'database-migration-reviewer'],
    ['incident-response', 'incident-investigator'],
    ['performance-regression', 'performance-reviewer'],
    ['architecture-change', 'architecture-reviewer'],
  ];

  for (const [id, expectedRole] of cases) {
    const blueprint = getFhKuikaCuratedBlueprintV1(id);
    assert.ok(blueprint);

    const draft = createFhKuikaWorkflowDraftV1({
      blueprint,
      exactRevision: 'abcdef1234567890',
    });

    assert.ok(
      draft.workflow.nodes.some((node) => node.role === expectedRole),
      id + ' should map at least one lifecycle node to ' + expectedRole,
    );
  }
});
