import type { SecretInjectionTarget } from './secret-broker.js';

export type SecretResolverKind =
  | 'LOCAL_ENV'
  | 'OS_KEYCHAIN'
  | 'ONEPASSWORD'
  | 'BITWARDEN_SECRETS_MANAGER'
  | 'HASHICORP_VAULT'
  | 'EXTERNAL_BROKER'
  | 'GITHUB_AUTH_CAPABILITY';

export type SecretBindingStorage = 'MACHINE_LOCAL' | 'PORTABLE_REFERENCE' | 'PROJECT_TEMPLATE';

export type SecretResolverHealth = 'HEALTHY' | 'UNAVAILABLE' | 'UNKNOWN';

export interface SecretRequirementV1 {
  readonly schemaVersion: 1;
  readonly handleId: string;
  readonly purpose: string;
  readonly allowedTargets: readonly SecretInjectionTarget[];
  readonly requiredCapabilities: readonly string[];
  readonly requiredForRoles: readonly string[];
  readonly optional: boolean;
  readonly authority: 'NONE';
}

export interface SecretBindingV1 {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly handleId: string;
  readonly resolverKind: SecretResolverKind;
  readonly storage: SecretBindingStorage;
  readonly reference: string | null;
  readonly accountProfile: string | null;
  readonly portableReferenceApproved: boolean;
  readonly authority: 'NONE';
}

export interface SecretResolverEvidenceV1 {
  readonly resolverKind: SecretResolverKind;
  readonly health: SecretResolverHealth;
  readonly authenticated: boolean | null;
  readonly availableCapabilities: readonly string[];
}

export interface SecretBindingProfileV1 {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly bindings: readonly SecretBindingV1[];
  readonly authority: 'NONE';
}

export type SecretRequirementStatus =
  'RESOLVABLE' | 'BLOCKED_CONFIGURATION' | 'OPTIONAL_UNAVAILABLE';

export interface SecretRequirementResolutionV1 {
  readonly handleId: string;
  readonly status: SecretRequirementStatus;
  readonly profileId: string;
  readonly resolverKind: SecretResolverKind | null;
  readonly reasons: readonly string[];
}

