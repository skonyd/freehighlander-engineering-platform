# ADR-0004 — Provider Adapter, Capability Registry ve Fallback Politikası

**Status:** ACCEPTED

## Context

FreeHighlander bir logical role'u tek bir vendor/model API'sine bağlamamalı. Mevcut ve gelecekteki çalışma biçimleri şunları birlikte desteklemelidir:

- provider API'leri,
- provider CLI/subscription akışları,
- OpenAI-compatible local endpoints,
- local cluster modelleri,
- farklı model/effort/caching/tool yetenekleri.

Aynı zamanda provider outage/quota durumunda güvenli fallback gerekir; ancak semantic negatif sonucu "başka model denersek geçer" yaklaşımıyla bypass etmek yasaktır.

## Decision

### 1. Core yalnız ProviderAdapter kontratını görür

Core aşağıdaki vendor-neutral capability'lerle çalışır:

~~~text
ProviderAdapter
  ├─ invoke()
  ├─ health()
  ├─ capabilities()
  ├─ countInputTokens()? 
  ├─ cancel()? 
  └─ usage()/normalized response
~~~

Provider SDK/CLI ayrıntıları adapter içinde kalır.

### 2. API ve CLI ayrı adapter türleridir

İlk hedef adapter sınıfları:

- OpenAI API / Responses adapter
- Anthropic API / Messages adapter
- Claude CLI adapter
- Codex/OpenAI CLI adapter
- OpenAI-compatible local adapter

CLI adapter'ları özellikle subscription tabanlı developer erişimini desteklemek için meşrudur; ancak API adapter'ları daha zengin telemetry/cache/token-count özelliklerine sahip olduğunda tercih edilebilir.

Seçim "API her zaman daha iyi" veya "CLI her zaman daha ucuz" gibi sabit kuralla yapılmaz. Binding policy capability, quota, reliability ve benchmark verisine bakar.

### 3. Capability registry zorunludur

Her provider/model binding runtime'da şu gibi yetenekler ilan eder:

- streaming
- structured_output
- tool_calling
- parallel_tool_calls
- prompt_caching
- token_counting
- reasoning_effort
- output_verbosity
- response_retrieval
- cancellation
- context_compaction
- tool_search_or_deferred_tools
- usage_token_breakdown

Core bu capability'leri varsaymaz.

### 4. Credentials repository'den ayrıdır

Credential kaynakları:
- environment variable,
- OS/user credential store,
- future secrets broker.

Repo, state, prompt veya artifact içine plaintext secret yazılmaz.

### 5. Fallback yalnız availability sınıfında

Fallback yapılabilecek örnekler:

- quota exhausted
- rate limited
- provider unavailable
- CLI/service unavailable
- auth unavailable
- transient transport failure

Fallback yapılamayacak örnekler:

- FAIL
- BLOCKED
- INSUFFICIENT
- confirmed finding
- reviewer disagreement
- malformed semantic output (default fail-closed)

### 6. Fallback audit edilir

Her attempted binding kaydedilir:

- role
- binding
- provider/model
- start/end
- failure class
- fallback reason
- final binding
- usage/cost

Bir önceki semantic verdict silinmez.

### 7. Independence korunur

Fallback sonucu producer ve reviewer aynı independence group'a düşüyorsa ve policy bağımsızlık istiyorsa fallback yasaktır veya human escalation gerekir.

## Current provider-specific observations

OpenAI Responses API güncel olarak structured tools, usage token breakdown, reasoning effort, verbosity, response retrieval/cancel/compact ve prompt cache seçenekleri sunuyor. Anthropic güncel API'sinde prompt caching, token counting, tool search/deferred tools ve context-management mekanizmaları bulunuyor.

Bu özellikler adapter capability olarak modellenir; core contract bunlara doğrudan bağımlı değildir.

## Consequences

- Yeni provider eklemek core workflow semantics'ini değiştirmez.
- CLI ve API aynı logical role altında farklı binding olabilir.
- Cache/token-count gibi yeni vendor özellikleri capability üzerinden kullanılabilir.
- Provider-specific optimization authority katmanına sızmaz.
- Fallback güvenli ve auditable olur.
