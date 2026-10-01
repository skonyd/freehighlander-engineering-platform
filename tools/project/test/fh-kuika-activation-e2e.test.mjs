import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  AuthorityCapabilityActivationService,
  AuthorityCapabilityApprovalCoordinator,
  AuthorityCapabilityExecutionGate,
  FhKuikaConnectorInvocationRuntime,
  FhKuikaCoreExecutionBridge,
  FhKuikaRoutineDispatchRuntime,
} from '../../../apps/control-plane/dist/index.js';
import {
  createFhKuikaConnectorInvocationRequestV1,
  createFhKuikaRoutineDispatchRequestV1,
} from '../../../packages/contracts/dist/index.js';
import {
  BindingRegistry,
  ProviderRegistry,
  applyFhKuikaRuntimeFailoverV1,
  createRoleBindingFailoverState,
  resolveBindingPlan,
} from '../../../packages/model-runtime/dist/index.js';
import { AuthorityCapabilityStateStore } from '../../../packages/persistence/dist/index.js';
import {
  createFhKuikaWorkbenchExecutionEnvelopeV1,
  createFhKuikaWorkbenchIntentV1,
} from '../../../apps/web/dist/index.js';

const REVISION = 'a'.repeat(40);
const REPOSITORY = 'skonyd/freehighlander-engineering-platform';

function activity(id, input) {
  return {
    schemaVersion: 1,
    activityId: id,
    runId: 'run-kuika-e2e',
    workspaceHash: 'b'.repeat(64),
    kind: 'COMMAND',
    input,
    timeoutMs: 1000,
    attempt: 1,
    executionMode: 'LIVE',
  };
}

async function activate(service, coordinator, capability) {
  const before = service.snapshot();
  const requested = service.setRequested(capability, true, before.generation);
  assert.equal(requested.status, 'APPLIED');
  const approved = coordinator.approve(capability, requested.generation);
  assert.equal(approved.status, 'APPROVED');
  const activated = coordinator.activateApproved(capability, requested.generation);
  assert.equal(activated.status, 'APPLIED');
}

function provider(id) {
  return {
    id,
    capabilities: () => new Set(),
    health: async () => ({ available: true }),
    invoke: async () => ({ output: 'ok', model: 'm' }),
  };
}

function failoverPlan() {
  const providers = new ProviderRegistry();
  providers.register(provider('anthropic'));
  providers.register(provider('openai'));

  const bindings = new BindingRegistry();
  bindings.register({
    id: 'preferred',
    version: '1.0.0',
    providerId: 'anthropic',
    model: 'opus-5.5',
    effort: 'low',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'implementation',
  });
  bindings.register({
    id: 'fallback',
    version: '1.0.0',
    providerId: 'openai',
    model: 'gpt-6',
    effort: 'medium',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'implementation',
  });
  return resolveBindingPlan(providers, bindings, {
    logicalRole: 'implementation',
    riskTier: 'NORMAL',
    primaryBindingId: 'preferred',
    fallbackBindingIds: ['fallback'],
  });
}

