import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIncidentSnapshot,
  incidentCanAutomaticallyRemediate,
  incidentCanExecuteOperationalIntent,
  incidentCanGrantAuthority,
  incidentCanMutateInfrastructure,
  incidentProjection,
  validateIncident,
} from '../dist/index.js';

const binding = {
  serviceId: 'svc-api',
  environment: 'staging',
  resourceIds: ['api', 'db'],
};

const evidence = {
  id: 'ev-1',
  digest: 'a'.repeat(64),
  provenance: 'TRUSTED',
};

const incident = {
  schemaVersion: 1,
  id: 'inc-1',
  serviceId: 'svc-api',
  environment: 'staging',
  severity: 'SEV2',
  status: 'RESOLVED',
  title: 'API elevated errors',
  affectedResources: [{ resourceId: 'api' }],
  evidence: [evidence],
  timeline: [
    {
      id: 'evt-1',
      incidentId: 'inc-1',
      kind: 'DECLARED',
      occurredAt: '2026-09-20T12:00:00.000Z',
      actor: 'observer',
      evidenceIds: ['ev-1'],
    },
    {
      id: 'evt-2',
      incidentId: 'inc-1',
      kind: 'INVESTIGATION_STARTED',
      occurredAt: '2026-09-20T12:01:00.000Z',
      actor: 'human',
      evidenceIds: ['ev-1'],
    },
    {
      id: 'evt-3',
      incidentId: 'inc-1',
      kind: 'RESOLVED',
      occurredAt: '2026-09-20T12:30:00.000Z',
      actor: 'human',
      evidenceIds: ['ev-1'],
    },
  ],
  operationalIntentIds: ['intent-1'],
  authority: 'NONE',
  automaticRemediation: 'FORBIDDEN',
};

test('incident projection is deterministic and authority-neutral', async () => {
  const projection = incidentProjection(binding, incident);
  const first = await buildIncidentSnapshot(binding, incident);
  const second = await buildIncidentSnapshot(structuredClone(binding), structuredClone(incident));

  assert.equal(projection.status, 'RESOLVED');
  assert.equal(projection.authority, 'NONE');
  assert.equal(projection.infrastructureMutationAuthorized, false);
  assert.equal(projection.operationalIntentExecutionAuthorized, false);
  assert.equal(projection.automaticRemediationAuthorized, false);
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.equal(incidentCanGrantAuthority(), false);
  assert.equal(incidentCanMutateInfrastructure(), false);
  assert.equal(incidentCanExecuteOperationalIntent(), false);
  assert.equal(incidentCanAutomaticallyRemediate(), false);
});

test('unknown affected resources fail closed', () => {
  const invalid = {
    ...incident,
    affectedResources: [{ resourceId: 'unknown' }],
  };
  const result = validateIncident(binding, invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /unknown affected resource/);
});

test('invalid lifecycle transitions fail closed', () => {
  const invalid = {
    ...incident,
    status: 'CLOSED',
    timeline: [incident.timeline[0], { ...incident.timeline[2], kind: 'CLOSED' }],
  };
  const result = validateIncident(binding, invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /invalid incident transition/);
});

test('timeline must remain ordered and evidence-bound', () => {
  const invalid = {
    ...incident,
    timeline: [
      incident.timeline[0],
      {
        ...incident.timeline[1],
        occurredAt: '2026-09-20T11:59:00.000Z',
        evidenceIds: ['missing'],
      },
      incident.timeline[2],
    ],
  };
  const result = validateIncident(binding, invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /ordered by occurredAt/);
  assert.match(result.errors.join('\n'), /unknown evidence/);
});
