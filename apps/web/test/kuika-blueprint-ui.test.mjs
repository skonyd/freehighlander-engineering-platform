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
  createDashboardServer,
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


test('Blueprint HTTP routes expose catalog, detail and preparation without local telemetry', async () => {
  const server = createDashboardServer({ databasePath: '/tmp/fh-kuika-blueprint-no-db.sqlite' });

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

    const page = await fetch(base + '/modules/fh-kuika/build/blueprints');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Blueprint Catalog/);

    const catalog = await (await fetch(base + '/api/modules/fh-kuika/blueprints')).json();
    assert.equal(catalog.blueprints.length, 12);
    assert.equal(catalog.blueprints[0].authority, 'NONE');

    const detail = await (
      await fetch(base + '/api/modules/fh-kuika/blueprints/security-patch')
    ).json();
    assert.equal(detail.blueprint.id, 'security-patch');

    const prepared = await (
      await fetch(base + '/api/modules/fh-kuika/blueprints/security-patch/prepare')
    ).json();
    assert.equal(prepared.preparation.authority, 'NONE');
    assert.equal(prepared.preparation.executionAuthorized, false);

    const missing = await fetch(base + '/api/modules/fh-kuika/blueprints/does-not-exist');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, 'blueprint_not_found');
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
