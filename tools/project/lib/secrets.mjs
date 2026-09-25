import fs from 'node:fs/promises';
import path from 'node:path';

import {
  createDefaultSecretResolverRegistry,
  createSecretBindingProfileV1,
  createSecretBindingV1,
  evaluateSecretBindingStatusV1,
  validateSecretBindingProfileV1,
  validateSecretRequirementV1,
} from '../../../packages/governance/dist/index.js';
import { AtomicJsonConfigStore } from '../../../packages/persistence/dist/index.js';

const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export function localSecretProfileFile(root, profileId) {
  validateProfileId(profileId);
  return path.join(root, '.freehighlander', 'runtime', 'secret-bindings', `${profileId}.json`);
}

export function createLocalSecretProfileStore(root, profileId) {
  const filePath = localSecretProfileFile(root, profileId);
  return new AtomicJsonConfigStore(filePath, (value) => {
    validateSecretBindingProfileV1(value);
    return value;
  });
}

export function readLocalSecretProfile(store, profileId) {
  validateProfileId(profileId);
  const snapshot = store.read();
  if (snapshot === null) {
    return {
      generation: 0,
      snapshotHash: null,
      profile: createSecretBindingProfileV1(profileId, []),
    };
  }
  validateSecretBindingProfileV1(snapshot.payload);
  if (snapshot.payload.profileId !== profileId) {
    throw new Error('persisted secret binding profile identity mismatch');
  }
  return {
    generation: snapshot.generation,
    snapshotHash: snapshot.snapshotHash,
    profile: snapshot.payload,
  };
}

export function writeLocalSecretProfile(store, generation, profile) {
  validateSecretBindingProfileV1(profile);
  const result = store.write(generation, profile);
  if (result.status !== 'WRITTEN' || result.snapshot === null) {
    const actual = result.actualGeneration === null ? 'unknown' : String(result.actualGeneration);
    throw new Error(
      `secret binding profile write conflict: ${result.status} expected=${generation} actual=${actual}`,
    );
  }
  validateSecretBindingProfileV1(result.snapshot.payload);
  return {
    generation: result.snapshot.generation,
    snapshotHash: result.snapshot.snapshotHash,
    profile: result.snapshot.payload,
  };
}

export function bindLocalSecret(profile, input) {
  validateSecretBindingProfileV1(profile);
  if (input.profileId !== profile.profileId) {
    throw new Error('secret binding profile identity mismatch');
  }

  const binding = createSecretBindingV1({
    profileId: profile.profileId,
    handleId: input.handleId,
    resolverKind: input.resolverKind,
    storage: input.storage ?? 'MACHINE_LOCAL',
    reference: input.reference ?? null,
    accountProfile: input.accountProfile ?? null,
    portableReferenceApproved: input.portableReferenceApproved === true,
  });

  const bindings = [
    ...profile.bindings.filter((entry) => entry.handleId !== binding.handleId),
    binding,
  ];
  return createSecretBindingProfileV1(profile.profileId, bindings);
}

export function unbindLocalSecret(profile, handleId) {
  validateSecretBindingProfileV1(profile);
  requireText(handleId, 'handleId');
  if (!profile.bindings.some((binding) => binding.handleId === handleId)) {
    throw new Error(`secret binding does not exist: ${handleId}`);
  }
  return createSecretBindingProfileV1(
    profile.profileId,
    profile.bindings.filter((binding) => binding.handleId !== handleId),
  );
}

export async function inspectLocalSecretProfile(profile, options = {}) {
  validateSecretBindingProfileV1(profile);
  const registry =
    options.registry ??
    createDefaultSecretResolverRegistry({
      environment: options.environment,
      platform: options.platform,
      commandRunner: options.commandRunner,
    });

  const bindings = profile.bindings.filter((binding) => binding.storage !== 'PROJECT_TEMPLATE');
  const evidence = [];
  for (const binding of bindings) {
    try {
      evidence.push(await registry.probe(binding));
    } catch {
      evidence.push({
        resolverKind: binding.resolverKind,
        handleId: binding.handleId,
        health: 'UNAVAILABLE',
        authenticated: null,
        availableCapabilities: [],
      });
    }
  }

  return {
    profileId: profile.profileId,
    bindings: profile.bindings.map((binding) => ({
      handleId: binding.handleId,
      resolverKind: binding.resolverKind,
      storage: binding.storage,
      accountProfile: binding.accountProfile,
      portableReferenceApproved: binding.portableReferenceApproved,
      referenceConfigured: binding.reference !== null,
    })),
    evidence,
    authority: 'NONE',
    secretValuesPresent: false,
  };
}

export async function doctorLocalSecrets(profile, requirements, options = {}) {
  validateSecretBindingProfileV1(profile);
  const normalizedRequirements = validateSecretRequirements(requirements);
  const inspection = await inspectLocalSecretProfile(profile, options);
  const status = evaluateSecretBindingStatusV1(
    normalizedRequirements,
    profile,
    inspection.evidence,
  );

  return {
    profileId: profile.profileId,
    status: status.status,
    resolutions: status.resolutions,
    authority: 'NONE',
    secretValuesPresent: false,
  };
}

