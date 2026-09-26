import assert from 'node:assert/strict';
import test from 'node:test';

import { FH_KUIKA_WORKFLOW_STUDIO_HTML } from '../dist/index.js';

test('Workflow Studio UX exposes advanced inspector annotations without runtime authority', () => {
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /Advanced annotations/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="risk-tier"/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="approval-policy"/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="token-budget"/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="cost-budget"/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="required-evidence"/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /draft-only hints/);
});

test('Workflow Studio UX exposes deterministic validation and non-executing simulation preview', () => {
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="validate"/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /id="simulate"/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /Canonical publish validation is always required/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /SIMULATION PREVIEW/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /NOT_EXECUTED/);
  assert.match(FH_KUIKA_WORKFLOW_STUDIO_HTML, /No runtime execution occurs/);
});
