# ADR-0001 — Automation scriptlerinden engineering platformuna geçiş

**Status:** Proposed / direction approved

## Context

Mevcut shell tabanlı automation sistemi; multi-model orchestration, deterministic gates, exact-SHA artifacts, provenance, risk routing ve human authority gibi kritik kavramları doğruladı. Orchestration karmaşıklığı büyüdükçe Bash ana control plane için sürdürülebilir olmaktan uzaklaşıyor.

## Decision

Mevcut V2 çöpe atılmayacak. V3 geliştirilirken şu rollerle kullanılacak:

- reference implementation
- bootstrap engine
- behavioral regression oracle

V3 kademeli olarak TypeScript control plane'e taşınacak.

## Migration

```text
V2 authority
   ↓
telemetry + dashboard
   ↓
V3 shadow
   ↓
parity / benchmark / recovery tests
   ↓
V3 authority
   ↓
V2 compatibility
   ↓
legacy shell retirement
```
