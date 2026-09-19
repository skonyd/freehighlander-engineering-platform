# Metrics & Dashboard

## Event-first yaklaşım

Dashboard özel log parsing yapmamalı. Pipeline önce yapılandırılmış event üretmeli, dashboard bu event'lerden türetilmeli.

Örnek event türleri:

```text
run.started
run.completed
gate.started
gate.completed
model.call.started
model.call.completed
artifact.created
artifact.invalidated
candidate.created
finding.adjudicated
human.required
human.decision
provider.unavailable
quota.exhausted
```

## Minimum event metadata

- schema_version
- timestamp
- run_id
- task_id
- workflow_id / workflow_version
- PR / branch / base_sha / head_sha
- node_id
- gate/role
- provider
- model
- effort
- status/result
- duration_ms
- retry_count
- input/output/total tokens (varsa)
- artifact ids/hashes
- failure class

## İlk dashboard ekranları

### Runs

- Run listesi.
- Final status.
- Total duration.
- Risk tier.
- Human-required.

### Run detail

```text
Triage          PASS   35s
CI              PASS   2m10s
Qwen pre-review PASS   3m48s
Opus            PASS   2m51s
Full verify     PASS   1m55s
Candidate       WAIT
Astra           -
Human           -
```

### Models

- Role → model kullanımı.
- Calls.
- Tokens.
- Latency avg/p50/p95.
- Retry/timeout/quota.
- Cache hit.

### Findings benchmark

- Candidate count.
- Confirmed/rejected/unresolved.
- Precision.
- Agreement.
- P0/P1 misses.

## Storage geçişi

1. `events.jsonl`
2. SQLite index/state store
3. Gerekirse ileride PostgreSQL
