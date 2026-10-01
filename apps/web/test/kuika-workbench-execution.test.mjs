import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaWorkbenchExecutionEnvelopeV1,
  createFhKuikaWorkbenchIntentV1,
  workbenchExecutionEnvelopeCanExecuteDirectly,
  workbenchExecutionEnvelopeCanGrantAuthority,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const context = {
  repository: 'skonyd/freehighlander-engineering-platform',
  branch: 'main',
  exactRevision: REVISION,
  selectedFiles: ['apps/web/src/example.ts'],
  evidenceIds: [],
  blueprintId: null,
  workflowId: 'implementation',
};

function executeIntent(overrides = {}) {
  return createFhKuikaWorkbenchIntentV1({
    mode: 'EXECUTE',
    request: 'Implement the bounded change',
    context: { ...context, ...overrides },
    v3Authority: 'ENABLED',
  });
}

test('Workbench EXECUTE produces deterministic exact-bound Core request and payload', () => {
  const first = createFhKuikaWorkbenchExecutionEnvelopeV1({
    requestId: 'workbench-exec-1',
    mutationClass: 'GIT_WRITE',
    intent: executeIntent(),
  });
  const second = createFhKuikaWorkbenchExecutionEnvelopeV1({
    requestId: 'workbench-exec-1',
    mutationClass: 'GIT_WRITE',
    intent: executeIntent(),
  });

  assert.deepEqual(first, second);
  assert.equal(first.executionRequest.surface, 'WORKBENCH');
  assert.equal(first.executionRequest.requiredCapability, 'GIT_WRITE');
  assert.equal(first.executionRequest.repository, context.repository);
  assert.equal(first.executionRequest.exactRevision, REVISION);
  assert.equal(first.executionRequest.payloadDigest, first.payloadDigest);
  assert.match(first.payloadDigest, /^[a-f0-9]{64}$/);
  assert.equal(first.authority, 'NONE');
  assert.equal(first.executionOwner, 'CONTROL_PLANE');
  assert.equal(workbenchExecutionEnvelopeCanGrantAuthority(), false);
  assert.equal(workbenchExecutionEnvelopeCanExecuteDirectly(), false);
});

test('Workbench execution envelope supports every Core mutation capability without granting it', () => {
  for (const mutationClass of [
    'GIT_WRITE',
    'RELEASE_DEPLOY',
    'INFRASTRUCTURE_MUTATION',
    'AUTOMATIC_REMEDIATION',
  ]) {
    const envelope = createFhKuikaWorkbenchExecutionEnvelopeV1({
      requestId: 'workbench-' + mutationClass.toLowerCase(),
      mutationClass,
      intent: executeIntent(),
    });
    assert.equal(envelope.executionRequest.requiredCapability, mutationClass);
    assert.equal(envelope.executionRequest.authority, 'NONE');
  }
});

test('non-EXECUTE and malformed authority boundary fail closed', () => {
  const plan = createFhKuikaWorkbenchIntentV1({
    mode: 'PLAN',
    request: 'Plan only',
    context,
    v3Authority: 'ENABLED',
  });
  assert.throws(
    () =>
      createFhKuikaWorkbenchExecutionEnvelopeV1({
        requestId: 'workbench-plan-1',
        mutationClass: 'GIT_WRITE',
        intent: plan,
      }),
    /requires EXECUTE/,
  );

  const intent = executeIntent();
  assert.throws(
    () =>
      createFhKuikaWorkbenchExecutionEnvelopeV1({
        requestId: 'workbench-bad-1',
        mutationClass: 'GIT_WRITE',
        intent: { ...intent, mutationRequested: false },
      }),
    /must request gated mutation/,
  );
  assert.throws(
    () =>
      createFhKuikaWorkbenchExecutionEnvelopeV1({
        requestId: 'workbench-bad-2',
        mutationClass: 'GIT_WRITE',
        intent: { ...intent, selectionAuthority: 'ALLOW' },
      }),
    /authority boundary is invalid/,
  );
});

test('missing exact revision cannot become a Core execution request', () => {
  const intent = executeIntent();
  assert.throws(
    () =>
      createFhKuikaWorkbenchExecutionEnvelopeV1({
        requestId: 'workbench-no-revision',
        mutationClass: 'GIT_WRITE',
        intent: {
          ...intent,
          context: { ...intent.context, exactRevision: null },
        },
      }),
    /requires an exact revision/,
  );
});
