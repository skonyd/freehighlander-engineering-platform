---
applyTo: "automation/**,.freehighlander/**,packages/policy/**,packages/workflow/**,packages/artifacts/**"
---

Treat automation, policy, workflow authority and trusted state as sensitive/high-risk areas.

Preserve:
- exact revision binding
- producer/reviewer separation
- trusted provenance ownership
- fail-closed unknown states
- availability-only model fallback
- human-required boundaries

Never manually forge a semantic gate result or trusted artifact metadata.

Changes to authority semantics require explicit review and an ADR or accepted decision when they alter system policy.
