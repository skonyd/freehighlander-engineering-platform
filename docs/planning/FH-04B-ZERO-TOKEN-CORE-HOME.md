# FH-04B — Zero-Token Core Home Dashboard

**Status:** COMPLETE (.1–.9)  
**Parent:** FH-04 Read-only metrics dashboard  
**Surface:** FreeHighlander Core Home  
**Module relationship:** independent of FH-KUIKA  
**Authority:** read-only / authority-neutral  
**Primary invariant:** rendering or refreshing Core Home must never invoke an LLM/model provider

## Purpose

FH-04 delivered the first read-only engineering telemetry dashboard. FH-04B evolves that foundation into the default FreeHighlander Core Home Dashboard.

The dashboard answers, without spending model tokens:

- what is currently running;
- what needs human attention;
- which project/revision is active;
- whether the system/providers are healthy;
- which model binding is active for each important role;
- whether quota/fallback/recovery is active;
- how many tokens/cost have already been consumed;
- where the current workflow is;
- whether there are recent failures, approvals, security findings or blocked work;
- whether continuity/checkpoint state is healthy.

This is not an AI-generated summary screen. It is a deterministic read surface over already-recorded state.

---

# 1. Non-negotiable zero-token invariant

A dashboard refresh includes:

- opening Core Home;
- browser polling/refresh;
- loading summary/detail cards;
- changing dashboard time range/filter;
- opening deterministic detail drawers.

None of those operations may:

- call a ProviderAdapter;
- invoke model-runtime inference;
- create a MODEL workflow node;
- invoke an agent/role;
- ask an LLM to summarize events;
- trigger automatic repair/review/planning;
- consume model quota.

Allowed data sources:

- SQLite/read models;
- append-only telemetry already recorded;
- deterministic local configuration;
- deterministic local Git inspection;
- persisted scheduler/runtime state;
- persisted failover/quota state;
- optional non-LLM external APIs/connectors when explicitly configured.

Implementation should expose a deterministic guard similar to:

~~~ts
dashboardRefreshCanInvokeModel(): false
~~~

Dashboard server/request handlers must have no dependency path to ProviderAdapter or model invocation APIs.

A dependency-boundary test should fail CI if the dashboard read path begins importing model execution/runtime invocation surfaces.

## External API clarification

Zero-token does not necessarily mean zero network.

GitHub CI/PR status may be fetched through a deterministic REST/API connector without consuming LLM tokens.

However:

- Core Home must remain functional when external sources are unavailable;
- external deterministic sources must be labeled separately;
- no external API dependency may block local dashboard rendering;
- no API response may be interpreted by an LLM for Home rendering.

---

# 2. Relationship to current FH-04

## Already implemented

The current apps/web read-only dashboard already provides:

- SQLite health;
- total runs;
- human-required run count;
- total model calls;
- input/cached/output/reasoning/total token accounting;
- actual/estimated cost;
- average model latency;
- run list;
- branch/head SHA when present;
- workflow id/version;
- event/model-call counts;
- model/provider/role aggregation;
- retry/fallback counts;
- run events;
- model calls;
- artifacts;
- management read snapshot.

Existing server constraints should remain:

- GET/HEAD only;
- x-freehighlander-mode: read-only;
- browser disconnect cannot change workflow execution;
- web mutation authority = none.

## FH-04B gap

FH-04 is primarily an Engineering Telemetry page.

FH-04B changes the product framing to:

~~~text
FreeHighlander opens
      ↓
Core Home
      ↓
Current work + attention + provider/model health + usage
      ↓
Open Work / Run / Error / Approval when needed
~~~

The existing telemetry tables remain available as drill-down views.

---

# 3. Core Home UX

The first viewport should answer only five questions:

1. Where am I? — project / branch / exact revision.
2. Is the system healthy?
3. What is running now?
4. Does anything need my attention?
5. What AI resources have already been consumed / which models are active?

Do not expose policy hashes, event JSON, evidence hashes or permission matrices in the default viewport.

## Proposed first viewport

