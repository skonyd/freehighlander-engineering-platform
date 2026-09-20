# Engineering Lineage Schema v1

**Status:** ACCEPTED IMPLEMENTATION CONTRACT — FH-37A

## Core tables

### entities

~~~text
id
project_id
entity_type
current_version_id
created_at
archived_at?
~~~

### entity_versions

~~~text
id
entity_id
version
status
title?
payload_json/content_ref
content_hash
created_at
created_by
source_artifact_id?
~~~

### relations

~~~text
id
project_id
relation_type
source_entity_id
source_version_id?
target_entity_id
target_version_id?
status
created_at
created_by
valid_from?
valid_to?
~~~

### relation_evidence

~~~text
relation_id
evidence_type
artifact_id?
repository?
revision?
content_hash?
~~~

### external_refs

~~~text
id
entity_id
system
repository_id?
reference_type
reference_value
immutable_revision?
~~~

## Initial relation vocabulary

~~~text
DERIVED_FROM
REFINES
IMPLEMENTS
VERIFIES
CONSTRAINS
DEPENDS_ON
SUPERSEDES
GENERATED_FROM
FOUND_IN
RESOLVED_BY
MITIGATES
BLOCKS
PRODUCES
REFERENCES
INCLUDED_IN
RELEASES
DEPLOYS
OBSERVES
TRIGGERED_BY
CAUSED_BY
~~~

Vocabulary versioned'dır. Arbitrary free-text relation names authoritative değildir.

## Provenance

Authoritative decision'ı etkileyen relation:
- human action,
- deterministic import,
- model candidate + adjudication,
- accepted artifact

ile trace edilebilmelidir.

## Integrity

- unknown relation type reject unless approved extension namespace
- source/target entity exists
- authoritative relation için evidence requirement policy'ye göre enforced
- mutable "current" views version/history projection'dır
- exact code/release relation immutable revision'a bağlanır

## Query targets

- Which code changes implement REQ-X?
- Which tests verify a requirement?
- Which decision introduced a component?
- Which findings remain unresolved for a release?
- Which deployments contain a code change?
- Which incidents map to a release/change?
- Which new work came from an incident?

## Semantic index

Vector/semantic index selected entity content over IDs may exist for discovery/context retrieval. It is not authoritative relation storage.

## Deletion

Referenced AUDIT lineage hard-delete edilmez where policy requires audit. Tombstone/archive semantics referential integrity'yi korur; sensitive payload data-policy'ye göre silinebilir.


## FH-37A executable mapping

`packages/lineage` implements the v1 contract with stable `id@version` entity references, typed relations, explicit evidence/provenance, exact revision bindings and deterministic read-only traversal.

Relation classes are explicit:

- `AUTHORITATIVE`: exact typed endpoints plus trusted evidence/provenance are required.
- `DISCOVERY`: non-authoritative retrieval/context only. Semantic/vector similarity maps here and cannot establish authority.

The initial implementation remains `RELATIONAL_FIRST`. A graph database is not required by the contract and remains deferred until measured query/traversal needs justify one.

FH-37A authority invariants:

```text
lineage state != decision authority
semantic/vector similarity != authoritative lineage
lineage evidence != merge/release/deploy authority
lineage traversal != mutation authority
V3 authority = SHADOW_ONLY
```
