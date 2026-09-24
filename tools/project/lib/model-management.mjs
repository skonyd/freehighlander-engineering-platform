import path from 'node:path';

import {
  GeminiProviderAdapter,
  ModelCatalogManagementService,
  OpenAiCompatibleProviderAdapter,
  ProviderRegistry,
  RoleBindingManagementService,
  createEmptyModelManagementStateV1,
  validateManagedProviderConfigV1,
  validateModelManagementStateV1,
} from '../../../packages/model-runtime/dist/index.js';
import { AtomicJsonConfigStore } from '../../../packages/persistence/dist/index.js';

export function modelManagementStateFile(root, override) {
  return override ? path.resolve(override) : path.join(root, '.freehighlander', 'model-management.json');
}

export function createModelManagementStore(root, override) {
  return new AtomicJsonConfigStore(modelManagementStateFile(root, override), (value) =>
    validateModelManagementStateV1(value),
  );
}

export function readModelManagementState(store) {
  const snapshot = store.read();
  if (snapshot === null) {
    return {
      generation: 0,
      snapshotHash: null,
      state: createEmptyModelManagementStateV1(),
    };
  }
  return {
    generation: snapshot.generation,
    snapshotHash: snapshot.snapshotHash,
    state: validateModelManagementStateV1(snapshot.payload),
  };
}

export function writeModelManagementState(store, generation, state) {
  const normalized = validateModelManagementStateV1(state);
  const result = store.write(generation, normalized);
  if (result.status !== 'WRITTEN' || result.snapshot === null) {
    const actual =
      result.actualGeneration === null ? 'unknown' : String(result.actualGeneration);
    throw new Error(
      `model management state write conflict: ${result.status} expected=${generation} actual=${actual}`,
    );
  }
  return {
    generation: result.snapshot.generation,
    snapshotHash: result.snapshot.snapshotHash,
    state: validateModelManagementStateV1(result.snapshot.payload),
  };
}

export function setManagedProvider(state, input) {
  const provider = validateManagedProviderConfigV1({
    schemaVersion: 1,
    id: input.id,
    kind: input.kind,
    baseUrl: input.baseUrl,
    locality: input.locality,
    credential:
      input.credentialEnv === undefined || input.credentialEnv === null
        ? null
        : { resolverKind: 'LOCAL_ENV', reference: input.credentialEnv },
    authority: 'NONE',
  });

  const previous = state.providers.find((item) => item.id === provider.id);
  const changed = previous === undefined || JSON.stringify(previous) !== JSON.stringify(provider);

  const providers = [
    ...state.providers.filter((item) => item.id !== provider.id),
    provider,
  ].sort((left, right) => left.id.localeCompare(right.id));

  const next = {
    ...state,
    providers,
    catalogs: changed
      ? state.catalogs.filter((snapshot) => snapshot.providerId !== provider.id)
      : state.catalogs,
    qualifications: changed
      ? state.qualifications.filter((snapshot) => snapshot.providerId !== provider.id)
      : state.qualifications,
    publications: changed
      ? state.publications.filter(
          (publication) =>
            !publication.plan.bindings.some((binding) => binding.providerId === provider.id),
        )
      : state.publications,
  };

  return {
    state: validateModelManagementStateV1(next),
    changed,
    invalidated: {
      catalogs: state.catalogs.length - next.catalogs.length,
      qualifications: state.qualifications.length - next.qualifications.length,
      publications: state.publications.length - next.publications.length,
    },
  };
}

export function removeManagedProvider(state, providerId) {
  requireId(providerId, 'providerId');
  if (!state.providers.some((provider) => provider.id === providerId)) {
    throw new Error(`unknown managed provider: ${providerId}`);
  }

  const next = {
    ...state,
    providers: state.providers.filter((provider) => provider.id !== providerId),
    catalogs: state.catalogs.filter((snapshot) => snapshot.providerId !== providerId),
    qualifications: state.qualifications.filter((snapshot) => snapshot.providerId !== providerId),
    publications: state.publications.filter(
      (publication) =>
        !publication.plan.bindings.some((binding) => binding.providerId === providerId),
    ),
  };

  return {
    state: validateModelManagementStateV1(next),
    invalidated: {
      catalogs: state.catalogs.length - next.catalogs.length,
      qualifications: state.qualifications.length - next.qualifications.length,
      publications: state.publications.length - next.publications.length,
    },
  };
}

