export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · Core Home</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0f14;
      --panel: #121821;
      --panel-2: #171f2a;
      --line: #263241;
      --text: #e8eef6;
      --muted: #93a4b8;
      --accent: #7dd3fc;
      --good: #86efac;
      --warn: #fde68a;
      --bad: #fca5a5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top left, #122032 0, var(--bg) 38rem);
      color: var(--text);
      font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header, main { max-width: 1440px; margin: auto; padding: 24px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: end; }
    h1 { font-size: 24px; margin: 0; letter-spacing: -0.02em; }
    h2 { font-size: 16px; margin: 0 0 14px; }
    h3 { font-size: 13px; margin: 0 0 8px; color: var(--muted); font-weight: 600; }
    .eyebrow {
      color: var(--accent);
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: .14em;
      font-weight: 700;
    }
    .muted { color: var(--muted); }
    .readonly {
      border: 1px solid #225773;
      background: #102838;
      color: var(--accent);
      padding: 7px 10px;
      border-radius: 999px;
      font-size: 12px;
      white-space: nowrap;
    }
    .grid { display: grid; gap: 14px; }
    .home-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .card {
      background: color-mix(in srgb, var(--panel) 92%, transparent);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 32px #0004;
    }
    .metric strong {
      display: block;
      font-size: 22px;
      margin-top: 6px;
      font-variant-numeric: tabular-nums;
    }
    .metric span { color: var(--muted); font-size: 12px; }
    .home-layout {
      grid-template-columns: minmax(0, 1.35fr) minmax(340px, .65fr);
      margin-top: 14px;
    }
    .project-line { margin-top: 5px; }
    .work-title { font-size: 18px; margin-bottom: 4px; }
    .usage-line { font-size: 17px; font-variant-numeric: tabular-nums; }
    .attention-item {
      border-top: 1px solid var(--line);
      padding: 10px 0;
    }
    .attention-item:first-child { border-top: 0; padding-top: 0; }
    .attention-item strong { display: block; }
    .section-label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 8px;
    }
    .details-heading {
      margin: 22px 0 10px;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .1em;
    }
    .telemetry-layout {
      grid-template-columns: minmax(0, 1.4fr) minmax(360px, .6fr);
      margin-top: 14px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    tr[data-run] { cursor: pointer; }
    tr[data-run]:hover { background: #ffffff08; }
    code { color: #c4d7ec; font-size: 12px; }
    .pill {
      display: inline-flex;
      padding: 2px 7px;
      border: 1px solid var(--line);
      border-radius: 999px;
      font-size: 11px;
    }
    .good { color: var(--good); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    .human { color: var(--warn); border-color: #6d5b22; }
    .status-PASSED, .status-PASS { color: var(--good); }
    .status-FAILED, .status-FAIL { color: var(--bad); }
    .detail { min-height: 360px; }
    .detail pre {
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 260px;
      overflow: auto;
      background: #090d12;
      border-radius: 8px;
      padding: 12px;
    }
    .tabs { display: flex; gap: 7px; margin: 12px 0; flex-wrap: wrap; }
    button {
      background: var(--panel-2);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 7px;
      padding: 7px 10px;
      cursor: pointer;
    }
    button:hover { border-color: #52677d; }
    .empty { padding: 28px 12px; text-align: center; color: var(--muted); }
    .error { color: var(--bad); }
    .error-card {
      border: 1px solid #6b3030;
      background: #1b1113;
      border-radius: 9px;
      padding: 12px;
      margin: 8px 0;
    }
    .error-card strong { color: var(--bad); }
    .error-grid {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr);
      gap: 5px 10px;
      margin-top: 9px;
    }
    .error-grid span:nth-child(odd) { color: var(--muted); }
    .zero-token-note {
      margin-top: 14px;
      color: var(--muted);
      font-size: 12px;
    }
    @media (max-width: 1050px) {
      .home-metrics { grid-template-columns: repeat(2, 1fr); }
      .home-layout, .telemetry-layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
      header, main { padding: 16px; }
      header { align-items: flex-start; flex-direction: column; }
      .home-metrics { grid-template-columns: 1fr 1fr; }
      .wide { overflow-x: auto; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="eyebrow">FreeHighlander · Core</div>
      <h1>Home</h1>
      <div id="project-context" class="project-line muted">Loading project context…</div>
      <div id="health" class="muted">Connecting to local read model…</div>
    </div>
    <div class="readonly">READ ONLY · ZERO-TOKEN HOME</div>
  </header>
  <main>
    <section id="home-metrics" class="grid home-metrics"></section>

    <section class="grid home-layout">
      <div class="card">
        <div class="section-label">Current work</div>
        <div id="current-work"><div class="empty">Loading current work…</div></div>
      </div>
      <aside class="card">
        <div class="section-label">Needs attention</div>
        <div id="attention"><div class="empty">Loading attention state…</div></div>
      </aside>
    </section>

    <section class="card" style="margin-top:14px">
      <div class="section-label">AI usage today</div>
      <div id="usage"><div class="empty">Loading usage…</div></div>
    </section>

    <div class="details-heading">Engineering details</div>

    <section class="grid telemetry-layout">
      <div class="card wide">
        <h2>Recent runs</h2>
        <div id="runs"><div class="empty">Loading runs…</div></div>
      </div>
      <aside class="card detail">
        <h2>Run detail</h2>
        <div id="detail" class="muted">Select a run.</div>
      </aside>
    </section>

    <section class="card wide" style="margin-top:14px">
      <h2>Model / role usage</h2>
      <div id="models"><div class="empty">Loading model metrics…</div></div>
    </section>

    <div class="zero-token-note">
      Core Home reads deterministic telemetry and state only. Automatic refresh does not invoke a model.
    </div>
  </main>
<script>
const fmt = new Intl.NumberFormat();
const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4
});
const esc = value => String(value ?? '—').replace(
  /[&<>"']/g,
  ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])
);

async function api(path) {
  const response = await fetch(path, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) {
    throw Object.assign(
      new Error(body.message || body.error || response.statusText),
      { body, status: response.status }
    );
  }
  return body;
}

function metric(label, value, detail) {
  return '<div class="card metric"><span>' + esc(label) + '</span><strong>' +
    esc(value) + '</strong><span>' + esc(detail || '') + '</span></div>';
}

function stale(home, source) {
  return (home.sourceFreshness.staleSources || []).includes(source);
}

function stateClass(value) {
  if (value === 'HEALTHY' || value === 'ACTIVE') return 'good';
  if (value === 'DEGRADED' || value === 'ATTENTION' || value === 'FALLBACK_ACTIVE') return 'warn';
  if (value === 'FAILED' || value === 'ERROR' || value === 'CRITICAL') return 'bad';
  return 'muted';
}

function renderHome(home) {
  const project = home.project || {};
  const revision = project.headSha ? String(project.headSha).slice(0, 12) : 'revision unknown';
  const repository = project.repository || 'No repository context';
  const branch = project.branch || 'branch unknown';

  document.querySelector('#project-context').innerHTML =
    '<strong>' + esc(repository) + '</strong> · ' + esc(branch) + '@<code>' + esc(revision) + '</code>';

  const attentionValue = stale(home, 'attention') ? 'Unknown' : fmt.format(home.attention.total);
  const providerValue = stale(home, 'provider-state') ? 'Unknown' : home.system.providers;
  const errorValue = stale(home, 'attention') ? 'Unknown' : fmt.format(home.attention.errors);

  document.querySelector('#home-metrics').innerHTML = [
    metric('System', home.system.state, 'Database: ' + home.system.database),
    metric('Attention', attentionValue, stale(home, 'attention') ? 'Projection pending' : 'Current'),
    metric('Errors', errorValue, stale(home, 'attention') ? 'Projection pending' : 'Current'),
    metric('Providers', providerValue, stale(home, 'provider-state') ? 'Projection pending' : 'Current')
  ].join('');

  const currentTarget = document.querySelector('#current-work');
  if (stale(home, 'current-work')) {
    currentTarget.innerHTML =
      '<div class="work-title muted">Current-work projection not available yet</div>' +
      '<div class="muted">Recent runs remain available below.</div>';
  } else if (!home.currentWork) {
    currentTarget.innerHTML = '<div class="muted">No active work.</div>';
  } else {
    currentTarget.innerHTML =
      '<div class="work-title">' + esc(home.currentWork.label) + '</div>' +
      '<div><span class="' + stateClass(home.currentWork.state) + '">' +
      esc(home.currentWork.state) + '</span> · <code>' + esc(home.currentWork.runId) + '</code></div>' +
      '<div class="muted">Updated ' +
      esc(new Date(home.currentWork.updatedAt).toLocaleString()) + '</div>';
  }

  const attentionTarget = document.querySelector('#attention');
  if (stale(home, 'attention')) {
    attentionTarget.innerHTML =
      '<div class="muted">Attention projection not available yet.</div>';
  } else if (!home.attention.items.length) {
    attentionTarget.innerHTML = '<div class="muted">Nothing currently needs attention.</div>';
  } else {
    attentionTarget.innerHTML = home.attention.items.map(item =>
      '<div class="attention-item">' +
        '<strong class="' + stateClass(item.severity) + '">' + esc(item.headline) + '</strong>' +
        '<div class="muted">' + esc(item.kind) + ' · ' +
        esc(new Date(item.occurredAt).toLocaleString()) + '</div>' +
        (item.nextAction ? '<div>' + esc(item.nextAction) + '</div>' : '') +
      '</div>'
    ).join('');
  }

  const usage = home.usage;
  document.querySelector('#usage').innerHTML =
    '<div class="usage-line"><strong>' + fmt.format(usage.modelCalls) + '</strong> calls · ' +
    '<strong>' + fmt.format(usage.totalTokens) + '</strong> tokens · <strong>' +
    money.format(usage.actualCostUsd || usage.estimatedCostUsd) + '</strong></div>' +
    '<div class="muted">Input ' + fmt.format(usage.inputTokens) +
    ' · Cached ' + fmt.format(usage.cachedInputTokens) +
    ' · Output ' + fmt.format(usage.outputTokens) +
    ' · Reasoning ' + fmt.format(usage.reasoningTokens) +
    ' · Retries ' + fmt.format(usage.retries) +
    ' · Fallbacks ' + fmt.format(usage.fallbacks) + '</div>';
}

async function load() {
  try {
    const health = await api('/api/health');
    document.querySelector('#health').textContent = health.databaseExists
      ? 'SQLite schema v' + health.schemaVersion + ' · local observer'
      : 'Waiting for SQLite telemetry database';

    if (!health.databaseExists) {
      document.querySelector('#home-metrics').innerHTML = metric('State', 'No database', 'Waiting');
      document.querySelector('#current-work').innerHTML =
        '<div class="empty">Telemetry has not been indexed yet.</div>';
      document.querySelector('#attention').innerHTML =
        '<div class="empty">Attention state is not available yet.</div>';
      document.querySelector('#usage').innerHTML =
        '<div class="empty">No usage telemetry yet.</div>';
      document.querySelector('#runs').innerHTML =
        '<div class="empty">Run telemetry has not been indexed yet.</div>';
      document.querySelector('#models').innerHTML =
        '<div class="empty">No model telemetry yet.</div>';
      return;
    }

    const values = await Promise.all([
      api('/api/home'),
      api('/api/runs?limit=100'),
      api('/api/models?limit=100')
    ]);
    renderHome(values[0]);
    renderRuns(values[1].runs);
    renderModels(values[2].models);
  } catch (error) {
    document.querySelector('#health').innerHTML =
      '<span class="error">' + esc(error.message) + '</span>';
  }
}

function renderRuns(runs) {
  if (!runs.length) {
    document.querySelector('#runs').innerHTML = '<div class="empty">No runs indexed yet.</div>';
    return;
  }

  const rows = runs.map(run =>
    '<tr data-run="' + esc(run.runId) + '">' +
      '<td><code>' + esc(run.runId.slice(0, 12)) + '</code></td>' +
      '<td><span class="status-' + esc(run.status) + '">' + esc(run.status) + '</span>' +
        (run.humanRequired ? ' <span class="pill human">HUMAN</span>' : '') + '</td>' +
      '<td>' + esc(run.workflowId) +
        '<br><span class="muted">' + esc(run.workflowVersion) + '</span></td>' +
      '<td>' + fmt.format(run.eventCount) + '</td>' +
      '<td>' + fmt.format(run.modelCallCount) + '</td>' +
      '<td class="muted">' + esc(new Date(run.lastTimestamp).toLocaleString()) + '</td>' +
    '</tr>'
  ).join('');

  document.querySelector('#runs').innerHTML =
    '<table><thead><tr><th>Run</th><th>Status</th><th>Workflow</th>' +
    '<th>Events</th><th>Models</th><th>Updated</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';

  document.querySelectorAll('tr[data-run]').forEach(row =>
    row.addEventListener('click', () => loadRun(row.dataset.run))
  );
}

function renderModels(models) {
  if (!models.length) {
    document.querySelector('#models').innerHTML =
      '<div class="empty">No completed model calls indexed yet.</div>';
    return;
  }

  const rows = models.map(item =>
    '<tr>' +
      '<td>' + esc(item.logicalRole) + '</td>' +
      '<td>' + esc(item.provider) + '</td>' +
      '<td>' + esc(item.model) + '</td>' +
      '<td>' + esc(item.effort) + '</td>' +
      '<td>' + fmt.format(item.calls) + '</td>' +
      '<td>' + fmt.format(item.totalTokens) + '</td>' +
      '<td>' + money.format(item.actualCostUsd || item.estimatedCostUsd) + '</td>' +
      '<td>' + fmt.format(item.retries) + '</td>' +
      '<td>' + fmt.format(item.fallbacks) + '</td>' +
    '</tr>'
  ).join('');

  document.querySelector('#models').innerHTML =
    '<table><thead><tr><th>Role</th><th>Provider</th><th>Model</th><th>Effort</th>' +
    '<th>Calls</th><th>Tokens</th><th>Cost</th><th>Retries</th><th>Fallbacks</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

function renderRuntimeErrors(errors) {
  if (!errors.length) {
    return '<div class="empty">No diagnosed runtime errors for this run.</div>';
  }

  return errors.map(error =>
    '<div class="error-card">' +
      '<strong>[' + esc(error.code) + '] ' + esc(error.headline) + '</strong>' +
      '<div class="error-grid">' +
        '<span>Cause</span><span>' + esc(error.rootCause) + '</span>' +
        '<span>Source</span><span><code>' + esc(error.sourceComponent) + '/' +
          esc(error.sourceOperation) + '</code></span>' +
        '<span>Failed step</span><span>' + esc(error.failedStep) + '</span>' +
        '<span>Signal</span><span>' + esc(error.observedSignal) + '</span>' +
        '<span>Next</span><span>' + esc(error.nextAction) + '</span>' +
        (error.retryAt
          ? '<span>Retry</span><span>' + esc(new Date(error.retryAt).toLocaleString()) + '</span>'
          : '') +
        '<span>Correlation</span><span><code>' + esc(error.correlationId) + '</code></span>' +
      '</div>' +
    '</div>'
  ).join('');
}

async function loadRun(runId) {
  const target = document.querySelector('#detail');
  target.textContent = 'Loading ' + runId + '…';

  try {
    const detail = await api('/api/runs/' + encodeURIComponent(runId));
    const run = detail.run;
    const tabs = ['errors', 'events', 'modelCalls', 'artifacts'];

    target.innerHTML =
      '<div><code>' + esc(run.runId) + '</code></div>' +
      '<div class="muted">' + esc(run.repository) +
        (run.pullRequest ? ' · PR #' + run.pullRequest : '') + '</div>' +
      '<div style="margin-top:8px"><span class="pill status-' + esc(run.status) + '">' +
        esc(run.status) + '</span> ' +
        (run.humanRequired ? '<span class="pill human">HUMAN REQUIRED</span>' : '') + '</div>' +
      '<div class="tabs">' +
        tabs.map(tab => '<button data-tab="' + tab + '">' + tab + '</button>').join('') +
      '</div><div id="run-payload"></div>';

    const payload = target.querySelector('#run-payload');
    const show = key => {
      if (key === 'errors') {
        payload.innerHTML = renderRuntimeErrors(detail.runtimeErrors || []);
        return;
      }
      payload.innerHTML = '<pre>' + esc(JSON.stringify(detail[key], null, 2)) + '</pre>';
    };
    target.querySelectorAll('button[data-tab]').forEach(button =>
      button.addEventListener('click', () => show(button.dataset.tab))
    );
    show((detail.runtimeErrors || []).length ? 'errors' : 'events');
  } catch (error) {
    target.innerHTML = '<span class="error">' + esc(error.message) + '</span>';
  }
}

load();
setInterval(load, 15000);
</script>
</body>
</html>`;
