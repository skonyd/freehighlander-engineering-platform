import type { SandboxPermissionDecision } from './sandbox-policy.js';

export type SecretBackendKind = 'LOCAL_ENV' | 'OS_KEYCHAIN' | 'EXTERNAL_BROKER';
export type SecretInjectionTarget = 'COMMAND_ENV' | 'PROVIDER_AUTH' | 'TOOL_AUTH';

export interface SecretHandle {
  readonly id: string;
  readonly backend: SecretBackendKind;
  readonly classification: 'SECRET';
}

export interface SecretAccessRequest {
  readonly handle: SecretHandle;
  readonly logicalRole: string;
  readonly target: SecretInjectionTarget;
  readonly roleAllows: boolean;
  readonly workflowAllows: boolean;
  readonly sandboxDecision: SandboxPermissionDecision;
  readonly ttlMs: number;
  readonly envName?: string;
  readonly persistRequested?: boolean;
  readonly remoteModelEgressRequested?: boolean;
  readonly promptRequestedRawValue?: boolean;
  readonly modelIdentityRequestedRawValue?: boolean;
}

export interface SecretAccessDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly authority: 'NONE';
  readonly valuePersistence: 'FORBIDDEN';
  readonly remoteModelEgress: 'FORBIDDEN';
}

export interface SecretInjectionPlan {
  readonly handleId: string;
  readonly backend: SecretBackendKind;
  readonly target: SecretInjectionTarget;
  readonly logicalRole: string;
  readonly envName: string | null;
  readonly ttlMs: number;
  readonly retentionClass: 'EPHEMERAL';
  readonly persistValue: false;
  readonly remoteModelEgress: false;
  readonly redactLogs: true;
  readonly authority: 'NONE';
}

export interface SecretInjectionPlanningResult {
  readonly decision: SecretAccessDecision;
  readonly plan: SecretInjectionPlan | null;
}

export interface SecretInjectionReceipt {
  readonly receiptId: string;
  readonly handleId: string;
  readonly target: SecretInjectionTarget;
  readonly injectedAt: string;
  readonly expiresAt: string;
  readonly valuePersisted: false;
  readonly authority: 'NONE';
}

export interface SecretBrokerAdapter {
  readonly id: string;
  inject(plan: SecretInjectionPlan): Promise<SecretInjectionReceipt>;
  revoke?(receiptId: string): Promise<void>;
}

export interface SecretValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const HANDLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export function validateSecretHandle(handle: SecretHandle): SecretValidationResult {
  const errors: string[] = [];

  if (!HANDLE_ID_PATTERN.test(handle.id)) {
    errors.push('secret handle id must be opaque, bounded and identifier-safe');
  }
  if (!['LOCAL_ENV', 'OS_KEYCHAIN', 'EXTERNAL_BROKER'].includes(handle.backend)) {
    errors.push('secret handle backend is unsupported');
  }
  if (handle.classification !== 'SECRET') {
    errors.push('secret handle classification must remain SECRET');
  }

  return { valid: errors.length === 0, errors };
}

