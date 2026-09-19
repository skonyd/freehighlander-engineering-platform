# Engineering Lineage Schema v1

**Status:** PROPOSED IMPLEMENTATION CONTRACT

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
title?
payload_json
content_hash
created_at
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
evidence_artifact_id?
created_at
valid_from?
valid_to?
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
IMPLEMENTS
VERIFIES
CONSTRAINS
DEPENDS_ON
SUPERSEDES
GENERATED_FROM
FOUND_IN
RESOLVED_BY
INCLUDED_IN
DEPLOYED_AS
OBSERVED_BY
TRIGGERED
CAUSED_BY
MITIGATED_BY
CREATED
~~~

Vocabulary is versioned. Arbitrary free-text relation names are not authoritative.

## Provenance

Every relation that influences an authoritative decision should be traceable to:
- human action,
- deterministic import,
- model candidate + adjudication,
- accepted artifact.

## Deletion

Hard deletion of referenced AUDIT lineage is avoided where policy requires audit. Tombstone/archive semantics preserve referential integrity while sensitive payloads may be removed according to data policy.
