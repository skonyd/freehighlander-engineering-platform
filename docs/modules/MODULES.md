# SDLC Modülleri

## 1. Planning Module

Input: fikir, hedef, özellikler, kısıtlar, bütçe, ekip, zaman, teknoloji tercihleri.

Roller/akış örneği:

- Requirement Analyst
- Ambiguity / Gap Analyst
- Product Analyst
- Domain Architect
- Security / Privacy / Compliance
- Operations / Cost
- Architecture Options
- Model Council
- Human decisions

Çıktılar:

- business requirements
- functional/non-functional requirements
- bounded contexts
- architecture
- APIs/data ownership
- security/compliance assumptions
- SLO/observability requirements
- ADRs
- risks/open questions
- milestones/backlog

## 2. Development Module

- task/context triage
- implementation
- review
- tests
- security
- final review
- human/merge policy

Kodun hangi requirement/ADR/task ile ilişkili olduğu tutulur.

## 3. Testing Module

Roller:

- Unit Test Designer
- Integration Test Reviewer
- Contract Test Reviewer
- Regression Analyst
- Mutation Testing
- Property-Based Testing
- Performance Testing
- E2E Reviewer
- Test Adequacy Reviewer

Hedef: yalnız code coverage değil requirement coverage.

## 4. Security Module

Roller:

- Threat Modeler
- Secure Code Reviewer
- Pentest Reviewer
- CVE Analyst
- Dependency Security
- Secrets Reviewer
- IAM Reviewer
- Kubernetes Security
- Container Security
- Cloud Security
- Privacy Reviewer

Security lifecycle'a dağılır: design → development → build → pre-prod → production.

## 5. Release Module

- quality gates
- security gates
- change risk
- deployment plan
- rollback plan
- human approval
- canary/progressive delivery recommendation

## 6. Operations Module

Bağlantılar hedefte:

- Prometheus
- Grafana
- Zabbix
- Elastic
- OpenTelemetry
- Kubernetes
- Sentry
- cloud providers

Runtime telemetry engineering lineage ile bağlanır.

## 7. Incident Module

- incident intake
- telemetry collection
- timeline
- root-cause candidates
- evidence
- mitigation
- postmortem
- yeni requirement/test/task üretimi

Amaç: production öğrenmesini planning/development döngüsüne geri beslemek.
