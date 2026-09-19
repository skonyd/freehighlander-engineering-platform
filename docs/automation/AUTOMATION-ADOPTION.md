# Automation Adoption Plan

**Status:** PROPOSED

## Ön koşul
Creator Marketplace PR #207 final acceptance + merge + post-merge smoke.

## FH-01 kapsamı
Davranış olarak korunacak:
- exact-SHA artifact binding
- fail-closed gates
- risk tiers
- denylist/human-required
- Qwen local worker profiles
- Opus test-review specialist
- independent final reviewer
- candidate/adjudication separation
- repair rounds
- context-triage task fingerprint
- trusted provenance store
- quota/timeout primitives
- regression suites

## Repo-specific uyarlama
Creator Marketplace application paths, domain/package assumptions, DB/migration checks ve denyPaths aynen kopyalanmaz.

## İlk risk scope
- docs/planning change
- automation/core change
- future application/code change

## Telemetry hook noktaları
FH-01 telemetry implement etmez; FH-02 için:
- run start/end
- gate start/end
- model call start/end
- artifact store/check
- finding create/adjudicate
- human required
hook noktaları korunur.

## V2/V3 sınırı
V2 authority/reference; V3 önce shadow, parity sonrası authority.
