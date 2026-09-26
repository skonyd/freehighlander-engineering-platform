import assert from 'node:assert/strict';
import test from 'node:test';

import {
  curatedBlueprintPackCanGrantAuthority,
  getFhKuikaCuratedBlueprintV1,
  getFhKuikaCuratedBlueprintsV1,
} from '../dist/index.js';

const EXPECTED_INTENTS = [
  'FEATURE_IMPLEMENTATION',
  'BUG_FIX',
  'SECURITY_PATCH',
  'DEPENDENCY_UPGRADE',
  'DATABASE_MIGRATION',
  'REFACTOR',
  'RELEASE_PREPARATION',
  'HOTFIX',
  'INCIDENT_RESPONSE',
  'PERFORMANCE_REGRESSION',
  'PROVIDER_MODEL_MIGRATION',
  'ARCHITECTURE_CHANGE',
].sort();

test('curated blueprint pack covers the initial engineering intent catalog', () => {
  const blueprints = getFhKuikaCuratedBlueprintsV1();

  assert.equal(blueprints.length, 12);
  assert.equal(Object.isFrozen(blueprints), true);
  assert.deepEqual(
    blueprints.flatMap((item) => item.compatibleIntents).sort(),
    EXPECTED_INTENTS,
  );

  assert.equal(new Set(blueprints.map((item) => item.id)).size, blueprints.length);
  assert.equal(new Set(blueprints.map((item) => item.blueprintHash)).size, blueprints.length);

  for (const blueprint of blueprints) {
    assert.equal(blueprint.version, '1.0.0');
    assert.equal(blueprint.status, 'PUBLISHED');
    assert.equal(blueprint.authority, 'NONE');
    assert.equal(blueprint.blueprintHash.length, 64);
    assert.ok(blueprint.requiredEvidence.length > 0);
    assert.ok(blueprint.requiredRoles.length > 0);
    assert.ok(blueprint.lifecycleStages.length > 0);
    assert.ok(blueprint.validationRules.includes('authority-cannot-be-weakened'));
    assert.equal(blueprint.simulationFixtures.length, 2);
  }

  assert.equal(curatedBlueprintPackCanGrantAuthority(), false);
});

test('high-risk curated blueprints require independent non-self review', () => {
  const highRisk = getFhKuikaCuratedBlueprintsV1().filter(
    (item) => item.defaultRiskTier === 'HIGH' || item.defaultRiskTier === 'CRITICAL',
  );

  assert.ok(highRisk.length > 0);
  for (const blueprint of highRisk) {
    assert.equal(blueprint.independence.required, true);
    assert.ok(blueprint.independence.minimumDistinctReviewers >= 1);
    assert.equal(blueprint.independence.forbiddenSelfReview, true);
  }
});

test('curated blueprint lookup is exact id/version and does not silently float versions', () => {
  const feature = getFhKuikaCuratedBlueprintV1('feature-implementation', '1.0.0');
  assert.ok(feature);
  assert.equal(feature.id, 'feature-implementation');

  assert.equal(getFhKuikaCuratedBlueprintV1('feature-implementation', '2.0.0'), null);
  assert.equal(getFhKuikaCuratedBlueprintV1('unknown-blueprint', '1.0.0'), null);
});
