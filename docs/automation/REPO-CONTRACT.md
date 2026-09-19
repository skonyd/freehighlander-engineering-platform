# Repository Contract

**Status:** DRAFT

- `main` implementation için doğrudan write hedefi değildir; PR akışı kullanılır.
- Küçük, tek amaçlı PR tercih edilir.
- Planning-only PR authority semantics değiştirmez.
- Automation/core değişiklikleri HIGH/CRITICAL değerlendirilebilir.
- Her büyük feature requirement + acceptance criteria + decision/assumption + test/telemetry + rollout/rollback notu taşır.
- Canonical docs: `docs/INDEX.md`, `docs/ROADMAP.md`, `docs/planning/PR-ROADMAP.md`, `BACKLOG.md`.
- Accepted ADR çelişkide üst otoritedir.
- Runtime state/model output/token logs/artifacts varsayılan olarak Git'e girmez.
- Secrets repo veya prompt içine gömülmez.
- TASK_ID/task fingerprint bootstrap sırasında korunur; repository identity FreeHighlander olur.
