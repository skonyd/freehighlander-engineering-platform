import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fhKuikaBlueprintCatalogUiCanGrantAuthority,
  fhKuikaBlueprintCatalogUiCanInvokeModel,
  fhKuikaBlueprintCatalogUiCanMutateRuntime,
  renderFhKuikaBlueprintCatalogHtml,
  renderFhKuikaBlueprintDetailHtml,
} from '../dist/index.js';

test('FH-KUIKA blueprint catalog renders curated published blueprints read-only', () => {
  const html = renderFhKuikaBlueprintCatalogHtml();

  assert.match(html, /Blueprints/);
  assert.match(html, /Feature Implementation/);
  assert.match(html, /Security Patch/);
  assert.match(html, /Database Migration/);
  assert.match(html, /Incident Response/);
  assert.match(html, /Provider Model Migration/);
  assert.match(html, /\/modules\/fh-kuika\/build\/blueprints\/feature-implementation/);
  assert.match(html, /inspection is read-only/i);

  assert.equal(fhKuikaBlueprintCatalogUiCanInvokeModel(), false);
  assert.equal(fhKuikaBlueprintCatalogUiCanMutateRuntime(), false);
  assert.equal(fhKuikaBlueprintCatalogUiCanGrantAuthority(), false);
});

test('FH-KUIKA blueprint detail exposes lifecycle, evidence, independence and immutable identity', () => {
  const html = renderFhKuikaBlueprintDetailHtml('security-patch');

  assert.ok(html);
  assert.match(html, /security-patch/);
  assert.match(html, /SECURITY_REVIEW/);
  assert.match(html, /security-reviewer/);
  assert.match(html, /security-finding/);
  assert.match(html, /security-gate/);
  assert.match(html, /Self review forbidden/);
  assert.match(html, /Blueprint hash/);
  assert.match(html, /workflow:security-patch@1\.0\.0/);
  assert.match(html, />NONE</);
});

test('FH-KUIKA blueprint detail fails closed for unknown identifiers', () => {
  assert.equal(renderFhKuikaBlueprintDetailHtml('does-not-exist'), null);
});
