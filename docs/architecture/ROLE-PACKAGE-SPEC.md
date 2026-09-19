# Role Package Specification v1

**Status:** PROPOSED IMPLEMENTATION CONTRACT

## Example

~~~yaml
apiVersion: freehighlander.ai/v1
kind: Role

metadata:
  id: test-reviewer
  version: 3.0.0

spec:
  purpose: Evaluate whether tests adequately verify the active change.

  authority:
    class: FINAL_REVIEWER
    scope:
      - test-sufficiency
    may_block: true
    may_merge: false
    may_lower_risk: false

  risk:
    allowed:
      - NORMAL
      - HIGH
      - CRITICAL

  input:
    contract: schemas/test-review-input-v2.json
    requiredEvidence:
      - exact-head
      - changed-files
      - relevant-diff
      - acceptance-criteria
      - deterministic-test-results

  output:
    schema: schemas/test-review-output-v3.json

  prompt:
    contract: prompts/test-reviewer
    version: 3

  tools:
    allow:
      - repository.read
      - repository.search
      - test.read-results
    deny:
      - repository.write
      - git.merge
      - secrets.read

  data:
    repository:
      read: true
      write: false
    network:
      allowed: false

  independence:
    cannotReviewOwnOutput: true
    mustDifferFromRoles:
      - implementer
    bindingIndependenceRequired: true

  bindings:
    preferred:
      - opus-medium
    fallbacks:
      - gpt-high
    fallbackPolicy: availability-only

  execution:
    timeoutSeconds: 600
    retries: 1

  evaluation:
    benchmarkSuite: test-reviewer-v1
    promotionPolicy: human-approved

  sandbox:
    policy: reviewer-readonly-v1
~~~

## Required fields

- metadata.id
- metadata.version
- spec.purpose
- spec.authority
- spec.input
- spec.output
- spec.prompt
- spec.tools
- spec.independence
- spec.bindings
- spec.execution

## Versioning

Use semantic versioning for role package changes.

### Patch
Non-semantic metadata/doc clarification only.

### Minor
Backward-compatible behavior expansion.

### Major
Authority, input/output contract, required evidence, tool scope or semantic behavior change.

## Validation layers

1. YAML/schema validation
2. known role id/version
3. authority ceiling validation
4. tool permission validation
5. policy/risk compatibility
6. binding/capability compatibility
7. independence compatibility
8. prompt/schema artifact existence
9. hash/version pinning

## Role instance vs role definition

Role definition is reusable.

A workflow node creates a role instance:

~~~text
RoleDefinition test-reviewer@3
          ↓
WorkflowNode pr-test-review
          ↓
Binding opus-medium
          ↓
Run-specific context/evidence
~~~

Run-specific values do not mutate the role definition.

## Import/export

Role packages should remain portable:
- one YAML manifest
- referenced prompt/schema artifacts
- deterministic hashes

UI eventually imports/exports this package format.
