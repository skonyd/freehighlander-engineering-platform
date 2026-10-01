import { createHash } from 'node:crypto';

import {
  AUTHORITY_CAPABILITY_IDS,
  createFhKuikaCoreExecutionRequestV1,
  validateFhKuikaConnectorInvocationRequestV1,
  type FhKuikaConnectorInvocationRequestV1,
  type FhKuikaTrustedConnectorRuntimeV1,
} from '@freehighlander/contracts';

import type { AuthorityCapabilityExecutionGate } from './authority-capability-execution.js';
import type {
  ActivityExecutor,
  ActivityExecutorOutcome,
  ActivityRequest,
} from './execution-runtime.js';
import { FhKuikaCoreExecutionBridge } from './kuika-core-execution-bridge.js';

export interface FhKuikaConnectorInvocationRuntimeOptions {
  readonly repository: string;
  readonly revision: string;
  readonly gate: AuthorityCapabilityExecutionGate;
  readonly resolveConnector: (connectorId: string) => FhKuikaTrustedConnectorRuntimeV1 | null;
}

export class FhKuikaConnectorInvocationRuntime {
  readonly #bridge: FhKuikaCoreExecutionBridge;

  constructor(readonly options: FhKuikaConnectorInvocationRuntimeOptions) {
    requireRepository(options.repository);
    requireRevision(options.revision);
    if (typeof options.resolveConnector !== 'function') {
      throw new Error('resolveConnector must be a function');
    }
    this.#bridge = new FhKuikaCoreExecutionBridge({
      repository: options.repository,
      revision: options.revision,
      gate: options.gate,
    });
  }

  bind(request: FhKuikaConnectorInvocationRequestV1, delegate: ActivityExecutor): ActivityExecutor {
    validateFhKuikaConnectorInvocationRequestV1(request);
    if (request.repository !== this.options.repository) {
      throw new Error('connector invocation repository does not match control-plane');
    }
    if (request.exactRevision !== this.options.revision) {
      throw new Error('connector invocation revision is stale');
    }
    requireExecutor(delegate);

    return {
      id: 'kuika-connector-' + request.invocationId,
      execute: async (activity: ActivityRequest): Promise<ActivityExecutorOutcome> => {
        const digest = createHash('sha256').update(activity.input, 'utf8').digest('hex');
        if (digest !== request.payloadDigest) {
          return failed('KUIKA_CONNECTOR_BINDING_INVALID');
        }

        const connector = this.options.resolveConnector(request.connectorId);
        if (connector === null || !connector.enabled) {
          return failed('KUIKA_CONNECTOR_DISABLED_OR_MISSING');
        }
        validateTrustedConnector(connector, request.connectorId);

        const capability = connector.capabilities.find((item) => item.id === request.capabilityId);
        if (!capability) return failed('KUIKA_CONNECTOR_PERMISSION_DENIED');
        if (connector.roleAllowlist.length > 0 && !connector.roleAllowlist.includes(request.role)) {
          return failed('KUIKA_CONNECTOR_PERMISSION_DENIED');
        }
        if (!isSubset(request.filesystemScopes, connector.filesystemScopes)) {
          return failed('KUIKA_CONNECTOR_PERMISSION_DENIED');
        }
        if (!isSubset(request.networkDestinations, connector.networkDestinations)) {
          return failed('KUIKA_CONNECTOR_PERMISSION_DENIED');
        }
        if (!isSubset(request.secretHandleRefs, connector.secretHandleRefs)) {
          return failed('KUIKA_CONNECTOR_PERMISSION_DENIED');
        }

        if (capability.mutationCapability === null) {
          return delegate.execute(activity);
        }

        const coreRequest = createFhKuikaCoreExecutionRequestV1({
          requestId: request.invocationId,
          surface: 'CONNECTOR',
          mutationClass: capability.mutationCapability,
          repository: request.repository,
          exactRevision: request.exactRevision,
          payloadDigest: request.payloadDigest,
        });
        return this.#bridge.bind(coreRequest, delegate).execute(activity);
      },
    };
  }
}

export function connectorInvocationRuntimeCanGrantAuthority(): false {
  return false;
}

export function connectorInvocationRuntimeCanTrustCachedPermissions(): false {
  return false;
}

export function connectorInvocationRuntimeCanPersistRawSecrets(): false {
  return false;
}

function validateTrustedConnector(
  connector: FhKuikaTrustedConnectorRuntimeV1,
  expectedId: string,
): void {
  if (connector.id !== expectedId) throw new Error('trusted connector id does not match request');
  for (const capability of connector.capabilities) {
    requireIdentifier(capability.id, 'trusted connector capability id');
    if (
      capability.mutationCapability !== null &&
      !(AUTHORITY_CAPABILITY_IDS as readonly string[]).includes(capability.mutationCapability)
    ) {
      throw new Error('trusted connector mutation capability is unknown');
    }
  }
  for (const value of [
    ...connector.filesystemScopes,
    ...connector.networkDestinations,
    ...connector.roleAllowlist,
  ]) {
    requireSingleLine(value, 'trusted connector boundary');
  }
  for (const value of connector.secretHandleRefs) {
    if (!/^secret:[A-Za-z0-9._/-]+$/.test(value)) {
      throw new Error('trusted connector secret references must use secret:<reference>');
    }
  }
}

function isSubset(requested: readonly string[], allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return requested.every((value) => allowedSet.has(value));
}

function requireExecutor(delegate: ActivityExecutor): void {
  if (!delegate || typeof delegate.execute !== 'function') {
    throw new Error('connector delegate executor is required');
  }
  requireIdentifier(delegate.id, 'connector delegate id');
}

function requireIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(value)) {
    throw new Error(field + ' must be a bounded identifier');
  }
}

function requireSingleLine(value: string, field: string): void {
  if (!value.trim() || value.length > 500 || /[\r\n\t]/.test(value)) {
    throw new Error(field + ' must be a bounded single-line value');
  }
}

function requireRepository(value: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('repository must use owner/name');
  }
}

function requireRevision(value: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error('revision must be a 40-character git SHA');
}

function failed(failureKind: string): ActivityExecutorOutcome {
  return { status: 'FAILED', output: '', failureKind };
}
