# Continuity / Handoff

This directory defines how FreeHighlander work survives:
- machine changes,
- model changes,
- chat/session loss,
- quota interruptions.

Read:
1. [Resume Protocol](RESUME-PROTOCOL.md)
2. [Triple Mode](TRIPLE-MODE.md)
3. [Checkpoint Template](CHECKPOINT-TEMPLATE.md)
4. [State Schema](STATE-SCHEMA.md)
5. [History](HISTORY.md)

The root `PROJECT_STATE.md` is the human-readable current checkpoint.
The root `.freehighlander/state.yaml` is the machine-readable current pointer.
