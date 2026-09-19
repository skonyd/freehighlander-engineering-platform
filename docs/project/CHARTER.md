# Project Charter

**Status:** PROPOSED

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

## Primary user
İlk hedef: teknik olarak yetkin, küçük ekip veya tek geliştiricili projelerde çoklu LLM/agent koordinasyonu isteyen engineering owner.

## İlk başarı
- V2 automation davranışını ölçmek,
- Qwen offloading ile paid token kullanımını kaliteyi anlamlı düşürmeden azaltmak,
- V3 role/model/workflow çekirdeğini güvenilir hale getirmek,
- aynı çekirdek üzerinde Planning + Development modüllerini çalıştırmak.

## Kısıtlar
- Creator Marketplace automation ilk reference implementation'dır.
- V3 hazır olana kadar V2 authority olarak kalır.
- Human authority kritik akışlarda korunur.
- Big-bang rewrite yoktur.
