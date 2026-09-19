# Model Call Reuse and Deduplication

**Status:** PROPOSED

## Goal

Avoid paying for the same semantic model call more than once.

## Reuse is allowed only when semantic inputs match

A reuse key should eventually include:

~~~text
logical_role
exact_revision
workflow_hash
role_contract_hash
prompt_version
policy_hash
binding/provider/model
reasoning_effort
relevant_input_hash
tool_contract_hash
~~~

If any correctness-relevant component changes, cached semantic output is stale.

## Example

Safe reuse:

~~~text
same HEAD
same role contract
same workflow
same evidence packet
same model/binding
same effort
same policy
~~~

Unsafe reuse:

~~~text
HEAD moved
policy changed
prompt contract changed
evidence changed
different reviewer independence requirement
~~~

## Two cache layers

### Provider prompt cache
Optimization only.

- reduces repeated prefix cost/latency
- never considered authoritative evidence
- provider may miss/evict cache

### FreeHighlander semantic artifact reuse
Application-level correctness decision.

- exact input identity known
- artifact provenance validated
- policy explicitly permits reuse

These are different mechanisms.

## Negative-result rule

Do not bypass:
- FAIL
- BLOCKED
- INSUFFICIENT
- confirmed finding

by re-running different models until a favorable answer appears.

## Quota failure

Availability failures may allow a configured fallback, but:
- attempted bindings are recorded
- independence constraints remain
- semantic results from prior bindings are not erased

## Telemetry

Record:
- cache/reuse attempted
- reuse hit/miss
- invalidation reason
- reused artifact id
- input tokens avoided
- estimated money/time saved

## Future implementation

This contract should become part of FH-07 and V3 model router behavior.
