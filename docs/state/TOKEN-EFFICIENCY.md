# Token Efficiency Strategy

**Status:** ACCEPTED DIRECTION  
**Purpose:** Reduce paid/model tokens without reducing engineering quality or weakening authority boundaries.

## 1. Core rule

Token optimization is allowed only when it preserves:
- required evidence,
- deterministic verification,
- independent review,
- exact revision binding,
- authority / human gates.

Cost reduction must not become "use a weaker model until something passes."

## 2. Minimum-context loading

Repository context is loaded by task profile, not by reading everything.

Machine-readable source:
`.freehighlander/context.yaml`.

Profiles:
- `resume-minimal`
- `planning`
- `implementation`
- `review`

Context expands only when the active task requires it.

### Anti-pattern

```text
Read entire repo
+ entire history
+ every ADR
+ every log
+ every model artifact
```

for every call.

### Preferred

```text
state pointer
→ active work item
→ directly related docs/code
→ targeted search
→ broader context only if needed
```

## 3. Short always-on instructions

Repository-wide instruction files should contain only stable rules that apply broadly.

Use:
- `AGENTS.md` for cross-agent invariants,
- `.github/copilot-instructions.md` for short Copilot-wide rules,
- path-specific `.github/instructions/*.instructions.md` for specialized rules,
- reusable prompt files for task-specific workflows.

Do not place long architecture tutorials in always-on instructions.

## 4. Stable prompt prefixes

Provider adapters should construct prompts in this order:

```text
STABLE
  system / role contract
  tool definitions
  repository invariants
  stable rubric/examples
DYNAMIC
  current diff/evidence
  current task
  current user request
```

Rationale:
- OpenAI prompt caching reuses matching prefixes.
- Anthropic caching also works on prompt prefixes.
- Moving volatile timestamps/run IDs into an early static section destroys cache reuse.

Version reusable prefix intentionally:

```text
role:test-reviewer:v3
workflow:pr-review:v8
policy:authority:v2
```

A prompt-contract change should change the cache/prefix version.

## 5. Prompt caching policy

### OpenAI-family adapters

Where API support exists:
- keep reusable prefix stable,
- use stable prompt cache grouping keys,
- place dynamic content after the reusable prefix,
- measure `cached_tokens` / cache-write tokens,
- do not assume a cache hit.

Prompt caching reduces input processing cost/latency but cached tokens can still count toward context/rate limits.

### Anthropic-family adapters

Where API support exists:
- cache static tool/system/repository blocks,
- use explicit breakpoint after the last truly stable block when automatic caching would include volatile content,
- avoid rewriting cached-prefix blocks,
- choose TTL based on actual reuse pattern.

Prompt caching does **not** make a large prompt small; it makes repeated stable input cheaper. Context still needs management.

## 6. Preflight token counting

Before expensive reviews or unusually large packets:
- estimate/count tokens for the target model when provider supports it,
- compare against the active context budget,
- avoid guessing from character count alone,
- record estimate + actual usage.

Use model-specific counting when possible; tokenizer behavior can differ by model/version.

## 7. Adaptive reasoning effort

Higher reasoning effort is not the default optimization target.

Suggested policy:
- routine classification / extraction: LOW,
- normal engineering analysis: MEDIUM,
- ambiguous/high-risk architecture or final review: HIGH only where justified.

Promotion to higher effort should be based on:
- risk,
- benchmark/eval evidence,
- repeated miss patterns.

Do not increase effort merely because more computation "feels safer."

## 8. Output token control

Output tokens are frequently more expensive than input tokens.

Default:
- concise structured result,
- references to artifacts instead of repeating full content,
- findings only once,
- no repeated diff,
- no repeated large logs.

Use full prose only for:
- ADR,
- architecture artifact,
- required report,
- user-facing documentation.

Reviewer result should prefer compact schemas such as:

```text
VERDICT
FINDINGS
EVIDENCE
REQUIRED_ACTION
```

rather than long narrative.

## 9. Tool context discipline

Large tool schemas and accumulated tool results can dominate context.

When provider capabilities permit:

### Tool search / lazy tool loading
Use when toolset becomes large and most tools are irrelevant to a given turn.

### Programmatic/batched tool execution
Use for safe fan-out/bulk operations where intermediate tool results do not need model reasoning.

Good:
- fetch metadata for 20 files, aggregate, return compact result.

Bad:
- sequence where each result semantically determines the next call.

### Stale tool-result trimming
Old diagnostic output should not remain in every later prompt once:
- relevant evidence is summarized into a durable artifact,
- the raw result is no longer needed for an authoritative decision.

Never trim evidence still required for a gate.

## 10. Compaction

Long-running agent conversations may be summarized/compacted when:
- progress is already persisted in Git/artifacts,
- old turns are no longer needed verbatim,
- current exact state can be reconstructed.

Do not compact away:
- unresolved requirements,
- exact evidence required by a reviewer,
- current failure output before diagnosis,
- human decisions not yet persisted.

Repository checkpointing is preferred over relying on conversational memory.

## 11. Local/Qwen offload

High-volume work should first be evaluated for local execution:

Suitable candidates:
- repository scan,
- indexing,
- evidence collection,
- mechanical classification,
- candidate generation,
- documentation consistency,
- bounded transformations.

Strong models remain for roles where benchmark/risk requires them.

## 12. Diff/evidence packets

Do not send every strong reviewer the entire project history.

Create deterministic packets containing:
- exact HEAD/base,
- changed file list,
- relevant diff,
- acceptance criteria,
- direct dependency/ADR snippets,
- deterministic test results,
- candidate findings when policy permits.

For final-review roles that require full diff, full diff remains authoritative; an index/summary can aid navigation but cannot replace required evidence.

## 13. Deduplicate model calls

Cache/model artifact keys should eventually include:

```text
logical_role
exact_revision
workflow_hash
role_contract_hash
prompt_version
policy_hash
binding/model/effort
relevant_input_hash
```

If all semantic inputs are unchanged and policy allows reuse, reuse the authoritative artifact instead of paying for another call.

## 14. Token budget enforcement

Machine-readable initial policy:
`.freehighlander/token-policy.yaml`.

Budgets are warnings/guardrails, not authority shortcuts.

When over budget:
1. remove irrelevant context,
2. use targeted search,
3. reference durable artifacts,
4. batch safe tool work,
5. compact stale history,
6. only then consider a larger context model.

Do not truncate required evidence to meet a budget.

## 15. Metrics

FH-02 telemetry should record at least:

- logical role,
- provider/model/effort,
- context profile,
- input tokens,
- cached input tokens,
- cache write tokens if exposed,
- output tokens,
- latency,
- retries,
- quota failure,
- artifact reuse/cache hit,
- finding result.

Derived metrics:
- tokens per accepted finding,
- paid tokens per successful run,
- strong-model tokens saved by Qwen,
- cache hit ratio,
- repeat-call waste,
- role × model quality/cost matrix.

## 16. Initial acceptance targets

Do not set hard cost targets before baseline.

First collect enough real runs. Then define:
- max paid tokens per PR risk tier,
- max repeated-review waste,
- desired cache hit ratio,
- Qwen offload share,
- latency SLO.

Quality metrics always accompany cost metrics.
