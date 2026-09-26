import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blueprintSimulationPreviewCanExecute,
  blueprintWorkflowDraftCanExecute,
  blueprintWorkflowDraftCanPublish,
  buildFhKuikaBlueprintSimulationPreviewV1,
  createFhKuikaBlueprintWorkflowDraftV1,
  getFhKuikaCuratedBlueprintV1,
} from '../dist/index.js';

test('blueprint creates an exact-revision-bound non-executable workflow draft', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('feature-implementation');
  assert.ok(blueprint);

  const draft = createFhKuikaBlueprintWorkflowDraftV1({
    draftId: 'draft-1',
    repository: 'skonyd/freehighlander-engineering-platform',
    exactRevision: 'a'.repeat(40),
    blueprint,
    parameterValues: {
      scope: 'apps/web',
    },
  });

  assert.equal(draft.schemaVersion, 1);
  assert.equal(draft.blueprintHash, blueprint.blueprintHash);
  assert.equal(draft.workflowTemplateRef, blueprint.workflowTemplateRef);
  assert.equal(draft.exactRevision, 'a'.repeat(40));
  assert.equal(draft.parameterValues.scope, 'apps/web');
  assert.equal(draft.authority, 'NONE');
  assert.equal(draft.publishAuthorized, false);
  assert.equal(draft.executionAuthorized, false);
  assert.equal(blueprintWorkflowDraftCanPublish(), false);
  assert.equal(blueprintWorkflowDraftCanExecute(), false);
});

test('workflow draft validates required, unknown and typed blueprint parameters', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('feature-implementation');
  assert.ok(blueprint);

  assert.throws(
    () =>
      createFhKuikaBlueprintWorkflowDraftV1({
        draftId: 'missing',
        repository: 'repo',
        exactRevision: 'a'.repeat(40),
        blueprint,
        parameterValues: {},
      }),
    /required blueprint parameter is missing: scope/,
  );

  assert.throws(
    () =>
      createFhKuikaBlueprintWorkflowDraftV1({
        draftId: 'unknown',
        repository: 'repo',
        exactRevision: 'a'.repeat(40),
        blueprint,
        parameterValues: { scope: 'apps/web', authority: 'SYSTEM_POLICY' },
      }),
    /unknown blueprint parameter: authority/,
  );

  assert.throws(
    () =>
      createFhKuikaBlueprintWorkflowDraftV1({
        draftId: 'typed',
        repository: 'repo',
        exactRevision: 'a'.repeat(40),
        blueprint,
        parameterValues: { scope: 5 },
      }),
    /blueprint parameter type mismatch: scope/,
  );
});

test('simulation preview is fixture-only and performs no execution', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('security-patch');
  assert.ok(blueprint);

  const preview = buildFhKuikaBlueprintSimulationPreviewV1(blueprint);
  assert.equal(preview.schemaVersion, 1);
  assert.equal(preview.blueprintHash, blueprint.blueprintHash);
  assert.equal(preview.fixtures.length, 2);
  assert.equal(preview.authority, 'NONE');
  assert.equal(preview.executionPerformed, false);
  assert.equal(blueprintSimulationPreviewCanExecute(), false);
});
