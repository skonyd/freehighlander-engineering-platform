import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('Core Home UI exposes FH-04B.8 progressive disclosure and persistent filters', async () => {
  const path = fileURLToPath(new URL('../src/ui.ts', import.meta.url));
  const source = await readFile(path, 'utf8');

  assert.match(source, /id="time-window"/);
  assert.match(source, /id="attention-filter"/);
  assert.match(source, /<details class="advanced-details">/);
  assert.match(source, /freehighlander\.core-home\.preferences\.v1/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /No runs in the selected time window/);
  assert.match(source, /Partial\/unavailable · last local snapshot retained/);
});

test('Core Home refresh is single-flight and polling is timeout-based', async () => {
  const path = fileURLToPath(new URL('../src/ui.ts', import.meta.url));
  const source = await readFile(path, 'utf8');

  assert.match(source, /if \(activeLoad\) return activeLoad/);
  assert.match(source, /activeLoad = loadInternal\(\)\.finally/);
  assert.match(source, /setTimeout\(async \(\) =>/);
  assert.doesNotMatch(source, /setInterval\(/);
});

test('advanced diagnostics remain hidden by default and keyboard-accessible run rows remain intact', async () => {
  const path = fileURLToPath(new URL('../src/ui.ts', import.meta.url));
  const source = await readFile(path, 'utf8');

  assert.match(source, /advancedOpen: false/);
  assert.match(source, /<details class="advanced-details"/);
  assert.match(source, /tabindex="0" role="button"/);
  assert.match(source, /event\.key === 'Enter' \|\| event\.key === ' '/);
});
