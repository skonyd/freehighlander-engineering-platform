import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeBuildCompleteness } from './lib/build-completeness.mjs';
import { discoverWorkspacePackages } from './lib/dependency-boundaries.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let workspaces;
let baseConfig;
try {
  workspaces = await discoverWorkspacePackages(root);
  baseConfig = JSON.parse(await fs.readFile(path.join(root, 'tsconfig.base.json'), 'utf8'));
} catch (error) {
  console.error('Build completeness check FAIL');
  console.error(
    `- unable to load build completeness inputs: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const result = await analyzeBuildCompleteness(root, workspaces, baseConfig);
if (!result.valid) {
  console.error('Build completeness check FAIL');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Build completeness check PASS (${result.workspaceCount} workspaces, ${result.sourceModuleCount} source modules)`,
);
