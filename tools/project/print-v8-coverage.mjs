import fs from 'node:fs/promises';
import path from 'node:path';

const directory = '/tmp/fh-v8cov';
const targetSuffix = '/apps/control-plane/dist/local-worktree-backend.js';
const sourcePath = path.resolve('apps/control-plane/dist/local-worktree-backend.js');
const source = await fs.readFile(sourcePath, 'utf8');

function position(offset) {
  const before = source.slice(0, offset);
  const parts = before.split('\n');
  return { line: parts.length, column: parts.at(-1)?.length ?? 0 };
}

for (const name of await fs.readdir(directory)) {
  if (!name.endsWith('.json')) continue;
  const payload = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
  for (const script of payload.result ?? []) {
    if (!String(script.url).endsWith(targetSuffix)) continue;
    console.log('V8 COVERAGE FILE', name, script.url);
    for (const fn of script.functions ?? []) {
      for (const range of fn.ranges ?? []) {
        if (range.count !== 0) continue;
        const start = position(range.startOffset);
        const end = position(range.endOffset);
        console.log(
          JSON.stringify({
            functionName: fn.functionName,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
            start,
            end,
            excerpt: source.slice(range.startOffset, Math.min(range.endOffset, range.startOffset + 240)),
          }),
        );
      }
    }
  }
}
