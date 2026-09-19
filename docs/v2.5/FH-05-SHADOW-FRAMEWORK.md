# FH-05 — Qwen / Local Specialist Shadow Framework

**Status:** IMPLEMENTED  
**Issue:** #29

## Purpose

Run local/Qwen specialist roles against the same authoritative input as an independent reference reviewer,
without giving the candidate model authority.

```text
authoritative input packet
       ├─ candidate shadow worker
       └─ reference reviewer
            ↓
independent first opinions
            ↓
reconciliation / benchmark sample
            ↓
NO authority / NO auto-promotion
```

## Initial roles

- repo-analysis
- test-candidate-reviewer
- security-candidate-reviewer
- architecture-consistency-reviewer
- cve-dependency-triage

## Independence rules

- candidate and reference receive the exact same input string
- the runner hashes that input once and binds both sides to the same hash
- independence keys must differ
- workers are invoked before either result is revealed to reconciliation
- worker failure becomes UNRESOLVED benchmark evidence, not fallback authority

## Reconciliation labels

- CONFIRMED
- FALSE_POSITIVE
- MISSED_BY_CANDIDATE
- UNRESOLVED

P0/P1 and P2 misses are counted explicitly.

## Provider adapter

`OpenAiCompatibleProviderAdapter` supports local OpenAI-compatible endpoints such as vLLM-style Qwen
servers.

It provides:

- `/v1/models` health probe
- `/v1/chat/completions` invocation
- input/cache/output/reasoning/total usage mapping when exposed
- auth/quota/rate/provider/transport/malformed failure classification

Tests use a local fake HTTP server and require no real model endpoint.

## Authority boundary

```text
shadowCanGrantAuthority() === false
pair.authority === "NONE"
reconciliation.promotionAuthority === "NONE"
```

FH-06 may compute promotion-candidate reports, but only human/policy decision can promote a role.
