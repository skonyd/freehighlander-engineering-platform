# Research — Agent Platform Ecosystem Review (2026)

**Date:** 2026-09-19  
**Status:** RESEARCH INPUT

## GitHub agent customization

Current GitHub guidance separates:
- repository-wide instructions
- path-specific instructions
- AGENTS/CLAUDE/GEMINI files
- reusable prompt files
- custom agents
- agent skills
- hooks
- MCP integrations

FreeHighlander implication:
- keep always-on instructions short,
- load detailed workflows as skills/prompts only when relevant,
- use custom agents for persona/tool restriction,
- use hooks only after deterministic validator scripts exist,
- GitHub customizations remain convenience integrations, not FreeHighlander authority.

Official references:
- https://docs.github.com/en/copilot/concepts/prompting/response-customization
- https://docs.github.com/en/copilot/reference/customization-cheat-sheet
- https://docs.github.com/en/copilot/reference/custom-agents-configuration
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
- https://docs.github.com/en/copilot/concepts/agents/hooks

## MCP

MCP specification revision 2026-07-28 introduced a stateless core, cacheable list results, authorization hardening and an extension framework. Official TypeScript SDK v2 implements this revision.

FreeHighlander implication:
- MCP is preferred external interoperability layer,
- tool catalog cache hints can reduce repeated context/tool discovery,
- MCP Tasks can map to long-running external jobs,
- self-reported server/client metadata is not a security identity,
- all external tools normalize into internal ToolAdapter/sandbox/data policy.

References:
- https://blog.modelcontextprotocol.io/posts/2026-07-28/
- https://ts.sdk.modelcontextprotocol.io/v2/
- https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28

## SQLite recovery

SQLite documents Online Backup API as a live snapshot mechanism and VACUUM INTO as another consistent snapshot option. In WAL mode, the WAL is part of persistent state while active, so copying only the main DB file can miss committed transactions.

FreeHighlander implication:
- use library-supported consistent snapshot APIs,
- couple DB snapshot with artifact manifest,
- validate restore, not just backup creation.

References:
- https://www.sqlite.org/backup.html
- https://www.sqlite.org/wal.html
- https://sqlite.org/lang_vacuum.html

## OpenTelemetry GenAI

OpenTelemetry maintains GenAI semantic conventions for provider/model usage, including input/output/cache/reasoning token concepts and agent/workflow/tool attributes.

FreeHighlander implication:
- internal domain events remain canonical,
- versioned exporter maps compatible attributes to OTel,
- prompt/completion content is not exported by default,
- avoid baking unstable external attribute names into DB schema.

References:
- https://opentelemetry.io/docs/specs/semconv/gen-ai/
- https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/

## Conclusion

No researched ecosystem feature changes FreeHighlander's core principle:

> External agent/tool/provider capabilities are adapters. Authority, evidence, policy and durable project state remain FreeHighlander-owned.
