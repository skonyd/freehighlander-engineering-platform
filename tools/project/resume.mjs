import { assertStateContract, findRepoRoot, loadProjectState } from './lib/state.mjs';
import { collectRepositoryReconciliation } from './lib/reconciliation.mjs';

const root = await findRepoRoot();
const state = await loadProjectState(root);
assertStateContract(state);

const reconciliation = await collectRepositoryReconciliation(root, state);

console.log('FreeHighlander resume');
console.log(`phase: ${state.phase.id} / ${state.phase.name} / ${state.phase.status}`);
console.log(`objective: ${state.active_work.objective}`);
console.log(`next action: ${state.active_work.next_action}`);
console.log(`state branch: ${reconciliation.expectedBranch ?? 'none'}`);
console.log(`local branch: ${reconciliation.localBranch ?? 'none'}`);
console.log(`local HEAD: ${reconciliation.localHead ?? 'none'}`);
console.log(`remote HEAD: ${reconciliation.remoteHead ?? 'none'}`);
console.log(`remote reconciliation: ${reconciliation.canonical ? 'PASS' : 'STALE'}`);

if (state.active_work.pull_request !== null && state.active_work.pull_request !== undefined) {
  console.log(`active PR: #${state.active_work.pull_request}`);
}

if (state.external_dependency) {
  console.log(
    `external dependency: ${state.external_dependency.repository}#${state.external_dependency.pull_request}`,
  );
}

if (state.fh01b?.promotion?.status === 'blocked') {
  console.log(`FH-01B2 blocked: ${state.fh01b.promotion.blocker}`);
}

for (const warning of reconciliation.warnings) console.log(`warning: ${warning}`);
for (const error of reconciliation.errors) console.error(`stale: ${error}`);

if (!reconciliation.canonical) process.exitCode = 2;
