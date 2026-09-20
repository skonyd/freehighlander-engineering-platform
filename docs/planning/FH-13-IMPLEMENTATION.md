# FH-13 — Workflow DAG and explicit state machine

**Issue:** #45  
**Status:** COMPLETE  
**Authority effect:** NONE

## Objective

Implement immutable, semantically versioned workflow definitions and deterministic run-state semantics without granting or changing authority.

## Contract

- published workflow definitions are immutable snapshots;
- node IDs and edge references are unique and validated;
- graph edges form a DAG;
- iterative behavior exists only inside explicit bounded LOOP nodes;
- identical definitions produce identical workflow hashes;
- run snapshots bind workflow hash, exact role versions, policy hash, resolved bindings and provider capability snapshots;
- node states are explicit and transitions fail closed;
- predecessor failure/blocking deterministically blocks dependents;
- provider/model choices never change state semantics;
- V3 remains SHADOW_ONLY until FH-20.

## Acceptance

- duplicate nodes/edges rejected;
- unknown edge references rejected;
- cycles rejected;
- LOOP without maxIterations rejected;
- independent roots start READY;
- PASSED predecessors unlock dependents;
- FAILED/BLOCKED predecessors propagate BLOCKED;
- illegal transitions rejected;
- run snapshot hash stable for semantically identical inputs;
- workflow configuration cannot grant authority;
- protected-main CI passes.
