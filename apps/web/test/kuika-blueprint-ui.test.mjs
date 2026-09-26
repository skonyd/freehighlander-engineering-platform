import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FH_KUIKA_BLUEPRINTS_HTML,
  blueprintCatalogPageCanGrantAuthority,
  blueprintCatalogPageCanInvokeModel,
  blueprintCatalogPageCanMutateRuntime,
  blueprintPreparationCanExecute,
  blueprintPreparationCanGrantAuthority,
  blueprintPreparationCanPublishDirectly,
  getFhKuikaCuratedBlueprintV1,
  prepareFhKuikaBlueprintWorkflowV1,
  renderFhKuikaBlueprintSummaryV1,
} from '../dist/index.js';

test('Blueprint Catalog UI is read-only and exposes deterministic preparation', () => {
  assert.match(FH_KUIKA_BLUEPRINTS_HTML, /Blueprint Catalog/);
  assert.match(FH_KUIKA_BLUEPRINTS_HTML, /Prepare workflow draft/);
  assert.match(FH_KUIKA_BLUEPRINTS_HTML, /Simulate fixtures/);
  assert.match(FH_KUIKA_BLUEPRINTS_HTML, /invokes no model/);
  assert.equal(blueprintCatalogPageCanInvokeModel(), false);
  assert.equal(blueprintCatalogPageCanGrantAuthority(), false);
  assert.equal(blueprintCatalogPageCanMutateRuntime(), false);
});

test('published blueprint prepares a non-authoritative canonical workflow draft', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('security-patch');
  assert.ok(blueprint);

  const preparation = prepareFhKuikaBlueprintWorkflowV1(blueprint);
  assert.equal(preparation.blueprintId, 'security-patch');
  assert.equal(preparation.authority, 'NONE');
  assert.equal(preparation.publishAuthorized, false);
  assert.equal(preparation.executionAuthorized, false);
  assert.equal(preparation.workflowDraft.authority, 'NONE');
  assert.equal(preparation.workflowDraft.publishAuthorized, false);
  assert.equal(preparation.workflowDraft.executionAuthorized, false);
  assert.ok(preparation.workflowDraft.canonicalDefinition.nodes.length > 0);
  assert.ok(
    preparation.workflowDraft.canonicalDefinition.nodes.some((node) => node.kind === 'GATE'),
  );
  assert.equal(preparation.simulations.length, blueprint.simulationFixtures.length);
  assert.ok(preparation.simulations.every((item) => item.draftValid));
  assert.ok(preparation.simulations.every((item) => item.authority === 'NONE'));

  assert.equal(blueprintPreparationCanGrantAuthority(), false);
  assert.equal(blueprintPreparationCanPublishDirectly(), false);
  assert.equal(blueprintPreparationCanExecute(), false);
});

test('blueprint summary retains provenance and hides no risk/evidence requirements', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('database-migration');
  assert.ok(blueprint);
  const summary = renderFhKuikaBlueprintSummaryV1(blueprint);

  assert.equal(summary.id, blueprint.id);
  assert.equal(summary.version, blueprint.version);
  assert.equal(summary.blueprintHash, blueprint.blueprintHash);
  assert.equal(summary.defaultRiskTier, 'HIGH');
  assert.deepEqual(summary.requiredEvidence, blueprint.requiredEvidence);
  assert.deepEqual(summary.requiredRoles, blueprint.requiredRoles);
  assert.equal(summary.authority, 'NONE');
});
