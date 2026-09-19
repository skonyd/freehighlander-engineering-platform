import fs from 'node:fs/promises';
import path from 'node:path';

import { assertStateContract, findRepoRoot, loadProjectState } from './lib/state.mjs';

const root = await findRepoRoot();
const state = await loadProjectState(root);
assertStateContract(state);

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const requiredMajor = Number(packageJson.engines.node.match(/>=([0-9]+)/)?.[1] ?? 0);
const actualMajor = Number(process.versions.node.split('.')[0]);

if (actualMajor < requiredMajor) {
  throw new Error(`Node ${packageJson.engines.node} required; current ${process.versions.node}`);
}

console.log('FreeHighlander bootstrap preflight OK');
console.log(`Node: ${process.versions.node}`);
console.log(`Package manager contract: ${packageJson.packageManager}`);
console.log('Next: npm install && npm run verify');
