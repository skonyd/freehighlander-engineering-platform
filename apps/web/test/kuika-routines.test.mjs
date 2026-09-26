import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FH_KUIKA_ROUTINES_HTML,
  buildFhKuikaRoutineActivationPlanV1,
  createDashboardServer,
  createFhKuikaRoutineDraftV1,
  getFhKuikaRoutineTemplateV1,
  listFhKuikaRoutineTemplatesV1,
  normalizeFhKuikaTriggerEventV1,
  routineCatalogCanActivate,
  routineDraftCanActivate,
  routineDraftCanGrantAuthority,
  routinesPageCanActivate,
  routinesPageCanGrantAuthority,
  routinesPageCanInvokeModel,
  triggerNormalizationCanExecuteWorkflow,
  triggerNormalizationCanInvokeModel,
} from '../dist/index.js';

test('routine drafts remain authority-neutral and validate trigger-specific fields', () => {
  const routine = createFhKuikaRoutineDraftV1({
    id: 'weekly-security-review',
    name: 'Weekly Security Review',
    trigger: { kind: 'CRON', schedule: '0 8 * * 1' },
    workflowRef: 'security-review@1.0.0',
    requiredConnectorRefs: ['trivy-mcp'],
    secretHandleRefs: ['secret:trivy/token'],
    concurrency: 1,
    retry: { maxAttempts: 2, backoffMs: 5_000 },
  });

  assert.equal(routine.status, 'DRAFT');
  assert.equal(routine.authority, 'NONE');
  assert.equal(routine.activationAuthorized, false);
  assert.deepEqual(routine.requiredConnectorRefs, ['trivy-mcp']);
  assert.deepEqual(routine.secretHandleRefs, ['secret:trivy/token']);

  assert.equal(routineDraftCanActivate(), false);
  assert.equal(routineDraftCanGrantAuthority(), false);

  assert.throws(
    () =>
      createFhKuikaRoutineDraftV1({
        id: 'bad-cron',
        name: 'Bad cron',
        trigger: { kind: 'CRON', schedule: '* * *' },
        workflowRef: 'security-review@1.0.0',
      }),
    /five fields/,
  );

  assert.throws(
    () =>
      createFhKuikaRoutineDraftV1({
        id: 'bad-manual',
        name: 'Bad manual',
        trigger: { kind: 'MANUAL', source: 'github' },
        workflowRef: 'manual@1.0.0',
      }),
    /MANUAL trigger cannot define/,
  );

  assert.throws(
    () =>
      createFhKuikaRoutineDraftV1({
        id: 'bad-event',
        name: 'Bad event',
        trigger: { kind: 'GIT_EVENT', source: 'github', events: [] },
        workflowRef: 'pr-review@1.0.0',
      }),
    /requires at least one event/,
  );

  assert.throws(
    () =>
      createFhKuikaRoutineDraftV1({
        id: 'bad-secret',
        name: 'Bad secret',
        trigger: { kind: 'MANUAL' },
        workflowRef: 'manual@1.0.0',
        secretHandleRefs: ['raw-token-value'],
      }),
    /secret:<reference>/,
  );
});

test('trigger normalization stores digest and bounded metadata but no authority', () => {
  const event = normalizeFhKuikaTriggerEventV1({
    kind: 'GIT_EVENT',
    source: 'github',
    event: 'pull-request-opened',
    occurredAt: '2026-09-26T16:00:00.000Z',
    payload: '{"number":42,"title":"test"}',
    repository: 'skonyd/freehighlander-engineering-platform',
    exactRevision: 'a'.repeat(40),
  });

  assert.equal(event.schemaVersion, 1);
  assert.equal(event.kind, 'GIT_EVENT');
  assert.equal(event.payloadDigest.length, 64);
  assert.equal(event.authority, 'NONE');
  assert.equal(event.exactRevision, 'a'.repeat(40));
  assert.equal(triggerNormalizationCanInvokeModel(), false);
  assert.equal(triggerNormalizationCanExecuteWorkflow(), false);

  assert.throws(
    () =>
      normalizeFhKuikaTriggerEventV1({
        kind: 'CI_EVENT',
        source: 'github-actions',
        event: 'workflow-failed',
        occurredAt: 'not-a-time',
        payload: '{}',
      }),
    /valid timestamp/,
  );

  assert.throws(
    () =>
      normalizeFhKuikaTriggerEventV1({
        kind: 'GIT_EVENT',
        source: 'github',
        event: 'pull-request-opened',
        occurredAt: '2026-09-26T16:00:00.000Z',
        payload: '{}',
        exactRevision: 'not-a-sha',
      }),
    /lowercase git sha/,
  );
});

