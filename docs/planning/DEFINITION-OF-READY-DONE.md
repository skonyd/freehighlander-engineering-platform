# Definition of Ready / Done

## PR Ready
- amaç/scope açık
- acceptance criteria yazılı
- dependencies biliniyor
- ilgili discussion/ADR kapanmış veya assumption olarak işaretli
- authority/security etkisi belirtilmiş
- test stratejisi belirtilmiş
- rollout/rollback etkisi düşünülmüş
- telemetry etkisi düşünülmüş

## PR Done
- acceptance criteria karşılandı
- tests + deterministic verify geçti
- docs güncellendi
- migration varsa belgeli
- event/metric etkisi test edildi
- secrets/PII log'a sızmıyor
- backward compatibility değerlendirildi
- findings adjudicate edildi
- authority policy ihlal edilmedi
- gerekiyorsa human approval
- post-merge smoke planı var

## Decision Done
- alternatives/trade-offs kayıtlı
- decision owner belli
- ACCEPTED/REJECTED statüsü var
- affected requirements/PR'lar bağlı
- supersede yolu tanımlı
