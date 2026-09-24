import fs from 'node:fs';

const root = '.tmp-v8';
const sourcePath = 'apps/control-plane/dist/local-worktree-backend.js';
const source = fs.readFileSync(sourcePath, 'utf8');

for (const name of fs.readdirSync(root)) {
  const report = JSON.parse(fs.readFileSync(root + '/' + name, 'utf8'));
  for (const script of report.result ?? []) {
    if (!script.url.endsWith(sourcePath)) continue;
    for (const fn of script.functions ?? []) {
      const zero = (fn.ranges ?? []).filter((range) => range.count === 0);
      for (const range of zero) {
        const start = Math.max(0, range.startOffset - 80);
        const end = Math.min(source.length, range.endOffset + 80);
        console.log(
          'UNCOVERED',
          fn.functionName || '<anonymous>',
          JSON.stringify(range),
          JSON.stringify(source.slice(start, end)),
        );
      }
    }
  }
}
