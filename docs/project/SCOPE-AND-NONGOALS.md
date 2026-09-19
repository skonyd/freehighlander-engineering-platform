# Scope & Non-goals

**Status:** PROPOSED

## Scope
Platform core:
- Workflow engine
- Role registry
- Model/provider router
- Tool registry
- Policy engine
- State/event store
- Artifact/evidence/provenance store
- Human approvals
- Metrics/audit
- Replay/simulation
- Sandbox/secrets
- UI/API/CLI

SDLC modules:
- Planning
- Development
- Testing
- Security
- Release
- Operations
- Incident

## İlk implementation scope
V2.5: telemetry, dashboard, Qwen benchmark/offloading.
V3: provider-neutral roles, workflow DAG, state machine, reusable role packages, UI control plane.

## Non-goals — ilk aşamalar
- Kendi foundation modelimizi eğitmek.
- IDE replacement yapmak.
- CRITICAL alanlarda insan kararını tamamen kaldırmak.
- İlk sürümde enterprise multi-tenancy çözmek.
- İlk sürümde distributed scheduler kurmak.
- Tüm provider API'lerini aynı anda desteklemek.
- Backend semantics netleşmeden görsel workflow editor ile başlamak.
- LLM consensus'u truth/authority kabul etmek.
