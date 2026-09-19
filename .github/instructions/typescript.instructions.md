---
applyTo: "**/*.ts,**/*.tsx"
---

FreeHighlander TypeScript implementation begins in FH-01.

Before changing code, identify the active work item and acceptance criteria.

Keep domain/core logic independent of model/provider-specific SDK details. Provider-specific behavior belongs behind adapters.

Logical role identity must not be encoded as a concrete model name.

Deterministic gates, authority validation and provenance checks fail closed.

Add or update tests for changed behavior. Do not weaken tests merely to make a change pass.

Do not log secrets or full provider credentials.
