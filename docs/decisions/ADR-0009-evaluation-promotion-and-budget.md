# ADR-0009 — Model Promotion, Quality Gates ve Cost/Budget Policy

**Status:** ACCEPTED

## Context

FreeHighlander'ın model routing hedefi maliyeti azaltırken kaliteyi korumaktır. Model seçimleri genel "en iyi model" sıralamasına veya tek benchmark skoruna dayanamaz.

Ayrıca cost/token budget authority veya evidence requirement'ı düşürmemelidir.

## Decision

### 1. Evaluation logical-role bazlıdır

Her binding şu bağlamda değerlendirilir:

~~~text
logical role + risk tier + evidence profile
~~~

Genel model sıralaması routing authority oluşturmaz.

### 2. Promotion candidate eşikleri başlangıçta provisional'dır

NORMAL role için başlangıç minimumu:
- >= 50 adjudicated real samples
- agreement >= 95%
- P0/P1 miss = 0
- recurring P2 miss kabul edilebilir sınırın altında
- meaningful paid-token/latency benefit

HIGH role için başlangıç minimumu:
- >= 100 adjudicated real samples
- agreement >= 97%
- P0/P1 miss = 0
- adversarial/regression suite PASS
- düşük recurring P2 miss

Bu sayılar "kanıtlanmış güvenlik olasılığı" değildir; yalnız promotion değerlendirmesine giriş eşiğidir.

### 3. Critical/authority promotion yalnız ekonomiyle yapılamaz

FINAL_REVIEWER, ADJUDICATOR veya CRITICAL authority taşıyan role:
- benchmark,
- regression corpus,
- independence,
- human review

gerektirir.

Otomatik promotion yoktur.

### 4. Serious miss regression corpus'a girer

P0/P1 veya sistematik P2 miss, güvenli olduğu ölçüde kalıcı eval case olur.

Model upgrade aynı regression corpus üzerinden tekrar değerlendirilir.

### 5. Budget iki katmanlıdır

- soft budget: optimizasyon/escalation sinyali
- hard budget: yeni ücretli çağrıyı durdurur veya policy-approved cheaper binding/human kararına gider

Budget exhaustion PASS değildir.

### 6. Budget sırası

Budget aşım riski varsa:

1. semantic artifact reuse
2. provider prompt cache
3. irrelevant context trimming
4. targeted retrieval/context packet
5. local/advisory offload
6. cheaper eligible binding before semantic call
7. human budget override / pause

Required evidence truncate edilmez.

### 7. Semantic result sonrası cost shopping yok

Bir binding semantic FAIL/BLOCKED/INSUFFICIENT ürettiyse sırf daha ucuz/farklı model denemek için reroute yapılmaz.

### 8. Budget reservation

DEBATE ve multi-step workflow'lar başlamadan tahmini budget reserve edebilir. Yarım kalan council'ın "consensus" sayılması yasaktır.

## Consequences

- model routing kendi workload verimize dayanır
- maliyet azaltımı quality metrics ile birlikte değerlendirilir
- token budget authority shortcut olmaz
- model upgrade regressions görünür olur
