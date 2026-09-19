# FH-01A — Platform Bootstrap

**Status:** IN PROGRESS  
**Issue:** #15

FH-01A starts executable product foundations without importing unfinished Creator Marketplace #207 authority behavior.

## Toolchain

Pinned for the bootstrap:
- Node.js 24.21.0 LTS
- npm 11.19.1 workspaces
- TypeScript 7.0.2
- Prettier 3.9.8
- Node built-in test runner
- Zod 4.6.5
- YAML 2.9.1

No monorepo build framework is introduced yet.

## Scope

- bounded-context monorepo
- control-plane/web skeletons
- ProviderAdapter and failure taxonomy
- role/workflow serialized contracts
- authority primitives
- evidence/artifact metadata
- telemetry event contract
- persistence ports
- read-only bootstrap/doctor/resume tooling
- safe checkpoint preview
- architecture/state validation
- CI

## Safety boundary

`automation/legacy-v2/` remains documentation-only.

No exact-SHA gate port, trusted store, candidate adjudication, Opus/Astra authority or human/merge terminal logic is implemented in FH-01A. Those belong to FH-01B after #207 closes.
