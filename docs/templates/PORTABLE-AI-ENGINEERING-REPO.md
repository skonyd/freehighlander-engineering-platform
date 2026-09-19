# Portable AI Engineering Repository Blueprint

This document is intentionally generic. Copy/adapt it into a new repository to recreate a cross-machine, multi-model, token-efficient engineering workflow.

## Goal

A different model on a clean machine should be able to:
- clone the repository,
- discover exact current work,
- understand blockers and next action,
- load only relevant context,
- continue without the old chat transcript.

---

## 1. Recommended layout

~~~text
AGENTS.md
CLAUDE.md
GEMINI.md
PROJECT_STATE.md
CONTRIBUTING.md
SECURITY.md

.project-ai/
  state.yaml
  context.yaml
  role-mode.yaml
  token-policy.yaml
  authority-policy.yaml
  provider-policy.yaml
  sandbox-policy.yaml
  data-policy.yaml

docs/
  INDEX.md
  ROADMAP.md

  state/
    RESUME-PROTOCOL.md
    CHECKPOINT-TEMPLATE.md
    HISTORY.md
    CONTEXT-PROFILES.md
    TOKEN-EFFICIENCY.md

  decisions/
    README.md
    ADR-0001-....md

  planning/
    PR-ROADMAP.md
    DISCUSSION-AGENDA.md
    DEFINITION-OF-READY-DONE.md

  project/
    CHARTER.md
    SCOPE-AND-NONGOALS.md
    REQUIREMENTS.md
    NON-FUNCTIONAL-REQUIREMENTS.md
    RISK-REGISTER.md

  governance/
  security/
  testing/
  operations/

.github/
  copilot-instructions.md
  CODEOWNERS
  PULL_REQUEST_TEMPLATE.md

  instructions/
    planning.instructions.md
    language.instructions.md
    automation.instructions.md

  prompts/
    resume.prompt.md
    checkpoint.prompt.md

  skills/
    project-resume/SKILL.md
    project-checkpoint/SKILL.md
    independent-review/SKILL.md

  agents/
    project-coordinator.agent.md
    implementation.agent.md
    independent-reviewer.agent.md

  ISSUE_TEMPLATE/
    decision.yml
    work-item.yml
    bug.yml
~~~

Rename `.project-ai/` to a project-specific namespace if desired.

Do not add hooks until the scripts they call are real and tested.

---

## 2. Canonical precedence

Suggested order:

1. accepted ADRs
2. machine-readable current-state pointer
3. human-readable PROJECT_STATE
4. active PR/issue
5. PR roadmap
6. backlog
7. draft docs

Conflicts are surfaced; never silently merge contradictory state.

---

## 3. Keep always-on context small

Use:
- `AGENTS.md` for stable cross-agent invariants,
- path-specific instructions for file/domain-specific rules,
- skills/prompts for detailed task procedures,
- custom agents for specialized tool/persona boundaries.

Do **not** put the whole architecture into always-on instructions.

---

## 4. Machine-readable state

Example:

~~~yaml
schema_version: 1
project: example
repository: owner/repo

phase:
  id: P-01
  status: in_progress

active_work:
  branch: feat/example
  pull_request: 12
  objective: ...

blockers:
  - ...

next_action: ...
~~~

This is a pointer, not gate evidence.

---

## 5. Context profiles

Load context by task:

~~~yaml
profiles:
  resume:
    read:
      - AGENTS.md
      - .project-ai/state.yaml
      - PROJECT_STATE.md

  planning:
    extends: resume
    read:
      - docs/ROADMAP.md
      - docs/project/REQUIREMENTS.md
      - docs/decisions/README.md

  implementation:
    extends: resume
    dynamic:
      - active_work_item
      - affected_code
      - related_ADRs

  review:
    extends: resume
    dynamic:
      - exact_diff
      - acceptance_criteria
      - verification_evidence
      - authority_rules
~~~

---

## 6. Logical role separation

Use role names, not model names:

~~~text
Discovery / independent review
Implementation / verified fix
Local high-volume worker
~~~

Invariant:

~~~text
producer != independent final approver
~~~

A cheap/local worker defaults to advisory/candidate unless policy explicitly grants more.

---

## 7. Resume protocol

