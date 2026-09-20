import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkWorkspaceDependencyBoundaries } from './lib/dependency-boundaries.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const result = await checkWorkspaceDependencyBoundaries(root);

if (!result.valid) {
  console.error('Dependency boundary check FAIL');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Dependency boundary check PASS (${result.workspaceCount} workspaces)`);
}
