# Research — Security, Auth, Backup and Integration Practices (2026)

**Date:** 2026-09-19  
**Status:** RESEARCH INPUT

## SQLite

SQLite's official documentation recommends the Online Backup API for consistent live database snapshots and also documents `VACUUM INTO` as an alternative snapshot technique.

WAL is part of the database's persistent state while in use. Copying only the main database file while a live WAL contains committed transactions can lose state or produce an unsafe backup.

FreeHighlander result:
- use SQLite-supported backup/snapshot mechanics,
- include artifact inventory/hashes,
- verify restore rather than treating file copy as success.

References:
- https://www.sqlite.org/backup.html
- https://www.sqlite.org/wal.html

## OAuth / local and remote clients

Current OAuth security guidance consolidates around Authorization Code + PKCE, exact redirect URI validation and avoiding implicit/password flows.

Native/local clients are public clients and should not depend on a client secret embedded in the application.

FreeHighlander result:
- loopback-only single-user local mode can remain simple,
- remote/self-hosted integrations use standards-based auth,
- no embedded shared secret as proof of native-client identity.

References:
- https://oauth.net/2.1/
- https://oauth.net/2/native-apps/

## WebAuthn / passkeys

WebAuthn Level 3 is a W3C Recommendation for origin-scoped public-key credentials and strong user authentication.

FreeHighlander result:
- passkeys/WebAuthn are a strong future UI authentication option,
- they are not required for the first loopback-only local mode.

Reference:
- https://www.w3.org/TR/webauthn/

## MCP authorization/security

The current MCP authorization specification uses OAuth-based authorization for HTTP transports and requires security properties including PKCE, token audience/resource binding and secure token storage. Token passthrough is explicitly disallowed. Local STDIO integrations are expected to obtain credentials from the environment rather than applying the HTTP OAuth flow.

FreeHighlander result:
- MCP can be an interoperability layer,
- MCP tool discovery never grants workflow authority,
- MCP capabilities map into FreeHighlander sandbox/data policy,
- remote tokens are scoped/audience-bound,
- token passthrough is forbidden.

References:
- https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/index.mdx
- https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/security-considerations.mdx

## Agent cost controls

Recent production guidance consistently treats the agent **run**, not a single request, as the primary budget unit because retries, tools, sub-agents and long contexts compound spend.

FreeHighlander result:
- reserve budget before a call,
- reconcile actual usage after,
- share the parent budget across retry/fallback,
- stop/preserve state when a hard budget is exhausted,
- do not convert budget exhaustion into semantic PASS/FAIL.

This remains operational guidance; final thresholds are calibrated from FreeHighlander telemetry.
