# ADR-0011 — Tool / Plugin Ecosystem ve MCP Boundary

**Status:** ACCEPTED

## Context

External systems/tools core içine hard-code edilmemelidir; fakat external plugin/tool doğrudan authority, filesystem, network veya secrets yetkisi kazanamaz.

## Decision

### 1. Internal ToolAdapter contract kanoniktir

Core tüm built-in/external integrations'ı internal capability/permission modeline normalize eder.

### 2. MCP preferred external interoperability protocol'dür

External tool/resource/prompt integration için ilk tercih MCP'dir.

Initial target:
- MCP 2026-07-28 semantics
- official TypeScript SDK v2 line where implementation time compatibility is verified

MCP support = trust/authority değildir.

### 3. Self-reported metadata security identity değildir

MCP server/client metadata display/debug için kullanılabilir; permission/identity policy'den gelir.

### 4. Catalog cache kullanılabilir

Protocol cache hints/TTL varsa tool/resource catalog caching token/context maliyetini düşürmek için kullanılabilir.

Cache permission revalidation'ı bypass etmez.

### 5. Trust levels

~~~text
BUILT_IN
REVIEWED_PINNED
EXTERNAL_UNTRUSTED
~~~

External plugin default:
- human install/enable
- version/source pin
- explicit tool allowlist
- no secrets
- no unrestricted network/filesystem

### 6. Long-running tool operations

MCP Tasks veya native job adapters future execution mechanism olabilir; workflow authority/state yine FreeHighlander'dadır.

### 7. Skills/plugins code gibi incelenir

Third-party skills/plugins prompt injection, scripts ve supply-chain risk taşıyabilir. Preview/review/pin zorunlu policy olabilir.

## Product packaging

Product/package naming ve bounded-context monorepo kararı ADR-0012'ye ayrılmıştır.

## Consequences

- broad integration ecosystem mümkün
- core external protocol'a kilitlenmez
- permission/authority merkezi kalır
- external supply-chain riski explicit policy ile sınırlandırılır