export async function doctorResumeSecretHandles(
  profile,
  requirements,
  requiredHandleIds,
  options = {},
) {
  validateSecretBindingProfileV1(profile);
  const normalizedRequirements = validateSecretRequirements(requirements);
  const required = normalizeRequiredHandleIds(requiredHandleIds);
  const requirementById = new Map(
    normalizedRequirements.map((requirement) => [requirement.handleId, requirement]),
  );
  const selectedRequirements = [];
  const missingRequirementIds = [];

  for (const handleId of required) {
    const requirement = requirementById.get(handleId);
    if (requirement) selectedRequirements.push(requirement);
    else missingRequirementIds.push(handleId);
  }

  const requiredSet = new Set(required);
  const scopedProfile = createSecretBindingProfileV1(
    profile.profileId,
    profile.bindings.filter((binding) => requiredSet.has(binding.handleId)),
  );
  const doctor = await doctorLocalSecrets(scopedProfile, selectedRequirements, options);
  const resolutions = [
    ...doctor.resolutions,
    ...missingRequirementIds.map((handleId) => ({
      handleId,
      status: 'BLOCKED_CONFIGURATION',
      profileId: profile.profileId,
      resolverKind: null,
      reasons: ['secret requirement metadata is missing'],
    })),
  ].sort((left, right) => left.handleId.localeCompare(right.handleId));

  const resolvableHandleIds = resolutions
    .filter((resolution) => resolution.status === 'RESOLVABLE')
    .map((resolution) => resolution.handleId);
  const blockedHandleIds = resolutions
    .filter((resolution) => resolution.status !== 'RESOLVABLE')
    .map((resolution) => resolution.handleId);
  const status = missingRequirementIds.length > 0 ? 'BLOCKED_CONFIGURATION' : doctor.status;

  return {
    profileId: profile.profileId,
    status,
    requiredHandleIds: required,
    resolvableHandleIds,
    blockedHandleIds,
    secretDependentWorkReady: blockedHandleIds.length === 0,
    resolutions,
    authority: 'NONE',
    secretValuesPresent: false,
  };
}

export async function loadSecretRequirements(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return [];
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('secret requirements file must contain valid JSON');
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.schemaVersion !== 1 ||
    parsed.authority !== 'NONE' ||
    parsed.secretValuesPresent !== false ||
    !Array.isArray(parsed.requirements)
  ) {
    throw new Error('secret requirements file has invalid schema');
  }
  const allowed = new Set(['schemaVersion', 'requirements', 'authority', 'secretValuesPresent']);
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) throw new Error(`secret requirements field is not allowed: ${key}`);
  }
  return validateSecretRequirements(parsed.requirements);
}

export function defaultSecretRequirementsFile(root) {
  return path.join(root, '.freehighlander', 'secret-requirements.json');
}

export function serializePortableSecretRequirements(requirements) {
  const normalized = validateSecretRequirements(requirements);
  return {
    schemaVersion: 1,
    requirements: normalized,
    authority: 'NONE',
    secretValuesPresent: false,
  };
}

export function parseSecretCliArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positionals = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const name = token.slice(2);
    if (!name) throw new Error('empty option name');
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) {
      options[name] = true;
      continue;
    }
    index += 1;
    options[name] = next;
  }

  return { command, options, positionals };
}

export function requireSecretCliOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

export function optionalSecretCliOption(options, name) {
  const value = options[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`--${name} requires a value`);
  }
  return value;
}

export function portableSecretsCliCanPrintSecretValues() {
  return false;
}

export function portableSecretsCliCanPersistSecretValues() {
  return false;
}

export function portableSecretsCliCanGrantAuthority() {
  return false;
}

function normalizeRequiredHandleIds(requiredHandleIds) {
  if (!Array.isArray(requiredHandleIds)) {
    throw new Error('required secret handle ids must be an array');
  }
  const seen = new Set();
  for (const handleId of requiredHandleIds) {
    requireText(handleId, 'required secret handle id');
    if (seen.has(handleId)) {
      throw new Error(`duplicate required secret handle id: ${handleId}`);
    }
    seen.add(handleId);
  }
  return [...seen].sort();
}

function validateSecretRequirements(requirements) {
  if (!Array.isArray(requirements)) throw new Error('secret requirements must be an array');
  const normalized = [...requirements];
  const seen = new Set();
  for (const requirement of normalized) {
    validateSecretRequirementV1(requirement);
    if (seen.has(requirement.handleId)) {
      throw new Error(`duplicate secret requirement handleId: ${requirement.handleId}`);
    }
    seen.add(requirement.handleId);
  }
  normalized.sort((left, right) => left.handleId.localeCompare(right.handleId));
  return normalized;
}

function validateProfileId(profileId) {
  if (typeof profileId !== 'string' || !PROFILE_ID_PATTERN.test(profileId)) {
    throw new Error('profileId must be a bounded identifier');
  }
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
}

function isNodeError(error) {
  return error instanceof Error && 'code' in error;
}
