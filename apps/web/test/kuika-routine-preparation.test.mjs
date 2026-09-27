import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaRoutineDraftV1,
  matchFhKuikaRoutineEventV1,
  normalizeFhKuikaWebhookEnvelopeV1,
  prepareFhKuikaRoutineScheduleV1,
  routineEventAdapterCanExecute,
  routineEventAdapterCanInvokeModel,
  routineSchedulerPreparationCanExecute,
  routineSchedulerPreparationCanSchedule,
} from '../dist/index.js';

test('routine scheduler preparation is deterministic and non-executing', () => {
  const routine=createFhKuikaRoutineDraftV1({
    id:'pr-review',name:'PR Review',
    trigger:{kind:'GIT_EVENT',source:'github',events:['pull-request-opened']},
    workflowRef:'pr-review@1.0.0',concurrency:2,retry:{maxAttempts:2,backoffMs:5000},
  });
  const plan=prepareFhKuikaRoutineScheduleV1(routine);
  assert.equal(plan.schedulerState,'PREPARED');
  assert.equal(plan.schedulingAuthorized,false);
  assert.equal(plan.executionAuthorized,false);
  assert.equal(plan.authority,'NONE');
  assert.equal(routineSchedulerPreparationCanSchedule(),false);
  assert.equal(routineSchedulerPreparationCanExecute(),false);
});

test('webhook adapter retains digest metadata only and event matching cannot execute', () => {
  const routine=createFhKuikaRoutineDraftV1({
    id:'pr-review',name:'PR Review',
    trigger:{kind:'GIT_EVENT',source:'github',events:['pull-request-opened']},
    workflowRef:'pr-review@1.0.0',
  });
  const envelope=normalizeFhKuikaWebhookEnvelopeV1({
    provider:'github',deliveryId:'delivery-1',kind:'GIT_EVENT',
    event:'pull-request-opened',occurredAt:'2026-09-27T20:00:00.000Z',
    payload:'{"number":42}',repository:'skonyd/freehighlander-engineering-platform',
    exactRevision:'a'.repeat(40),
  });
  assert.equal(envelope.rawPayloadRetained,false);
  assert.equal(envelope.event.payloadDigest.length,64);
  assert.equal(envelope.modelInvocationRequired,false);
  const match=matchFhKuikaRoutineEventV1(routine,envelope.event);
  assert.equal(match.matched,true);
  assert.equal(match.reason,'MATCHED');
  assert.equal(match.executionAuthorized,false);
  assert.equal(routineEventAdapterCanInvokeModel(),false);
  assert.equal(routineEventAdapterCanExecute(),false);
});
