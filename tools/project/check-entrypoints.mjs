import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverWorkspacePackages } from './lib/dependency-boundaries.mjs';
import { analyzeWorkspaceEntrypoints } from './lib/workspace-entrypoints.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let workspaces;
try {
  workspaces = await discoverWorkspacePackages(root);
} catch (error) {
  console.error('Workspace entrypoint check FAIL');
  console.error(
    `- unable to discover workspaces: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const result = await analyzeWorkspaceEntrypoints(workspaces);
if (!result.valid) {
  console.error('Workspace entrypoint check FAIL');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Workspace entrypoint check PASS (${result.workspaceCount} workspaces)`);
