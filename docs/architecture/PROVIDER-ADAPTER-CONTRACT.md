# Provider Adapter Contract

**Status:** PROPOSED IMPLEMENTATION CONTRACT

## Normalized request

Conceptual shape:

~~~ts
type ModelRequest = {
  logicalRole: string;
  bindingId: string;
  model: string;
  effort?: string;
  promptContractVersion: string;
  contextPacketId: string;
  input: unknown;
  tools?: ToolDescriptor[];
  outputSchema?: unknown;
  deadlineMs?: number;
};
~~~

## Normalized response

~~~ts
type ModelResponse = {
  provider: string;
  model: string;
  bindingId: string;
  status: "completed" | "failed" | "cancelled";
  output?: unknown;
  usage?: {
    inputTokens?: number;
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  };
  latencyMs: number;
  providerRequestId?: string;
  cache?: {
    hit?: boolean;
    prefixVersion?: string;
  };
  rawRef?: string;
};
~~~

Raw provider payload should not become the core domain model.

## Failure taxonomy

Adapter failures normalize into categories:

~~~text
AUTH
QUOTA
RATE_LIMIT
PROVIDER_UNAVAILABLE
TRANSPORT
TIMEOUT
CANCELLED
INVALID_REQUEST
MALFORMED_PROVIDER_RESPONSE
SEMANTIC_OUTPUT_INVALID
UNKNOWN
~~~

Only policy-approved availability classes may trigger fallback.

## Capability interface

~~~ts
type ProviderCapabilities = {
  streaming: boolean;
  structuredOutput: boolean;
  toolCalling: boolean;
  parallelToolCalls: boolean;
  promptCaching: boolean;
  tokenCounting: boolean;
  reasoningEffort: boolean;
  outputVerbosity: boolean;
  cancellation: boolean;
  responseRetrieval: boolean;
  contextCompaction: boolean;
  deferredToolLoading: boolean;
};
~~~

Capability values belong to a provider/model/version binding, not merely the vendor.

## Health model

Health is separate from semantic quality:

~~~text
HEALTHY
DEGRADED
RATE_LIMITED
QUOTA_EXHAUSTED
AUTH_FAILED
UNAVAILABLE
UNKNOWN
~~~

Health may affect routing. It may not reinterpret a semantic FAIL as PASS.

## Timeout model

Use layered deadlines:

- provider attempt timeout
- role/model call budget
- workflow/node deadline
- overall run deadline

A retry must consume the same parent deadline budget rather than reset it.

## CLI adapters

CLI adapters must:
- use non-interactive invocation where possible,
- capture exact executable/version,
- normalize exit/status/output,
- detect quota/auth/unknown-option warnings,
- avoid shell interpolation of large/untrusted payloads,
- prefer stdin/files for large packets,
- record provider/model identity actually used.

## API adapters

API adapters should:
- expose request ids where available,
- capture normalized usage,
- implement prompt cache capability only when supported,
- expose token preflight when supported,
- preserve provider response references for audit without coupling core to raw schema.

## OpenAI-compatible local adapter

Treat "OpenAI-compatible" as protocol compatibility only.

Do not assume the endpoint supports:
- exact OpenAI cache semantics,
- reasoning effort,
- structured output,
- token counting,
- all tool modes.

Probe/discover capabilities explicitly.
