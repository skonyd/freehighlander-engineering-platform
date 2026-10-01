import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORITY_CAPABILITY_ACTIONS,
  AUTHORITY_CAPABILITY_IDS,
  AUTHORITY_CAPABILITY_REGISTRY_V1,
  authorityCapabilityRegistryCanGrantAuthority,
  authorityCapabilityRegistryDefaultsDeny,
  getAuthorityCapabilityDefinitionV1,
} from '../dist/index.js';

test('authority capability registry is ordered unique and default DENY', () => {
  assert.deepEqual(AUTHORITY_CAPABILITY_IDS, [
    'GIT_WRITE',
    'RELEASE_DEPLOY',
    'INFRASTRUCTURE_MUTATION',
    'AUTOMATIC_REMEDIATION',
  ]);
  assert.equal(new Set(AUTHORITY_CAPABILITY_IDS).size, AUTHORITY_CAPABILITY_IDS.length);
  assert.equal(
    new Set(AUTHORITY_CAPABILITY_REGISTRY_V1.map((definition) => definition.action)).size,
    AUTHORITY_CAPABILITY_REGISTRY_V1.length,
  );

  for (const definition of AUTHORITY_CAPABILITY_REGISTRY_V1) {
    assert.equal(definition.defaultDeny, true);
    assert.equal(definition.requiresHumanApproval, true);
    assert.equal(definition.riskTier, 'CRITICAL');
    assert.equal(definition.dataClassification, 'INTERNAL');
    assert.deepEqual(definition.dependencies, []);
    assert.ok(definition.label.length > 0);
    assert.ok(definition.description.length > 0);
    assert.ok(definition.risk.length > 0);
    assert.equal(AUTHORITY_CAPABILITY_ACTIONS[definition.id], definition.action);
    assert.equal(getAuthorityCapabilityDefinitionV1(definition.id), definition);
  }

  assert.equal(authorityCapabilityRegistryDefaultsDeny(), true);
  assert.equal(authorityCapabilityRegistryCanGrantAuthority(), false);
});

test('unknown authority capability lookup fails closed', () => {
  assert.throws(
    () => getAuthorityCapabilityDefinitionV1('UNKNOWN_CAPABILITY'),
    /unknown authority capability/,
  );
});
