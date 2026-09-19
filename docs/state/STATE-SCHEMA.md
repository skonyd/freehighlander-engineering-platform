# State Schema v1

`.freehighlander/state.yaml` is deliberately small.

## Required concepts

- `schema_version`
- project/repository
- last human-readable update timestamp
- default working mode
- current phase
- active work branch/PR/objective
- external dependency/blocker
- accepted direction summary
- resume read order

## State vs evidence

The YAML file is a pointer, not proof.

Examples:
- `CI passed` in YAML is a cached summary.
- GitHub Actions run / artifact is the evidence.
- `Opus sufficient` is a cached summary.
- exact-SHA review artifact is the evidence.

Any agent making an authoritative decision must revalidate evidence as required by the active workflow.

## No secrets

Never store:
- API keys,
- auth tokens,
- passwords,
- private prompt data not meant for source control.

## Future automation

FH-01/FH-02 should add deterministic tooling that:
- validates state schema,
- detects stale branch/PR pointers,
- emits checkpoint state,
- can print a one-command resume summary,
- never claims semantic model gates passed without authoritative evidence.
