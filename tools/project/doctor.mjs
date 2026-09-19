import fs from 'node:fs/promises';
import path from 'node:path';

import { loadArchitectureContract } from './lib/architecture-contract.mjs';
import {
  budgetNameForContextProfile,
  loadContextConfig,
  loadTokenPolicy,
  resolveContextProfile,
  tokenBudgetFor,
} from './lib/context-policy.mjs';
import { assertStateContract, findRepoRoot, loadProjectState } from './lib/state.mjs';

const root = await findRepoRoot();
const state = await loadProjectState(root);
assertStateContract(state);

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const actualMajor = Number(process.versions.node.split('.')[0]);
const requiredMajor = Number(packageJson.engines.node.match(/>=([0-9]+)/)?.[1] ?? 0);

const failures = [];

try {
  await loadArchitectureContract(root);
} catch (error) {
  failures.push(error instanceof Error ? error.message : 'architecture contract validation failed');
}

if (actualMajor < requiredMajor) {
  failures.push(`Node ${packageJson.engines.node} required; current ${process.versions.node}`);
}

for (const requiredPath of [
  'apps/control-plane',
  'apps/web',
  'packages/orchestration',
  'packages/governance',
  'packages/model-runtime',
  'packages/evidence',
  'packages/telemetry',
  'packages/persistence',
  'packages/contracts',
  'packages/v2-compat',
]) {
  try {
    await fs.access(path.join(root, requiredPath));
  } catch {
    failures.push(`missing ${requiredPath}`);
  }
}

try {
  const tokenPolicy = await loadTokenPolicy(root);
  const contextConfig = await loadContextConfig(root);

  for (const profileName of Object.keys(contextConfig.profiles)) {
    const resolved = resolveContextProfile(contextConfig, profileName);
    const budgetName = budgetNameForContextProfile(profileName);
    tokenBudgetFor(tokenPolicy, budgetName);

    for (const file of resolved.read) {
      try {
        await fs.access(path.join(root, file));
      } catch {
        failures.push(`context profile ${profileName} references missing file ${file}`);
      }
    }
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : 'token/context policy validation failed');
}

if (failures.length > 0) {
  console.error('FreeHighlander doctor FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('FreeHighlander doctor PASS');
console.log(`phase=${state.phase.id} status=${state.phase.status}`);
console.log(`next=${state.active_work.next_action}`);
