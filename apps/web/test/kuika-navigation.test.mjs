import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fhKuikaAreaPageCanGrantAuthority,
  fhKuikaAreaPageCanInvokeModel,
  fhKuikaAreaPageCanMutateRuntime,
  fhKuikaNavigationCanGrantAuthority,
  fhKuikaNavigationCanInvokeModel,
  fhKuikaNavigationCanMutateRuntime,
  getFhKuikaNavigationItem,
  isFhKuikaPreparationArea,
  listFhKuikaNavigation,
  renderFhKuikaAreaHtml,
} from '../dist/index.js';

test('FH-KUIKA navigation stays shallow and authority-neutral', () => {
  const items = listFhKuikaNavigation();

  assert.deepEqual(
    items.map((item) => item.area),
    ['OVERVIEW', 'WORKBENCH', 'BUILD', 'INTEGRATE', 'KNOWLEDGE', 'OPERATE'],
  );
  assert.equal(items.length, 6);
  assert.ok(items.every((item) => item.authority === 'NONE'));
  assert.ok(items.every((item) => item.modelCallOnNavigate === false));
  assert.ok(items.every((item) => item.mutationOnNavigate === false));
  assert.equal(fhKuikaNavigationCanInvokeModel(), false);
  assert.equal(fhKuikaNavigationCanMutateRuntime(), false);
  assert.equal(fhKuikaNavigationCanGrantAuthority(), false);
});

test('FH-KUIKA navigation returns defensive copies and stable routes', () => {
  const first = listFhKuikaNavigation();
  const second = listFhKuikaNavigation();

  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.equal(getFhKuikaNavigationItem('BUILD').href, '/modules/fh-kuika/build');
  assert.equal(getFhKuikaNavigationItem('INTEGRATE').href, '/modules/fh-kuika/integrate');
  assert.equal(getFhKuikaNavigationItem('KNOWLEDGE').href, '/modules/fh-kuika/knowledge');
});

test('FH-KUIKA preparation areas render without model or authority paths', () => {
  for (const area of ['BUILD', 'INTEGRATE', 'KNOWLEDGE']) {
    const html = renderFhKuikaAreaHtml(area);

    assert.match(html, /FH-KUIKA/);
    assert.match(html, /Overview/);
    assert.match(html, /Workbench/);
    assert.match(html, /Build/);
    assert.match(html, /Integrate/);
    assert.match(html, /Knowledge/);
    assert.match(html, /Operate/);
    assert.match(html, /invokes no model/);
    assert.match(html, /grants no authority/);
    if (area === 'BUILD') {
      assert.match(html, /\/modules\/fh-kuika\/build\/blueprints/);
      assert.match(html, /AVAILABLE/);
    }
    assert.equal(isFhKuikaPreparationArea(area), true);
  }

  assert.equal(isFhKuikaPreparationArea('OVERVIEW'), false);
  assert.equal(fhKuikaAreaPageCanInvokeModel(), false);
  assert.equal(fhKuikaAreaPageCanMutateRuntime(), false);
  assert.equal(fhKuikaAreaPageCanGrantAuthority(), false);
});
