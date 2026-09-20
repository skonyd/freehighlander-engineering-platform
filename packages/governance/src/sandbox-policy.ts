import path from 'node:path';

import YAML from 'yaml';

export type SandboxCapability =
  | 'FILESYSTEM_READ'
  | 'FILESYSTEM_WRITE'
  | 'COMMAND_EXECUTE'
  | 'NETWORK_OUTBOUND'
  | 'SECRET_ACCESS'
  | 'DESTRUCTIVE_ACTION'
  | 'UNKNOWN';

export interface SandboxPolicy {
  readonly schema_version: 1;
  readonly default: {
    readonly filesystem: {
      readonly read: readonly ['repository'];
      readonly write: readonly ['repository_worktree'];
      readonly outside_repository: 'deny';
    };
    readonly command: {
      readonly execute: 'deny_unless_role_allows';
      readonly cwd_outside_repository: 'deny';
      readonly timeout_required: true;
      readonly env_allowlist_required: true;
    };
    readonly network: {
      readonly outbound: 'deny_unless_role_allows';
    };
    readonly secrets: {
      readonly access: 'deny_unless_role_allows';
    };
    readonly destructive_action: {
      readonly require_human: true;
    };
  };
  readonly high_impact_examples: readonly string[];
  readonly rules: {
    readonly unknown_permission: 'DENY';
    readonly prompt_may_expand_permissions: false;
    readonly model_identity_may_expand_permissions: false;
    readonly workflow_may_not_bypass_human_required: true;
  };
}

export interface SandboxPermissionRequest {
  readonly capability: SandboxCapability;
  readonly repositoryRoot: string;
  readonly roleAllows: boolean;
  readonly workflowAllows: boolean;
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly envAllowlist?: readonly string[];
  readonly humanApproved?: boolean;
  readonly promptRequestedExpansion?: boolean;
  readonly modelIdentityRequestedExpansion?: boolean;
}

export interface SandboxPermissionDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly authority: 'NONE';
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const HIGH_IMPACT_EXAMPLES = [
  'force_push',
  'hard_reset',
  'recursive_delete',
  'credential_mutation',
  'iam_mutation',
  'production_deploy',
  'production_data_mutation',
] as const;

export function parseSandboxPolicyYaml(source: string): SandboxPolicy {
  const parsed: unknown = YAML.parse(source);
  const validation = validateSandboxPolicy(parsed);
  if (!validation.valid) {
    throw new Error(`invalid sandbox policy: ${validation.errors.join('; ')}`);
  }
  return parsed as SandboxPolicy;
}

export function validateSandboxPolicy(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['sandbox policy must be an object'] };

  if (value.schema_version !== 1) errors.push('sandbox policy schema_version must be 1');

  const defaults = recordValue(value, 'default');
  const filesystem = recordValue(defaults, 'filesystem');
  assertExactStringSet(arrayValue(filesystem, 'read'), ['repository'], 'filesystem read scope', errors);
  assertExactStringSet(
    arrayValue(filesystem, 'write'),
    ['repository_worktree'],
    'filesystem write scope',
    errors,
  );
  if (filesystem?.outside_repository !== 'deny') {
    errors.push('outside-repository filesystem access must remain denied');
  }

  const command = recordValue(defaults, 'command');
  if (command?.execute !== 'deny_unless_role_allows') {
    errors.push('command execution must remain deny_unless_role_allows');
  }
  if (command?.cwd_outside_repository !== 'deny') {
    errors.push('command cwd outside repository must remain denied');
  }
  if (command?.timeout_required !== true) {
    errors.push('command timeout must remain required');
  }
  if (command?.env_allowlist_required !== true) {
    errors.push('command environment allowlist must remain required');
  }

  const network = recordValue(defaults, 'network');
  if (network?.outbound !== 'deny_unless_role_allows') {
    errors.push('outbound network must remain deny_unless_role_allows');
  }

  const secrets = recordValue(defaults, 'secrets');
  if (secrets?.access !== 'deny_unless_role_allows') {
    errors.push('secret access must remain deny_unless_role_allows');
  }

  const destructive = recordValue(defaults, 'destructive_action');
  if (destructive?.require_human !== true) {
    errors.push('destructive actions must remain human-required');
  }

  const examples = arrayValue(value, 'high_impact_examples');
  for (const example of HIGH_IMPACT_EXAMPLES) {
    if (!examples.includes(example)) errors.push(`missing high-impact example: ${example}`);
  }

  const rules = recordValue(value, 'rules');
  if (rules?.unknown_permission !== 'DENY') {
    errors.push('unknown sandbox permission must remain DENY');
  }
  if (rules?.prompt_may_expand_permissions !== false) {
    errors.push('prompt must not expand sandbox permissions');
  }
  if (rules?.model_identity_may_expand_permissions !== false) {
    errors.push('model identity must not expand sandbox permissions');
  }
  if (rules?.workflow_may_not_bypass_human_required !== true) {
    errors.push('workflow must not bypass human-required actions');
  }

  return { valid: errors.length === 0, errors };
}

