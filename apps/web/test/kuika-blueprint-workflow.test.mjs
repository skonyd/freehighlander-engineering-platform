import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blueprintWorkflowPreparationCanExecute,
  blueprintWorkflowPreparationCanInvokeModel,
  blueprintWorkflowPreparationCanPublishDirectly,
  getFhKuikaCuratedBlueprintV1,
  prepareFhKuikaBlueprintSimulationV1,
  prepareFhKuikaBlueprintWorkflowV1,
} from '../dist/index.js';

function templateFor(blueprint) {
  const match = /^workflow:([^@]+)@(.+)$/.exec(blueprint.workflowTemplateRef);
  return {
    ref: blueprint.workflowTemplateRef,
    canonicalDefinition: {
      id: match[1],
      version: match[2],
      nodes: [
        { id: 'plan', kind: 'MODEL', role: 'planning-agent' },
        { id: 'review', kind: 'GATE' },
      ],
      edges: [{ from: 'plan', to: 'review' }],
    },
  };
}

test('blueprint workflow preparation requires exact canonical template identity', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('feature-implementation');
  assert.ok(blueprint);

  const prepared = prepareFhKuikaBlueprintWorkflowV1(blueprint, templateFor(blueprint));
  assert.equal(prepared.blueprintHash, blueprint.blueprintHash);
  assert.equal(prepared.workflowDraft.authority, 'NONE');
  assert.equal(prepared.workflowDraft.executionAuthorized, false);
  assert.equal(prepared.workflowDraft.publishAuthorized, false);
  assert.equal(prepared.authority, 'NONE');

  assert.throws(
    () =>
      prepareFhKuikaBlueprintWorkflowV1(blueprint, {
        ...templateFor(blueprint),
        ref: 'workflow:other@1.0.0',
      }),
    /template ref does not match/,
  );
});

test('simulation preparation is exact-bound and never executes fixtures', () => {
  const blueprint = getFhKuikaCuratedBlueprintV1('security-patch');
  assert.ok(blueprint);

  const prepared = prepareFhKuikaBlueprintWorkflowV1(blueprint, templateFor(blueprint));
  const simulation = prepareFhKuikaBlueprintSimulationV1(prepared, blueprint);

  assert.equal(simulation.workflowValid, true);
  assert.ok(simulation.fixtures.length > 0);
  assert.ok(simulation.fixtures.every((fixture) => fixture.state === 'NOT_EXECUTED'));
  assert.equal(simulation.executionAuthorized, false);
  assert.equal(simulation.authority, 'NONE');
});

test('blueprint workflow preparation stays zero-model, non-executing and non-publishing', () => {
  assert.equal(blueprintWorkflowPreparationCanInvokeModel(), false);
  assert.equal(blueprintWorkflowPreparationCanExecute(), false);
  assert.equal(blueprintWorkflowPreparationCanPublishDirectly(), false);
});
