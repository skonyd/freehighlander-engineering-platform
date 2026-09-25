#!/usr/bin/env node

import {
  preparePortableResumeRepository,
} from './lib/portable-resume-bootstrap.mjs';

try {
  const { repository, options } = parseArgs(process.argv.slice(2));
  const workspaceRoot = requireOption(options, 'workspace');
  const directoryName = option(options, 'directory');

  const result = preparePortableResumeRepository({
    repository,
    workspaceRoot,
    directoryName,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FreeHighlander portable resume bootstrap FAIL: ${message}`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const [repository, ...rest] = args;
  if (typeof repository !== 'string' || !repository.trim() || repository.startsWith('--')) {
    throw new Error('repository owner/name is required');
  }

  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!name || Object.hasOwn(options, name)) {
      throw new Error(`invalid or duplicate option: ${token}`);
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`option requires a value: ${token}`);
    }
    options[name] = value;
    index += 1;
  }
  return { repository, options };
}

function requireOption(options, name) {
  const value = option(options, name);
  if (value === null) throw new Error(`--${name} is required`);
  return value;
}

function option(options, name) {
  const value = options[name];
  if (value === undefined) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`--${name} must be a non-empty value`);
  }
  return value;
}
