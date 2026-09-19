# ADR-0008 — Engineering Lineage ve Project Knowledge Graph Modeli

**Status:** ACCEPTED

## Decision

FreeHighlander'ın ayırt edici çekirdeği bir "chat history" değil, ilişkilendirilebilir engineering lineage olacaktır.

İlk veri modeli relational kalır; graph database zorunlu değildir.

## First-class entities

~~~text
Project
Repository
Requirement
NonFunctionalRequirement
Assumption
Risk
Decision / ADR
WorkItem
PullRequest
Commit
Artifact
Evidence
Finding
Adjudication
TestEvidence
WorkflowRun
Release
Deployment
MetricReference
Alert
Incident
Postmortem
~~~

## Relationship model

İlişkiler first-class kayıt olarak tutulur:

~~~text
Requirement        implemented-by   WorkItem
WorkItem           changed-by       PullRequest
PullRequest        contains         Commit
PullRequest        verified-by      TestEvidence
Decision           constrains       Requirement / WorkItem
Finding            found-in         Revision / Artifact
Finding            resolved-by      PullRequest
Release            contains         PullRequest / Commit
Deployment         deploys          Release
Incident           observed-in      Deployment
Incident           caused-by        Change / Condition
Postmortem         creates          Requirement / Test / WorkItem
~~~

Her relation:
- id
- type
- source entity/version
- target entity/version
- created_at
- provenance/evidence ref
- optional validity interval

taşır.

## Identity

Entity kimliği display name değildir.

Kullan:
- stable UUID/ULID internal id
- repository scoped external references
- immutable revision identifiers where relevant

Git objects:
- repository identity
- commit SHA
- PR number + repository
- branch is pointer, not immutable identity

## Versioning

Requirements/decisions/workflows mutable display objects olabilir ancak accepted historical meaning kaybolmamalıdır.

Önemli semantic değişiklikler version/revision üretir.

## Query examples

Platform aşağıdakileri cevaplayabilmelidir:

- Bu kod neden var?
- Bu requirement hangi testlerle doğrulanıyor?
- Bu release hangi security finding'lerini kapattı?
- Bu incident hangi deployment/change ile ilişkili?
- Bu ADR'den etkilenen aktif work item'lar neler?
- Production sinyali hangi requirement'a geri bağlanıyor?

## Relational-first schema

İlk implementation:

~~~text
entities
entity_versions
relations
external_refs
~~~

ve domain-specific read models.

Graph DB ancak gerçek workload'da:
- deep multi-hop traversal,
- complex path queries,
- scale/performance

gereksinimi relational modelde sorun olursa değerlendirilir.

## Search

İki ayrı mekanizma:
1. exact structured lineage query
2. semantic/full-text discovery

Semantic search ilişki doğruluğunun yerine geçmez.

## Cross-repository

Entity/relation kimliği repository id içerir. Multi-repo lineage ileride aynı project/workspace altında birleştirilebilir.

## Consequences

- planning/code/runtime aynı digital thread'e bağlanabilir
- incident çıktısı tekrar requirement/test/task'a dönebilir
- AI summary yerine queryable provenance oluşur
- graph DB bağımlılığı ertelenir
