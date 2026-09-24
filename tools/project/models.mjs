#!/usr/bin/env node

import process from 'node:process';

import { findRepoRoot } from './lib/state.mjs';
import {
  createModelManagementStore,
  healthManagedProvider,
  parseCliArgs,
  previewManagedBinding,
  publishManagedBinding,
  readModelManagementState,
  refreshManagedProvider,
  removeManagedProvider,
  requireOption,
  selectCatalogs,
  selectQualifications,
  setManagedProvider,
  writeModelManagementState,
} from './lib/model-management.mjs';

try {
  const root = await findRepoRoot();
  const parsed = parseCliArgs(process.argv.slice(2));
  const override =
    typeof parsed.options.state === 'string'
      ? parsed.options.state
      : process.env.FREEHIGHLANDER_MODEL_STATE;
  const store = createModelManagementStore(root, override);
  const current = readModelManagementState(store);

  const output = await execute(parsed, current, store);
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      {
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'unknown model management error',
      },
      null,
      2,
    ) + '\n',
  );
  process.exitCode = 1;
}

async function execute(parsed, current, store) {
  const { command, subcommand, options } = parsed;

  if (command === undefined || command === 'help' || options.help === true) {
    return help();
  }

  if (command === 'status') {
    return {
      status: 'OK',
      file: store.filePath,
      generation: current.generation,
      snapshotHash: current.snapshotHash,
      counts: {
        providers: current.state.providers.length,
        catalogs: current.state.catalogs.length,
        qualifications: current.state.qualifications.length,
        publications: current.state.publications.length,
      },
      authority: 'NONE',
    };
  }

  if (command === 'provider' && subcommand === 'list') {
    return {
      status: 'OK',
      generation: current.generation,
      providers: current.state.providers,
      authority: 'NONE',
    };
  }

  if (command === 'provider' && subcommand === 'set') {
    const id = requireOption(options, 'id');
    const kind = requireOption(options, 'kind');
    const baseUrl = requireOption(options, 'base-url');
    const locality = requireOption(options, 'locality');
    const credentialEnv =
      options['credential-env'] === undefined
        ? null
        : requireOption(options, 'credential-env');

    const mutation = setManagedProvider(current.state, {
      id,
      kind,
      baseUrl,
      locality,
      credentialEnv,
    });
    const written = writeModelManagementState(store, current.generation, mutation.state);
    return {
      status: 'WRITTEN',
      generation: written.generation,
      snapshotHash: written.snapshotHash,
      providerId: id,
      changed: mutation.changed,
      invalidated: mutation.invalidated,
      authority: 'NONE',
    };
  }

  if (command === 'provider' && subcommand === 'remove') {
    const id = requireOption(options, 'id');
    const mutation = removeManagedProvider(current.state, id);
    const written = writeModelManagementState(store, current.generation, mutation.state);
    return {
      status: 'WRITTEN',
      generation: written.generation,
      snapshotHash: written.snapshotHash,
      providerId: id,
      invalidated: mutation.invalidated,
      authority: 'NONE',
    };
  }

  if (command === 'provider' && subcommand === 'health') {
    const id = requireOption(options, 'id');
    return {
      status: 'OK',
      ...(await healthManagedProvider(current.state, id)),
    };
  }

  if (command === 'refresh') {
    const id = requireOption(options, 'provider');
    const refreshedAt =
      typeof options.at === 'string' ? options.at : new Date().toISOString();
    const refreshed = await refreshManagedProvider(
      current.state,
      id,
      refreshedAt,
      process.env,
    );
    const written = writeModelManagementState(store, current.generation, refreshed.state);
    return {
      status: 'WRITTEN',
      generation: written.generation,
      snapshotHash: written.snapshotHash,
      providerId: id,
      catalogHash: refreshed.result.snapshot.hash,
      addedModelIds: refreshed.result.addedModelIds,
      becameUnavailableModelIds: refreshed.result.becameUnavailableModelIds,
      restoredModelIds: refreshed.result.restoredModelIds,
      deprecatedModelIds: refreshed.result.deprecatedModelIds,
      auditEvents: refreshed.auditEvents,
      authority: 'NONE',
    };
  }

  if (command === 'catalog') {
    const providerId =
      typeof options.provider === 'string' ? options.provider : undefined;
    return {
      status: 'OK',
      generation: current.generation,
      catalogs: selectCatalogs(current.state, providerId),
      authority: 'NONE',
    };
  }

  if (command === 'qualifications') {
    return {
      status: 'OK',
      generation: current.generation,
      qualifications: selectQualifications(current.state, {
        ...(typeof options.provider === 'string' ? { providerId: options.provider } : {}),
        ...(typeof options.model === 'string' ? { modelId: options.model } : {}),
        ...(typeof options.role === 'string' ? { role: options.role } : {}),
        ...(typeof options.risk === 'string' ? { riskTier: options.risk } : {}),
      }),
      authority: 'NONE',
    };
  }

  if (command === 'bindings' && subcommand === undefined) {
    return {
      status: 'OK',
      generation: current.generation,
      publications: current.state.publications,
      authority: 'NONE',
    };
  }

  if (command === 'binding' && subcommand === 'preview') {
    const preview = previewManagedBinding(
      current.state,
      bindingArgs(options),
      process.env,
    );
    return {
      status: 'OK',
      plan: preview.plan,
      qualificationHash: preview.qualification.hash,
      authority: 'NONE',
    };
  }

  if (command === 'binding' && subcommand === 'publish') {
    const publishedAt =
      typeof options.at === 'string' ? options.at : new Date().toISOString();
    const result = await publishManagedBinding(
      current.state,
      bindingArgs(options),
      publishedAt,
      process.env,
    );
    const written = writeModelManagementState(store, current.generation, result.state);
    return {
      status: 'WRITTEN',
      generation: written.generation,
      snapshotHash: written.snapshotHash,
      publication: result.publication,
      auditEvents: result.auditEvents,
      authority: 'NONE',
    };
  }

  throw new Error(
    `unknown model management command: ${[command, subcommand].filter(Boolean).join(' ')}`,
  );
}

