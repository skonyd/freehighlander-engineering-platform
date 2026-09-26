import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateFhKuikaBlueprintUsageV1,
  fhKuikaBlueprintMetricsCanGrantAuthority,
  fhKuikaBlueprintMetricsCanInvokeModel,
  fhKuikaBlueprintMetricsCanMutateRuntime,
  getFhKuikaCuratedBlueprintsV1,
  measureFhKuikaBlueprintCatalogV1,
} from '../dist/index.js';

test('blueprint catalog quality metrics are deterministic and authority-neutral', () => {
  const blueprints = getFhKuikaCuratedBlueprintsV1();
  const first = measureFhKuikaBlueprintCatalogV1(blueprints);
  const second = measureFhKuikaBlueprintCatalogV1(blueprints);

  assert.deepEqual(first, second);
  assert.equal(first.totalBlueprints, 12);
  assert.equal(first.uniqueIntents, 12);
  assert.equal(first.duplicateBlueprintHashes, 0);
  assert.equal(first.blueprintsWithPassFixture, 12);
  assert.equal(first.blueprintsWithBlockedFixture, 12);
  assert.ok(first.totalSimulationFixtures >= 24);
  assert.equal(first.authority, 'NONE');

  assert.equal(fhKuikaBlueprintMetricsCanInvokeModel(), false);
  assert.equal(fhKuikaBlueprintMetricsCanMutateRuntime(), false);
  assert.equal(fhKuikaBlueprintMetricsCanGrantAuthority(), false);
});

test('blueprint usage aggregation counts only supplied metadata events', () => {
  const events = [
    {
      schemaVersion: 1,
      timestamp: '2026-09-26T11:00:00.000Z',
      action: 'CATALOG_VIEW',
      authority: 'NONE',
    },
    {
      schemaVersion: 1,
      timestamp: '2026-09-26T11:01:00.000Z',
      action: 'BLUEPRINT_VIEW',
      blueprintId: 'feature-implementation',
      blueprintVersion: '1.0.0',
      authority: 'NONE',
    },
    {
      schemaVersion: 1,
      timestamp: '2026-09-26T11:02:00.000Z',
      action: 'DRAFT_CREATED',
      blueprintId: 'feature-implementation',
      blueprintVersion: '1.0.0',
      authority: 'NONE',
    },
    {
      schemaVersion: 1,
      timestamp: '2026-09-26T11:03:00.000Z',
      action: 'SIMULATION_COMPLETED',
      blueprintId: 'feature-implementation',
      blueprintVersion: '1.0.0',
      outcome: 'PASS',
      authority: 'NONE',
    },
    {
      schemaVersion: 1,
      timestamp: '2026-09-26T11:04:00.000Z',
      action: 'SIMULATION_COMPLETED',
      blueprintId: 'security-patch',
      blueprintVersion: '1.0.0',
      outcome: 'BLOCKED',
      authority: 'NONE',
    },
    {
      schemaVersion: 1,
      timestamp: '2026-09-26T11:05:00.000Z',
      action: 'SIMULATION_COMPLETED',
      blueprintId: 'security-patch',
      blueprintVersion: '1.0.0',
      outcome: 'FAIL',
      authority: 'NONE',
    },
  ];

  const summary = aggregateFhKuikaBlueprintUsageV1(events);

  assert.equal(summary.catalogViews, 1);
  assert.equal(summary.blueprintViews, 1);
  assert.equal(summary.draftsCreated, 1);
  assert.equal(summary.simulations, 3);
  assert.equal(summary.simulationPasses, 1);
  assert.equal(summary.simulationFailures, 1);
  assert.equal(summary.simulationBlocks, 1);
  assert.equal(summary.byBlueprint.length, 2);
  assert.equal(summary.authority, 'NONE');
});

test('blueprint usage aggregation fails closed on malformed metadata', () => {
  assert.throws(
    () =>
      aggregateFhKuikaBlueprintUsageV1([
        {
          schemaVersion: 1,
          timestamp: 'bad-time',
          action: 'CATALOG_VIEW',
          authority: 'NONE',
        },
      ]),
    /timestamp must be valid/,
  );

  assert.throws(
    () =>
      aggregateFhKuikaBlueprintUsageV1([
        {
          schemaVersion: 1,
          timestamp: '2026-09-26T11:00:00.000Z',
          action: 'BLUEPRINT_VIEW',
          authority: 'NONE',
        },
      ]),
    /requires blueprintId/,
  );

  assert.throws(
    () =>
      aggregateFhKuikaBlueprintUsageV1([
        {
          schemaVersion: 1,
          timestamp: '2026-09-26T11:00:00.000Z',
          action: 'SIMULATION_COMPLETED',
          blueprintId: 'feature-implementation',
          blueprintVersion: '1.0.0',
          authority: 'NONE',
        },
      ]),
    /requires outcome/,
  );
});
