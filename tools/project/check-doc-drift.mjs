import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];

const state = YAML.parse(
  await fs.readFile(path.join(root, '.freehighlander', 'state.yaml'), 'utf8'),
);
const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8');
const backlog = await fs.readFile(path.join(root, 'BACKLOG.md'), 'utf8');
const projectState = await fs.readFile(path.join(root, 'PROJECT_STATE.md'), 'utf8');
const roadmap = await fs.readFile(path.join(root, 'docs', 'ROADMAP.md'), 'utf8');
const prRoadmap = await fs.readFile(path.join(root, 'docs', 'planning', 'PR-ROADMAP.md'), 'utf8');

expect(state.phase?.id, 'PRE-CUTOVER', 'state phase');
expect(state.phase?.status, 'blocked_on_external_dependency', 'state phase status');
expect(state.active_work?.branch, 'main', 'state active branch');
if (state.active_work?.pull_request !== null) {
  failures.push('state active_work.pull_request must be null while waiting on external dependency');
}
expect(state.fh01b?.promotion?.status, 'blocked', 'FH-01B2 promotion state');
expect(state.fh20?.cutover_allowed, false, 'FH-20 cutover state');
expect(state.fh20?.v3_authority, 'SHADOW_ONLY', 'V3 authority state');

for (const key of ['fh30a', 'fh31a', 'fh32a', 'fh33a', 'fh34a', 'fh35a', 'fh36a', 'fh37a']) {
  expect(state[key]?.status, 'complete', `${key} state`);
}

expect(
  state.pre_cutover_hardening?.status,
  'complete_through_lockfile_provenance_gate',
  'pre-cutover hardening state',
);

for (const [documentName, content, required] of [
  [
    'README.md',
    readme,
    [
      'FH-30A..FH-37A authority-neutral SDLC preparation lane tamamlandı.',
      'V3 authority = SHADOW_ONLY',
      'FH-01B2 final V2 reconciliation/parity',
    ],
  ],
  [
    'BACKLOG.md',
    backlog,
    [
      '[x] Architecture dependency-boundary enforcement — issue #105 / PR #106',
      'Roadmap/state/documentation drift cleanup — issue #107 / PR #108',
      'Reproducible CI / npm lockfile / immutable Action SHA pinning — issue #109 / PR #110',
      'Checkout credential isolation + bounded dependency-update hygiene — issue #111 / PR #112',
      'Deterministic tracked-secret leakage gate — issue #114 / PR #117',
      'Pinned GitHub Actions v7 current-main refresh — issue #118 / PR #119',
      'Native Node per-workspace coverage regression gate — issue #120 / PR #121',
      'Control-plane test/coverage gap closure (19/19 workspaces) — issue #122 / PR #123',
      'Secret-handle + EPHEMERAL injection contract — issue #124 / PR #125',
      'Lockfile provenance + integrity + install-script gate — issue #126 / PR #127',
      'FH-30B..FH-37B',
    ],
  ],
  [
    'PROJECT_STATE.md',
    projectState,
    [
      'PRE-CUTOVER PREPARATION COMPLETE / FH-01B2 + FH-20 CUTOVER BLOCKED',
      'FH-37A Engineering Lineage',
      'workspace dependency-boundary enforcement',
      '#109 / PR #110 — reproducible CI',
      '#111 / PR #112 — checkout credential isolation',
      '#114 / PR #117 — deterministic git-tracked secret leakage gate',
      '#118 / PR #119 — reviewed current-main refresh',
      '#120 / PR #121 — Node 24 native per-workspace coverage regression floors',
      '#122 / PR #123 — control-plane contract tests',
      '#124 / PR #125 — opaque SecretHandle',
      '#126 / PR #127 — deterministic npm lockfile provenance',
    ],
  ],
  [
    'docs/ROADMAP.md',
    roadmap,
    [
      'FH-30A..FH-37A COMPLETE / B-lane BLOCKED',
      'READINESS COMPLETE / CUTOVER BLOCKED',
      'Pre-cutover hardening — COMPLETE THROUGH LOCKFILE PROVENANCE GATE',
    ],
  ],
  [
    'docs/planning/PR-ROADMAP.md',
    prRoadmap,
    [
      'FH-01B2 final accepted-V2 reconciliation',
      'FH-30A..FH-37A complete and authority-neutral.',
      'repository hygiene',
      'lockfile provenance enforcement is complete',
      'Creator Marketplace #207',
    ],
  ],
]) {
  for (const marker of required) {
    if (!content.includes(marker))
      failures.push(`${documentName} missing current-state marker: ${marker}`);
  }
}

for (const [documentName, content, stalePhrases] of [
  [
    'README.md',
    readme,
    [
      'Şu anda FH-00 planning foundation tamamlanmış ve review aşamasındadır.',
      'FH-01, #207 final acceptance + merge + post-merge smoke sonrasında başlar.',
    ],
  ],
  ['BACKLOG.md', backlog, ['issue #78 / PR #79 active']],
  ['PROJECT_STATE.md', projectState, ['## FH-33A active', 'FH-33A Security — active as issue #78']],
  [
    'docs/planning/PR-ROADMAP.md',
    prRoadmap,
    ['Creator Marketplace #207 merge+smoke sonrası başlar.'],
  ],
]) {
  for (const phrase of stalePhrases) {
    if (content.includes(phrase)) failures.push(`${documentName} contains stale phrase: ${phrase}`);
  }
}

if (failures.length > 0) {
  console.error('Documentation drift check FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Documentation drift check PASS');

function expect(actual, expected, label) {
  if (actual !== expected) {
    failures.push(`${label} expected ${String(expected)}, got ${String(actual)}`);
  }
}
