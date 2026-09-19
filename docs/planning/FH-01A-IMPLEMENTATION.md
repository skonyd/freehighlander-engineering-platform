# FH-01A — Platform Bootstrap

**Status:** COMPLETE  
**Issue:** #15  
**Pull Request:** #17

FH-01A establishes executable FreeHighlander foundations without importing unfinished Creator Marketplace #207 authority behavior.

## Toolchain

Pinned for the bootstrap:
- Node.js 24.21.0
- npm 11.19.1 workspaces
- TypeScript 7.0.2
- Prettier 3.9.8
- Node built-in test runner
- Zod 4.6.5
- YAML 2.9.1

No monorepo build framework is introduced yet.

## Delivered

- bounded-context monorepo
- control-plane/web skeletons
- ProviderAdapter and failure taxonomy
- role/workflow serialized contracts
- authority/fallback primitives
- evidence/artifact metadata
- telemetry event contract
- persistence ports
- bounded orchestration primitive
- bootstrap/doctor/resume tooling
- safe checkpoint preview
- architecture/state validation
- GitHub Actions CI
- deterministic tests

## Safety boundary

`automation/legacy-v2/` remains documentation-only.

FH-01A does not implement:
- accepted V2 exact-SHA gate semantics
- trusted artifact writer
- candidate/adjudication mechanics
- Opus/Astra authority
- human/merge terminal behavior

Those belong to FH-01B after Creator Marketplace #207 final acceptance, merge and post-merge smoke.

## Acceptance

Canonical verification command:

~~~bash
npm install --package-lock=false --ignore-scripts --no-audit --no-fund
npm run verify
~~~

The final FH-01A PR must be green before merge.