export function evaluateSecretAccess(request: SecretAccessRequest): SecretAccessDecision {
  const handleValidation = validateSecretHandle(request.handle);
  if (!handleValidation.valid) {
    return deny(`invalid secret handle: ${handleValidation.errors.join('; ')}`);
  }

  if (!request.logicalRole.trim()) {
    return deny('logical role is required for secret access');
  }
  if (request.sandboxDecision.authority !== 'NONE') {
    return deny('sandbox decision must remain authority-neutral');
  }
  if (!request.sandboxDecision.allowed) {
    return deny('sandbox SECRET_ACCESS decision denied the request');
  }
  if (!request.roleAllows) {
    return deny('logical role does not allow secret access');
  }
  if (!request.workflowAllows) {
    return deny('workflow node does not allow secret access');
  }
  if (request.promptRequestedRawValue === true) {
    return deny('prompt content cannot request raw secret material');
  }
  if (request.modelIdentityRequestedRawValue === true) {
    return deny('model identity cannot request raw secret material');
  }
  if (request.persistRequested === true) {
    return deny('secret values cannot be persisted');
  }
  if (request.remoteModelEgressRequested === true) {
    return deny('secret values cannot cross the remote-model boundary');
  }
  if (!Number.isInteger(request.ttlMs) || request.ttlMs <= 0) {
    return deny('ephemeral secret injection requires an explicit positive ttlMs');
  }
  if (!['COMMAND_ENV', 'PROVIDER_AUTH', 'TOOL_AUTH'].includes(request.target)) {
    return deny('secret injection target is unsupported');
  }

  if (request.target === 'COMMAND_ENV') {
    if (!request.envName || !ENV_NAME_PATTERN.test(request.envName)) {
      return deny('COMMAND_ENV injection requires a bounded uppercase environment variable name');
    }
  } else if (request.envName !== undefined) {
    return deny('envName is only valid for COMMAND_ENV secret injection');
  }

  return allow('secret handle satisfies role, workflow, sandbox and ephemeral-use constraints');
}

export function planSecretInjection(request: SecretAccessRequest): SecretInjectionPlanningResult {
  const decision = evaluateSecretAccess(request);
  if (!decision.allowed) return { decision, plan: null };

  return {
    decision,
    plan: {
      handleId: request.handle.id,
      backend: request.handle.backend,
      target: request.target,
      logicalRole: request.logicalRole,
      envName: request.target === 'COMMAND_ENV' ? (request.envName ?? null) : null,
      ttlMs: request.ttlMs,
      retentionClass: 'EPHEMERAL',
      persistValue: false,
      remoteModelEgress: false,
      redactLogs: true,
      authority: 'NONE',
    },
  };
}

export function validateSecretInjectionReceipt(
  plan: SecretInjectionPlan,
  receipt: SecretInjectionReceipt,
): SecretValidationResult {
  const errors: string[] = [];

  if (!HANDLE_ID_PATTERN.test(receipt.receiptId)) {
    errors.push('secret injection receipt id is invalid');
  }
  if (receipt.handleId !== plan.handleId) {
    errors.push('secret injection receipt handle does not match plan');
  }
  if (receipt.target !== plan.target) {
    errors.push('secret injection receipt target does not match plan');
  }
  if (receipt.valuePersisted !== false) {
    errors.push('secret injection receipt must prove valuePersisted=false');
  }
  if (receipt.authority !== 'NONE') {
    errors.push('secret injection receipt must remain authority-neutral');
  }

  const injectedAt = Date.parse(receipt.injectedAt);
  const expiresAt = Date.parse(receipt.expiresAt);
  if (!Number.isFinite(injectedAt) || !Number.isFinite(expiresAt)) {
    errors.push('secret injection receipt timestamps must be valid ISO timestamps');
  } else {
    if (expiresAt <= injectedAt) {
      errors.push('secret injection receipt must expire after injection');
    }
    if (expiresAt - injectedAt > plan.ttlMs) {
      errors.push('secret injection receipt cannot exceed the planned ttlMs');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function secretBrokerCanGrantAuthority(): false {
  return false;
}

export function secretValueCanBePersisted(): false {
  return false;
}

export function secretValueCanReachRemoteModel(): false {
  return false;
}

export function promptCanRequestRawSecretValue(): false {
  return false;
}

function allow(reason: string): SecretAccessDecision {
  return {
    allowed: true,
    reason,
    authority: 'NONE',
    valuePersistence: 'FORBIDDEN',
    remoteModelEgress: 'FORBIDDEN',
  };
}

function deny(reason: string): SecretAccessDecision {
  return {
    allowed: false,
    reason,
    authority: 'NONE',
    valuePersistence: 'FORBIDDEN',
    remoteModelEgress: 'FORBIDDEN',
  };
}
