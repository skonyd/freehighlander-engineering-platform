# Workflow Engine

## Pipeline değil workflow graph

V3 fixed sequence yerine konfigüre edilebilir graph kullanır.

Desteklenecek primitive'ler:

```text
MODEL
COMMAND
GATE
CONDITION
PARALLEL
AGGREGATE
DEBATE
LOOP (bounded)
HUMAN
SUBWORKFLOW
```

## Esnek gate ordering

Kapıların sırası source code'a gömülmez. Workflow version'a bağlı graph'tan gelir.

## Dynamic role injection

Örnek:

```text
IF changed path matches packages/auth/**
THEN inject Security Reviewer after Pre-review
```

## Debate / Council

İki veya daha fazla model aynı kararı tartışabilir.

Önerilen protokol:

1. independent first opinion
2. reveal
3. disagreement detection
4. evidence exchange / cross-review
5. bounded round(s)
6. consensus veya escalation

Consensus seçenekleri:

- unanimous
- majority
- weighted
- adjudicator
- human escalation

Critical işler için automated consensus insan authority'sini kaldırmaz.

## Sub-workflow

Örneğin `security-review`:

```text
Threat Model
   ↓
Secure Code Review
   ↓
Security Tests
```

Ana workflow tek node ile bu sub-workflow'u çağırabilir.

## Versioning

Her run:

- workflow name/version/hash
- role contract hashes
- policy hash
- provider bindings

ile bağlanır. Publish sonrası devam eden run ortasında workflow değiştirilmez.

## UI hedefi

Visual Workflow Designer:

- drag/drop nodes
- reorder
- parallel branches
- condition builder
- debate editor
- model/role selection
- simulate
- validate
- publish new version
