# ADR-0003 — İlk ürün modeli, stack ve persistence yaklaşımı

**Status:** ACCEPTED

## Decisions

1. İlk kullanılabilir ürün **local-first / single-user** yaklaşımıyla geliştirilecek.
2. Orta vadede self-hosted ve multi-user modele geçişe izin verecek domain sınırları korunacak.
3. Ana implementation dili **TypeScript** olacak.
4. İlk repository yapısı **monorepo** olacak; control-plane ile web UI mantıksal olarak ayrılacak.
5. İlk telemetry katmanı append-only **JSONL event stream** üretecek.
6. SQLite, query/current-state ve metadata store olarak kullanılacak.
7. Event yaklaşımı full event-sourcing zorunluluğu yerine pragmatic event history/audit modeliyle başlayacak.
8. Workflow tanımları ilk aşamada repo-as-code kalacak; ileride UI Draft → Validate → Simulate → Publish akışıyla versioned spec yayınlayacak.
9. Project knowledge graph ilk aşamada relational entity/relationship modeliyle kurulacak; graph DB yalnız gerçek ihtiyaç ölçülürse değerlendirilecek.
10. Dashboard iki aşamalı olacak:
   - V2.5 read-only observability
   - V3 management/control plane

## Repository decision

Bu repository yalnız dokümantasyon repository'si değildir. FreeHighlander ürün kodunun ana repository'sidir.

İlk implementation odağı:
1. multi-model automation/control plane,
2. telemetry/dashboard,
3. Qwen benchmark/offloading,
4. V3 role/model/workflow engine.

SDLC modülleri daha sonra aynı repository ve core üzerinde eklenecektir.

## Rationale

Önce automation/control-plane çekirdeğini gerçek kullanımla doğrulamak, planning/security/testing gibi üst modüllerin güvenilir bir ortak kernel üzerinde inşa edilmesini sağlar.
