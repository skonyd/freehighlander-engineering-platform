# Risk Register

**Status:** ACCEPTED BASELINE

| ID | Risk | Impact | Mitigation |
|---|---|---:|---|
| RK-001 | V2 davranışı rewrite sırasında kaybolur | High | V2 reference + parity + shadow dual-run |
| RK-002 | Fallback semantic FAIL'i bypass eder | Critical | availability-only fallback / no model shopping |
| RK-003 | Qwen/local offloading kaliteyi düşürür | High | independent shadow benchmark + promotion policy |
| RK-004 | Model output authority gibi kullanılır | Critical | logical-role authority + system policy |
| RK-005 | Prompt/config değişikliği stale artifact reuse yaratır | High | prompt/workflow/policy/input hashes |
| RK-006 | UI kritik invariant siler | Critical | workflow layer < policy/authority layer |
| RK-007 | Tool-enabled agent workspace/secrets'e zarar verir | Critical | default-deny sandbox + human high-impact gates |
| RK-008 | Event/artifact data kontrolsüz büyür | Medium | retention classes + cleanup/compaction |
| RK-009 | Provider quota run'ları kilitler | Medium | health/quota + safe fallback + resumable state |
| RK-010 | Debate false confidence üretir | High | independent first opinions + bounded rounds + escalation |
| RK-011 | Scope kontrolsüz büyür | High | phased PR roadmap + non-goals |
| RK-012 | Planning-code lineage kopar | High | first-class versioned relation/evidence model |
| RK-013 | Cost görünürlüğü yetersiz | Medium | token/cache/cost/budget telemetry |
| RK-014 | Benchmark bias / over-promotion | High | real+adversarial corpus + human promotion decision |
| RK-015 | Duplicate/conflicting planning contracts | High | canonical ADR index + FH-00 consistency audit |
| RK-016 | Remote control plane accidentally auth'sız expose edilir | Critical | loopback default + non-loopback auth deny |
| RK-017 | SQLite raw copy committed state kaybeder | High | Online Backup/VACUUM INTO + restore test |
| RK-018 | External plugin/MCP server over-privileged olur | Critical | ToolAdapter normalization + explicit capabilities + pinning |
| RK-019 | Third-party skill/plugin prompt injection | High | review/preview/pin + sandbox; external text=data |
| RK-020 | Large context/token optimization drops required evidence | High | context packet manifest + evidence-preservation invariant |
| RK-021 | Provider-specific feature core semantics'e sızar | High | capability registry + adapters |
| RK-022 | Raw model/tool logs leak confidential data | Critical | redaction-before-persist + raw capture default-off |
| RK-023 | Backup exists but restore fails | High | manifest/hash + restore drill |
| RK-024 | Active run behavior changes mid-run | High | immutable run snapshot |
