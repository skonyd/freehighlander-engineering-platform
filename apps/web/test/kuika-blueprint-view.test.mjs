import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blueprintCatalogViewCanGrantAuthority,
  blueprintCatalogViewCanInvokeModel,
  blueprintCatalogViewCanMutateBlueprint,
  buildFhKuikaBlueprintCatalogViewV1,
  buildFhKuikaBlueprintDetailViewV1,
  getFhKuikaCuratedBlueprintV1,
  getFhKuikaCuratedBlueprintsV1,
} from '../dist/index.js';

test('Blueprint Catalog view is deterministic, read-only and authority-neutral', () => {
  const blueprints = getFhKuikaCuratedBlueprintsV1();
  const first = buildFhKuikaBlueprintCatalogViewV1(blueprints);
  const second = buildFhKuikaBlueprintCatalogViewV1([...blueprints].reverse());

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.authority, 'NONE');
  assert.equal(first.blueprints.length, 12);
  assert.equal(blueprintCatalogViewCanInvokeModel(), false);
  assert.equal(blueprintCatalogViewCanGrantAuthority(), false);
  assert.equal(blueprintCatalogViewCanMutateBlueprint(), false);
});

test('Blueprint detail exposes lifecycle, evidence and authority-sensitive metadata', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('security-patch');
  assert.ok(blueprint);

  const detail = buildFhKuikaBlueprintDetailViewV1(blueprint);
  assert.equal(detail.id, 'security-patch');
  assert.equal(detail.defaultRiskTier, 'HIGH');
  assert.equal(detail.independentReviewRequired, true);
  assert.ok(detail.lifecycleStages.includes('SECURITY_REVIEW'));
  assert.ok(detail.requiredRoleIds.includes('security-reviewer'));
  assert.ok(detail.requiredEvidenceKinds.includes('security-finding'));
  assert.ok(detail.authoritySensitiveNodes.includes('security-gate'));
  assert.equal(detail.authority, 'NONE');
  assert.equal(detail.blueprintHash.length, 64);
});