Fresh machine:
1. clone/fetch,
2. inspect worktree/branch,
3. read root contract/state,
4. verify active remote PR/head,
5. load minimum context profile,
6. continue only current step.

Suggested phrase:

> Repo'yu aç, AGENTS.md ve PROJECT_STATE.md'yi oku. Çoklu-model modunda kaldığımız yerden devam et.

---

## 8. Checkpoint protocol

Before machine/model switch:
1. finish smallest safe unit,
2. run deterministic checks,
3. secret/runtime-artifact check,
4. update state if changed,
5. append HISTORY,
6. commit,
7. push,
8. verify remote.

Rule:

~~~text
unpushed local work != canonical project state
~~~

---

## 9. Token-saving design

### Context
- minimum sufficient packet,
- targeted retrieval,
- inclusion reason/manifest,
- required evidence never trimmed for budget.

### Prompt
- stable contract/tool/policy prefix first,
- dynamic diff/task/evidence later,
- version/hash reusable prompt contracts.

### Reuse
Distinguish:
- provider prompt cache,
- application-level semantic artifact reuse.

Semantic reuse key should include role, exact revision, workflow/policy/prompt/input/binding semantics.

### Tools
- lazy/deferred tool loading when toolsets are large,
- safe batching/programmatic fan-out,
- trim stale tool results after durable evidence exists.

### Output
Compact structured verdicts by default.

### Routing
Local/cheap model for high-volume advisory work only after evaluation.

---

## 10. Evidence / authority

A useful authority ladder:

~~~text
ADVISORY
CANDIDATE
WRITER
ADJUDICATOR
FINAL_REVIEWER
HUMAN_APPROVER
SYSTEM_POLICY
~~~

Model name or prompt text never grants authority.

---

## 11. PR / issue discipline

PR captures:
- work item
- purpose
- scope/non-scope
- risk/authority impact
- acceptance
- verification
- requirement/ADR links
- rollout/rollback
- producer/reviewer independence
- cross-machine handoff state

Issue types:
- work item
- decision
- bug/regression

---

## 12. ADR discipline

Lifecycle:

~~~text
DRAFT/PROPOSED
 → ACCEPTED or REJECTED
 → SUPERSEDED
~~~

Do not silently rewrite accepted semantics after merge.

---

## 13. Sandbox / privacy

Default deny for:
- filesystem outside workspace
- network
- secrets
- destructive/high-impact commands

Classify data and control remote-provider egress.

Never commit secrets/state transcripts containing credentials.

---

## 14. Tool/plugin ecosystem

Keep an internal ToolAdapter contract.

External protocol such as MCP may be supported, but:
- discovery does not grant permission,
- metadata does not grant identity/authority,
- version/source pinning matters,
- external scripts/skills are supply-chain inputs and must be reviewed.

---

## 15. Backup/recovery

For SQLite:
- use supported consistent live snapshot mechanisms,
- account for WAL,
- back up authoritative artifacts with a manifest,
- test restore.

Backup without restore verification is incomplete.

---

## 16. Early telemetry

Measure:
- run/node/gate
- logical role/binding/provider/model
- input/cache/output/reasoning tokens
- latency/retry/timeout/quota
- budget state
- artifact reuse
- findings/adjudication
- human-required/decision

Map to OpenTelemetry in an exporter rather than making external telemetry schema your internal domain model.

---

## 17. Automation to implement when ready

Conceptual commands:

~~~text
project:bootstrap
project:doctor
project:resume
project:checkpoint
~~~

Validate:
- stale PR pointer
- wrong branch
- local/remote divergence
- invalid state
- secret leak
- missing evidence
- unpushed continuation-critical work

---

## 18. Minimal setup

For a smaller project start with:

~~~text
AGENTS.md
PROJECT_STATE.md
.project-ai/state.yaml
.project-ai/context.yaml
docs/ROADMAP.md
docs/state/RESUME-PROTOCOL.md
docs/state/TOKEN-EFFICIENCY.md
docs/decisions/README.md
.github/PULL_REQUEST_TEMPLATE.md
~~~

Add policies/skills/agents only when complexity warrants them.

---

## 19. Completion test

The setup is successful when a fresh model on a clean machine can correctly identify:

~~~text
current phase
active branch/PR
exact blocker
accepted decisions
required evidence
logical role
next safe action
~~~

and continue without the old conversation transcript.
