# V3 Architecture Contract — Taslak

## Hedef

V2 shell reference implementation'ını gerçek bir reusable engineering control plane'e dönüştürmek.

## Zorunlu mimari özellikler

### Control plane / execution plane ayrımı

```text
CONTROL PLANE
- orchestrator
- state machine
- policy engine
- role router
- scheduler
- quota/budget manager
- artifact/provenance manager

EXECUTION PLANE
- model providers
- git/GitHub
- deterministic commands/tests
- sandbox/tool adapters
```

### Event-sourced run history

Her state change append-only event üretir. Metrics, audit, replay ve UI aynı event stream'den beslenir.

### Persistence

İlk hedef SQLite:

- runs
- events
- node_runs
- artifacts metadata
- model_calls
- approvals
- provider_health
- findings
- benchmark_labels

### Artifact lineage

Her authoritative artifact en az şunlara bağlanır:

- run/workflow/node
- exact revision
- logical role
- binding
- provider/model/effort
- prompt/contract hash
- input content hash
- output hash
- parent artifacts

### Human approval

İnsan kararı first-class artifact olmalıdır; SHA, kapsam, gerekçe ve incelenen evidence'a bağlanır.

### Replay / simulation

- models-disabled replay
- alternate router simulation
- policy simulation
- historical runs üzerinde regression

### Crash recovery

Run güvenli state'ten devam edebilmeli; state/artifact publication transaction-benzeri olmalıdır.

### UI/CLI contract

UI ve CLI aynı API/control plane'i kullanır. UI günlük operasyonlarda source code veya shell düzenlemeyi gerektirmemelidir.
