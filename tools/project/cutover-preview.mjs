#!/usr/bin/env node

import process from 'node:process';

import { runCutoverPreviewCommand } from './lib/cutover-preview.mjs';

try {
  const result = runCutoverPreviewCommand(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      {
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'unknown cutover preview error',
        authority: 'NONE',
      },
      null,
      2,
    ) + '\n',
  );
  process.exitCode = 1;
}
