#!/usr/bin/env node

import path from 'node:path';

import { assertSafeCheckpointWorktree } from './lib/reconciliation.mjs';
import {
  createPortableResumeStore,
  inspectPortableResume,
  publishPreparedResumeCheckpoint,
  readCheckpointWorktreeStatus,
  readPreparedResumeManifest,
  readRemoteBranchHead,
} from './lib/portable-resume.mjs';
import { assertStateContract, findRepoRoot, loadProjectState } from './lib/state.mjs';

try {
  const root = await findRepoRoot();
  const state = await loadProjectState(root);
  assertStateContract(state);

  const parsed = parseArgs(process.argv.slice(2));
  const remote = option(parsed.options, 'remote') ?? 'origin';

  if (parsed.command === 'checkpoint') {
    const manifestFile = requireOption(parsed.options, 'manifest');
    assertSafeCheckpointWorktree(readCheckpointWorktreeStatus(root));

    const manifest = await readPreparedResumeManifest(path.resolve(process.cwd(), manifestFile));
    const store = createPortableResumeStore(root, remote);
    const remoteHead = readRemoteBranchHead(root, remote, manifest.branch);
    const result = await publishPreparedResumeCheckpoint({
      store,
      manifest,
      repositoryIdentity: state.repository,
      remoteHead,
    });
    printJson(result);
    if (result.status !== 'PORTABLE_READY') process.exitCode = 2;
  } else if (parsed.command === 'resume') {
    const projectId = requireOption(parsed.options, 'project');
    const store = createPortableResumeStore(root, remote);
    const result = await inspectPortableResume({
      store,
      repositoryIdentity: state.repository,
      projectId,
      readRemoteHead: async (branch) => readRemoteBranchHead(root, remote, branch),
    });
    printJson(result);
    if (result.status !== 'READY') process.exitCode = 2;
  } else if (parsed.command === 'help' || parsed.command === undefined) {
    printHelp();
  } else {
    throw new Error(`unknown portable resume command: ${parsed.command}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FreeHighlander portable resume FAIL: ${message}`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const [command, ...rest] = args;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!name || Object.hasOwn(options, name)) {
      throw new Error(`invalid or duplicate option: ${token}`);
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`option requires a value: ${token}`);
    }
    options[name] = value;
    index += 1;
  }

  return { command, options };
}

function requireOption(options, name) {
  const value = option(options, name);
  if (value === null) throw new Error(`--${name} is required`);
  return value;
}

function option(options, name) {
  const value = options[name];
  if (value === undefined) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`--${name} must be a non-empty value`);
  }
  return value;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`FreeHighlander portable resume

Usage:
  npm run project:portable-resume -- checkpoint --manifest <manifest.json> [--remote origin]
  npm run project:portable-resume -- resume --project <project-id> [--remote origin]

Checkpoint safety:
  - requires a clean product worktree
  - validates the strict ResumeManifestV1 contract
  - verifies manifest remote HEAD is current before publication
  - publishes with generation/CAS semantics
  - verifies remote read-back/hash
  - never infers semantic gate PASS or authority

Resume safety:
  - fetches the latest portable generation explicitly
  - verifies repository identity and current remote branch HEAD
  - reports RECONCILIATION_REQUIRED instead of guessing continuation
  - never mutates or cleans the product worktree
`);
}
