# Context Profiles

**Status:** ACCEPTED

## Neden?

Her modelin tüm repository dokümantasyonunu her seferinde okuması hem token israfı hem de stale/irrelevant bilgi riskidir. Bu nedenle context, görev tipine göre deterministik bir profile ayrılır.

Machine-readable tanım: `.freehighlander/context.yaml`.

## Profiller

### resume-minimal
Yeni makine / yeni model / yeni chat için minimum başlangıç.

Amaç yalnız şunları çözmektir:
- nerede kaldık?
- aktif PR/work item ne?
- blocker ne?
- sıradaki güvenli adım ne?
- current logical role ne?

### planning
Product/architecture/roadmap kararı için gereken kabul edilmiş kararları ve açık soruları yükler.

### implementation
Aktif ticket + ilgili requirement/ADR + repo contract + quality/security kuralları.

### review
Exact revision, authority rules, tests/security ve producer'dan bağımsız evidence.

## Context expansion kuralı

```text
MINIMAL CONTEXT
     ↓
active work item
     ↓
direct dependency docs
     ↓
only when needed: broader repository search
```

"Her şeyi oku" varsayılan davranış değildir.

## Staleness

Bir doküman current pointer ile çelişirse:
1. remote Git/GitHub doğrulanır,
2. accepted ADR precedence uygulanır,
3. conflict raporlanır,
4. silent inference yapılmaz.
