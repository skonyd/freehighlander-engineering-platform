# Research — Token-efficient Agent Repository Practices (2026)

**Date:** 2026-09-19  
**Status:** RESEARCH INPUT

## GitHub instruction architecture

GitHub recommends separating:
- repository-wide instructions,
- path-specific instructions,
- reusable prompt files,
- custom agents.

Path-specific instructions avoid loading specialized guidance into unrelated tasks. GitHub also notes custom instructions are most effective when short and self-contained.

Implication for FreeHighlander:
- keep root/global instruction surface compact,
- put TypeScript/automation/planning rules behind path-specific files,
- use task prompt files for resume/checkpoint,
- keep role-specific behavior in agent/role contracts.

## Prompt-prefix caching

Both OpenAI and Anthropic currently provide prompt-prefix caching mechanisms.

Shared design implication:
- stable reusable material first,
- volatile task data last,
- explicit/versioned stable-prefix boundaries,
- measure real cache hits.

OpenAI documents cached-input discounts and cache telemetry; its current prompt-caching guide emphasizes matching rendered prefixes and stable tool definitions/conversation history.

Anthropic documents automatic or explicit cache breakpoints and specifically recommends placing a breakpoint after the final stable block when later content changes.

## Context/tool management

Anthropic's current guidance separates four problems:
- large tool definitions → tool search/lazy loading,
- repetitive multi-tool fan-out → programmatic tool calling,
- repeated stable context → prompt caching,
- stale tool-result history → context editing.

Their published internal benchmark reports a substantial billed-input reduction for a many-tool agent using programmatic tool calling, while noting it is not advantageous for every sequential tool workflow.

Implication:
do not blindly batch every tool call; use batching where intermediate model reasoning is unnecessary.

## Token counting

Anthropic exposes preflight token counting and recommends using it for cost/rate/context decisions. Tokenization can change across model generations, so old character/token estimates should not be treated as permanent.

FreeHighlander implication:
provider adapters should expose optional `countInputTokens()` capability and telemetry should compare estimate to actual.

## Reasoning effort

OpenAI model guidance explicitly recommends choosing higher reasoning effort only when evals show measurable benefit and notes higher effort can cause unnecessary search/overthinking on weakly bounded tasks.

FreeHighlander implication:
reasoning effort belongs in role/risk binding and benchmark data, not as "always high."

## Large context is not free optimization

Large context windows make bigger packets possible, but:
- cost grows,
- irrelevant context can degrade focus,
- caching does not reduce context length,
- some providers/models apply higher pricing above large-input thresholds.

FreeHighlander should optimize retrieval/context selection before using larger windows.

## Recommended additions implemented

- `.freehighlander/token-policy.yaml`
- `docs/state/TOKEN-EFFICIENCY.md`
- portable new-project blueprint
- token policy telemetry fields

## Future executable work

FH-01/FH-02:
- token-budget validator,
- provider token-count capability,
- context packet builder,
- stable prompt-prefix builder,
- cache diagnostics telemetry,
- artifact reuse key,
- stale tool-result compaction rules,
- role-specific reasoning/verbosity defaults.

## Official references

GitHub:
- https://docs.github.com/en/copilot/concepts/prompting/response-customization
- https://docs.github.com/en/copilot/reference/customization-cheat-sheet
- https://docs.github.com/en/copilot/reference/custom-instructions-support

Anthropic:
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- https://platform.claude.com/docs/en/build-with-claude/token-counting
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/manage-tool-context
- https://platform.claude.com/docs/en/build-with-claude/context-editing
- https://platform.claude.com/docs/en/build-with-claude/compaction

OpenAI:
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/guides/latest-model
