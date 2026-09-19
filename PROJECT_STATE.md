# FreeHighlander — Current Project State

**State status:** FH-05 COMPLETE / FH-01B2 BLOCKED  
**Canonical pointer:** `.freehighlander/state.yaml`

## Completed

- FH-00 planning foundation
- FH-01A executable TypeScript platform bootstrap
- FH-01B1 provisional V2 compatibility port
- FH-02 append-only telemetry event history
- FH-03 SQLite telemetry read model
- FH-04 read-only local observability dashboard
- FH-05 independent Qwen/local shadow evaluation framework

FH-05 provides:

- OpenAI-compatible local provider adapter
- local provider health + chat-completion calls
- usage-token mapping
- availability/failure classification
- independent candidate/reference first opinions
- same-authoritative-input hash binding
- independence-key separation
- finding reconciliation
- CONFIRMED / FALSE_POSITIVE / MISSED_BY_CANDIDATE / UNRESOLVED labels
- explicit P0/P1 and P2 miss accounting
- initial specialist shadow-role registry
- shadow/benchmark telemetry event types

## Authority remains unchanged

Shadow evaluation is measurement only:

```text
shadowCanGrantAuthority() = false
pair.authority = NONE
reconciliation.promotionAuthority = NONE
```

FH-01B1 remains:

```text
REFERENCE_STATUS = PROVISIONAL
AUTHORITY         = DISABLED
```

FH-01B2 issue **#19** still requires Creator Marketplace #207 final acceptance, merge and post-merge smoke.

## Next unblocked work

FH-06 benchmark reconciliation and promotion-candidate reporting.

FH-06 may say `PROMOTION_CANDIDATE`; it must never self-promote a role to authority.
