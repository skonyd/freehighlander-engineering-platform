import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FH_KUIKA_APPROVALS_HTML,
  FH_KUIKA_MODULE_HTML,
  FH_KUIKA_OPERATIONS_HTML,
  FH_KUIKA_WORKBENCH_HTML,
} from '../dist/index.js';

const surfaces = [
  ['module', FH_KUIKA_MODULE_HTML],
  ['workbench', FH_KUIKA_WORKBENCH_HTML],
  ['operations', FH_KUIKA_OPERATIONS_HTML],
  ['approvals', FH_KUIKA_APPROVALS_HTML],
];

test('FH-KUIKA primary P0 surfaces provide keyboard skip navigation and a focusable main target', () => {
  for (const [name, html] of surfaces) {
    assert.match(html, /class="skip-link"/, name + ' must expose a skip link');
    assert.match(html, /href="#main-content"/, name + ' skip link must target main content');
    assert.match(
      html,
      /<main id="main-content" tabindex="-1">/,
      name + ' must expose a focusable main target',
    );
    assert.match(html, /:focus/, name + ' must provide visible focus handling');
  }
});

test('dynamic FH-KUIKA status surfaces announce deterministic state changes politely', () => {
  assert.match(FH_KUIKA_MODULE_HTML, /role="status" aria-live="polite"/);
  assert.match(FH_KUIKA_OPERATIONS_HTML, /role="status" aria-live="polite"/);
  assert.match(FH_KUIKA_APPROVALS_HTML, /role="status" aria-live="polite"/);
  assert.match(FH_KUIKA_WORKBENCH_HTML, /role="status" aria-live="polite"/);
});

test('FH-KUIKA operation filters and Workbench mode are local persistent UI state only', () => {
  assert.match(FH_KUIKA_OPERATIONS_HTML, /fh-kuika-operate-filters-v1/);
  assert.match(FH_KUIKA_OPERATIONS_HTML, /localStorage\.setItem/);
  assert.match(FH_KUIKA_OPERATIONS_HTML, /Filters are local UI state only/);

  assert.match(FH_KUIKA_WORKBENCH_HTML, /fh-kuika-workbench-mode-v1/);
  assert.match(FH_KUIKA_WORKBENCH_HTML, /localStorage\.setItem/);
  assert.match(FH_KUIKA_WORKBENCH_HTML, /NO MODEL CALL ON SELECT/);
});

test('FH-KUIKA P0 surfaces retain responsive collapse rules', () => {
  assert.match(FH_KUIKA_MODULE_HTML, /@media \(max-width: 560px\)/);
  assert.match(FH_KUIKA_OPERATIONS_HTML, /@media \(max-width: 820px\)/);
  assert.match(FH_KUIKA_APPROVALS_HTML, /@media \(max-width:760px\)/);
  assert.match(FH_KUIKA_WORKBENCH_HTML, /@media \(max-width:820px\)/);
});
