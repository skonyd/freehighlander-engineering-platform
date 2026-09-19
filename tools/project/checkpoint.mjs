import { execFileSync } from 'node:child_process';

import { assertStateContract, findRepoRoot, loadProjectState } from './lib/state.mjs';

const root = await findRepoRoot();
const state = await loadProjectState(root);
assertStateContract(state);

const status = execFileSync('git', ['status', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
}).trim();

if (status) {
  console.error('Checkpoint refused: worktree is dirty.');
  process.exit(2);
}

const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();

console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      repository: state.repository,
      phase: state.phase.id,
      status: state.phase.status,
      head,
      nextAction: state.active_work.next_action,
      canonical: false,
      note: 'FH-01A checkpoint is a safe preview; canonical mutation/remote reconciliation remains issue #10.',
    },
    null,
    2,
  ),
);