export function managedProviderById(state, providerId) {
  requireId(providerId, 'providerId');
  const provider = state.providers.find((item) => item.id === providerId);
  if (!provider) throw new Error(`unknown managed provider: ${providerId}`);
  return provider;
}

export function resolveManagedCredential(provider, env = process.env) {
  if (provider.credential === null) return undefined;
  const value = env[provider.credential.reference];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(
      `credential environment variable is unavailable: ${provider.credential.reference}`,
    );
  }
  return value;
}

export function createManagedProviderAdapter(provider, env = process.env) {
  const apiKey = resolveManagedCredential(provider, env);
  if (provider.kind === 'OPENAI_COMPATIBLE') {
    return new OpenAiCompatibleProviderAdapter(provider.id, {
      baseUrl: provider.baseUrl,
      ...(apiKey === undefined ? {} : { apiKey }),
      modelLocality: provider.locality,
    });
  }
  if (apiKey === undefined) {
    throw new Error(`Gemini provider ${provider.id} requires a credential reference`);
  }
  return new GeminiProviderAdapter(provider.id, {
    baseUrl: provider.baseUrl,
    apiKey,
  });
}

export async function healthManagedProvider(state, providerId, env = process.env) {
  const provider = managedProviderById(state, providerId);
  const adapter = createManagedProviderAdapter(provider, env);
  return {
    providerId,
    health: await adapter.health(),
    authority: 'NONE',
  };
}

export async function refreshManagedProvider(
  state,
  providerId,
  refreshedAt,
  env = process.env,
) {
  const provider = managedProviderById(state, providerId);
  const adapter = createManagedProviderAdapter(provider, env);
  const registry = new ProviderRegistry();
  registry.register(adapter);
  const existing = state.catalogs.find((snapshot) => snapshot.providerId === providerId);
  const audit = new MemoryAuditSink();
  const service = new ModelCatalogManagementService(
    registry,
    audit,
    existing === undefined ? [] : [existing],
  );
  const result = await service.refreshProvider({
    providerId,
    refreshedAt,
    operationId: `cli-refresh:${providerId}`,
  });

  const catalogs = [
    ...state.catalogs.filter((snapshot) => snapshot.providerId !== providerId),
    result.snapshot,
  ].sort((left, right) => left.providerId.localeCompare(right.providerId));

  const next = validateModelManagementStateV1({
    ...state,
    catalogs,
  });

  return {
    state: next,
    result,
    auditEvents: audit.events,
  };
}

export function selectCatalogs(state, providerId) {
  if (providerId === undefined) return state.catalogs;
  requireId(providerId, 'providerId');
  return state.catalogs.filter((snapshot) => snapshot.providerId === providerId);
}

export function selectQualifications(state, filters = {}) {
  return state.qualifications.filter((snapshot) => {
    if (filters.providerId !== undefined && snapshot.providerId !== filters.providerId) return false;
    if (filters.modelId !== undefined && snapshot.modelId !== filters.modelId) return false;
    if (filters.role !== undefined) {
      const role = snapshot.eligibility?.role ?? snapshot.shadow?.role;
      if (role !== filters.role) return false;
    }
    if (filters.riskTier !== undefined) {
      const riskTier = snapshot.eligibility?.riskTier ?? snapshot.shadow?.riskTier;
      if (riskTier !== filters.riskTier) return false;
    }
    return true;
  });
}

export function bindingInputFromArgs(args) {
  const logicalRole = requireId(args.role, 'role');
  const riskTier = requireRiskTier(args.risk);
  const providerId = requireId(args.provider, 'provider');
  const model = requireId(args.model, 'model');
  const id = requireId(args.bindingId, 'binding-id');
  const version = args.version ?? '1.0.0';
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('version must be semantic x.y.z');
  }
  const independenceGroup = requireId(args.independenceGroup ?? providerId, 'independence-group');
  const capabilities = normalizeList(args.capability);

  const primary = {
    id,
    version,
    providerId,
    model,
    ...(args.effort === undefined ? {} : { effort: requireId(args.effort, 'effort') }),
    ...(capabilities.length === 0 ? {} : { requiredCapabilities: capabilities }),
    allowedRiskTiers: [riskTier],
    independenceGroup,
  };

  return { logicalRole, riskTier, primary };
}

