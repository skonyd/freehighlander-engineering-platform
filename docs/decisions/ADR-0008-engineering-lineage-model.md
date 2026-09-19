# ADR-0008 — Engineering Lineage / Project Knowledge Model

**Status:** ACCEPTED

## Context

FreeHighlander'ın ayırt edici hedeflerinden biri yalnız agent orchestration değil; bir değişikliğin neden var olduğunu fikirden production davranışına kadar izleyebilmektir.

Semantic search tek başına authoritative lineage değildir. Aynı şekilde ilk sürümde graph database kurmak da gereksiz operasyonel karmaşıklık yaratır.

## Decision

### 1. Relational-first, graph-shaped domain

İlk persistence relational olacaktır; domain ise graph şeklinde modellenir.

Temel yapı:

~~~text
Entity
EntityVersion
Relation
RelationEvidence
~~~

Graph database ancak gerçek traversal/query ölçümleri relational modelin yetersiz olduğunu gösterirse değerlendirilir.

### 2. Stable identity + versioned state

Her first-class entity stable bir ID taşır. Anlamlı değişiklikler version/history üretir.

İlk entity türleri:

- Project
- Repository
- Idea
- Requirement
- NonFunctionalRequirement
- Assumption
- Risk
- Decision/ADR
- WorkItem
- CodeChange
- WorkflowRun
- Artifact
- Finding
- TestEvidence
- Approval
- Release
- Deployment
- MetricReference
- Alert
- Incident
- Postmortem

### 3. Relations first-class'tır

Relation yalnız string link değildir. En az:

- relation type
- source entity/version
- target entity/version
- provenance/evidence
- created by actor/role
- created at
- confidence/status where applicable

taşır.

Örnek relation tipleri:

~~~text
DERIVED_FROM
REFINES
SUPERSEDES
IMPLEMENTS
VERIFIES
MITIGATES
BLOCKS
PRODUCES
REFERENCES
RELEASES
DEPLOYS
OBSERVES
TRIGGERED_BY
CAUSED_BY
RESOLVED_BY
~~~

### 4. Structured lineage authoritative, semantic search discovery'dir

Embedding/vector search:
- benzer doküman bulabilir,
- candidate relationship önerebilir,
- context retrieval yapabilir.

Ancak authoritative relation oluşturmak için deterministic/imported evidence veya adjudication gerekir.

### 5. Code identity exact revision'a bağlıdır

CodeChange ve related evidence:
- repository identity
- commit/PR
- exact base/head revision
- changed paths

ile bağlanır.

"current main" gibi hareketli referans authoritative historical relation için yeterli değildir.

### 6. Requirement coverage first-class'tır

Requirement -> acceptance criterion -> test evidence ilişkisi tutulmalıdır.

Bu sayede test coverage yalnız line/branch coverage değildir.

### 7. Runtime feedback aynı graph'a bağlanır

Release/Deployment -> Metric/Alert/Incident -> Postmortem -> new Requirement/WorkItem/Test ilişkileri desteklenir.

## Consequences

- fikirden production'a digital thread kurulabilir
- dashboard "bu kod neden var?" sorusunu cevaplayabilir
- semantic retrieval güvenilir lineage yerine geçmez
- graph DB dependency'si ertelenir
- audit/replay için version/provenance korunur
