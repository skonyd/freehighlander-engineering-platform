# Context Packet Contract

**Status:** PROPOSED

## Goal

Model calls should receive the **smallest sufficient evidence packet**, not an arbitrary dump of repository state.

A context packet is a deterministic, auditable input bundle for one logical role.

## Required metadata

Every packet should identify:

- packet schema version
- run id
- task/work item id
- repository
- base revision
- head revision
- workflow/version
- logical role
- context profile
- risk tier
- packet content hash
- referenced artifact ids
- included file paths
- excluded/truncated sections

## Packet classes

### resume
Purpose:
- reconstruct current work state

Contains:
- active phase
- branch/PR
- blockers
- next action
- relevant accepted decisions

### planning
Purpose:
- architecture/product reasoning

Contains:
- requirements
- NFR
- accepted ADRs
- risks
- active decision question

### implementation
Purpose:
- bounded change

Contains:
- active work item
- directly affected code/docs
- acceptance criteria
- related ADRs
- test requirements

### review
Purpose:
- independent evidence-based review

Contains:
- exact diff
- acceptance criteria
- deterministic verification evidence
- relevant authority/security rules
- prior findings only when protocol allows reviewer visibility

## Inclusion rule

A context item must have a reason.

Future packet builders should emit a manifest such as:

~~~json
{
  "path": "packages/workflow/router.ts",
  "reason": "changed-file",
  "source": "git-diff"
}
~~~

This allows token/cost analysis to answer **why** a document was sent.

## Exclusion rule

Do not include by default:

- entire repository history
- unrelated ADRs
- stale logs
- duplicate test output
- full model transcripts
- old tool output already persisted as durable evidence
- machine-local environment noise

## Truncation

Truncation is allowed only for non-authoritative supporting material.

Never truncate away evidence explicitly required by the active gate.

Any truncation must be recorded in the packet manifest.

## Review packet invariant

If a final-review policy requires full diff, a summary/index may be added for navigation but cannot replace the full authoritative diff.

## Future implementation

FH-01/FH-02 should provide a reusable context packet builder and packet manifest validator.
