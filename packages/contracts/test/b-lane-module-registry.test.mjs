import assert from 'node:assert/strict';
import test from 'node:test';

import {
  B_LANE_MODULE_REGISTRY_V1,
  bLaneModuleRegistryCanGrantAuthority,
  getBLaneModuleDefinitionV1,
} from '../dist/index.js';

test('B-lane registry covers FH-30B through FH-37B exactly once', () => {
  assert.deepEqual(
    B_LANE_MODULE_REGISTRY_V1.map((item) => item.id),
    ['FH-30B', 'FH-31B', 'FH-32B', 'FH-33B', 'FH-34B', 'FH-35B', 'FH-36B', 'FH-37B'],
  );
  assert.equal(new Set(B_LANE_MODULE_REGISTRY_V1.map((item) => item.id)).size, 8);
  assert.equal(B_LANE_MODULE_REGISTRY_V1.every((item) => item.implementationStatus === 'OPERATIONAL'), true);
  assert.equal(bLaneModuleRegistryCanGrantAuthority(), false);
});

test('B-lane critical mutation modules expose canonical capability bindings', () => {
  assert.deepEqual(getBLaneModuleDefinitionV1('FH-31B').requiredCapabilities, ['GIT_WRITE']);
  assert.deepEqual(getBLaneModuleDefinitionV1('FH-34B').requiredCapabilities, ['RELEASE_DEPLOY']);
  assert.deepEqual(getBLaneModuleDefinitionV1('FH-35B').requiredCapabilities, [
    'INFRASTRUCTURE_MUTATION',
  ]);
  assert.deepEqual(getBLaneModuleDefinitionV1('FH-36B').requiredCapabilities, [
    'AUTOMATIC_REMEDIATION',
  ]);
  assert.deepEqual(getBLaneModuleDefinitionV1('FH-36B').conditionalCapabilities, [
    'INFRASTRUCTURE_MUTATION',
  ]);
});

test('evidence-only B-lane modules expose no mutation authority', () => {
  for (const id of ['FH-30B', 'FH-32B', 'FH-33B', 'FH-37B']) {
    const definition = getBLaneModuleDefinitionV1(id);
    assert.equal(definition.authorityEffect, 'NONE');
    assert.deepEqual(definition.requiredCapabilities, []);
  }
});
