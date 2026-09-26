#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';

import { findRepoRoot } from './lib/state.mjs';
import {
  buildRunInspectorReport,
  loadRunEvents,
  projectRunInspectorReportToOtel,
} from './lib/run-inspector.mjs';

try {
  const root = await findRepoRoot();
  const options = parseArgs(process.argv.slice(2));
  const runId = requireOption(options, 'run');
  const databasePath =
    options.db ??
    process.env.FREEHIGHLANDER_DB ??
    path.join(root, '.freehighlander', 'runtime', 'freehighlander.sqlite');
  const limit = options.limit === undefined ? 10_000 : Number(options.limit);
  const events = loadRunEvents(databasePath, runId, limit);
  if (events.length === 0) throw new Error(`run not found: ${runId}`);

  const report = buildRunInspectorReport(events);
  const format = options.format ?? 'report';
  if (format !== 'report' && format !== 'otel') {
    throw new Error('--format must be report or otel');
  }
  const output = format === 'otel' ? projectRunInspectorReportToOtel(report) : report;
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      {
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'unknown run inspector error',
      },
      null,
      2,
    ) + '\n',
  );
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!name || value === undefined || value.startsWith('--')) {
      throw new Error(`--${name || 'option'} requires a value`);
    }
    options[name] = value;
    index += 1;
  }
  return options;
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`--${name} is required`);
  return value;
}
