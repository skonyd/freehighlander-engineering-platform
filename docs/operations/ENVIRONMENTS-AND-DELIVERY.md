# Environments & Delivery

**Status:** DRAFT

İlk aşama: local developer environment + GitHub repository.

Planlanan environment kavramı: local/dev, test, staging, production.

Platform kendi deployment'ı ile yönettiği project deployment'ını ayırmalıdır.

Delivery requirements:
- schema migrations
- rollback
- config versioning
- artifact/state backup
- health checks
- post-deploy smoke
- auditability

Open decisions: local-only vs self-hosted topology, container-first deployment, desktop wrapper, backup target, production DB transition, auth provider, multi-user model.
