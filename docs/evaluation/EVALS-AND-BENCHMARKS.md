# Evals and Benchmarks

**Status:** PROPOSED

## Goal

FreeHighlander must not choose models, reasoning effort, fallbacks or role promotion based on intuition alone.

## Unit of evaluation

Benchmark per **logical role**, not generic "best model".

Examples:
- repo-analyst
- test-candidate-reviewer
- security-candidate-reviewer
- final-reviewer
- bounded-implementer

## Dataset sources

Preferred:
1. real historical project runs
2. curated regression cases
3. synthetic adversarial cases
4. known failure incidents

Historical examples must preserve:
- task type
- exact evidence set
- expected/adjudicated outcome
- severity

## Metrics

Quality:
- agreement
- precision
- recall/miss rate where measurable
- P0/P1 misses
- P2 misses
- false-positive rate
- evidence quality
- schema validity

Efficiency:
- input tokens
- cached input tokens
- output tokens
- latency
- retry rate
- timeout rate
- quota impact
- estimated cost

Reliability:
- malformed output rate
- provider failure rate
- nondeterministic disagreement rate

## Shadow evaluation

For candidate role migration:

~~~text
same authoritative input
     ├── candidate model
     └── reference reviewer
              ↓
        independent verdicts
              ↓
        reconciliation label
~~~

The candidate model must not see the reference verdict before producing its first opinion.

## Promotion

A model/role binding may become `PROMOTION_CANDIDATE` when thresholds are met.

Promotion is a human/policy decision, not an automatic consequence of a score.

## Regression corpus

Every serious miss should become a durable regression case when legally/operationally safe.

This prevents model upgrades from silently reintroducing previously observed failures.

## Model upgrade policy

New model/version:
1. run shadow benchmark
2. compare quality/cost/latency
3. inspect critical misses
4. accept/reject binding change
5. record decision/version

Do not silently replace the model behind an authoritative role.
