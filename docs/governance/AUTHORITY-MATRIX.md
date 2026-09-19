# Authority Matrix

**Status:** ACCEPTED DIRECTION

| Authority | Üretebilir | Bloklayabilir | Kod değiştirebilir | Final onay | Merge / high-impact action |
|---|---|---:|---:|---:|---:|
| ADVISORY | analiz/öneri | Hayır | Hayır | Hayır | Hayır |
| CANDIDATE | finding/candidate | Doğrudan değil | Hayır | Hayır | Hayır |
| WRITER | bounded implementation | Hayır | Evet | Hayır | Hayır |
| ADJUDICATOR | candidate verdict | Policy'ye göre | Varsayılan hayır | Hayır | Hayır |
| FINAL_REVIEWER | final semantic review | Evet | Hayır | Semantic review | Hayır |
| HUMAN_APPROVER | insan kararı | Evet | Policy'ye göre | Evet | Policy'ye göre |
| SYSTEM_POLICY | deterministic enforcement | Evet | Hayır | Gate kararı | Policy'ye göre |

## Important distinctions

### Candidate != finding authority

Bir CANDIDATE role şunu diyebilir:

~~~text
DS-004: possible race condition
~~~

Bu tek başına authoritative finding değildir.

### Writer != approver

Implementation yapan role kendi çalışmasını independent final review olarak kapatamaz.

### Final reviewer != human approver

Final reviewer PASS verebilir ama CRITICAL policy HUMAN_REQUIRED ise merge authority oluşmaz.

### System policy > model prompt

Model "approve" dese bile policy:
- exact SHA mismatch,
- missing evidence,
- denylist,
- human-required

durumunda gate'i kapalı tutar.

## Example PR flow

~~~text
ADVISORY/CANDIDATE
    Qwen scan
       ↓
WRITER
    Codex implementation
       ↓
SYSTEM_POLICY
    deterministic verify
       ↓
ADJUDICATOR
    candidate decisions
       ↓
FINAL_REVIEWER
    independent review
       ↓
SYSTEM_POLICY
    risk/human rule
       ↓
HUMAN_APPROVER
    merge decision
~~~
