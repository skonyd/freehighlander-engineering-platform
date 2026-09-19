# FH-08 — Provider health / quota / circuit-breaker telemetry

**Issue:** #36  
**Status:** COMPLETE  
**Authority effect:** NONE

## Objective

Make provider availability failures observable and bounded without changing semantic authority, quality gates, or fallback policy.

## Scope

- deterministic provider circuit breaker;
- CLOSED / OPEN / HALF_OPEN state transitions;
- availability-failure threshold;
- quota/rate-limit retry cooldown;
- normalized provider health snapshots;
- provider health/circuit telemetry metadata;
- architecture guards and deterministic tests.

## Failure policy

Circuit-breaking is availability-only.

Counts toward the circuit:
- quota_exhausted
- rate_limited
- auth_unavailable
- provider_unavailable
- transport_failure

Does not trip the circuit:
- semantic_failure
- malformed_output

A non-availability outcome proves the provider is reachable for availability purposes and clears the availability failure streak. It does not convert the semantic result into PASS and does not trigger model shopping.

## Cooldown

The probe window is:

```text
max(configured_open_duration, provider_retry_after)
```

Provider retry hints may extend but never shorten the configured cooldown.

## Telemetry

Provider resilience events are metadata-only:

- `provider.health.checked`
- `provider.circuit.opened`
- `provider.circuit.half_opened`
- `provider.circuit.closed`
- existing `provider.unavailable`
- existing `quota.exhausted`

No prompt/completion content is required.

## Acceptance

- CLOSED → OPEN → HALF_OPEN → CLOSED is deterministic;
- failed HALF_OPEN probe reopens immediately;
- semantic/malformed failures never trip the circuit;
- retry-after normalization is tested;
- provider/circuit state is telemetry-visible;
- circuit breaker cannot change authority;
- `npm run verify` passes;
- canonical state closes FH-08.
