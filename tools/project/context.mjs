import {
  budgetNameForContextProfile,
  loadContextConfig,
  loadTokenPolicy,
  resolveContextProfile,
  tokenBudgetFor,
} from './lib/context-policy.mjs';
import { findRepoRoot } from './lib/state.mjs';

const root = await findRepoRoot();
const contextConfig = await loadContextConfig(root);
const tokenPolicy = await loadTokenPolicy(root);
const profileName = process.argv[2] ?? contextConfig.default_profile;
const profile = resolveContextProfile(contextConfig, profileName);
const budgetName = budgetNameForContextProfile(profileName);
const budget = tokenBudgetFor(tokenPolicy, budgetName);

console.log(`profile=${profile.name}`);
console.log(`purpose=${profile.purpose}`);
console.log(`ancestry=${profile.ancestry.join(' -> ')}`);
console.log(`token_target=${budget.targetInputTokens}`);
console.log(`token_hard_warn=${budget.hardWarnTokens}`);

for (const entry of profile.readReasons) {
  console.log(`read=${entry.path} reason=profile:${entry.introducedBy}`);
}
for (const entry of profile.dynamic) {
  console.log(`dynamic=${entry}`);
}
for (const entry of profile.rules) {
  console.log(`rule=${entry}`);
}
