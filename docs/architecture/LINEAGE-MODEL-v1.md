# Engineering Lineage Model v1

**Status:** PROPOSED IMPLEMENTATION CONTRACT

## Minimal relational schema concept

~~~text
entities
  id
  type
  project_id
  created_at

entity_versions
  entity_id
  version
  status
  content_ref
  content_hash
  created_at
  created_by

relations
  id
  relation_type
  source_entity_id
  source_version?
  target_entity_id
  target_version?
  status
  created_at
  created_by

relation_evidence
  relation_id
  evidence_type
  artifact_id?
  repository?
  revision?
  content_hash?
~~~

Exact SQL schema is deferred to persistence implementation.

## Integrity rules

- unknown relation type = reject unless extension namespace is explicitly allowed
- source/target entity must exist
- relation evidence required for authoritative relation types
- superseded/deleted entity history is retained according to retention policy
- mutable "current" views are projections over version/history

## Example lineage

~~~text
REQ-118
  IMPLEMENTS ← TASK-391
       ↓
    PR-220
       ↓ VERIFIED_BY
  TEST-802
       ↓ RELEASES
    v1.8.3
       ↓ DEPLOYS
  deploy-77
       ↓ OBSERVES
  metric/alert
       ↓ TRIGGERED_BY
  INC-14
       ↓ PRODUCES
  postmortem
       ↓ DERIVED_FROM
  REQ-144
~~~

## Query targets

The initial model should efficiently answer:

- Which code changes implement REQ-X?
- Which tests verify a requirement?
- Which decision introduced a component?
- Which findings are still unresolved for a release?
- Which deployments contain a code change?
- Which incidents map back to a release/change?
- Which new work was created by an incident?

## Semantic index

A vector/semantic index may be built over selected entity content, but stores entity IDs as references. It is not the source of truth.