function bindingArgs(options) {
  return {
    role: requireOption(options, 'role'),
    risk: requireOption(options, 'risk'),
    bindingId: requireOption(options, 'binding-id'),
    version:
      typeof options.version === 'string' ? options.version : '1.0.0',
    provider: requireOption(options, 'provider'),
    model: requireOption(options, 'model'),
    ...(typeof options.effort === 'string' ? { effort: options.effort } : {}),
    ...(options.capability === undefined ? {} : { capability: options.capability }),
    ...(typeof options['independence-group'] === 'string'
      ? { independenceGroup: options['independence-group'] }
      : {}),
    ...(typeof options['operation-id'] === 'string'
      ? { operationId: options['operation-id'] }
      : {}),
  };
}

function help() {
  return {
    status: 'OK',
    authority: 'NONE',
    commands: [
      'status',
      'provider list',
      'provider set --id ID --kind OPENAI_COMPATIBLE|GEMINI --base-url URL --locality LOCAL|REMOTE [--credential-env ENV]',
      'provider remove --id ID',
      'provider health --id ID',
      'refresh --provider ID [--at ISO]',
      'catalog [--provider ID]',
      'qualifications [--provider ID] [--model ID] [--role ROLE] [--risk NORMAL|HIGH|CRITICAL]',
      'bindings',
      'binding preview --role ROLE --risk TIER --binding-id ID --provider ID --model ID [--version X.Y.Z] [--effort EFFORT] [--capability CAP]',
      'binding publish --role ROLE --risk TIER --binding-id ID --provider ID --model ID [--version X.Y.Z] [--effort EFFORT] [--capability CAP] [--at ISO]',
    ],
  };
}
