# Workflow Specification v1

**Status:** PROPOSED IMPLEMENTATION CONTRACT

## Example

~~~yaml
apiVersion: freehighlander.ai/v1
kind: Workflow

metadata:
  id: pr-review
  version: 1.0.0

spec:
  entry: triage

  nodes:
    triage:
      type: MODEL
      role: context-triage@1
      next: verify

    verify:
      type: GATE
      command: verify
      onPass: council
      onFail: stop

    council:
      type: DEBATE
      participants:
        - architecture-reviewer@1
        - test-reviewer@3
      strategy: adjudicator
      maxRounds: 2
      adjudicator: final-reviewer@2
      next: human

    human:
      type: HUMAN
      policy: critical-approval-v1
~~~

## Required workflow metadata

- id
- semantic version
- content hash
- entry node
- node graph
- referenced role versions
- policy references

## Node common fields

Each node may declare:
- id
- type
- timeout
- retry
- budget
- risk constraints
- input mapping
- output mapping
- transitions
- artifact retention

## Validation

Before publish:
1. schema validation
2. graph reachability
3. missing reference detection
4. unbounded loop detection
5. authority compatibility
6. role/binding capability compatibility
7. human-required path validation
8. cycle validation
9. budget validation

## Publish rule

A published workflow version is immutable.

Changes create a new version.

## Run binding

At run start create a snapshot containing:
- workflow hash
- role versions
- policy hash
- resolved bindings
- provider capability snapshot

This snapshot is the run's execution contract.
