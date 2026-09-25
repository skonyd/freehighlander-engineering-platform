#!/usr/bin/env node

import path from 'node:path';

import { GitPortableOwnershipStore } from './lib/portable-ownership-store.mjs';
import { assertSafeCheckpointWorktree } from './lib/reconciliation.mjs';
import {
  createPortableResumeStore,
  inspectPortableResume,
  claimPortableResumeOwnership,
  inspectPortableResumeWithOwnership,
  publishPreparedResumeCheckpoint,
  publishPreparedResumeHandoff,
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
    if (parsed.flags.has('claim')) throw new Error('--claim is valid only with resume');
    const manifestFile = requireOption(parsed.options, 'manifest');
    assertSafeCheckpointWorktree(readCheckpointWorktreeStatus(root));

    const manifest = await readPreparedResumeManifest(path.resolve(process.cwd(), manifestFile));
    const store = createPortableResumeStore(root, remote);
    const remoteHead = readRemoteBranchHead(root, remote, manifest.branch);
    const handoff = parsed.flags.has('handoff');
    if (!handoff && option(parsed.options, 'lease-id') !== null) {
      throw new Error('--lease-id requires --handoff');
    }

    const result = handoff
      ? await publishPreparedResumeHandoff({
          resumeStore: store,
          ownershipStore: new GitPortableOwnershipStore(root, remote),
          manifest,
          repositoryIdentity: state.repository,
          remoteHead,
          leaseId:
            manifest.activeWorkItemId === null ? null : requireOption(parsed.options, 'lease-id'),
          releasedAt: new Date().toISOString(),
        })
      : await publishPreparedResumeCheckpoint({
          store,
          manifest,
          repositoryIdentity: state.repository,
          remoteHead,
        });
    printJson(result);
    if (result.status !== 'PORTABLE_READY' || result.handoffComplete === false) {
      process.exitCode = 2;
    }
  } else if (parsed.command === 'resume') {
    if (parsed.flags.has('handoff')) throw new Error('--handoff is valid only with checkpoint');
    const projectId = requireOption(parsed.options, 'project');
    const store = createPortableResumeStore(root, remote);
    const ownershipStore = new GitPortableOwnershipStore(root, remote);
    const claim = parsed.flags.has('claim');
    const now = new Date().toISOString();

    if (!claim) {
      for (const name of ['run-id', 'machine-instance', 'ttl-ms']) {
        if (option(parsed.options, name) !== null) {
          throw new Error(`--${name} requires --claim`);
        }
      }
    }

    const result = claim
      ? await claimPortableResumeOwnership({
          resumeStore: store,
          ownershipStore,
          repositoryIdentity: state.repository,
          projectId,
          readRemoteHead: async (branch) => readRemoteBranchHead(root, remote, branch),
          runId: option(parsed.options, 'run-id'),
          leaseId: option(parsed.options, 'lease-id'),
          machineInstanceId: option(parsed.options, 'machine-instance'),
          ttlMs: integerOption(parsed.options, 'ttl-ms'),
          now,
        })
      : await inspectPortableResumeWithOwnership({
          resumeStore: store,
          ownershipStore,
          repositoryIdentity: state.repository,
          projectId,
          readRemoteHead: async (branch) => readRemoteBranchHead(root, remote, branch),
          leaseId: option(parsed.options, 'lease-id'),
          now,
        });
    printJson(result);
    if (result.status !== 'READY' || result.readyToMutate !== true) process.exitCode = 2;
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
  const flags = new Set();

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!name || Object.hasOwn(options, name) || flags.has(name)) {
      throw new Error(`invalid or duplicate option: ${token}`);
    }
    if (name === 'handoff' || name === 'claim') {
      flags.add(name);
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`option requires a value: ${token}`);
    }
    options[name] = value;
    index += 1;
  }

  return { command, options, flags };
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

function integerOption(options, name) {
  const value = option(options, name);
  if (value === null) return null;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`--${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`--${name} must be a positive safe integer`);
  }
  return parsed;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`FreeHighlander portable resume

Usage:
  npm run project:portable-resume -- checkpoint --manifest <manifest.json> [--remote origin]
  npm run project:portable-resume -- checkpoint --manifest <manifest.json> --handoff --lease-id <lease-id> [--remote origin]
  npm run project:portable-resume -- resume --project <project-id> [--lease-id <current-lease-id>] [--remote origin]
  npm run project:portable-resume -- resume --project <project-id> --claim \
    --run-id <run-id> --lease-id <new-lease-id> --machine-instance <machine-id> --ttl-ms <milliseconds> [--remote origin]

Checkpoint safety:
  - requires a clean product worktree
  - validates the strict ResumeManifestV1 contract
  - verifies manifest remote HEAD is current before publication
  - publishes with generation/CAS semantics
  - verifies remote read-back/hash
  - --handoff releases the exact active ownership lease only after checkpoint verification
  - handoff lease release uses exact Git revision CAS and read-back verification
  - never infers semantic gate PASS or authority

Resume safety:
  - fetches the latest portable generation explicitly
  - verifies repository identity and current remote branch HEAD
  - verifies active-work ownership before reporting mutation-ready state
  - a live lease requires the exact current lease id; machine identity alone is never sufficient
  - missing/released/expired ownership reports OWNERSHIP_CLAIM_REQUIRED
  - --claim acquires/reclaims ownership with exact Git revision CAS
  - a live non-expired lease blocks claim; CAS conflict never guesses takeover
  - reports RECONCILIATION_REQUIRED instead of guessing continuation
  - never mutates or cleans the product worktree
`);
}
