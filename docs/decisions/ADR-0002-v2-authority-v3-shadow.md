# ADR-0002 — V3 hazır olana kadar V2 authority, V3 shadow

**Status:** Proposed / direction approved

## Decision

V3 ilk sürümlerinde üretim/merge authority taşımaz. Aynı task üzerinde V2 sonucu ile karşılaştırılır.

```text
V2 = authority
V3 = shadow
```

Promotion için:

- state transition parity
- artifact/provenance validation parity
- deterministic gate parity
- benchmark acceptance
- failure injection
- crash/recovery behavior

kanıtlanmalıdır.

Parity sonrası:

```text
V3 = authority
V2 = compatibility/reference
```
