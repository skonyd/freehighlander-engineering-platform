# FreeHighlander Engineering Platform

> Çalışma adı. Amaç: bir yazılım fikrinin ilk tanımından production gözlemine ve incident sonrası öğrenmeye kadar tüm SDLC sürecini; insan otoritesini koruyan, değiştirilebilir LLM rolleri ve deterministik kapılarla yönetmek.

## Mevcut durum

Bu repo **kodlama reposu değil, ürün/mimari planlama reposudur**. İlk gerçek implementation çekirdeği şu anda `skonyd/creator-marketplace` içindeki automation çalışmasında doğrulanıyor.

Güncel geçiş planı:

1. PR #207 final acceptance + merge + post-merge smoke.
2. Mevcut V2 pipeline'a telemetry/metrics ekleme.
3. Read-only dashboard.
4. Qwen specialist rollerini shadow benchmark ile ölçme.
5. Kalite düşmeden devredilebilen rolleri Qwen primary'ye taşıma.
6. Token/context optimizasyonu.
7. V3 role/model/router + workflow engine tasarımı.
8. Shell orchestration'dan TypeScript control plane'e kademeli geçiş.
9. Planning, Development, Testing, Security, Release, Operations ve Incident modüllerini aynı çekirdek üzerinde geliştirme.

## Temel prensipler

- `LLM output is data, never authority.`
- Producer ile final approver aynı otorite değildir.
- Deterministik kapılar model görüşünden üstündür.
- CRITICAL/denylist durumunda insan otoritesi korunur.
- Model değişebilir; logical role sabit kalır.
- Fallback yalnız availability/quota/provider failure gibi durumlarda çalışır; semantic FAIL üzerine model shopping yapılmaz.
- Workflow esnek olabilir; authority invariant'ları zayıflatılamaz.
- Yeni roller core source code değiştirmeden eklenebilmelidir.
- Telemetry önce, rewrite sonra.

## Dokümanlar

- [Vizyon](docs/VISION.md)
- [Ana Yol Haritası](docs/ROADMAP.md)
- [V2.5 Planı](docs/v2.5/PLAN.md)
- [Metrics & Dashboard](docs/v2.5/METRICS-DASHBOARD.md)
- [Qwen Role Benchmark](docs/v2.5/QWEN-BENCHMARK.md)
- [V3 Architecture Contract](docs/v3/ARCHITECTURE-CONTRACT.md)
- [Role / Model Router](docs/v3/ROLE-MODEL-ROUTER.md)
- [Workflow Engine](docs/v3/WORKFLOW-ENGINE.md)
- [Platform Modules](docs/modules/MODULES.md)
- [Backlog](BACKLOG.md)
- [ADR-0001](docs/decisions/ADR-0001-platform-direction.md)
- [ADR-0002](docs/decisions/ADR-0002-v2-authority-v3-shadow.md)
