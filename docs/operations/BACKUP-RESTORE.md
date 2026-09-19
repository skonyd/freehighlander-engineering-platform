# Backup / Restore Contract

**Status:** ACCEPTED DIRECTION

## Backup sets

### Configuration set
Git-tracked:
- workflows
- roles
- policies
- ADR/docs

### Runtime state set
- SQLite database
- artifact/evidence content
- local project metadata not stored in Git

## Backup triggers

- manual
- scheduled
- before schema migration
- before authority/policy migration
- before destructive maintenance

## SQLite rule

Do not blindly copy a live WAL-mode DB main file.

Use SQLite-supported snapshot/backup mechanics.

## Restore test

A backup is not considered reliable until a restore test can:
- open DB
- verify integrity
- resolve artifact refs
- read workflow/run history
- validate state schema

## Retention

Backup retention follows data classification and retention policy. Secrets are not intentionally embedded into backup payloads.
