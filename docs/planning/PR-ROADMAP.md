# PR Roadmap

**Status:** PROPOSED

FH kimlikleri planlanan çalışma paketidir.

## Foundation
- **FH-00 Planning foundation:** docs/scope/requirements/risk/governance/PR planı. Kod yok.
- **FH-01 Automation bootstrap:** Creator Marketplace #207 merge+smoke sonrası V2 automation'ı bu repo için uyarlama.
- **FH-02 Telemetry event schema + emitter:** run/gate/model/artifact/finding event'leri, JSONL.
- **FH-03 SQLite telemetry/state index:** migrations, run/event/model_call/artifact/finding read model.
- **FH-04 Read-only dashboard:** runs/timeline/models/tokens/findings/artifacts/failures.

## Qwen/model economics
- **FH-05 Qwen specialist shadow roles:** repo/test/security/architecture/CVE candidates.
- **FH-06 Benchmark reconciliation:** agreement/precision/miss/token/latency ve promotion report.
- **FH-07 Token/context optimization:** evidence packets, safe cache, duplicate call suppression.
- **FH-08 Provider health/quota:** taxonomy, quota groups, circuit breaker, availability fallback telemetry.

## V3
- **FH-10 Architecture contract freeze**
- **FH-11 Provider adapters + binding registry**
- **FH-12 Role registry + role packages**
- **FH-13 Workflow DAG + explicit state machine**
- **FH-14 Debate/council + disagreement escalation**
- **FH-15 Policy-as-code + human approval**
- **FH-16 Artifact lineage + hashes**
- **FH-17 Replay/simulation + crash recovery**
- **FH-18 UI control plane**
- **FH-19 V2/V3 shadow parity**
- **FH-20 V3 authority cutover**

## SDLC modules
- **FH-30 Planning module MVP:** idea → requirements → gaps → architecture options → ADR → backlog.
- **FH-31 Development module:** task → implementation → review → tests → merge.
- **FH-32 Testing module:** requirement coverage + specialist test roles.
- **FH-33 Security module:** threat model + code/dependency/container/IAM/pentest roles.
- **FH-34 Release module:** release dossier + deployment/rollback/risk gates.
- **FH-35 Operations module:** runtime integrations + deployment/metric lineage.
- **FH-36 Incident module:** timeline → RCA → mitigation → postmortem → learning loop.
- **FH-37 Project knowledge graph:** requirement/decision/task/code/test/finding/release/incident relationships.

## Dependency spine
```text
FH-00
 ↓
FH-01 → FH-02 → FH-03 → FH-04
                   ↓
                FH-05 → FH-06 → FH-07/08
                                 ↓
                              FH-10
                                 ↓
                    FH-11 → FH-12 → FH-13
                                      ↓
                              FH-14/15/16
                                      ↓
                                  FH-17/18
                                      ↓
                                  FH-19 → FH-20
                                              ↓
                                         FH-30+
```