export interface SecretBindingStatusV1 {
  readonly status: 'READY' | 'PARTIAL' | 'BLOCKED_CONFIGURATION';
  readonly resolutions: readonly SecretRequirementResolutionV1[];
  readonly authority: 'NONE';
  readonly secretValuesPresent: false;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const ENV_REFERENCE_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const RESOLVER_KINDS = new Set<SecretResolverKind>([
  'LOCAL_ENV',
  'OS_KEYCHAIN',
  'ONEPASSWORD',
  'BITWARDEN_SECRETS_MANAGER',
  'HASHICORP_VAULT',
  'EXTERNAL_BROKER',
  'GITHUB_AUTH_CAPABILITY',
]);
const STORAGE_KINDS = new Set<SecretBindingStorage>([
  'MACHINE_LOCAL',
  'PORTABLE_REFERENCE',
  'PROJECT_TEMPLATE',
]);
const TARGETS = new Set<SecretInjectionTarget>(['COMMAND_ENV', 'PROVIDER_AUTH', 'TOOL_AUTH']);

export function createSecretRequirementV1(
  input: Omit<SecretRequirementV1, 'schemaVersion' | 'authority'>,
): SecretRequirementV1 {
  requireId(input.handleId, 'handleId');
  requireText(input.purpose, 'purpose');
  const allowedTargets = uniqueSortedTargets(input.allowedTargets);
  if (allowedTargets.length === 0) throw new Error('secret requirement requires an allowed target');
  const requiredCapabilities = uniqueSortedIds(input.requiredCapabilities, 'required capability');
  const requiredForRoles = uniqueSortedIds(input.requiredForRoles, 'required role');
  if (requiredForRoles.length === 0) throw new Error('secret requirement requires a role');

  return {
    schemaVersion: 1,
    handleId: input.handleId,
    purpose: input.purpose,
    allowedTargets,
    requiredCapabilities,
    requiredForRoles,
    optional: input.optional,
    authority: 'NONE',
  };
}

export function createSecretBindingV1(
  input: Omit<SecretBindingV1, 'schemaVersion' | 'authority'>,
): SecretBindingV1 {
  requireId(input.profileId, 'profileId');
  requireId(input.handleId, 'handleId');
  requireResolverKind(input.resolverKind);
  requireStorageKind(input.storage);
  if (input.accountProfile !== null) requireId(input.accountProfile, 'accountProfile');

  if (input.storage === 'PROJECT_TEMPLATE') {
    if (input.reference !== null) {
      throw new Error('PROJECT_TEMPLATE secret binding cannot contain a resolver reference');
    }
    if (input.portableReferenceApproved) {
      throw new Error('PROJECT_TEMPLATE cannot approve a portable resolver reference');
    }
  } else {
    if (input.reference === null) throw new Error('secret binding resolver reference is required');
    validateReference(input.resolverKind, input.reference);
  }

  if (input.storage === 'PORTABLE_REFERENCE' && !input.portableReferenceApproved) {
    throw new Error('PORTABLE_REFERENCE requires explicit approval');
  }
  if (input.storage !== 'PORTABLE_REFERENCE' && input.portableReferenceApproved) {
    throw new Error('portable reference approval is valid only for PORTABLE_REFERENCE');
  }

  return {
    schemaVersion: 1,
    profileId: input.profileId,
    handleId: input.handleId,
    resolverKind: input.resolverKind,
    storage: input.storage,
    reference: input.reference,
    accountProfile: input.accountProfile,
    portableReferenceApproved: input.portableReferenceApproved,
    authority: 'NONE',
  };
}

export function createSecretBindingProfileV1(
  profileId: string,
  bindings: readonly SecretBindingV1[],
): SecretBindingProfileV1 {
  requireId(profileId, 'profileId');
  const seen = new Set<string>();
  const normalized = bindings.map((binding) => {
    validateSecretBindingV1(binding);
    if (binding.profileId !== profileId) {
      throw new Error('secret binding profileId mismatch');
    }
    if (seen.has(binding.handleId)) throw new Error('duplicate secret binding handleId');
    seen.add(binding.handleId);
    return { ...binding };
  });

  normalized.sort((left, right) => left.handleId.localeCompare(right.handleId));
  return { schemaVersion: 1, profileId, bindings: normalized, authority: 'NONE' };
}

export function evaluateSecretBindingStatusV1(
  requirements: readonly SecretRequirementV1[],
  profile: SecretBindingProfileV1,
  resolverEvidence: readonly SecretResolverEvidenceV1[],
): SecretBindingStatusV1 {
  validateSecretBindingProfileV1(profile);

  const requirementMap = new Map<string, SecretRequirementV1>();
  for (const requirement of requirements) {
    validateSecretRequirementV1(requirement);
    if (requirementMap.has(requirement.handleId)) {
      throw new Error('duplicate secret requirement handleId');
    }
    requirementMap.set(requirement.handleId, requirement);
  }

  const evidenceMap = new Map<SecretResolverKind, SecretResolverEvidenceV1>();
  for (const evidence of resolverEvidence) {
    validateResolverEvidence(evidence);
    if (evidenceMap.has(evidence.resolverKind)) {
      throw new Error('duplicate resolver evidence kind');
    }
    evidenceMap.set(evidence.resolverKind, evidence);
  }

  const bindingMap = new Map(profile.bindings.map((binding) => [binding.handleId, binding]));
  const resolutions: SecretRequirementResolutionV1[] = [];

  for (const requirement of [...requirementMap.values()].sort((left, right) =>
    left.handleId.localeCompare(right.handleId),
  )) {
    const binding = bindingMap.get(requirement.handleId);
    const reasons: string[] = [];

    if (!binding || binding.storage === 'PROJECT_TEMPLATE') {
      reasons.push('no machine-resolvable binding is configured');
    }

    const evidence = binding ? evidenceMap.get(binding.resolverKind) : undefined;
    if (binding && binding.storage !== 'PROJECT_TEMPLATE') {
      if (!evidence) {
        reasons.push('resolver health is unverifiable');
      } else {
        if (evidence.health !== 'HEALTHY') {
          reasons.push('resolver is not healthy');
        }
        if (evidence.authenticated === false) {
          reasons.push('resolver authentication is unavailable');
        }
        const capabilities = new Set(evidence.availableCapabilities);
        for (const capability of requirement.requiredCapabilities) {
          if (!capabilities.has(capability)) {
            reasons.push('resolver capability is unavailable: ' + capability);
          }
        }
      }
    }

    const status: SecretRequirementStatus =
      reasons.length === 0
        ? 'RESOLVABLE'
        : requirement.optional
          ? 'OPTIONAL_UNAVAILABLE'
          : 'BLOCKED_CONFIGURATION';

    resolutions.push({
      handleId: requirement.handleId,
      status,
      profileId: profile.profileId,
      resolverKind: binding?.resolverKind ?? null,
      reasons: reasons.sort(),
    });
  }

  const requiredBlocked = resolutions.some(
    (resolution) => resolution.status === 'BLOCKED_CONFIGURATION',
  );
  const optionalMissing = resolutions.some(
    (resolution) => resolution.status === 'OPTIONAL_UNAVAILABLE',
  );

  return {
    status: requiredBlocked ? 'BLOCKED_CONFIGURATION' : optionalMissing ? 'PARTIAL' : 'READY',
    resolutions,
    authority: 'NONE',
    secretValuesPresent: false,
  };
}

export function validateSecretRequirementV1(requirement: SecretRequirementV1): void {
  if (requirement.schemaVersion !== 1)
    throw new Error('secret requirement schemaVersion must be 1');
  if (requirement.authority !== 'NONE')
    throw new Error('secret requirement authority must remain NONE');
  const rebuilt = createSecretRequirementV1({
    handleId: requirement.handleId,
    purpose: requirement.purpose,
    allowedTargets: requirement.allowedTargets,
    requiredCapabilities: requirement.requiredCapabilities,
    requiredForRoles: requirement.requiredForRoles,
    optional: requirement.optional,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(requirement)) {
    throw new Error('secret requirement is not canonically normalized');
  }
}

export function validateSecretBindingV1(binding: SecretBindingV1): void {
  if (binding.schemaVersion !== 1) throw new Error('secret binding schemaVersion must be 1');
  if (binding.authority !== 'NONE') throw new Error('secret binding authority must remain NONE');
  const rebuilt = createSecretBindingV1({
    profileId: binding.profileId,
    handleId: binding.handleId,
    resolverKind: binding.resolverKind,
    storage: binding.storage,
    reference: binding.reference,
    accountProfile: binding.accountProfile,
    portableReferenceApproved: binding.portableReferenceApproved,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(binding)) {
    throw new Error('secret binding is not canonically normalized');
  }
}

export function validateSecretBindingProfileV1(profile: SecretBindingProfileV1): void {
  if (profile.schemaVersion !== 1)
    throw new Error('secret binding profile schemaVersion must be 1');
  if (profile.authority !== 'NONE')
    throw new Error('secret binding profile authority must remain NONE');
  const rebuilt = createSecretBindingProfileV1(profile.profileId, profile.bindings);
  if (JSON.stringify(rebuilt) !== JSON.stringify(profile)) {
    throw new Error('secret binding profile is not canonically normalized');
  }
}

export function secretBindingCanContainSecretValues(): false {
  return false;
}

export function secretBindingCanExportCredentialMaterial(): false {
  return false;
}

export function secretBindingCanGrantAuthority(): false {
  return false;
}

function validateResolverEvidence(evidence: SecretResolverEvidenceV1): void {
  requireResolverKind(evidence.resolverKind);
  if (!['HEALTHY', 'UNAVAILABLE', 'UNKNOWN'].includes(evidence.health)) {
    throw new Error('unsupported secret resolver health');
  }
  if (
    evidence.authenticated !== true &&
    evidence.authenticated !== false &&
    evidence.authenticated !== null
  ) {
    throw new Error('resolver authenticated must be boolean or null');
  }
  uniqueSortedIds(evidence.availableCapabilities, 'resolver capability');
}

function uniqueSortedTargets(
  values: readonly SecretInjectionTarget[],
): readonly SecretInjectionTarget[] {
  const seen = new Set<SecretInjectionTarget>();
  for (const value of values) {
    if (!TARGETS.has(value)) throw new Error('unsupported secret injection target');
    if (seen.has(value)) throw new Error('duplicate secret injection target');
    seen.add(value);
  }
  return [...seen].sort();
}

function uniqueSortedIds(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    requireId(value, label);
    if (seen.has(value)) throw new Error('duplicate ' + label + ': ' + value);
    seen.add(value);
  }
  return [...seen].sort();
}

function validateReference(kind: SecretResolverKind, reference: string): void {
  requireText(reference, 'resolver reference');
  if (reference.length > 512 || /[\r\n\0]/.test(reference)) {
    throw new Error('resolver reference must be bounded single-line metadata');
  }
  if (kind === 'LOCAL_ENV' && !ENV_REFERENCE_PATTERN.test(reference)) {
    throw new Error('LOCAL_ENV reference must be an environment variable name');
  }
  if (kind === 'ONEPASSWORD' && !reference.startsWith('op://')) {
    throw new Error('ONEPASSWORD reference must use op://');
  }
  if (kind === 'BITWARDEN_SECRETS_MANAGER' && !reference.startsWith('bw://')) {
    throw new Error('BITWARDEN reference must use bw://');
  }
  if (kind === 'HASHICORP_VAULT' && !reference.startsWith('vault://')) {
    throw new Error('VAULT reference must use vault://');
  }
  if (kind === 'GITHUB_AUTH_CAPABILITY' && !reference.startsWith('github-auth://')) {
    throw new Error('GitHub auth reference must describe an authenticated capability');
  }
  if (looksLikeCredentialMaterial(reference)) {
    throw new Error('resolver reference resembles credential material');
  }
}

function looksLikeCredentialMaterial(reference: string): boolean {
  return (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(reference) ||
    /^(?:sk-|ghp_|github_pat_|xox[baprs]-)/i.test(reference) ||
    /(?:password|token|secret|api[_-]?key)\s*=\s*[^\s]+/i.test(reference)
  );
}

function requireResolverKind(value: SecretResolverKind): void {
  if (!RESOLVER_KINDS.has(value)) throw new Error('unsupported secret resolver kind');
}

function requireStorageKind(value: SecretBindingStorage): void {
  if (!STORAGE_KINDS.has(value)) throw new Error('unsupported secret binding storage');
}

function requireId(value: string, name: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(name + ' must be a bounded identifier');
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(name + ' is required');
}
