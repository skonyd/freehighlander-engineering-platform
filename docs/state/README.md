# Continuity / Handoff

This directory defines how FreeHighlander work survives:
- machine changes,
- model changes,
- chat/session loss,
- quota interruptions,
- context/token limits.

Read:
1. [Resume Protocol](RESUME-PROTOCOL.md)
2. [Triple Mode](TRIPLE-MODE.md)
3. [Context Profiles](CONTEXT-PROFILES.md)
4. [Token Efficiency](TOKEN-EFFICIENCY.md)
5. [Checkpoint Template](CHECKPOINT-TEMPLATE.md)
6. [State Schema](STATE-SCHEMA.md)
7. [History](HISTORY.md)

The root `PROJECT_STATE.md` is the human-readable current checkpoint.
The root `.freehighlander/state.yaml` is the machine-readable current pointer.
`.freehighlander/context.yaml` controls minimum context loading.
`.freehighlander/token-policy.yaml` provides initial token-budget guardrails.