~~~text
┌────────────────────────────────────────────────────────────────────────────┐
│ FreeHighlander                                      System: HEALTHY       │
│ Project X · main@91ac3d2                            V3: SHADOW_ONLY       │
├────────────────────────────────────────────────────────────────────────────┤
│ Running          Attention         Errors           Providers             │
│    2                 1                0               Healthy              │
├────────────────────────────────────────────────────────────────────────────┤
│ Current Work                                                               │
│ Feature XYZ                                                                │
│ PLAN ✓ → IMPLEMENT ● → TEST ○ → REVIEW ○                                │
│                                                                            │
│ [ Open Work ]                                           [ Open Run ]       │
├────────────────────────────────────────────────────────────────────────────┤
│ AI Usage Today                                                             │
│ 43 calls · 184k tokens · $3.21                                            │
│                                                                            │
│ Implementer     preferred Opus       ACTIVE                               │
│ Reviewer        preferred GPT        ACTIVE                               │
│ Security        preferred Gemini     FALLBACK → GPT                       │
├────────────────────────────────────────────────────────────────────────────┤
│ Needs Attention                                                            │
│ ! 1 approval waiting                                                       │
│ ! Gemini fallback active · next recovery check in 42 min                  │
└────────────────────────────────────────────────────────────────────────────┘
~~~

Secondary content below the fold or behind tabs/drawers:

- Recent Runs
- Token/Cost detail
- Provider/Model detail
- Errors
- Approvals
- Checkpoint/Resume health
- Findings/Security
- CI/Git status
- Evidence/Artifacts

## Progressive disclosure

Default card:

~~~text
Provider fallback active
Gemini → GPT
Recovery check: 42 min
[Details]
~~~

Details may show:

- logical role;
- preferred binding;
- active binding;
- failure kind;
- observed at;
- retry/reset source;
- nextCheckAt;
- return policy;
- qualification;
- independence;
- correlation ID.

The default Home must remain useful without opening advanced detail.

---

# 4. Dashboard snapshot contract

Introduce one stable Core Home aggregate instead of making the browser independently compose many low-level endpoints.

Conceptual contract:

~~~ts
interface CoreHomeSnapshotV1 {
  schemaVersion: 1;
  generatedAt: string;
  sourceFreshness: CoreHomeFreshness;

  project: ProjectContextView;
  authority: AuthoritySummaryView;
  system: SystemHealthView;
  currentWork: CurrentWorkView | null;
  attention: AttentionSummaryView;
  usage: UsageWindowView;
  roleBindings: readonly RoleBindingHealthView[];
  recentRuns: readonly RecentRunView[];
  continuity: ContinuitySummaryView;
  findings: FindingSummaryView;
}
~~~

The aggregate is a read projection.

It cannot:

- grant authority;
- create execution intents;
- mark work complete;
- change model binding;
- acknowledge an approval;
- mutate workflow state.

Recommended endpoint:

~~~text
GET /api/home
~~~

Optional deterministic detail endpoints only if payload size requires them:

~~~text
GET /api/home/usage
GET /api/home/attention
GET /api/home/providers
GET /api/home/continuity
~~~

---

# 5. Data-source matrix

| Dashboard information | Source today | Token cost | FH-04B work |
| --- | --- | ---: | --- |
| total runs | SQLite runs | 0 | reuse |
| human-required count | SQLite runs/events | 0 | improve currentness/count |
| model calls | SQLite model_calls | 0 | reuse |
| token usage | SQLite model_calls | 0 | add time-window query |
| cost | SQLite model_calls | 0 | add time-window query |
| latency | SQLite model_calls | 0 | reuse / p50-p95 later |
| retries/fallback count | SQLite model_calls | 0 | reuse |
| branch/head SHA | SQLite run projection | 0 | select active/recent context |
| workflow/version | SQLite run projection | 0 | reuse |
| active/running work | run/events + scheduler state | 0 | new aggregate/projection |
| workflow progress | node/gate telemetry | 0 | deterministic progress projection |
| approvals waiting | human.required + decision state | 0 | new attention projection |
| recent errors | runtime error reports/events | 0 | persist/project structured errors |
| provider health | provider health telemetry | 0 | new current-state projection |
| quota exhausted | quota telemetry | 0 | new current-state projection |
| preferred/active binding | failover state | 0 | expose persisted read state |
| next recovery check | quota-aware failover state | 0 | expose persisted read state |
| return policy | failover state | 0 | expose persisted read state |
| authority state | architecture/runtime config | 0 | deterministic summary |
| checkpoint | checkpoint.created / resume store | 0 | new continuity projection |
| resume health | resume manifest/store | 0 | deterministic projection |
| findings | finding/security events/artifacts | 0 | new summary projection |
| CI state | optional GitHub/CI API | 0 LLM | optional deterministic adapter |
| git clean/dirty | local Git | 0 | optional local status source |
| PR state | optional GitHub API | 0 LLM | optional deterministic adapter |