export function evaluateSandboxPermission(
  policy: SandboxPolicy,
  request: SandboxPermissionRequest,
): SandboxPermissionDecision {
  assertValidPolicy(policy);

  if (!request.repositoryRoot.trim()) {
    return deny('repositoryRoot is required');
  }

  if (request.promptRequestedExpansion === true) {
    return deny('prompt text cannot expand sandbox permissions');
  }
  if (request.modelIdentityRequestedExpansion === true) {
    return deny('model identity cannot expand sandbox permissions');
  }

  if (request.capability === 'UNKNOWN') {
    return deny('unknown sandbox capability is denied');
  }

  if (!request.roleAllows) {
    return deny('logical role does not allow the requested capability');
  }
  if (!request.workflowAllows) {
    return deny('workflow node does not allow the requested capability');
  }

  switch (request.capability) {
    case 'FILESYSTEM_READ':
    case 'FILESYSTEM_WRITE': {
      if (!request.targetPath) return deny('filesystem capability requires targetPath');
      if (!isWithinRepository(request.repositoryRoot, request.targetPath)) {
        return deny('filesystem target is outside repository boundary');
      }
      return allow('filesystem request is inside repository and allowed by role/workflow');
    }

    case 'COMMAND_EXECUTE': {
      if (!request.cwd) return deny('command execution requires cwd');
      if (!isWithinRepository(request.repositoryRoot, request.cwd)) {
        return deny('command cwd is outside repository boundary');
      }
      if (
        request.timeoutMs === undefined ||
        !Number.isInteger(request.timeoutMs) ||
        request.timeoutMs <= 0
      ) {
        return deny('command execution requires a positive timeout');
      }
      if (request.envAllowlist === undefined) {
        return deny('command execution requires an explicit environment allowlist');
      }
      return allow('command execution satisfies role/workflow and sandbox constraints');
    }

    case 'NETWORK_OUTBOUND':
      return allow('outbound network explicitly allowed by role and workflow');

    case 'SECRET_ACCESS':
      return allow('secret access explicitly allowed by role and workflow');

    case 'DESTRUCTIVE_ACTION':
      return request.humanApproved === true
        ? allow('destructive action has explicit human approval')
        : deny('destructive action requires explicit human approval');

    case 'UNKNOWN':
      return deny('unknown sandbox capability is denied');
  }
}

export function isWithinRepository(repositoryRoot: string, candidatePath: string): boolean {
  if (!repositoryRoot.trim() || !candidatePath.trim()) return false;

  const root = path.resolve(repositoryRoot);
  const candidate = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(root, candidatePath);
  const relative = path.relative(root, candidate);

  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function sandboxPolicyCanGrantAuthority(): false {
  return false;
}

export function promptCanExpandSandboxPermissions(): false {
  return false;
}

export function modelIdentityCanExpandSandboxPermissions(): false {
  return false;
}

function allow(reason: string): SandboxPermissionDecision {
  return { allowed: true, reason, authority: 'NONE' };
}

function deny(reason: string): SandboxPermissionDecision {
  return { allowed: false, reason, authority: 'NONE' };
}

function assertValidPolicy(policy: SandboxPolicy): void {
  const validation = validateSandboxPolicy(policy);
  if (!validation.valid) {
    throw new Error(`invalid sandbox policy: ${validation.errors.join('; ')}`);
  }
}

function assertExactStringSet(
  actual: readonly unknown[],
  expected: readonly string[],
  label: string,
  errors: string[],
): void {
  const values = actual.filter((item): item is string => typeof item === 'string');
  const sortedActual = [...values].sort();
  const sortedExpected = [...expected].sort();
  if (
    sortedActual.length !== actual.length ||
    sortedActual.length !== sortedExpected.length ||
    sortedActual.some((value, index) => value !== sortedExpected[index])
  ) {
    errors.push(`${label} does not match accepted policy`);
  }
}

function recordValue(
  record: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (!record) return null;
  const value = record[key];
  return isRecord(value) ? value : null;
}

function arrayValue(record: Record<string, unknown> | null, key: string): readonly unknown[] {
  if (!record) return [];
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
