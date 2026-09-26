import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getFhKuikaWorkbenchModeView,
  listFhKuikaWorkbenchModes,
  workbenchModeSelectionCanGrantAuthority,
  workbenchModeSelectionCanInvokeModel,
} from '../dist/index.js';

test('FH-KUIKA Workbench mode selection is non-authoritative and zero-call', () => {
  const modes = listFhKuikaWorkbenchModes();

  assert.deepEqual(
    modes.map((item) => item.mode),
    ['ASK', 'PLAN', 'EXECUTE', 'REVIEW'],
  );

  for (const mode of modes) {
    assert.equal(mode.selectionAuthority, 'NONE');
    assert.equal(mode.executionOwner, 'CONTROL_PLANE');
    assert.equal(mode.canSelect, true);
    assert.equal(mode.canInvokeModelOnSelection, false);
    assert.equal(mode.canGrantAuthority, false);
  }

  assert.equal(workbenchModeSelectionCanInvokeModel(), false);
  assert.equal(workbenchModeSelectionCanGrantAuthority(), false);
});

test('only Execute mode is mutation-capable and requires enabled V3 authority', () => {
  const execute = getFhKuikaWorkbenchModeView('EXECUTE');
  const ask = getFhKuikaWorkbenchModeView('ASK');
  const plan = getFhKuikaWorkbenchModeView('PLAN');
  const review = getFhKuikaWorkbenchModeView('REVIEW');

  assert.equal(execute.mutationCapable, true);
  assert.equal(execute.requiresEnabledV3Authority, true);

  for (const mode of [ask, plan, review]) {
    assert.equal(mode.mutationCapable, false);
    assert.equal(mode.requiresEnabledV3Authority, false);
  }
});
