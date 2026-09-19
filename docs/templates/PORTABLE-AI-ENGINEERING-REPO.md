# Portable AI Engineering Repository Blueprint

This document is intentionally generic. It can be copied into a new repository to recreate the FreeHighlander-style multi-model engineering workflow without depending on FreeHighlander source code.

## Goal

A project should be resumable:
- on another machine,
- in another chat,
- by another supported model/agent,
- without asking the user to restate project history.

It should also minimize repeated token usage by loading only relevant context.

---

# 1. Recommended repository layout

```text
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
    GLOSSARY.md

  governance/
    AUTHORITY-AND-DECISIONS.md

  security/
    SECURITY-BASELINE.md

  testing/
    QUALITY-STRATEGY.md

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

  agents/
    project-coordinator.agent.md
    implementation.agent.md
    independent-reviewer.agent.md

  ISSUE_TEMPLATE/
    decision.yml
    work-item.yml
    bug.yml
```

Rename `.project-ai/` to a project-specific namespace if desired.

---

# 2. Canonical authority order

Suggested precedence:

1. ACCEPTED ADRs
2. machine-readable current state
3. human-readable PROJECT_STATE
4. active PR/issue
5. PR roadmap
6. backlog
7. draft docs

Conflicts are surfaced; do not silently merge contradictory state.

---

# 3. AGENTS.md minimum contract

Keep it short.

Must include:
- how to resume,
- where canonical state lives,
- evidence vs cached state distinction,
- authority invariants,
- cross-machine checkpoint rule,
- instruction to load minimum context,
- no secrets.

Avoid embedding full architecture documentation here because it is always-on context.

---

# 4. Machine-readable current state

A minimal state file:

```yaml
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
```

This is a pointer, not authoritative evidence.

---

# 5. Context profiles

Do not send all docs to every model.

Example:

```yaml
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
    read:
      - active_work_item
      - affected_code
      - related_ADRs

  review:
    extends: resume
    read:
      - exact_diff
      - acceptance_criteria
      - verification_evidence
      - authority_rules
```

---

# 6. Multi-model role separation

Use logical roles, not model names.

Example:

```text
ROLE A — discovery / independent review
ROLE B — plan challenge / implementation
ROLE C — local high-volume worker
```

Bindings can change later.

Invariant:
```text
producer != independent final approver
```

Local/cheap worker output defaults to advisory/candidate unless policy says otherwise.

---

# 7. Resume protocol

Fresh machine:

```bash
git clone ...
cd repo
git fetch --all --prune
git status --short
git branch --show-current
git log -1 --oneline
```

Then:
1. read root agent contract,
2. read state pointer,
3. read human project state,
4. verify active PR/remote HEAD,
5. load task context profile,
6. continue current step only.

Suggested user phrase:

> Repo'yu aç, AGENTS.md ve PROJECT_STATE.md'yi oku. Çoklu-model modunda kaldığımız yerden devam et.

---

# 8. Checkpoint protocol

Before machine/model switch:

1. finish smallest safe unit,
2. run deterministic checks,
3. inspect staged files for secrets/runtime artifacts,
4. update state if changed,
5. append HISTORY checkpoint,
6. commit,
7. push,
8. confirm remote,
9. prefer clean worktree.

Rule:

```text
unpushed local work != canonical project state
```

---

# 9. Token-saving design

## Instructions
- global instructions short,
- specialized rules path-scoped,
- task workflows reusable prompt files,
- broad context loaded on demand.

## Prompt structure
Stable content first, dynamic content last.

## Cache
Version stable prompts/contracts and measure cached input rather than assuming it works.

## Tools
- lazy-load large toolsets,
- batch/programmatic calls for fan-out work,
- remove stale tool results after evidence is persisted.

## Conversation
Use compaction only after durable state/checkpoint exists.

## Outputs
Prefer compact structured verdicts over repeated narrative.

## Model routing
Cheap/local model for high-volume advisory work; strong model only where benchmark/risk justifies it.

---

# 10. PR template essentials

Every PR should record:
- work item,
- purpose,
- scope/non-scope,
- risk,
- authority impact,
- acceptance criteria,
- verification,
- requirement/ADR links,
- rollout/rollback,
- producer role,
- independent reviewer requirement,
- cross-machine handoff check.

---

# 11. Issue types

At minimum:
- work item,
- architecture/product decision,
- bug/regression.

This prevents decisions from disappearing inside implementation tickets.

---

# 12. ADR rules

Do not rewrite history by silently changing an accepted decision.

Lifecycle:

```text
DRAFT / PROPOSED
      ↓
ACCEPTED or REJECTED
      ↓
SUPERSEDED
```

When a decision changes, create a superseding ADR and link both.

---

# 13. Security baseline

Never commit:
- API keys,
- provider tokens,
- passwords,
- private machine paths,
- raw secret-bearing model transcripts.

Sensitive domains should get explicit owner/reviewer routing.

Tool-enabled agents should eventually have:
- filesystem scope,
- network policy,
- command policy,
- secret injection boundary.

---

# 14. Automation to add later

When the project is ready, implement:

```bash
project:bootstrap
project:doctor
project:resume
project:checkpoint
```

Validators should detect:
- stale PR pointer,
- wrong branch,
- remote/local divergence,
- invalid state schema,
- missing required docs,
- unpushed continuation-critical changes,
- secret leakage.

---

# 15. Telemetry to add early

Before optimizing models, measure:

```text
run
gate
logical role
provider/model
input tokens
cached input
cache writes
output tokens
reasoning effort
latency
retry
quota
artifact reuse
finding outcomes
```

Build role × model quality/cost matrices from your own workload.

---

# 16. Provider-specific optimizations

These should live behind adapters, not in core authority logic.

### OpenAI-style APIs
- stable reusable prefix,
- prompt cache grouping/versioning,
- cached-token telemetry,
- adaptive reasoning effort,
- concise output verbosity.

### Anthropic-style APIs
- cache stable tool/system/context prefixes,
- explicit cache breakpoint when volatile suffix would damage hits,
- token counting before expensive large calls,
- context editing for stale tool results,
- compaction for genuinely long-running conversations.

Provider features change; core contracts should remain provider-neutral.

---

# 17. What not to copy blindly

Do not copy:
- model names,
- token thresholds,
- risk tiers,
- folder names,
- tool lists

without adapting them to the new project.

Copy the **contracts and principles**, then bind project-specific models/tools later.

---

# 18. Minimum viable setup for a new project

If you want the smallest useful version, create only:

```text
AGENTS.md
PROJECT_STATE.md
.project-ai/state.yaml
.project-ai/context.yaml
docs/ROADMAP.md
docs/state/RESUME-PROTOCOL.md
docs/state/TOKEN-EFFICIENCY.md
docs/decisions/README.md
.github/PULL_REQUEST_TEMPLATE.md
```

Then expand governance/roles/agents only when project complexity requires them.

---

# 19. Completion test

The setup is successful when:

> A different model on a clean machine can clone the repository, identify the exact current work, explain the blocker and next action, load only relevant context, and continue without receiving the old chat transcript.

That is the portability acceptance test.
