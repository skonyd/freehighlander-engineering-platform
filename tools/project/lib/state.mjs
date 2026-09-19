import fs from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

export async function findRepoRoot(start = process.cwd()) {
  let current = path.resolve(start);

  while (true) {
    try {
      await fs.access(path.join(current, '.git'));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        throw new Error('Not inside a FreeHighlander git repository');
      }
      current = parent;
    }
  }
}

export async function loadProjectState(root) {
  const file = path.join(root, '.freehighlander', 'state.yaml');
  const raw = await fs.readFile(file, 'utf8');
  const state = YAML.parse(raw);

  if (!state || typeof state !== 'object') {
    throw new Error('Invalid .freehighlander/state.yaml');
  }

  return state;
}

export function assertStateContract(state) {
  const errors = [];

  if (state.schema_version !== 1) errors.push('schema_version must be 1');
  if (state.project !== 'freehighlander-engineering-platform') errors.push('unexpected project');
  if (state.repository !== 'skonyd/freehighlander-engineering-platform') {
    errors.push('unexpected repository');
  }
  if (!state.phase?.id) errors.push('phase.id is required');
  if (!state.active_work?.next_action) errors.push('active_work.next_action is required');
  if (state.accepted_direction?.implementation_language !== 'TypeScript') {
    errors.push('implementation language must remain TypeScript');
  }
  if (state.accepted_direction?.fallback !== 'availability-only') {
    errors.push('fallback policy must remain availability-only');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
}
