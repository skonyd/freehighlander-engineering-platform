# Control Plane UX

**Status:** DRAFT

## FH-04 read-only UI
Runs, timeline, model calls, token/latency, artifacts, findings, failures/quota, benchmark. Authority/config write yok.

## V3 management
Dashboard, Projects, Runs, Workflows, Roles, Models, Providers, Policies, Artifacts, Metrics, Benchmarks, Settings.

## Workflow Designer
drag/drop node, reorder, parallel, condition, bounded loop, sub-workflow, debate, human gate.

## Role Manager
create/version/remove role, prompt/contract, I/O, tools/permissions, authority, bindings, risk scope.

## Publish lifecycle
Draft → Validate → Simulate → Publish. Running workflow published version'a pinned kalır.

## Core vs module navigation

The user interface must keep the core control-plane navigation separate from optional modules.

~~~text
FreeHighlander
├─ Core
│  └─ canonical control-plane screens
└─ Modules
   └─ FH-KUIKA
      └─ optional Kuika-inspired productization screens
~~~

The `FH-KUIKA` section is a distinct collapsible top-level module group, not a set of mixed core menu entries.

## Optional productization module

Kuika-inspired Studio/productization UX is intentionally isolated from this core control-plane contract.

See:
- [FH-KUIKA module roadmap](../modules/kuika-inspired-productization/ROADMAP.md)
- [FH-KUIKA product UX](../modules/kuika-inspired-productization/UX.md)

The optional module must not become a dependency required for core runtime correctness or alter authority semantics.