test('FH-KUIKA post-cutover runtime stays Core-owned gated revocable and availability-only end to end', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fh-kuika-activation-e2e-'));
  try {
    const stateStore = new AuthorityCapabilityStateStore(join(root, 'authority.json'));
    const service = new AuthorityCapabilityActivationService(stateStore);
    const coordinator = new AuthorityCapabilityApprovalCoordinator(service, {
      repository: REPOSITORY,
      revision: REVISION,
      approverId: 'kuika-e2e-operator',
    });
    const gate = new AuthorityCapabilityExecutionGate({
      stateStore,
      expectedRevision: REVISION,
      observeRevision: () => REVISION,
    });

    let delegated = 0;
    const delegate = {
      id: 'kuika-e2e-delegate',
      async execute(request) {
        delegated += 1;
        return { status: 'SUCCEEDED', output: request.activityId };
      },
    };

    const workbenchIntent = createFhKuikaWorkbenchIntentV1({
      mode: 'EXECUTE',
      request: 'Apply the bounded repository change',
      context: {
        repository: REPOSITORY,
        branch: 'main',
        exactRevision: REVISION,
        selectedFiles: ['apps/web/src/example.ts'],
        evidenceIds: [],
        blueprintId: null,
        workflowId: 'implementation',
      },
      v3Authority: 'ENABLED',
    });
    const envelope = createFhKuikaWorkbenchExecutionEnvelopeV1({
      requestId: 'workbench-e2e',
      mutationClass: 'GIT_WRITE',
      intent: workbenchIntent,
    });
    const workbenchBridge = new FhKuikaCoreExecutionBridge({
      repository: REPOSITORY,
      revision: REVISION,
      gate,
    });
    const workbenchExecutor = workbenchBridge.bind(envelope.executionRequest, delegate);

    const workbenchDenied = await workbenchExecutor.execute(
      activity('workbench-denied', envelope.payload),
    );
    assert.equal(workbenchDenied.failureKind, 'CAPABILITY_GATE_DENIED');
    assert.equal(delegated, 0);

    await activate(service, coordinator, 'GIT_WRITE');
    const workbenchAllowed = await workbenchExecutor.execute(
      activity('workbench-live', envelope.payload),
    );
    assert.equal(workbenchAllowed.status, 'SUCCEEDED');
    assert.equal(delegated, 1);

    let trustedConnector = {
      id: 'kubernetes-mcp',
      enabled: true,
      capabilities: [{ id: 'cluster.write', mutationCapability: 'INFRASTRUCTURE_MUTATION' }],
      filesystemScopes: ['workspace-readonly'],
      networkDestinations: ['cluster.internal'],
      secretHandleRefs: ['secret:kubernetes/kubeconfig'],
      roleAllowlist: ['operations-agent'],
    };
    const connectorRuntime = new FhKuikaConnectorInvocationRuntime({
      repository: REPOSITORY,
      revision: REVISION,
      gate,
      resolveConnector: () => trustedConnector,
    });
    const connectorPayload = '{"operation":"apply"}';
    const connectorRequest = createFhKuikaConnectorInvocationRequestV1({
      invocationId: 'connector-e2e',
      connectorId: 'kubernetes-mcp',
      capabilityId: 'cluster.write',
      repository: REPOSITORY,
      exactRevision: REVISION,
      role: 'operations-agent',
      filesystemScopes: ['workspace-readonly'],
      networkDestinations: ['cluster.internal'],
      secretHandleRefs: ['secret:kubernetes/kubeconfig'],
      payloadDigest: createHash('sha256').update(connectorPayload, 'utf8').digest('hex'),
    });
    const connectorExecutor = connectorRuntime.bind(connectorRequest, delegate);

    const connectorDenied = await connectorExecutor.execute(
      activity('connector-denied', connectorPayload),
    );
    assert.equal(connectorDenied.failureKind, 'CAPABILITY_GATE_DENIED');

    await activate(service, coordinator, 'INFRASTRUCTURE_MUTATION');
    assert.equal(
      (await connectorExecutor.execute(activity('connector-live', connectorPayload))).status,
      'SUCCEEDED',
    );
    assert.equal(delegated, 2);

    trustedConnector = { ...trustedConnector, enabled: false };
    const connectorRevoked = await connectorExecutor.execute(
      activity('connector-disabled', connectorPayload),
    );
    assert.equal(connectorRevoked.failureKind, 'KUIKA_CONNECTOR_DISABLED_OR_MISSING');
    assert.equal(delegated, 2);

    const routinePayload = '{"trigger":"security-event"}';
    const routineRuntime = new FhKuikaRoutineDispatchRuntime({
      repository: REPOSITORY,
      revision: REVISION,
      gate,
      resolveRoutine: () => ({
        id: 'security-remediation',
        version: '1.0.0',
        active: true,
        workflowRef: 'remediate@1.0.0',
        mutationCapability: 'AUTOMATIC_REMEDIATION',
        maxAttempts: 2,
      }),
    });
    const submissions = [];
    const scheduler = {
      id: 'scheduler-e2e',
      async submit(submission) {
        submissions.push(submission);
      },
    };
    const routineRequest = createFhKuikaRoutineDispatchRequestV1({
      dispatchId: 'routine-e2e',
      routineId: 'security-remediation',
      routineVersion: '1.0.0',
      repository: REPOSITORY,
      exactRevision: REVISION,
      payloadDigest: createHash('sha256').update(routinePayload, 'utf8').digest('hex'),
      attempt: 1,
    });

    const routineDenied = await routineRuntime.submitAttempt(
      routineRequest,
      routinePayload,
      scheduler,
    );
    assert.equal(routineDenied.reason, 'CAPABILITY_GATE_DENIED');
    assert.equal(submissions.length, 0);

    await activate(service, coordinator, 'AUTOMATIC_REMEDIATION');
    assert.equal(
      (await routineRuntime.submitAttempt(routineRequest, routinePayload, scheduler)).status,
      'SUBMITTED',
    );
    assert.equal(submissions.length, 1);

    const beforeRevoke = service.snapshot();
    const revoked = service.deactivate('AUTOMATIC_REMEDIATION', beforeRevoke.generation);
    assert.equal(revoked.status, 'APPLIED');
    const retry = await routineRuntime.submitAttempt(
      { ...routineRequest, attempt: 2 },
      routinePayload,
      scheduler,
    );
    assert.equal(retry.reason, 'CAPABILITY_GATE_DENIED');
    assert.equal(submissions.length, 1);

    const plan = failoverPlan();
    const failoverState = createRoleBindingFailoverState(plan, {
      returnPolicy: 'ASK_BEFORE_RETURN',
      unknownResetRecheckMs: 60_000,
    });
    const availability = applyFhKuikaRuntimeFailoverV1(failoverState, plan, {
      failureKind: 'quota_exhausted',
      scope: 'BINDING',
      observedAt: '2026-10-01T12:00:00.000Z',
      retryAfterMs: 1000,
      availabilityByBinding: { preferred: false, fallback: true },
    });
    assert.equal(availability.transition.status, 'SWITCHED_TO_FALLBACK');
    assert.equal(availability.transition.selectedBindingId, 'fallback');

    const semanticState = createRoleBindingFailoverState(plan, {
      returnPolicy: 'ASK_BEFORE_RETURN',
      unknownResetRecheckMs: 60_000,
    });
    const semantic = applyFhKuikaRuntimeFailoverV1(semanticState, plan, {
      failureKind: 'semantic_failure',
      scope: 'BINDING',
      observedAt: '2026-10-01T12:00:00.000Z',
      availabilityByBinding: { preferred: false, fallback: true },
    });
    assert.equal(semantic.failoverApplied, false);
    assert.equal(semantic.transition.status, 'FALLBACK_FORBIDDEN');
    assert.equal(semantic.semanticOutcomeConsidered, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
