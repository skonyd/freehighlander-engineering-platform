import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blueprintSimulationPreviewCanExecute,
  blueprintWorkflowDraftCanExecute,
  blueprintWorkflowDraftCanGrantAuthority,
  blueprintWorkflowDraftCanPublish,
  createFhKuikaBlueprintWorkflowDraftV1,
  getFhKuikaCuratedBlueprintV1,
  simulateFhKuikaBlueprintV1,
} from '../dist/index.js';

test('blueprint generates unresolved template workflow draft without authority', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('security-patch');
  assert.ok(blueprint);

  const result = createFhKuikaBlueprintWorkflowDraftV1(blueprint);

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.blueprintId, 'security-patch');
  assert.equal(result.blueprintVersion, '1.0.0');
  assert.equal(result.blueprintHash, blueprint.blueprintHash);
  assert.equal(result.workflowTemplateRef, blueprint.workflowTemplateRef);
  assert.equal(result.templateResolution, 'REQUIRED');
  assert.equal(result.authority, 'NONE');
  assert.equal(result.publishAuthorized, false);
  assert.equal(result.executionAuthorized, false);

  assert.equal(result.draft.authority, 'NONE');
  assert.equal(result.draft.publishAuthorized, false);
  assert.equal(result.draft.executionAuthorized, false);
  assert.deepEqual(result.draft.canonicalDefinition.nodes, [
    { id: 'template', kind: 'SUBWORKFLOW' },
  ]);
  assert.deepEqual(result.draft.canonicalDefinition.edges, []);

  assert.equal(blueprintWorkflowDraftCanGrantAuthority(), false);
  assert.equal(blueprintWorkflowDraftCanPublish(), false);
  assert.equal(blueprintWorkflowDraftCanExecute(), false);
});

test('blueprint simulation is expected-only preview and performs no execution', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('database-migration');
  assert.ok(blueprint);

  const simulation = simulateFhKuikaBlueprintV1(blueprint);

  assert.equal(simulation.schemaVersion, 1);
  assert.equal(simulation.executionPerformed, false);
  assert.equal(simulation.authority, 'NONE');
  assert.equal(simulation.publishAuthorized, false);
  assert.equal(simulation.executionAuthorized, false);
  assert.equal(simulation.draftValidation.valid, true);
  assert.equal(simulation.draftValidation.requiresCanonicalPublishValidation, true);
  assert.equal(simulation.fixtures.length, blueprint.simulationFixtures.length);
  assert.ok(simulation.fixtures.every((item) => item.resultKind === 'EXPECTED_ONLY'));
  assert.equal(blueprintSimulationPreviewCanExecute(), false);
});
