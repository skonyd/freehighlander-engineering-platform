export type RuntimePreflightStatus = 'PASS' | 'BLOCKED';
export type RuntimePreflightCircuitState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

export type RuntimePreflightFailureCode =
  | 'RUN_SNAPSHOT_UNBUILDABLE'
  | 'BINDING_MISSING'
  | 'MODEL_INELIGIBLE'
  | 'EFFORT_UNSUPPORTED'
  | 'CAPABILITY_MISSING'
  | 'INDEPENDENCE_MISMATCH'
  | 'PROVIDER_UNAVAILABLE'
  | 'CIRCUIT_OPEN'
  | 'ENDPOINT_UNHEALTHY'
  | 'SECRET_UNRESOLVABLE';

export interface RuntimePreflightBindingInput {
  readonly bindingId: string;
  readonly logicalRole: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly bindingExists: boolean;
  readonly modelEligible: boolean;
  readonly effort: string | null;
  readonly effortSupported: boolean | null;
  readonly requiredCapabilities: readonly string[];
  readonly availableCapabilities: readonly string[];
  readonly independenceGroup: string;
  readonly requiredIndependenceGroup: string | null;
  readonly providerAvailable: boolean;
  readonly circuitState: RuntimePreflightCircuitState;
  readonly endpointRequired: boolean;
  readonly endpointHealthy: boolean | null;
  readonly requiredSecretHandleIds: readonly string[];
  readonly resolvableSecretHandleIds: readonly string[];
}

export interface RuntimePreflightInput {
  readonly runSnapshotBuildable: boolean;
  readonly bindings: readonly RuntimePreflightBindingInput[];
}

export interface RuntimePreflightFailure {
  readonly code: RuntimePreflightFailureCode;
  readonly bindingId: string | null;
  readonly detail: string;
}

export interface RuntimePreflightResult {
  readonly status: RuntimePreflightStatus;
  readonly failures: readonly RuntimePreflightFailure[];
  readonly checkedBindingIds: readonly string[];
  readonly authority: 'NONE';
  readonly invocationAuthorized: false;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export function evaluateRuntimePreflight(input: RuntimePreflightInput): RuntimePreflightResult {
  const failures: RuntimePreflightFailure[] = [];

  if (!input.runSnapshotBuildable) {
    failures.push({
      code: 'RUN_SNAPSHOT_UNBUILDABLE',
      bindingId: null,
      detail: 'workflow/run snapshot cannot be built deterministically',
    });
  }

  const checkedBindingIds = new Set<string>();
  for (const binding of input.bindings) {
    validateBindingInput(binding);
    if (checkedBindingIds.has(binding.bindingId)) {
      throw new Error('duplicate runtime preflight bindingId: ' + binding.bindingId);
    }
    checkedBindingIds.add(binding.bindingId);

    if (!binding.bindingExists) {
      failures.push(failure('BINDING_MISSING', binding, 'selected binding does not exist'));
    }
    if (!binding.modelEligible) {
      failures.push(failure('MODEL_INELIGIBLE', binding, 'selected model is not eligible'));
    }
    if (binding.effort !== null && binding.effortSupported !== true) {
      failures.push(
        failure('EFFORT_UNSUPPORTED', binding, 'selected effort is unsupported or unverifiable'),
      );
    }

    const availableCapabilities = new Set(binding.availableCapabilities);
    for (const capability of binding.requiredCapabilities) {
      if (!availableCapabilities.has(capability)) {
        failures.push(
          failure(
            'CAPABILITY_MISSING',
            binding,
            'required capability is unavailable: ' + capability,
          ),
        );
      }
    }

    if (
      binding.requiredIndependenceGroup !== null &&
      binding.independenceGroup !== binding.requiredIndependenceGroup
    ) {
      failures.push(
        failure(
          'INDEPENDENCE_MISMATCH',
          binding,
          'binding independence group does not satisfy the required group',
        ),
      );
    }

    if (!binding.providerAvailable) {
      failures.push(
        failure('PROVIDER_UNAVAILABLE', binding, 'selected provider is currently unavailable'),
      );
    }
    if (binding.circuitState === 'OPEN') {
      failures.push(failure('CIRCUIT_OPEN', binding, 'provider circuit is open'));
    }
    if (binding.endpointRequired && binding.endpointHealthy !== true) {
      failures.push(
        failure(
          'ENDPOINT_UNHEALTHY',
          binding,
          'required local/provider endpoint is unhealthy or unverifiable',
        ),
      );
    }

    const resolvableSecrets = new Set(binding.resolvableSecretHandleIds);
    for (const handleId of binding.requiredSecretHandleIds) {
      if (!resolvableSecrets.has(handleId)) {
        failures.push(
          failure(
            'SECRET_UNRESOLVABLE',
            binding,
            'required secret handle is not resolvable: ' + handleId,
          ),
        );
      }
    }
  }

  failures.sort((left, right) => {
    const leftKey = (left.bindingId ?? '') + ':' + left.code + ':' + left.detail;
    const rightKey = (right.bindingId ?? '') + ':' + right.code + ':' + right.detail;
    return leftKey.localeCompare(rightKey);
  });

  return {
    status: failures.length === 0 ? 'PASS' : 'BLOCKED',
    failures,
    checkedBindingIds: [...checkedBindingIds].sort(),
    authority: 'NONE',
    invocationAuthorized: false,
  };
}

export function runtimePreflightCanInvokeProvider(): false {
  return false;
}

export function runtimePreflightCanResolveSecretValue(): false {
  return false;
}

export function runtimePreflightCanGrantAuthority(): false {
  return false;
}

function validateBindingInput(binding: RuntimePreflightBindingInput): void {
  requireId(binding.bindingId, 'bindingId');
  requireId(binding.logicalRole, 'logicalRole');
  requireId(binding.providerId, 'providerId');
  requireId(binding.modelId, 'modelId');
  if (binding.effort !== null) requireId(binding.effort, 'effort');
  requireId(binding.independenceGroup, 'independenceGroup');
  if (binding.requiredIndependenceGroup !== null) {
    requireId(binding.requiredIndependenceGroup, 'requiredIndependenceGroup');
  }
  if (
    binding.circuitState !== 'CLOSED' &&
    binding.circuitState !== 'HALF_OPEN' &&
    binding.circuitState !== 'OPEN'
  ) {
    throw new Error('unsupported circuitState');
  }
  if (!binding.endpointRequired && binding.endpointHealthy !== null) {
    throw new Error('endpointHealthy must be null when endpointRequired=false');
  }

  validateUniqueIds(binding.requiredCapabilities, 'required capability');
  validateUniqueIds(binding.availableCapabilities, 'available capability');
  validateUniqueIds(binding.requiredSecretHandleIds, 'required secret handle');
  validateUniqueIds(binding.resolvableSecretHandleIds, 'resolvable secret handle');
}

function validateUniqueIds(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    requireId(value, label);
    if (seen.has(value)) throw new Error('duplicate ' + label + ': ' + value);
    seen.add(value);
  }
}

function failure(
  code: RuntimePreflightFailureCode,
  binding: RuntimePreflightBindingInput,
  detail: string,
): RuntimePreflightFailure {
  return { code, bindingId: binding.bindingId, detail };
}

function requireId(value: string, name: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(name + ' must be a bounded identifier');
}
