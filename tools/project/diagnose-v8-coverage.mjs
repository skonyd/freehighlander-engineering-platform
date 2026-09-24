import fs from 'node:fs';

const root = '.tmp-v8';
for (const name of fs.readdirSync(root)) {
  const report = JSON.parse(fs.readFileSync(root + '/' + name, 'utf8'));
  for (const script of report.result ?? []) {
    if (!script.url.endsWith('apps/control-plane/dist/local-worktree-backend.js')) continue;
    for (const fn of script.functions ?? []) {
      const zero = (fn.ranges ?? []).filter((range) => range.count === 0);
      if (zero.length > 0) {
        console.log('UNCOVERED', fn.functionName || '<anonymous>', JSON.stringify(zero));
      }
    }
  }
}