export function findEligibleQualification(state, providerId, modelId, role, riskTier) {
  const matches = state.qualifications.filter(
    (snapshot) =>
      snapshot.providerId === providerId &&
      snapshot.modelId === modelId &&
      snapshot.stage === 'ELIGIBLE' &&
      snapshot.eligibility?.role === role &&
      snapshot.eligibility.riskTier === riskTier,
  );
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one ELIGIBLE qualification for ${providerId}/${modelId} ${role}/${riskTier}; found ${matches.length}`,
    );
  }
  return matches[0];
}

export function previewManagedBinding(state, args, env = process.env) {
  const input = bindingInputFromArgs(args);
  const provider = managedProviderById(state, input.primary.providerId);
  const adapter = createManagedProviderAdapter(provider, env);
  const registry = new ProviderRegistry();
  registry.register(adapter);

  const catalog = state.catalogs.find(
    (snapshot) => snapshot.providerId === input.primary.providerId,
  );
  if (!catalog) throw new Error(`no managed catalog for provider ${input.primary.providerId}`);

  const catalogs = new ModelCatalogManagementService(registry, new MemoryAuditSink(), [catalog]);
  const publicationsForProvider = state.publications.filter((publication) =>
    publication.plan.bindings.every((binding) => binding.providerId === provider.id),
  );
  const service = new RoleBindingManagementService(
    registry,
    catalogs,
    new MemoryAuditSink(),
    publicationsForProvider,
  );
  const qualification = findEligibleQualification(
    state,
    input.primary.providerId,
    input.primary.model,
    input.logicalRole,
    input.riskTier,
  );

  const plan = service.preview({
    ...input,
    qualifications: { [input.primary.id]: qualification },
  });
  return { plan, input, qualification };
}

export async function publishManagedBinding(
  state,
  args,
  publishedAt,
  env = process.env,
) {
  const input = bindingInputFromArgs(args);
  const provider = managedProviderById(state, input.primary.providerId);
  const adapter = createManagedProviderAdapter(provider, env);
  const registry = new ProviderRegistry();
  registry.register(adapter);
  const catalog = state.catalogs.find(
    (snapshot) => snapshot.providerId === input.primary.providerId,
  );
  if (!catalog) throw new Error(`no managed catalog for provider ${input.primary.providerId}`);

  const catalogs = new ModelCatalogManagementService(registry, new MemoryAuditSink(), [catalog]);
  const audit = new MemoryAuditSink();
  const existingPublications = state.publications.filter((publication) =>
    publication.plan.bindings.every((binding) => binding.providerId === provider.id),
  );
  const service = new RoleBindingManagementService(
    registry,
    catalogs,
    audit,
    existingPublications,
  );
  const qualification = findEligibleQualification(
    state,
    input.primary.providerId,
    input.primary.model,
    input.logicalRole,
    input.riskTier,
  );

  const publication = await service.publish({
    ...input,
    qualifications: { [input.primary.id]: qualification },
    operationId: args.operationId ?? `cli-binding:${input.logicalRole}:${input.riskTier}`,
    publishedAt,
  });

  const publications = [
    ...state.publications.filter(
      (item) =>
        item.logicalRole !== publication.logicalRole || item.riskTier !== publication.riskTier,
    ),
    publication,
  ].sort((left, right) => {
    const roleOrder = left.logicalRole.localeCompare(right.logicalRole);
    return roleOrder !== 0 ? roleOrder : left.riskTier.localeCompare(right.riskTier);
  });

  return {
    state: validateModelManagementStateV1({ ...state, publications }),
    publication,
    auditEvents: audit.events,
  };
}

export function parseCliArgs(argv) {
  const [command, subcommand, ...rest] = argv;
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
    if (options[name] === undefined) {
      options[name] = next;
    } else if (Array.isArray(options[name])) {
      options[name].push(next);
    } else {
      options[name] = [options[name], next];
    }
  }

  return { command, subcommand, options, positionals };
}

export function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

export class MemoryAuditSink {
  events = [];

  async append(event) {
    this.events.push(event);
  }
}

function requireRiskTier(value) {
  if (!['NORMAL', 'HIGH', 'CRITICAL'].includes(value)) {
    throw new Error('risk must be NORMAL HIGH or CRITICAL');
  }
  return value;
}

function normalizeList(value) {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((item) => requireId(item, 'capability')))].sort();
}

function requireId(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
