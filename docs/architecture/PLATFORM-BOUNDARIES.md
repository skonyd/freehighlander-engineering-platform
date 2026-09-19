# Platform Boundaries

**Status:** DRAFT

## Core
Workflow execution, roles/bindings, provider/tool adapters, policy/authority, event/state, artifacts/evidence, approvals, audit/metrics, replay/simulation.

Core "security reviewer" veya "planning analyst" gibi domain-specific rolleri hard-code etmez.

## Modules
Planning, Development, Testing, Security, Release, Operations, Incident.

## Planes
```text
CONTROL PLANE
  orchestrator / state machine / policy / router / scheduler / artifact-event manager

EXECUTION PLANE
  model providers / Git / deterministic commands / scanners / runtime integrations
```

Provider/model/tool değişikliği core state semantics'i değiştirmemelidir.
