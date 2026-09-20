import assert from 'node:assert/strict';
import test from 'node:test';

import { getControlPlaneFoundationInfo } from '../dist/index.js';

test('control-plane foundation identity remains FH-01A and authority-disabled', () => {
  assert.deepEqual(getControlPlaneFoundationInfo(), {
    name: 'freehighlander-control-plane',
    phase: 'FH-01A',
    workflowAuthority: 'disabled-until-fh-01b',
    uiCoupling: 'independent',
  });
});

test('control-plane foundation snapshot is deterministic and mutation-isolated', () => {
  const first = getControlPlaneFoundationInfo();
  const second = getControlPlaneFoundationInfo();

  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.equal(first.workflowAuthority, 'disabled-until-fh-01b');
});
