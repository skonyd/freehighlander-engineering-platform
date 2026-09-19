# V2 Provisional Reference — FH-01B1

**Status:** PROVISIONAL / NON-AUTHORITATIVE  
**Issue:** #18

## Captured source

```text
repository: skonyd/creator-marketplace
pull_request: 207
head_sha: 0e70f4a9680fcc5c287b7926f2aa20170c79f47d
reference_status: PROVISIONAL
authority: DISABLED
```

## Compatibility invariants captured

1. TASK_ID is task-scoped; fingerprint = SHA-256(repository identity + "|" + TASK_ID).
2. PR body transports exactly one valid automation-task-id marker; zero/multiple markers fail closed.
3. Risk can escalate but effective risk cannot be downgraded.
4. CRITICAL requires human handling.
5. Final reviewer route is gpt-6-astra with tier-aware effort in the provisional V2 profile.
6. Opus test-review routing is deterministic; producer cannot bypass it.
7. Test-review structure is strict and INSUFFICIENT requires a concrete finding.
8. Authoritative artifact decisions use full artifacts, not display-shortened artifacts.
9. Candidate adjudication is controller-stamped and bound to the exact full pre-review content hash.
10. Context-triage WARN adjudication is controller-stamped and bound to exact triage content hash and BASE_SHA.
11. Trusted adjudication roles cannot enter through the generic untrusted store path.
12. Repair rounds increment only after a successful review of a new SHA following an INSUFFICIENT review; CLI/auth/malformed retries do not consume a repair round.
13. Semantic FAIL/BLOCKED/INSUFFICIENT is not a provider-fallback reason.
14. FH-01B1 itself cannot enable workflow/merge/final authority.

## FH-01B2 reconciliation

After #207 final acceptance/merge/smoke:

- record final accepted SHA
- compare with the SHA above
- inspect exact delta
- update this port only for accepted delta
- rerun parity/regression tests
- run post-port smoke
- explicitly review authority promotion

No silent promotion is permitted.


## Implementation status

FH-01B1 implementation:
- package: `packages/v2-compat`
- PR: `#21`
- state: COMPLETE once final PR CI is green and merged
- authority remains DISABLED
- `automation/legacy-v2/` remains documentation-only

Deterministic architecture checks fail if the provisional source is changed to `ACCEPTED` or `ENABLED` before FH-01B2.
