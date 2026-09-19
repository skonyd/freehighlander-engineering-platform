# Risk Register

**Status:** DRAFT

| ID | Risk | Impact | İlk mitigation |
|---|---|---:|---|
| RK-001 | V2 davranışı rewrite sırasında kaybolur | High | V2 reference + compatibility tests + shadow dual-run |
| RK-002 | Fallback semantic FAIL'i bypass eder | Critical | availability-only fallback |
| RK-003 | Qwen offloading kaliteyi düşürür | High | shadow benchmark + promotion thresholds |
| RK-004 | Model output authority gibi kullanılır | Critical | role authority + trusted provenance writer |
| RK-005 | Prompt/config değişikliği eski artifact'ı geçerli tutar | High | contract/workflow/prompt hash |
| RK-006 | UI kritik invariant siler | Critical | immutable policy/authority layer |
| RK-007 | Tool-enabled agent workspace/secrets'e zarar verir | Critical | sandbox + secrets broker + allowlists |
| RK-008 | Event/artifact verisi kontrolsüz büyür | Medium | retention/compaction policy |
| RK-009 | Provider quota run'ları kilitler | Medium | quota groups + safe fallback |
| RK-010 | Debate false confidence üretir | High | independent opinion + evidence + escalation |
| RK-011 | Scope kontrolsüz büyür | High | phased modules + non-goals |
| RK-012 | Planning-code lineage kopar | High | project knowledge graph |
| RK-013 | Cost görünürlüğü yetersiz | Medium | token/cost/budget telemetry |
| RK-014 | Benchmark bias | Medium | independent comparison + sample thresholds |
