# Discussion Agenda

**Status:** ACTIVE

Bu kararları ilgili PR başlamadan netleştireceğiz.

1. **Ürün çalışma modeli:** local-first / self-hosted / hosted SaaS; multi-user ne zaman?
2. **Backend/UI stack:** TypeScript + SQLite + API/SSE yönü; Next.js monorepo mu ayrı API/frontend mi?
3. **Event source of truth:** JSONL audit/transport mı; SQLite ne zaman canonical?
4. **Provider access:** CLI vs API primary; subscription quota nasıl temsil edilecek?
5. **Authority matrix:** advisory, blocker candidate, adjudicator, final reviewer, human.
6. **Role package format:** YAML/JSON manifest, prompt/versioning, permissions, schema.
7. **Workflow persistence:** repo-as-code mı DB-native mı; UI ne publish edecek?
8. **Debate semantics:** unanimous/majority/weighted, tie, max rounds, arbiter.
9. **Tool sandbox:** filesystem, network, command allowlists, container/host execution.
10. **Artifact/data retention:** raw prompts, PII/secrets redaction, compression, export/delete.
11. **Project knowledge graph:** relational relationship table yeterli mi; graph DB kriteri?
12. **Promotion thresholds:** NORMAL/HIGH benchmark eşikleri gerçek V2.5 verisiyle kalibre edilecek.
13. **Cost/budget policy:** per-run/per-role/provider budget, hard/soft cap.
14. **Naming/product packaging:** FreeHighlander kalıcı mı; monorepo/repo ayrımı?
15. **Auth ve identity:** ilk UI local trusted user mı; login ne zaman?
16. **Backup/restore:** SQLite/artifacts/event history recovery hedefi.
17. **Plugin/tool ecosystem:** built-in adapter ile external plugin sınırı.
18. **Data privacy:** project source/prompt/model data hangi provider'a gidebilir?
