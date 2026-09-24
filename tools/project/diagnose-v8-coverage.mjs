import fs from 'node:fs';

const root = '.tmp-v8';
const sourcePath = 'apps/control-plane/dist/local-worktree-backend.js';
const source = fs.readFileSync(sourcePath, 'utf8');

for (const name of fs.readdirSync(root)) {
  const report = JSON.parse(fs.readFileSync(root + '/' + name, 'utf8'));
  for (const script of report.result ?? []) {
    if (!script.url.endsWith(sourcePath)) continue;
    for (const fn of script.functions ?? []) {
      for (const range of (fn.ranges ?? []).filter((candidate) => candidate.count === 0)) {
        if (range.endOffset - range.startOffset > 500) continue;
        console.log(
          'UNCOVERED_EXACT',
          fn.functionName || '<anonymous>',
          JSON.stringify(range),
          JSON.stringify(source.slice(range.startOffset, range.endOffset)),
        );
      }
    }
  }
}
