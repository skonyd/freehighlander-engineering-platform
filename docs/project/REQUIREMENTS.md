# Product Requirements

**Status:** DRAFT

- **R-001 Project workspace:** requirement, decision, workflow, artifact, finding, test evidence, release ve incident aynı proje bağlamında ilişkilendirilebilir.
- **R-002 Logical roles:** rol model/provider isminden bağımsızdır.
- **R-003 Model bindings:** primary/fallback binding konfigüre edilebilir.
- **R-004 Workflow composition:** sıra, condition, parallel, bounded loop, sub-workflow ve human gate tanımlanabilir.
- **R-005 Debate/council:** bağımsız ilk görüş + cross-review + reconciliation desteklenir.
- **R-006 Authority separation:** advisory output doğrudan merge/production authority olmaz.
- **R-007 Evidence binding:** authoritative karar revision/input/policy/contract versiyonuna bağlanır.
- **R-008 Telemetry:** her run/gate/model call structured event üretir.
- **R-009 Replay:** geçmiş run models-disabled replay ve alternate-router simulation destekler.
- **R-010 Dashboard:** run/gate/model/artifact/finding/benchmark canlı ve geçmişe dönük görülür.
- **R-011 UI configuration:** normal operasyonlarda rol/model/workflow için source code/shell düzenleme gerekmez.
- **R-012 Project planning:** fikirden requirement/NFR/ADR/risk/backlog üretilebilir.
- **R-013 Development traceability:** code ↔ requirement/decision/task/test/security evidence ilişkisi tutulur.
- **R-014 Security lifecycle:** security design-development-build-preprod-production boyunca çalışır.
- **R-015 Production feedback:** observability/incident sinyali requirement/task/test döngüsüne geri bağlanır.

## Açık alanlar
Hosted vs local-first, multi-user ilk hedefi, supported Git providers, secrets storage, desktop/web deployment ve plugin/tool sınırları karar bekliyor.
