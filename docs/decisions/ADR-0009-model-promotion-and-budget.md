# ADR-0009 — Model Promotion, Evaluation ve Cost/Budget Policy

**Status:** ACCEPTED

## Context

FreeHighlander model routing'i maliyet için optimize ederken kalite, evidence ve authority sınırlarını korumalıdır. "En iyi model" veya tek benchmark skoru, tüm roller için routing kararı olamaz.

## Decision

### 1. Evaluation logical-role bazlıdır

Değerlendirme birimi:

~~~text
logical role + risk tier + evidence profile
~~~

Her binding kendi rolündeki gerçek iş yükü ve regression corpus üzerinde ölçülür.

### 2. Promotion thresholds başlangıçta provisional'dır

NORMAL role için promotion-candidate minimumu:
- >= 50 adjudicated real samples
- agreement >= 95%
- P0/P1 miss = 0
- recurring P2 miss kabul edilebilir sınırın altında
- meaningful paid-token/latency benefit

HIGH role için:
- >= 100 adjudicated real samples
- agreement >= 97%
- P0/P1 miss = 0
- adversarial/regression suite PASS
- düşük recurring P2 miss

Bu sample/percentage değerleri istatistiksel "güvenlik garantisi" değildir; promotion değerlendirmesine giriş eşiğidir ve V2.5 gerçek verisiyle kalibre edilir.

### 3. Critical/authority promotion yalnız ekonomiyle yapılamaz

FINAL_REVIEWER, ADJUDICATOR veya CRITICAL authority için:
- benchmark,
- regression corpus,
- independence validation,
- human/policy approval

gerekir.

Sistem yalnız `PROMOTION_CANDIDATE` üretir; otomatik authority promotion yoktur.

### 4. Serious miss regression corpus'a girer

P0/P1 veya sistematik P2 miss, güvenli olduğu ölçüde durable eval case olur. Model upgrade aynı corpus üzerinde tekrar doğrulanır.

### 5. Budget run-first'tür

Her run/node/role için gerektiğinde:
- token budget
- optional money budget
- model-call count
- tool-call count
- retry limit
- wall-clock deadline

tanımlanabilir.

### 6. Soft / hard budget

~~~text
soft
  → reuse/cache/context reduction/local offload/cheaper eligible route suggestion

hard
  → new paid calls pause
  → human override, wait, or policy-approved route
~~~

Budget exhaustion PASS değildir ve semantic FAIL değildir; operational stop/escalation state'idir.

### 7. Optimization order

Budget baskısında sıra:

1. semantic artifact reuse
2. provider prompt cache
3. irrelevant context trimming
4. targeted retrieval/context packet
5. local/advisory offload
6. cheaper eligible binding **before** semantic verdict
7. human budget override / pause

Required evidence budget için truncate edilmez.

### 8. No cost/model shopping after semantic result

FAIL/BLOCKED/INSUFFICIENT/confirmed finding sonrası sırf daha ucuz/farklı modelden favorable verdict aramak yasaktır.

### 9. Reservation-before-call

Özellikle DEBATE/multi-step workflow:
- tahmini budget reserve eder,
- call sonrası actual usage ile reconcile eder,
- retry/fallback parent budget'ı paylaşır.

Yarım kalan council consensus sayılmaz.

## Metrics

Role/binding bazında birlikte izlenir:
- quality/agreement/miss
- input/cached/output/reasoning tokens
- cost
- latency
- retries/timeouts
- quota/provider failures
- accepted findings
- artifact reuse

## Consequences

FreeHighlander "en ucuz model" değil, role bazında ölçülmüş en ekonomik güvenli binding'i seçmeye çalışır.
