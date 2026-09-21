import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverWorkspacePackages } from './lib/dependency-boundaries.mjs';
import { analyzeWorkspaceResolution } from './lib/workspace-resolution.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let workspaces;
let lockfile;
try {
  workspaces = await discoverWorkspacePackages(root);
  lockfile = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
} catch (error) {
  console.error('Workspace resolution check FAIL');
  console.error(
    `- unable to load workspace resolution inputs: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const result = analyzeWorkspaceResolution(workspaces, lockfile);
if (!result.valid) {
  console.error('Workspace resolution check FAIL');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Workspace resolution check PASS (${result.workspaceCount} local workspaces)`);
