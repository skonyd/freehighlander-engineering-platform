#!/usr/bin/env node

import process from 'node:process';

import { findRepoRoot } from './lib/state.mjs';
import {
  createModelManagementStore,
  parseCliArgs,
  readModelManagementState,
  requireOption,
} from './lib/model-management.mjs';
import { buildFullAutoConfigurationPreview } from './lib/full-auto-preview.mjs';

try {
  const root = await findRepoRoot();
  const parsed = parseCliArgs(process.argv.slice(2));
  const override =
    typeof parsed.options.state === 'string'
      ? parsed.options.state
      : process.env.FREEHIGHLANDER_MODEL_STATE;
  const store = createModelManagementStore(root, override);
  const current = readModelManagementState(store);

  const output = execute(parsed, current);
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      {
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'unknown Full Auto preview error',
      },
      null,
      2,
    ) + '\n',
  );
  process.exitCode = 1;
}

function execute(parsed, current) {
  const { command, options } = parsed;

  if (command === undefined || command === 'help' || options.help === true) {
    return help();
  }

  if (command !== 'preview') {
    throw new Error(`unknown Full Auto command: ${command}`);
  }

  const preview = buildFullAutoConfigurationPreview(current.state, {
    profile: typeof options.profile === 'string' ? options.profile : 'OFF',
    riskTier: typeof options.risk === 'string' ? options.risk : 'NORMAL',
    reviewerARole:
      typeof options['reviewer-a-role'] === 'string'
        ? options['reviewer-a-role']
        : 'autonomous-merge-reviewer-a',
    reviewerBRole:
      typeof options['reviewer-b-role'] === 'string'
        ? options['reviewer-b-role']
        : 'autonomous-merge-reviewer-b',
    producerIndependenceGroup: requireOption(options, 'producer-group'),
    maxDebateRounds:
      typeof options['max-debate-rounds'] === 'string' ? options['max-debate-rounds'] : 2,
    customAllowedRiskTiers: normalizeOptionList(options['custom-risk']),
  });

  return {
    status: 'OK',
    generation: current.generation,
    modelManagementSnapshotHash: current.snapshotHash,
    ...preview,
  };
}

function normalizeOptionList(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function help() {
  return {
    status: 'OK',
    authority: 'NONE',
    commands: [
      'preview --producer-group GROUP [--profile OFF|SAFE|BALANCED|CUSTOM] [--risk NORMAL|HIGH|CRITICAL] [--reviewer-a-role ROLE] [--reviewer-b-role ROLE] [--max-debate-rounds N] [--custom-risk TIER ...] [--state FILE]',
    ],
    notes: [
      'Full Auto preview is read-only.',
      'V3 merge execution remains SHADOW_ONLY until the explicit FH-20 authority cutover.',
      'CUSTOM profile requires at least one --custom-risk tier.',
    ],
  };
}
