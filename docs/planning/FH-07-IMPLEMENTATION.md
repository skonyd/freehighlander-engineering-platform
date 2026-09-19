# FH-07 — Token/context optimization implementation

**Status:** IN PROGRESS  
**Canonical issue:** #11  
**Branch:** `feat/fh-07-context-token-optimization`

## Objective

Make context selection, prompt-prefix identity, token budgeting and cache/reuse diagnostics executable without changing model authority or removing evidence required by a gate.

## Non-negotiable invariants

- optimization is authority-neutral;
- required evidence is never dropped to satisfy a token budget;
- final-review/full-diff requirements remain authoritative where configured;
- cache/reuse is an optimization, never a correctness assumption;
- semantic model-shopping/fallback is out of scope;
- prompt, contract, policy and revision identity must be explicit and hash-bound.

## Delivery slices

### FH-07A — deterministic context identity

- context packet manifest;
- per-item content hashes;
- packet hash;
- prompt/role/policy/workflow hash inputs;
- semantic model-call reuse key;
- deterministic tests for order/content/revision sensitivity.

### FH-07B — token budget/preflight

- context-profile budget loader;
- target vs hard-warn evaluation;
- provider token-count capability contract;
- estimate-vs-actual diagnostics;
- required-evidence preservation guard.

### FH-07C — cache/reuse diagnostics

- stable prefix identity/version;
- cache hit/write metadata;
- duplicate-call detection;
- artifact reuse decision contract;
- explicit reuse rejection reasons.

### FH-07D — telemetry/read-model integration

- context packet/reuse/budget events;
- cached-input share and repeated-call waste metrics;
- role × model token/cost views.

### FH-07E — integration/acceptance

- architecture guards;
- full deterministic verify;
- docs/state update;
- post-merge smoke.

## FH-07A acceptance criteria

1. Same semantic inputs produce the same packet hash and reuse key.
2. Content, exact revision, role contract, workflow/policy/prompt version or model binding changes invalidate reuse identity.
3. Raw prompt/evidence content is not required in the reuse key; hashes are sufficient.
4. Packet manifest preserves ordered context layout so stable-prefix placement is observable.
5. Nothing in FH-07A can grant, downgrade or bypass authority.
