import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  collectRepositoryReconciliation,
  assertSafeCheckpointWorktree,
  checkpointCanInferSemanticGatePass,
} from './lib/reconciliation.mjs';
import { assertStateContract, findRepoRoot, loadProjectState } from './lib/state.mjs';

const root = await findRepoRoot();
const state = await loadProjectState(root);
assertStateContract(state);

const runGit = (args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

assertSafeCheckpointWorktree(runGit(['status', '--porcelain']));

const reconciliation = await collectRepositoryReconciliation(root, state, { runGit });
if (!reconciliation.canonical) {
  console.error('Checkpoint refused: repository pointers are stale.');
  for (const error of reconciliation.errors) console.error(`- ${error}`);
  process.exit(2);
}

const write = process.argv.includes('--write');
if (!write) {
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        repository: state.repository,
        phase: state.phase.id,
        status: state.phase.status,
        branch: reconciliation.localBranch,
        head: reconciliation.localHead,
        remoteHead: reconciliation.remoteHead,
        nextAction: state.active_work.next_action,
        canonical: true,
        semanticGatePassInferred: checkpointCanInferSemanticGatePass(),
        writeRequiredForNewCheckpoint: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (reconciliation.localBranch === 'main') {
  console.error('Checkpoint refused: --write requires a feature branch, never protected main.');
  process.exit(2);
}

const historyFile = path.join(root, 'HISTORY.md');
let history = '';
try {
  history = await fs.readFile(historyFile, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  history = '# Project Checkpoint History\n\n';
}

const timestamp = new Date().toISOString();
const entry = [
  `## ${timestamp} — ${state.phase.id}`,
  '',
  `- branch: \`${reconciliation.localBranch}\``,
  `- head_before_checkpoint: \`${reconciliation.localHead}\``,
  `- status: \`${state.phase.status}\``,
  `- next_action: ${state.active_work.next_action}`,
  '- semantic_gate_pass_inferred: false',
  '',
].join('\n');

await fs.writeFile(historyFile, `${history.trimEnd()}\n\n${entry}`, 'utf8');
runGit(['add', 'HISTORY.md']);
runGit(['commit', '-m', `chore(checkpoint): ${state.phase.id} handoff`]);

const checkpointHead = runGit(['rev-parse', 'HEAD']);
runGit(['push', 'origin', `HEAD:${reconciliation.localBranch}`]);
const remoteLine = runGit(['ls-remote', 'origin', `refs/heads/${reconciliation.localBranch}`]);
const pushedHead = remoteLine.split(/\s+/)[0] ?? '';

if (pushedHead !== checkpointHead) {
  console.error('Checkpoint push verification failed.');
  process.exit(3);
}

console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      repository: state.repository,
      phase: state.phase.id,
      branch: reconciliation.localBranch,
      checkpointHead,
      remoteHead: pushedHead,
      canonical: true,
      semanticGatePassInferred: false,
      history: 'HISTORY.md',
    },
    null,
    2,
  ),
);
