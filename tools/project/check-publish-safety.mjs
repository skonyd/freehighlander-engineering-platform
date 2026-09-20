import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverWorkspacePackages } from './lib/dependency-boundaries.mjs';
import { analyzePublishSafety } from './lib/publish-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let rootManifest;
let workspaces;

try {
  rootManifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  workspaces = await discoverWorkspacePackages(root);
} catch (error) {
  console.error('Publish safety check FAIL');
  console.error(
    `- unable to inspect workspace manifests: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const result = analyzePublishSafety(rootManifest, workspaces);

if (!result.valid) {
  console.error('Publish safety check FAIL');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Publish safety check PASS (${result.workspaceCount} private workspaces)`);
