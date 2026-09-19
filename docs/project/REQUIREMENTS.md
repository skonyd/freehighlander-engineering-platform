# Product Requirements

**Status:** ACCEPTED BASELINE — evolves by versioned change/ADR

- **R-001 Project workspace:** requirement, decision, workflow, artifact, finding, test evidence, release ve incident aynı proje bağlamında ilişkilendirilebilir.
- **R-002 Logical roles:** rol model/provider isminden bağımsızdır.
- **R-003 Model bindings:** primary/fallback binding konfigüre edilebilir; capability/independence/policy doğrulanır.
- **R-004 Workflow composition:** condition, parallel, bounded loop, sub-workflow, debate ve human gate tanımlanabilir.
- **R-005 Debate/council:** bağımsız ilk görüş + bounded cross-review + reconciliation/escalation desteklenir.
- **R-006 Authority separation:** advisory/candidate/model output doğrudan merge/production authority olmaz.
- **R-007 Evidence binding:** authoritative karar exact revision/input/policy/contract versiyonuna bağlanır.
- **R-008 Telemetry:** her run/gate/model/tool/artifact/finding lifecycle structured event üretir.
- **R-009 Replay/simulation:** geçmiş run models-disabled replay ve alternate-router/policy simulation destekler.
- **R-010 Dashboard:** run/gate/model/artifact/finding/benchmark canlı ve geçmişe dönük görülebilir.
- **R-011 UI configuration:** normal operasyonda rol/model/workflow yönetimi source-code edit gerektirmemelidir.
- **R-012 Project planning:** fikirden requirement/NFR/ADR/risk/backlog üretilebilir.
- **R-013 Development traceability:** code ↔ requirement/decision/task/test/security evidence ilişkisi tutulur.
- **R-014 Security lifecycle:** security design-development-build-preprod-production boyunca çalışabilir.
- **R-015 Production feedback:** observability/incident sinyali requirement/task/test döngüsüne geri bağlanır.
- **R-016 Cross-machine continuity:** fresh clone + current remote state ile chat history olmadan kaldığı yerden devam edilebilir.
- **R-017 Context efficiency:** model call yalnız active task için gerekli minimum sufficient evidence packet'ı alabilir.
- **R-018 Evaluation/routing:** role × model quality/cost benchmark ve promotion lifecycle tutulur.
- **R-019 Sandbox/data policy:** filesystem/network/command/secrets/provider-egress yetkileri policy ile sınırlandırılır.
- **R-020 Backup/recovery:** runtime state/artifacts consistent snapshot + validated restore ile kurtarılabilir.
- **R-021 Tool/plugin extensibility:** built-in ve external tools internal capability/permission contract'a normalize edilir; MCP uyumlu external adapters desteklenebilir.
- **R-022 Engineering lineage:** versioned entities/relations üzerinden idea→requirement→decision→task→code→test→release→runtime→incident digital thread kurulabilir.
- **R-023 Budget controls:** run/role/provider seviyesinde token/cost/call/time budget uygulanabilir; budget authority/evidence requirement'ı düşürmez.
- **R-024 Human approval:** high-impact approval stable actor, exact revision, scope ve reviewed evidence'a bağlanabilir.

## Intentionally deferred implementation choices

Aşağıdakiler product requirement boşluğu değildir; implementation-time seçimidir:
- exact UI/API framework
- exact package manager/build runner
- exact OIDC provider
- numeric RPO/RTO
- numeric paid-token budgets
- graph database adoption (only if measured need)
- public product branding before launch
