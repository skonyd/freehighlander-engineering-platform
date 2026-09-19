# Backup and Restore Contract

**Status:** ACCEPTED DIRECTION

## Recovery point

A backup is a versioned recovery point, not just a copied SQLite file.

Manifest concept:

~~~yaml
schemaVersion: 1
createdAt: ...
database:
  schemaVersion: ...
  snapshotHash: ...
artifacts:
  manifestHash: ...
contracts:
  workflowRefs: [...]
  roleRefs: [...]
  policyHash: ...
repository:
  repo: owner/name
  revision: ...
~~~

## SQLite

Preferred live backup:
1. Online Backup API for incremental/live snapshot, or
2. VACUUM INTO when a compact standalone snapshot is useful.

If WAL mode is enabled, do not copy only the main DB file while live and assume it contains all committed state.

## Artifact backup

Artifacts referenced by authoritative DB rows should be:
- content-addressed where practical,
- checksum validated,
- included in or resolvable by the recovery manifest.

## Secrets

Backup contains secret references/metadata, not plaintext provider credentials by default.

## Restore test

A restore must be exercised in a temporary location and verify:
- DB integrity
- migrations
- artifact checksums
- authoritative references
- app start/read smoke

## Future

When multi-user/remote:
- encrypted backup target
- rotation
- retention policy
- RPO/RTO
- offsite copy
- recovery drill events
