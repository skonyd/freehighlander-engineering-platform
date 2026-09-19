# FreeHighlander Engineering Platform

> Fikir aşamasından production operasyonuna kadar yazılım yaşam döngüsünü; değiştirilebilir LLM rolleri, deterministik kapılar, insan otoritesi ve tam mühendislik izlenebilirliği ile yöneten AI destekli engineering platformu.

## Durum

Bu repository şu anda **planning / architecture / governance repository** olarak kullanılır. Ürün kodu başlamadan önce hedefler, kararlar, PR sırası, quality/security kuralları ve mevcut Creator Marketplace automation çekirdeğinin buraya nasıl taşınacağı burada tanımlanır.

Mevcut bootstrap/reference implementation:
- `skonyd/creator-marketplace`
- PR #207: multi-model automation çekirdeği
- #207 tamamlandıktan sonra bu repo için V2.5 telemetry + dashboard + Qwen benchmark fazı başlar.

## İlk teslim sırası

1. #207 final acceptance + merge + post-merge smoke.
2. Bu repo için automation bootstrap.
3. Telemetry/event schema.
4. Read-only dashboard.
5. Qwen specialist shadow benchmark.
6. Ölçüme göre rol offloading.
7. Token/context optimizasyonu.
8. V3 logical role/model router.
9. Workflow DAG + state machine.
10. TypeScript control plane.
11. Planning → Development → Testing → Security → Release → Operations → Incident modülleri.

## Dokümantasyon

- [Documentation Index](docs/INDEX.md)
- [Vision](docs/VISION.md)
- [Roadmap](docs/ROADMAP.md)
- [Project Charter](docs/project/CHARTER.md)
- [Scope & Non-goals](docs/project/SCOPE-AND-NONGOALS.md)
- [Requirements](docs/project/REQUIREMENTS.md)
- [Non-functional Requirements](docs/project/NON-FUNCTIONAL-REQUIREMENTS.md)
- [PR Roadmap](docs/planning/PR-ROADMAP.md)
- [Discussion Agenda](docs/planning/DISCUSSION-AGENDA.md)
- [Automation Adoption](docs/automation/AUTOMATION-ADOPTION.md)
- [Architecture Contract](docs/v3/ARCHITECTURE-CONTRACT.md)
- [Backlog](BACKLOG.md)

## Değişmez prensipler

- **LLM output is data, never authority.**
- Model değişebilir; logical role/contract sabit kalır.
- Producer kendi çıktısının final approver'ı olamaz.
- Deterministik kapılar model yorumuyla bypass edilemez.
- Fallback yalnız availability/quota/provider sınıfındaki hatalar içindir; semantic FAIL üzerine model shopping yapılmaz.
- CRITICAL/denylist akışlarda insan otoritesi korunur.
- Workflow esnek olabilir; authority invariant'ları workflow tarafından zayıflatılamaz.
- Yeni roller core orchestrator source code'u değiştirmeden eklenebilmelidir.
- Telemetry ve baseline ölçümü rewrite'tan önce gelir.