---

# 6. Attention model

The Home page should not dump all events. It should produce deterministic attention items.

Conceptual:

~~~ts
type AttentionKind =
  | 'HUMAN_APPROVAL'
  | 'RUNTIME_ERROR'
  | 'PROVIDER_FALLBACK'
  | 'QUOTA_WAIT'
  | 'BUDGET_WARNING'
  | 'BLOCKED_WORK'
  | 'SECURITY_FINDING'
  | 'CONTINUITY_RISK'
  | 'CI_FAILURE';

interface AttentionItemV1 {
  id: string;
  kind: AttentionKind;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  headline: string;
  source: string;
  occurredAt: string;
  runId?: string;
  workItemId?: string;
  correlationId?: string;
  nextAction?: string;
  authority: 'NONE';
}
~~~

Headlines and next-action strings are deterministic fields derived from structured state.

The dashboard must not ask an LLM to produce or rewrite them.

Structured runtime error reporting already provides the right pattern.

## Deduplication

Attention aggregation should avoid repeated cards for the same underlying state.

Examples:

- 40 repeated quota events for one provider cooldown → one active quota/fallback attention item;
- historical resolved human approvals → do not show as waiting;
- recovered provider → remove from active attention, retain in history;
- stale approval → show as stale, not as actionable current approval.

---

# 7. Current-work projection

Current Work should be derived from canonical workflow/scheduler state, not inferred by a model.

Possible presentation states:

~~~text
PLANNING
IMPLEMENTING
TESTING
SECURITY_REVIEW
REVIEW
WAITING_HUMAN
WAITING_PROVIDER
BLOCKED
COMPLETE
FAILED
UNKNOWN
~~~

The mapping from workflow nodes/modules to product labels must be deterministic and versioned.

When exact mapping is unavailable:

~~~text
Current work: Run 8f12… active
Current node: dependency-security-review
~~~

Do not invent a friendlier semantic stage.

## Multi-work handling

If more than one work item is active:

~~~text
2 active work items
1 waiting for approval
[View work]
~~~

Do not attempt an LLM-generated prioritization.

---

# 8. Provider / model status

The dashboard should combine existing provider/model telemetry with quota-aware failover state.

For each important logical role show only:

- logical role;
- preferred model/binding;
- active model/binding;
- health state;
- fallback active yes/no.

Example:

~~~text
Implementation   Opus     ACTIVE
Review           GPT      ACTIVE
Security         Gemini   FALLBACK → GPT
~~~

Details may show:

- provider ID;
- model;
- effort;
- cooldowns;
- failure kind;
- nextCheckAt;
- timing source;
- return policy;
- risk qualification;
- independence compatibility;
- recent calls/tokens/cost/latency.

Semantic failures must never appear as availability fallback reasons.

---

# 9. Usage windows

Current FH-04 summary is lifetime aggregation.

FH-04B should support deterministic windows:

- Today
- 24h
- 7d
- Current run
- Current project where repository identity is available

Minimum metrics:

- calls;
- total tokens;
- input;
- cached input;
- output;
- reasoning;
- actual cost;
- estimated cost;
- retries;
- fallbacks.

Default Home:

~~~text
Today: 43 calls · 184k tokens · $3.21
~~~

Detailed token categories remain collapsed.

---

# 10. System health

Core Home system health should be deterministic and decomposable.

Suggested dimensions:

- telemetry database;
- persistence integrity/currentness;
- provider availability;
- active quota/cooldown;
- workflow runtime heartbeat/liveness where available;
- unresolved critical runtime errors;
- resume/checkpoint health;
- optional external CI/connectors.

Overall state:

~~~text
HEALTHY
DEGRADED
ATTENTION
UNKNOWN
~~~

Avoid a single opaque AI health score.

The user must be able to inspect the underlying dimensions.

---

# 11. Continuity / checkpoint

Surface without model calls:

- latest checkpoint time;
- active work item;
- last remote checkpoint if available;
- resume manifest validity;
- source revision;
- continuity warning.

Default:

~~~text
Continuity
Checkpoint 4 min ago · resume ready
~~~

Warning:

~~~text
Continuity
Checkpoint stale · active run changed after last checkpoint
[Inspect]
~~~

This is operational state, not an LLM judgment.

---

# 12. Findings / security summary

Default Home should not list every finding.

Show:

- active critical/high count;
- unresolved/new count;
- latest finding timestamp.

Example:

~~~text
Security
0 critical · 2 high
~~~

Clicking opens the relevant deterministic finding/evidence view.

---

# 13. Optional Git / CI status

Useful but not a hard dependency for initial FH-04B delivery.

Possible cards:

- branch;
- exact HEAD;
- dirty/clean;
- ahead/behind;
- current PR;
- CI state.

Priority:

1. local Git deterministic state;
2. already-recorded CI events;
3. optional GitHub connector/API.

Core Home must still load if GitHub is offline.

---

# 14. Freshness semantics

Every aggregate should make freshness explicit.

Conceptual:

~~~ts
interface CoreHomeFreshness {
  generatedAt: string;
  sqliteUpdatedAt?: string;
  providerStateUpdatedAt?: string;
  continuityUpdatedAt?: string;
  externalCiUpdatedAt?: string;
  staleSources: readonly string[];
}
~~~

A stale source is not silently treated as healthy.

Examples:

~~~text
Provider health: UNKNOWN · last update 2h ago
CI: STALE · GitHub unavailable
~~~

---

# 15. Polling / performance

Current dashboard polls every 15 seconds.

FH-04B initial target:

- local Home snapshot poll: 10–15 seconds;
- browser hidden/background tab: reduced polling;
- external API polling: slower independent cadence;
- no repeated full-detail queries for unopened drawers.

Performance goals:

- Home snapshot is a bounded read;
- avoid full event-history scans on each refresh when a current-state projection can be maintained;
- SQLite remains read-only from web;
- snapshot response remains compact enough for frequent local refresh.

Server-Sent Events/WebSocket may be considered later if profiling justifies it.

---

# 16. Error behavior

Dashboard itself needs predictable error states.

### SQLite missing

~~~text
Telemetry not initialized yet
No model call will be started.
~~~

### Provider state unavailable

~~~text
Provider status unknown
Last deterministic update: 14:21
~~~

### External CI unavailable

~~~text
CI status unavailable
Core dashboard remains operational.
~~~

### Partial projection failure

Render other cards and mark only the affected source unavailable.

Do not replace a failed deterministic source with an LLM-generated guess.

---

# 17. Security / privacy

Default cards must not show:

- raw secrets;
- raw prompt/completion contents;
- plaintext secret values;
- sensitive provider payloads;
- unredacted runtime causes.

Use existing structured redaction/error-reporting rules.

Detailed diagnostics inherit existing data-policy constraints.

---

# 18. Main implementation impact

Expected primary areas:

~~~text
apps/web/src/read-model.ts
apps/web/src/server.ts
apps/web/src/ui.ts
apps/web/src/management.ts

packages/persistence
packages/telemetry

read-only projections for:
  provider/failover state
  continuity/checkpoint state
  structured runtime errors
  scheduler/current-work state
~~~

FH-04B should reuse existing bounded contexts instead of creating a generic dashboard domain package.

---

# 19. PR roadmap

## FH-04B.1 — Zero-token contract + Core Home snapshot schema

Deliver:

- CoreHomeSnapshotV1;
- source freshness contract;
- attention item contract;
- zero-token invariant documentation/tests;
- dependency guard against model invocation from dashboard read path.

Exit:

A test can prove that building/serving the snapshot does not invoke model/provider execution.

## FH-04B.2 — Local read-model aggregation

Deliver deterministic aggregation for data already present in SQLite:

- runs;
- human-required;
- tokens/cost;
- model usage;
- retries/fallback counts;
- branch/head/workflow;
- recent run summary;
- time-window usage.

Add GET /api/home.

Exit:

Core Home can render a useful snapshot using only existing SQLite telemetry.

## FH-04B.3 — Minimal Core Home UI

Replace the telemetry-first landing page with:

- context/header;
- Running;
- Attention;
- Errors;
- Providers;
- Current Work;
- Usage Today;
- model-role status;
- recent runs.

Keep old telemetry available as drill-down.

Exit:

The default page is useful without inspecting raw telemetry tables.

## FH-04B.4 — Current Work + approval attention

Project:

- active scheduler/workflow state;
- current node/stage;
- waiting-human state;
- parked/blocked work;
- current approval count.

Ensure stale/resolved approvals are not shown as current.

Exit:

Home can accurately answer what is happening now and what needs user action.

## FH-04B.5 — Provider / quota / failover projection

Expose read-only state from quota-aware failover:

