# ADR-0011 — Plugin/Tool Ecosystem ve Product Packaging

**Status:** ACCEPTED

## Product naming

`FreeHighlander` current product/project name remains accepted for internal development.

Public launch/branding may supersede this decision later without changing technical identities.

Initial package namespace:
~~~text
@freehighlander/*
~~~

Repository remains monorepo until measured coupling/build/team constraints justify split.

## Built-in vs plugin

Core built-in adapters:
- Git/GitHub
- local filesystem/command sandbox
- primary provider adapters
- SQLite/artifact store

External integrations should prefer a versioned plugin/tool protocol rather than direct core imports.

## MCP direction

Model Context Protocol is an accepted candidate/default interoperability layer for external tool/resource integrations where it fits.

However:
- MCP server is not automatically trusted
- tool discovery does not grant permission
- transport auth does not grant workflow authority
- every MCP/tool capability is mapped into FreeHighlander policy/sandbox permissions

## Plugin manifest

Each plugin/tool adapter should declare:
- id/version
- protocol/transport
- capabilities/tools/resources
- read/write/mutation flags
- network needs
- secret scopes
- data classifications
- auth method
- trust/source metadata
- timeout/rate limits

## Trust tiers

Initial:
~~~text
BUILT_IN
APPROVED
UNTRUSTED
DISABLED
~~~

Unknown plugin defaults to UNTRUSTED/DISABLED for mutation-sensitive use.

## Supply-chain controls

Future plugin install should support:
- version pinning
- checksum/integrity
- source identity
- explicit human enablement
- capability diff on upgrade
- revoke/disable
- audit events

## MCP authorization notes

For HTTP MCP integrations:
- follow protocol authorization/security requirements
- use audience/resource-bound tokens
- no token passthrough
- PKCE where OAuth flow is used
- short-lived/scoped credentials

For local STDIO:
- credentials from controlled environment/secret broker
- no credentials committed in plugin config

## Consequences

FreeHighlander can integrate broad ecosystems without giving third-party tools implicit filesystem/network/authority access.
