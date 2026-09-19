# ADR-0012 — Product Naming ve Monorepo Bounded Contexts

**Status:** ACCEPTED

## Naming

"FreeHighlander" çalışma adı ve repository/package namespace olarak korunur.

Public product branding kararı public beta/launch öncesine ertelenmiştir; branding kararı core domain/architecture'ı bloklamaz.

## Monorepo principle

Package sınırları technical layer dumping yerine bounded platform capabilities üzerinden kurulacaktır.

Generic `packages/core` içinde bütün domain'i toplamak yasak hedef olarak kabul edilir.

## Initial bounded contexts

FH-01 için önerilen başlangıç:

~~~text
apps/
  control-plane/
  web/

packages/
  orchestration/
  governance/
  model-runtime/
  evidence/
  telemetry/
  persistence/
  contracts/

automation/
  legacy-v2/
~~~

### orchestration
Workflow definitions, state machine, run/node execution coordination.

### governance
Authority, policy, approvals, risk/human rules.

### model-runtime
Provider adapters, bindings, capability/health/quota interfaces.

### evidence
Artifacts, findings, adjudication, provenance, lineage contracts.

### telemetry
Events/metrics/tracing adapters.

### persistence
SQLite/repository implementations and migrations; domain-facing ports remain owned by their contexts.

### contracts
Only intentionally shared serialization/API/schema contracts. This is not a shared business-domain dumping ground.

## Web/control-plane separation

Web is a client/control UI. Workflow execution must survive web UI disconnect/restart.

## Avoid premature packages

A package is created when it owns a coherent capability and dependency boundary, not simply because a folder could exist.

UI component library stays inside web until real cross-app reuse appears.

## Consequences

- DDD/bounded-context direction is preserved
- generic shared-domain coupling is reduced
- V3 strangler migration has clear seams
- early monorepo avoids unnecessary package explosion
