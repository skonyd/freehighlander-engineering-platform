# ADR-0011 — Tool / Plugin Ecosystem ve MCP Boundary

**Status:** ACCEPTED

## Context

FreeHighlander external systems, tools and data sources with extensible şekilde çalışmalıdır. Her integration'ı core içine hard-code etmek ölçeklenmez; fakat external tool/plugin doğrudan authority ve secret erişimi almamalıdır.

MCP 2026-07-28 revision'ı stateless core, cacheable list results ve authorization hardening sunan güncel açık integration standardıdır.

## Decision

### 1. Internal ToolAdapter contract kanoniktir

Core external protocol yerine FreeHighlander ToolAdapter/Capability registry ile konuşur.

Built-in adapters ve external protocols aynı internal permission modeline normalize edilir.

### 2. MCP preferred external interoperability protocol'dür

External tool/resource/prompt integration için ilk tercih MCP olacaktır.

İlk target:
- official MCP TypeScript SDK v2 / 2026-07-28-compatible semantics.

Ancak MCP support = tool trust/authority değildir.

### 3. MCP server self-reported metadata security kararı değildir

ServerInfo/clientInfo display/debug için kullanılabilir; permission/identity kararı policy'den gelir.

### 4. Tool catalog cache kullanılabilir

MCP list responses'ın cache hints'i varsa catalog caching token/context tüketimini azaltmak için kullanılabilir.

Cache expiry correctness/permission bypass etmez.

### 5. Plugin trust levels

~~~text
BUILT_IN
REVIEWED_PINNED
EXTERNAL_UNTRUSTED
~~~

External plugin default:
- no secrets
- no unrestricted network/filesystem
- explicit tool allowlist
- human install/enable
- version/source pinning

### 6. MCP Tasks future adapter olabilir

Long-running external operations MCP Tasks extension veya native job adapter üzerinden normalize edilebilir.

Workflow run state yine FreeHighlander authority/state machine tarafından yönetilir.

### 7. Skills/prompts/plugins code gibi incelenir

Third-party skill/plugin:
- prompt injection,
- scripts,
- dependency/supply-chain

taşıyabilir.

Install öncesi preview/review/pin gerekir.

## Consequences

- integration ecosystem büyüyebilir
- core MCP'ye bağımlı hale gelmez
- tool permissions merkezi kalır
- current MCP ecosystem leverage edilir
- plugin supply-chain riskleri policy ile sınırlandırılır
