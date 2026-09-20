# FH-32A — Testing module pre-cutover implementation

**Issue:** #75  
**Status:** IN PROGRESS  
**Architecture contract:** 1.3.0  
**Authority effect:** NONE

## Objective

Represent test plans, acceptance coverage and exact revision/environment-bound test
evidence as deterministic read-only state before V3 authority cutover.

## Domain model

A test plan binds:
- development candidate identity;
- repository and exact revision under test;
- exact environment fingerprint;
- required acceptance criteria;
- required/optional test cases and coverage mappings.

A test run binds:
- plan identity;
- repository and exact revision;
- exact environment fingerprint;
- result per test case;
- digest-bound result evidence.

## Shadow gate

The read-only evaluator returns:

```text
PASS
FAIL
INSUFFICIENT_EVIDENCE
```

Missing/skipped required results remain `INSUFFICIENT_EVIDENCE`. FAIL/ERROR on a
required case remains `FAIL`.

## Authority boundary

```text
test PASS != merge authority
test PASS != release/deploy authority
test PASS != authority promotion
authority = NONE
V3 authority = SHADOW_ONLY
```

## Verification

```bash
npm run verify
```
