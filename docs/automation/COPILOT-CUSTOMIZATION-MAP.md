# GitHub Copilot Customization Map

**Status:** OPTIONAL CLIENT INTEGRATION

FreeHighlander authority remains vendor-neutral. GitHub Copilot customizations are convenience adapters.

## Use each mechanism for the right context

### Always-on instructions
- root `AGENTS.md`: vendor-neutral invariants
- `.github/copilot-instructions.md`: short Copilot-wide rules
- `.github/instructions/*.instructions.md`: path-specific rules

Keep these short because they can enter many requests.

### Skills
`.github/skills/*/SKILL.md`

Use for detailed task workflows loaded only when relevant:
- resume
- checkpoint
- independent review

This reduces always-on context compared with placing full procedures in global instructions.

### Custom agents
`.github/agents/*.agent.md`

Use for specialized personas/tool restrictions:
- coordinator
- implementer
- independent reviewer

Custom-agent tool aliases are explicitly constrained where possible.

### Prompt files
`.github/prompts/*.prompt.md`

Manual reusable entrypoints remain useful where a human wants deterministic task selection.

### Hooks — future after executable scripts exist
`.github/hooks/*.json`

Hooks can deterministically:
- validate/deny dangerous tool execution,
- run secret checks,
- validate state/checkpoint,
- produce audit events.

Do not add hooks that call nonexistent scripts. FH-01 should implement validators first, then wire hooks.

## Authority warning

Copilot agent/skill/hook configuration does not grant FreeHighlander logical authority. Internal SYSTEM_POLICY remains canonical.
