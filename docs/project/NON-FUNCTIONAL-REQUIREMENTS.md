# Non-functional Requirements

**Status:** DRAFT

- **NFR-001 Fail closed:** doğrulanamayan authority/gate geçmez.
- **NFR-002 Auditability:** role/provider/model/input/evidence/policy/workflow provenance izlenir.
- **NFR-003 Reproducibility:** deterministic kısımlar exact revision + contract hash ile tekrar çalışır.
- **NFR-004 Resumability:** crash sonrası güvenli state'ten devam.
- **NFR-005 Provider independence:** core provider CLI/API detayına bağımlı olmaz.
- **NFR-006 Security:** secrets prompt/artifact/event log'a sızmaz; tool/network/filesystem izinleri sınırlanır.
- **NFR-007 Performance:** güvenli independent nodes paralel; timeout bütün workflow budget'ında takip edilir.
- **NFR-008 Observability:** latency, tokens, retries, timeout, quota, cache, failure class, findings ölçülür.
- **NFR-009 Evolvability:** yeni role/provider/workflow node mümkün olduğunca core değişmeden eklenir.
- **NFR-010 Data portability:** project/workflow/decision/artifact metadata export edilebilir.
- **NFR-011 Backward compatibility:** V2→V3 parity testleri gerekir.
- **NFR-012 Human control:** high-impact authority human approval'a bağlanabilir.
