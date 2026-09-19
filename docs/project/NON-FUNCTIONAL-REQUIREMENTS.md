# Non-functional Requirements

**Status:** ACCEPTED BASELINE

- **NFR-001 Fail closed:** doğrulanamayan authority/gate/permission geçmez.
- **NFR-002 Auditability:** role/provider/model/input/evidence/policy/workflow/tool provenance izlenir.
- **NFR-003 Reproducibility:** deterministic kısımlar exact revision + contract/policy/workflow hashes ile tekrar çalışır.
- **NFR-004 Resumability:** crash/session/machine change sonrası güvenli state'ten devam.
- **NFR-005 Provider independence:** core provider CLI/API detayına bağımlı olmaz.
- **NFR-006 Security:** secrets prompt/artifact/event log'a sızmaz; tool/network/filesystem izinleri least-privilege.
- **NFR-007 Performance:** güvenli independent node'lar paralel; layered deadline bütün run budget'ı içinde izlenir.
- **NFR-008 Observability:** latency, tokens, cache, retries, timeout, quota, failure class, finding lifecycle ve cost ölçülür.
- **NFR-009 Evolvability:** yeni role/provider/tool/workflow capability mümkün olduğunca core değişmeden eklenebilir.
- **NFR-010 Data portability:** project/workflow/decision/artifact/lineage metadata export edilebilir.
- **NFR-011 Backward compatibility:** V2→V3 parity/regression testleri cutover öncesi gerekir.
- **NFR-012 Human control:** high-impact authority human approval'a bağlanabilir.
- **NFR-013 Privacy:** data classification ve provider egress policy uygulanır; SECRET remote model egress yasaktır.
- **NFR-014 Recovery:** backup yalnız üretim değil restore/integrity smoke ile doğrulanır.
- **NFR-015 Cost safety:** budget exhaustion PASS/semantic FAIL'e çevrilmez; authority maliyet için düşürülmez.
- **NFR-016 State consistency:** run state + authoritative artifact publication crash-safe/atomic semantics'e yaklaşmalıdır.
- **NFR-017 Immutable execution contract:** active run workflow/role/policy/binding snapshot'ına pinlenir.
- **NFR-018 Minimal context:** context selection traceable/justified olmalı; required evidence budget için truncate edilmemeli.
- **NFR-019 Plugin isolation:** external tool metadata/transport auth workflow authority sağlamaz.
- **NFR-020 Local safety:** initial control plane loopback-only default; non-loopback exposure authentication gerektirir.
