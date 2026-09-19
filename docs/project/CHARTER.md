# Project Charter

**Status:** ACCEPTED

## Problem
Bugünkü AI coding araçları task/PR seviyesinde güçlüdür ancak fikir → requirement → architecture → code → test → security → release → production → incident zincirinde ortak karar, evidence ve lineage modeli sunmaz.

## North Star
Kullanıcı yeni proje fikrini verdiğinde platform:
1. eksikleri ve belirsizlikleri ortaya çıkarır,
2. kurumsal seviyede requirement ve NFR üretir,
3. alternatif mimarileri uzman rollerle değerlendirir,
4. insan kararlarını ADR/decision olarak kaydeder,
5. implementation'ı kontrollü workflow'larla yürütür,
6. test/security/release kapılarıyla kanıt üretir,
7. production sinyallerini aynı engineering lineage'a bağlar,
8. incident/postmortem çıktısını yeniden requirement/test/task'a dönüştürür.

## Repository rolü
Bu repository hem planlama/dokümantasyon hem de FreeHighlander ürün kodunun ana repository'sidir.

İlk kodlama hedefi tüm SDLC modülleri değildir. Önce:
- multi-model automation çekirdeği,
- telemetry,
- read-only dashboard,
- Qwen benchmark/offloading,
- V3 role/model/workflow control plane

tamamlanır. Daha sonra Planning, Development, Testing, Security, Release, Operations ve Incident modülleri bu çekirdeğin üzerine eklenir.

## Primary user
İlk hedef: teknik olarak yetkin, küçük ekip veya tek geliştiricili projelerde çoklu LLM/agent koordinasyonu isteyen engineering owner.

## İlk başarı
- V2 automation davranışını FreeHighlander içinde çalıştırmak,
- davranışı telemetry ile ölçmek,
- Qwen offloading ile paid token kullanımını kaliteyi anlamlı düşürmeden azaltmak,
- V3 role/model/workflow çekirdeğini güvenilir hale getirmek,
- aynı çekirdek üzerinde Planning + Development modüllerini çalıştırmak.

## Accepted initial product direction
- local-first
- single-user first
- TypeScript monorepo
- control-plane / web separation
- JSONL telemetry first
- SQLite read/query/current-state store
- repo-as-code workflow specs
- V2.5 read-only dashboard
- V3 management UI

## Kısıtlar
- Creator Marketplace automation ilk reference implementation'dır.
- V3 hazır olana kadar V2 authority olarak kalır.
- Human authority kritik akışlarda korunur.
- Big-bang rewrite yoktur.
