import { assertStateContract, findRepoRoot, loadProjectState } from './lib/state.mjs';

const root = await findRepoRoot();
const state = await loadProjectState(root);
assertStateContract(state);

console.log('FreeHighlander resume');
console.log(`phase: ${state.phase.id} / ${state.phase.name} / ${state.phase.status}`);
console.log(`objective: ${state.active_work.objective}`);
console.log(`next action: ${state.active_work.next_action}`);

if (state.external_dependency) {
  console.log(
    `external dependency: ${state.external_dependency.repository}#${state.external_dependency.pull_request}`,
  );
}

if (state.fh01b?.status === 'blocked') {
  console.log(`FH-01B blocked: ${state.fh01b.blocker}`);
}
