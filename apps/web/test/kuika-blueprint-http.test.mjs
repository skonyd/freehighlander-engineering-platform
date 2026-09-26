import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createDashboardServer,
  blueprintCatalogViewCanGrantAuthority,
  blueprintCatalogViewCanInvokeModel,
  blueprintCatalogViewCanMutateBlueprint,
} from '../dist/index.js';

async function withServer(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'fh-kuika-blueprints-'));
  const server = createDashboardServer({
    databasePath: path.join(root, 'missing.sqlite'),
  });

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
    await run('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
}

test('FH-KUIKA blueprint catalog UI and API are deterministic read-only surfaces', async () => {
  await withServer(async (base) => {
    const page = await fetch(base + '/modules/fh-kuika/build/blueprints');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Engineering Blueprints/);
    assert.match(html, /Blueprint detail/);
    assert.equal(page.headers.get('x-freehighlander-mode'), 'read-only');

    const catalogResponse = await fetch(base + '/api/modules/fh-kuika/blueprints');
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json();
    assert.equal(catalog.schemaVersion, 1);
    assert.equal(catalog.authority, 'NONE');
    assert.equal(catalog.blueprints.length, 12);

    const detailResponse = await fetch(base + '/api/modules/fh-kuika/blueprints/security-patch');
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.id, 'security-patch');
    assert.equal(detail.defaultRiskTier, 'HIGH');
    assert.equal(detail.authority, 'NONE');

    const draftResponse = await fetch(
      base + '/api/modules/fh-kuika/blueprints/security-patch/draft',
    );
    assert.equal(draftResponse.status, 200);
    const draft = await draftResponse.json();
    assert.equal(draft.templateResolution, 'REQUIRED');
    assert.equal(draft.publishAuthorized, false);
    assert.equal(draft.executionAuthorized, false);

    const simulationResponse = await fetch(
      base + '/api/modules/fh-kuika/blueprints/security-patch/simulation',
    );
    assert.equal(simulationResponse.status, 200);
    const simulation = await simulationResponse.json();
    assert.equal(simulation.executionPerformed, false);
    assert.ok(simulation.fixtures.every((item) => item.resultKind === 'EXPECTED_ONLY'));

    const missing = await fetch(base + '/api/modules/fh-kuika/blueprints/does-not-exist');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, 'blueprint_not_found');
  });

  assert.equal(blueprintCatalogViewCanInvokeModel(), false);
  assert.equal(blueprintCatalogViewCanGrantAuthority(), false);
  assert.equal(blueprintCatalogViewCanMutateBlueprint(), false);
});