- preferred binding;
- active binding;
- cooldown;
- failure kind;
- nextCheckAt;
- return policy;
- recovery state.

Combine with provider health telemetry.

Exit:

Home shows active fallback and recovery timing without invoking a model.

## FH-04B.6 — Structured errors + deterministic attention aggregation

Project:

- runtime structured error reports;
- provider/runtime failures;
- budget warnings;
- blocked work;
- active attention items.

Add deterministic deduplication/currentness behavior.

Exit:

Needs Attention is concise, actionable and LLM-free.

## FH-04B.7 — Continuity / findings / optional local Git

Add:

- checkpoint/resume status;
- finding/security counts;
- local Git revision/dirty state if safely available.

External GitHub/CI state remains optional.

Exit:

Home provides engineering continuity/status beyond model telemetry.

## FH-04B.8 — UX hardening + progressive disclosure

Deliver:

- loading/empty/partial/stale states;
- responsive layout;
- keyboard/accessibility checks;
- detail drawers;
- reduced visual density;
- polling optimization;
- persistent deterministic filters/time window.

Exit:

Home is production-quality while remaining simple.

## FH-04B.9 — Optional deterministic external status adapters

Later/P1:

- GitHub PR/CI;
- other CI providers;
- deterministic connector health.

No LLM interpretation.

---

# 20. Recommended delivery order

~~~text
FH-04B.1 Zero-token contract/schema      COMPLETE
        ↓
FH-04B.2 SQLite aggregate                  COMPLETE
        ↓
FH-04B.3 Minimal Home UI                   COMPLETE
        ↓
FH-04B.4 Current work/approvals            COMPLETE
        ↓
FH-04B.5 Provider/quota/failover           COMPLETE
        ↓
FH-04B.6 Errors/attention                  COMPLETE
        ↓
FH-04B.7 Continuity/findings/local state   COMPLETE
        ↓
FH-04B.8 UX hardening                      COMPLETE
        ↓
FH-04B.9 Optional external status          COMPLETE
~~~

FH-04B.1–FH-04B.8 are Core roadmap work.

FH-04B.9 is implemented as optional deterministic GitHub PR/CI enrichment. It remains disabled by default and Core Home stays functional without it.

---

# 21. Dependency relationship

FH-04B is not blocked by FH-20 for read-only implementation.

~~~text
FH-02 telemetry
   ↓
FH-03 SQLite
   ↓
FH-04 read-only dashboard
   ↓
FH-04B Core Home Dashboard
~~~

It may consume read-only information from:

~~~text
FH-08 provider health
FH-13 workflow state
FH-15 human approval/policy
FH-16 evidence
FH-17 replay/checkpoint/recovery
FH-30A..FH-37A module read models
quota-aware failover
runtime structured errors
~~~

None of those dependencies grant dashboard authority.

FH-KUIKA may later link to Core Home but FH-04B must never depend on FH-KUIKA.

---

# 22. Acceptance criteria

FH-04B is complete when:

1. Opening/refreshing Home results in zero model/provider inference calls.
2. A deterministic test proves the zero-token invariant.
3. Home renders useful state with only SQLite/local read models.
4. Home remains available when external APIs are offline.
5. Current project/revision context is visible.
6. Running/blocked/waiting work is represented deterministically.
7. Current human attention is distinct from historical/stale approvals.
8. Active provider fallback and next recovery check are visible when known.
9. Usage is available at least for Today and Current Run.
10. Structured errors are shown without secret leakage or guessed root causes.
11. Stale/unknown source state is explicit.
12. Advanced diagnostics are hidden by default.
13. Core Home remains usable with FH-KUIKA disabled or absent.
14. Web remains read-only and cannot grant authority.
15. UI disconnect cannot change workflow execution.
16. Existing telemetry/run detail remains reachable.

---

# 23. Non-goals

FH-04B does not:

- generate AI summaries for the dashboard;
- automatically prioritize work with an LLM;
- automatically explain raw logs through an LLM;
- replace run detail/evidence views;
- activate V3 authority;
- perform approvals;
- mutate model bindings;
- execute recovery actions;
- depend on FH-KUIKA;
- introduce a generic BI/analytics product.

---

# 24. Product rule

The Core Home Dashboard is an observer first.

Its job is to make FreeHighlander understandable before the user spends another token.

If a future feature needs an LLM call, it must be an explicit user action outside the automatic Home refresh path and must clearly indicate that it will consume model resources.
