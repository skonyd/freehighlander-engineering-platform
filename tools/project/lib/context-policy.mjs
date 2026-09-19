import fs from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

export async function loadTokenPolicy(root) {
  const policy = await loadYaml(path.join(root, '.freehighlander', 'token-policy.yaml'));
  assertTokenPolicy(policy);
  return policy;
}

export function assertTokenPolicy(policy) {
  if (!isRecord(policy) || policy.schema_version !== 1) {
    throw new Error('token policy schema_version must be 1');
  }

  if (!isRecord(policy.budgets)) {
    throw new Error('token policy budgets are required');
  }

  for (const [name, budget] of Object.entries(policy.budgets)) {
    if (!isRecord(budget)) {
      throw new Error(`token budget ${name} must be an object`);
    }

    const target = budget.target_input_tokens;
    const hardWarn = budget.hard_warn_tokens;
    if (!isPositiveInteger(target) || !isPositiveInteger(hardWarn)) {
      throw new Error(`token budget ${name} values must be positive integers`);
    }
    if (target > hardWarn) {
      throw new Error(`token budget ${name} target cannot exceed hard warning`);
    }
  }

  if (policy.tool_context?.preserve_authoritative_evidence !== true) {
    throw new Error('token policy must preserve authoritative evidence');
  }

  const order = policy.prompt_layout?.order;
  if (!Array.isArray(order) || order.length === 0) {
    throw new Error('token policy prompt_layout.order is required');
  }
}

export function tokenBudgetFor(policy, name) {
  assertTokenPolicy(policy);
  const budget = policy.budgets[name];
  if (!isRecord(budget)) {
    throw new Error(`unknown token budget: ${name}`);
  }

  return {
    targetInputTokens: budget.target_input_tokens,
    hardWarnTokens: budget.hard_warn_tokens,
  };
}

export async function loadContextConfig(root) {
  const config = await loadYaml(path.join(root, '.freehighlander', 'context.yaml'));
  assertContextConfig(config);
  return config;
}

export function assertContextConfig(config) {
  if (!isRecord(config) || config.schema_version !== 1) {
    throw new Error('context schema_version must be 1');
  }
  if (typeof config.default_profile !== 'string' || !config.default_profile.trim()) {
    throw new Error('context default_profile is required');
  }
  if (!isRecord(config.profiles)) {
    throw new Error('context profiles are required');
  }
  if (!isRecord(config.profiles[config.default_profile])) {
    throw new Error('context default_profile must exist');
  }
}

export function resolveContextProfile(config, name) {
  assertContextConfig(config);

  const stack = [];
  const resolved = resolveProfile(config.profiles, name, stack);
  return {
    name,
    purpose: resolved.purpose,
    ancestry: resolved.ancestry,
    read: resolved.read.map((entry) => entry.path),
    readReasons: resolved.read,
    then: resolved.then,
    dynamic: resolved.dynamic,
    rules: resolved.rules,
  };
}

export function budgetNameForContextProfile(profileName) {
  if (profileName === 'resume-minimal') return 'resume';
  if (['planning', 'implementation', 'review'].includes(profileName)) return profileName;
  throw new Error(`no token budget mapping for context profile: ${profileName}`);
}

function resolveProfile(profiles, name, stack) {
  const profile = profiles[name];
  if (!isRecord(profile)) {
    throw new Error(`unknown context profile: ${name}`);
  }
  if (stack.includes(name)) {
    throw new Error(`context profile inheritance cycle: ${[...stack, name].join(' -> ')}`);
  }

  const nextStack = [...stack, name];
  let parent = emptyResolvedProfile();
  if (profile.extends !== undefined) {
    if (typeof profile.extends !== 'string' || !profile.extends.trim()) {
      throw new Error(`context profile ${name} has invalid extends`);
    }
    parent = resolveProfile(profiles, profile.extends, nextStack);
  }

  const ownRead = stringArray(profile.read, `${name}.read`).map((entry) => ({
    path: entry,
    introducedBy: name,
  }));

  return {
    purpose:
      typeof profile.purpose === 'string' && profile.purpose.trim()
        ? profile.purpose
        : parent.purpose,
    ancestry: unique([...parent.ancestry, name]),
    read: uniqueRead([...parent.read, ...ownRead]),
    then: unique([...parent.then, ...stringArray(profile.then, `${name}.then`)]),
    dynamic: unique([...parent.dynamic, ...stringArray(profile.dynamic, `${name}.dynamic`)]),
    rules: unique([...parent.rules, ...stringArray(profile.rules, `${name}.rules`)]),
  };
}

function emptyResolvedProfile() {
  return {
    purpose: '',
    ancestry: [],
    read: [],
    then: [],
    dynamic: [],
    rules: [],
  };
}

function stringArray(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`${name} must be an array of non-empty strings`);
  }
  return value;
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueRead(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });
}

async function loadYaml(file) {
  const raw = await fs.readFile(file, 'utf8');
  const parsed = YAML.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error(`invalid YAML object: ${file}`);
  }
  return parsed;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}
