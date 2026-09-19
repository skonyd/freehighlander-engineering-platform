import fs from 'node:fs/promises';
import path from 'node:path';

import { assertStateContract, findRepoRoot, loadProjectState } from './lib/state.mjs';

const root = await findRepoRoot();
const state = await loadProjectState(root);
assertStateContract(state);

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const actualMajor = Number(process.versions.node.split('.')[0]);
const requiredMajor = Number(packageJson.engines.node.match(/>=([0-9]+)/)?.[1] ?? 0);

const failures = [];
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

if (failures.length > 0) {
  console.error('FreeHighlander doctor FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('FreeHighlander doctor PASS');
console.log(`phase=${state.phase.id} status=${state.phase.status}`);
console.log(`next=${state.active_work.next_action}`);