test('routine catalog exposes curated drafts and activation planning only', () => {
  const routines = listFhKuikaRoutineTemplatesV1();
  assert.equal(routines.length, 4);
  assert.equal(new Set(routines.map((routine) => routine.id)).size, routines.length);

  const security = getFhKuikaRoutineTemplateV1('weekly-security-review');
  assert.ok(security);
  assert.equal(security.trigger.kind, 'CRON');
  assert.equal(routineCatalogCanActivate(), false);

  const blocked = buildFhKuikaRoutineActivationPlanV1(security, []);
  assert.deepEqual(blocked.missingConnectorRefs, ['trivy-mcp']);
  assert.equal(blocked.readyForAuthorityReview, false);
  assert.equal(blocked.activationAuthorized, false);
  assert.equal(blocked.authority, 'NONE');

  const ready = buildFhKuikaRoutineActivationPlanV1(security, ['trivy-mcp']);
  assert.deepEqual(ready.missingConnectorRefs, []);
  assert.equal(ready.readyForAuthorityReview, true);
  assert.equal(ready.requiresEnabledV3Authority, true);
  assert.equal(ready.requiresSystemPolicyAllow, true);
  assert.equal(ready.activationAuthorized, false);
});

test('Routines UI is read-only and exposes no activation control', () => {
  assert.match(FH_KUIKA_ROUTINES_HTML, /FH-KUIKA · Integrate/);
  assert.match(FH_KUIKA_ROUTINES_HTML, /Preparation only/);
  assert.match(FH_KUIKA_ROUTINES_HTML, /cannot enable a routine/);
  assert.doesNotMatch(FH_KUIKA_ROUTINES_HTML, /id="enable"/);
  assert.doesNotMatch(FH_KUIKA_ROUTINES_HTML, /id="run-now"/);

  assert.equal(routinesPageCanInvokeModel(), false);
  assert.equal(routinesPageCanActivate(), false);
  assert.equal(routinesPageCanGrantAuthority(), false);
});

test('routine HTTP surfaces are GET-only and activation plan remains non-authoritative', async () => {
  const server = createDashboardServer({
    databasePath: '/tmp/fh-kuika-routine-no-db.sqlite',
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port;

    const page = await fetch(base + '/modules/fh-kuika/integrate/routines');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<h1>Routines<\/h1>/);

    const catalog = await (await fetch(base + '/api/modules/fh-kuika/routines')).json();
    assert.equal(catalog.routines.length, 4);

    const detail = await (
      await fetch(base + '/api/modules/fh-kuika/routines/weekly-security-review')
    ).json();
    assert.equal(detail.routine.activationAuthorized, false);

    const blockedPlan = await (
      await fetch(base + '/api/modules/fh-kuika/routines/weekly-security-review/plan')
    ).json();
    assert.equal(blockedPlan.plan.readyForAuthorityReview, false);

    const readyPlan = await (
      await fetch(
        base + '/api/modules/fh-kuika/routines/weekly-security-review/plan?connector=trivy-mcp',
      )
    ).json();
    assert.equal(readyPlan.plan.readyForAuthorityReview, true);
    assert.equal(readyPlan.plan.activationAuthorized, false);

    const missing = await fetch(base + '/api/modules/fh-kuika/routines/missing');
    assert.equal(missing.status, 404);

    const denied = await fetch(base + '/api/modules/fh-kuika/routines', { method: 'POST' });
    assert.equal(denied.status, 405);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
