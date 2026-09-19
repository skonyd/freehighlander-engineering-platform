# ADR-0009 — Model Promotion, Cost Budget ve Run Circuit-Breaker Politikası

**Status:** ACCEPTED

## Decision

Model routing ekonomi için optimize edilebilir; authority ve kalite sınırları korunur.

## Promotion thresholds

Promotion role-specific benchmark ile yapılır.

Initial defaults:

### NORMAL role
- minimum ~50 adjudicated real samples
- agreement >= 95%
- P0/P1 miss = 0
- false-positive rate role için kabul edilebilir
- meaningful paid-token/latency saving

### HIGH role
- minimum ~100 adjudicated real samples
- agreement >= 97%
- P0/P1 miss = 0
- recurring P2 miss çok düşük
- stability across recent samples

### CRITICAL / authority
Ekonomik gerekçeyle otomatik promotion yapılmaz.

System yalnız:
~~~text
PROMOTION_CANDIDATE
~~~
üretir; human/policy kararı gerekir.

Threshold'lar V2.5 gerçek verisiyle kalibre edilebilir; değişiklik versioned policy olur.

## Budget model

Ana maliyet birimi tek request değil, **run**'dır.

Her run/node/role için:
- token budget
- optional money budget
- model-call count
- tool-call count
- retry limit
- wall-clock deadline

tanımlanabilir.

## Reservation-before-call

Model çağrısından önce tahmini kaynak budget'tan reserve edilir.

Call sonrası gerçek usage ile reconcile edilir.

Bu, retry/agent loop'un budget'ı fark edilmeden aşmasını engeller.

## Soft / hard thresholds

~~~text
soft threshold
  → warning / cheaper-safe route suggestion / context reduction

hard threshold
  → stop or HUMAN_REQUIRED / explicit override
~~~

Budget exhaustion:
- PASS değildir
- FAIL semantic verdict'i değildir
- operational stop/escalation state'idir.

## Retry budget

Retry yeni sınırsız budget açmaz.

Tüm retry/fallback'lar parent run budget'ını tüketir.

## Quality floor

Cost optimizer:
- required reviewer'ı atlayamaz
- evidence'i truncate edemez
- reasoning effort'i policy minimumunun altına indiremez
- independence'i bozamaz
- semantic negative result üzerinde model shopping yapamaz

## Metrics

Her role/binding için:
- quality
- tokens
- cached tokens
- cost
- latency
- retries
- timeouts
- quota failures
- accepted findings
- misses

birlikte değerlendirilir.

## Consequences

FreeHighlander "en ucuz model" değil, **role başına ölçülmüş en ekonomik güvenli binding** seçer.
