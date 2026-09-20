# FH-30..FH-37 — Pre-cutover preparation lane

**Status:** ACCEPTED PREPARATION DIRECTION  
**Authority effect:** NONE  
**Blocker for activation:** FH-01B2 / FH-20 final cutover

## Purpose

Creator Marketplace #207 blocks accepted V2 reconciliation and V3 authority cutover, but it does not need to block authority-neutral module design and implementation preparation.

Each module is therefore split into:

- **A — pre-cutover preparation:** contracts, state machines, schemas, evidence models, read-only/query surfaces, deterministic validators, simulation/shadow behavior and tests.
- **B — post-cutover activation:** authoritative mutation/execution, automated promotion/deploy/merge/remediation and any behavior that depends on V3 authority.

A-lane work may merge before FH-20. B-lane work may not.

## Global invariants

```text
pre-cutover preparation != authority
read-only/query != mutation authority
simulation/shadow != production action
module readiness != module activation
FH-20 remains the authority activation gate
legacy V2 retirement remains post-cutover
```

## FH-30A — Planning module

### Objective
Represent engineering plans, acceptance criteria, dependencies, decisions and blockers as deterministic versioned entities.

### Pre-cutover deliverables
- plan/work-item contract;
- dependency graph validation;
- acceptance-criterion identity;
- plan revision and supersession semantics;
- blocker/readiness projection;
- read-only plan query surface;
- deterministic tests.

### Activation boundary
No plan state may authorize code execution, merge, deployment or policy bypass.

## FH-31A — Development module

### Objective
Represent implementation work and exact repository revisions without granting write authority.

### Pre-cutover deliverables
- development task/change-candidate contract;
- repository + base/head revision binding;
- affected-path and scope representation;
- implementation intent and result evidence;
- read-only/shadow execution planning;
- deterministic validation/tests.

### Activation boundary
Git mutation, command execution with side effects, PR merge and authority-bearing write actions remain post-cutover policy-controlled actions.

## FH-32A — Testing module

### Objective
Represent test plans, test cases, execution evidence and requirement coverage independently from authority decisions.

### Pre-cutover deliverables
- test-plan/test-case/result contracts;
- acceptance-criterion-to-test coverage mapping;
- exact revision and environment binding;
- deterministic test-evidence validation;
- read-only reports and shadow gate evaluation.

### Activation boundary
A test PASS cannot itself authorize merge, release or promotion.

## FH-33A — Security module

### Objective
Represent security findings, scanner evidence, policy mappings and exception requests.

### Pre-cutover deliverables
- finding/severity/evidence contract;
- scanner provenance and revision binding;
- policy/control mapping;
- exception-request representation;
- read-only security posture queries;
- deterministic validation/tests.

### Activation boundary
A scanner or model cannot self-approve an exception or downgrade policy authority.

## FH-34A — Release module

### Objective
Represent release candidates and promotion evidence without performing deployment.

### Pre-cutover deliverables
- release-candidate and artifact-manifest contracts;
- source/build/test/security evidence binding;
- release-readiness projection;
- rollback-plan metadata;
- read-only release history/query surface.

### Activation boundary
No deploy, environment promotion, tag/release publication or rollback action before policy/human authorization after FH-20.

## FH-35A — Operations module

### Objective
Represent service inventory, health, runbooks and operational action intents.

### Pre-cutover deliverables
- service/resource identity;
- health snapshot contract;
- runbook/version contract;
- operational intent model;
- read-only operational dashboard/query projection;
- deterministic tests.

### Activation boundary
Operational intents are data only; live infrastructure mutation is not permitted pre-cutover.

## FH-36A — Incident module

### Objective
Represent incident lifecycle, observations, hypotheses, evidence and remediation intents.

### Pre-cutover deliverables
- incident state machine;
- timeline/event contract;
- observation/hypothesis/evidence links;
- remediation-intent representation;
- postmortem/learning references;
- deterministic tests.

### Activation boundary
Incident automation may recommend or prepare remediation but cannot execute production remediation pre-cutover.

## FH-37A — Project knowledge graph / engineering lineage

### Objective
Create a versioned, provenance-aware graph of engineering entities and relations.

### Pre-cutover deliverables
- versioned entity identity;
- typed/versioned relation contract;
- provenance and source-revision binding;
- relation validity intervals/supersession;
- lineage/query projection;
- deterministic graph integrity checks.

### Activation boundary
Graph facts do not grant authority. Derived relations cannot replace required authoritative evidence.

## Pre-cutover dependency graph

```text
Current V3 foundation (FH-10..19 + FH-20 readiness)
        |
        +--> FH-30A Planning
        |       |
        |       +--> FH-31A Development --> FH-32A Testing
        |                               \--> FH-34A Release
        |
        +--> FH-33A Security -----------/
        |
        +--> FH-35A Operations --> FH-36A Incident
        |
        +--> FH-37A Knowledge Graph

FH-01B2 + FH-20 final cutover
        |
        +--> FH-30B..FH-37B activation
        +--> legacy V2 retirement
```

FH-33A, FH-35A and FH-37A can proceed in parallel with FH-30A/FH-31A because their preparation contracts depend on already completed governance/evidence/telemetry foundations rather than V3 authority.

## Definition of done for A-lane

An A-lane module is complete only when:
1. its bounded purpose and authority boundary are explicit;
2. exact revision/evidence/provenance semantics are defined where relevant;
3. unknown or missing required data fails closed;
4. deterministic tests exist;
5. no code path enables authority or live mutation;
6. architecture/project checks pass.

## Promotion into B-lane

No A-lane completion implies B-lane activation.

B-lane begins only after FH-20 cutover prerequisites pass and canonical state records V3 authority activation according to policy.
