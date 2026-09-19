export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · Engineering Telemetry</title>
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
    .eyebrow { color: var(--accent); text-transform: uppercase; font-size: 11px; letter-spacing: .14em; font-weight: 700; }
    .muted { color: var(--muted); }
    .readonly { border: 1px solid #225773; background: #102838; color: var(--accent); padding: 7px 10px; border-radius: 999px; font-size: 12px; }
    .grid { display: grid; gap: 14px; }
    .metrics { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    .card { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1px solid var(--line); border-radius: 12px; padding: 16px; box-shadow: 0 8px 32px #0004; }
    .metric strong { display: block; font-size: 22px; margin-top: 6px; font-variant-numeric: tabular-nums; }
    .metric span { color: var(--muted); font-size: 12px; }
    .layout { grid-template-columns: minmax(0, 1.4fr) minmax(360px, .6fr); margin-top: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    tr[data-run] { cursor: pointer; }
    tr[data-run]:hover { background: #ffffff08; }
    code { color: #c4d7ec; font-size: 12px; }
    .pill { display: inline-flex; padding: 2px 7px; border: 1px solid var(--line); border-radius: 999px; font-size: 11px; }
    .human { color: var(--warn); border-color: #6d5b22; }
    .status-PASSED, .status-PASS { color: var(--good); }
    .status-FAILED, .status-FAIL { color: var(--bad); }
    .detail { min-height: 360px; }
    .detail pre { white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto; background: #090d12; border-radius: 8px; padding: 12px; }
    .tabs { display: flex; gap: 7px; margin: 12px 0; flex-wrap: wrap; }
    button { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: 7px; padding: 7px 10px; cursor: pointer; }
    button:hover { border-color: #52677d; }
    .empty { padding: 36px; text-align: center; color: var(--muted); }
    .error { color: var(--bad); }
    @media (max-width: 1050px) {
      .metrics { grid-template-columns: repeat(3, 1fr); }
      .layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
      header, main { padding: 16px; }
      .metrics { grid-template-columns: repeat(2, 1fr); }
      .wide { overflow-x: auto; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="eyebrow">FreeHighlander</div>
      <h1>Engineering Telemetry</h1>
      <div id="health" class="muted">Connecting to local read model…</div>
    </div>
    <div class="readonly">READ ONLY · V2.5</div>
  </header>
  <main>
    <section id="metrics" class="grid metrics"></section>
    <section class="grid layout">
      <div class="card wide">
        <h2>Runs</h2>
        <div id="runs"><div class="empty">Loading runs…</div></div>
      </div>
      <aside class="card detail">
        <h2>Run Evidence</h2>
        <div id="detail" class="muted">Select a run.</div>
      </aside>
    </section>
    <section class="card wide" style="margin-top:14px">
      <h2>Model / Role Usage</h2>
      <div id="models"><div class="empty">Loading model metrics…</div></div>
    </section>
  </main>
<script>
const fmt = new Intl.NumberFormat();
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
const duration = value => value == null ? '—' : value < 1000 ? value + ' ms' : (value / 1000).toFixed(1) + ' s';
const esc = value => String(value ?? '—').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

async function api(path) {
  const response = await fetch(path, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.message || body.error || response.statusText), { body, status: response.status });
  return body;
}

function metric(label, value) {
  return '<div class="card metric"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
}

async function load() {
  try {
    const health = await api('/api/health');
    document.querySelector('#health').textContent =
      health.databaseExists ? 'SQLite schema v' + health.schemaVersion + ' · local observer' : 'Waiting for SQLite telemetry database';

    if (!health.databaseExists) {
      document.querySelector('#metrics').innerHTML = metric('State', 'No database');
      document.querySelector('#runs').innerHTML = '<div class="empty">Run telemetry has not been indexed yet.</div>';
      document.querySelector('#models').innerHTML = '<div class="empty">No model telemetry yet.</div>';
      return;
    }

    const values = await Promise.all([
      api('/api/summary'),
      api('/api/runs?limit=100'),
      api('/api/models?limit=100')
    ]);
    const summary = values[0];
    const runs = values[1];
    const models = values[2];

    document.querySelector('#metrics').innerHTML = [
      metric('Runs', fmt.format(summary.runs)),
      metric('Human required', fmt.format(summary.humanRequiredRuns)),
      metric('Model calls', fmt.format(summary.modelCalls)),
      metric('Total tokens', fmt.format(summary.totalTokens)),
      metric('Actual cost', money.format(summary.actualCostUsd)),
      metric('Avg model latency', duration(summary.averageModelLatencyMs))
    ].join('');

    renderRuns(runs.runs);
    renderModels(models.models);
  } catch (error) {
    document.querySelector('#health').innerHTML = '<span class="error">' + esc(error.message) + '</span>';
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
      '<td>' + esc(run.workflowId) + '<br><span class="muted">' + esc(run.workflowVersion) + '</span></td>' +
      '<td>' + fmt.format(run.eventCount) + '</td>' +
      '<td>' + fmt.format(run.modelCallCount) + '</td>' +
      '<td class="muted">' + esc(new Date(run.lastTimestamp).toLocaleString()) + '</td>' +
    '</tr>'
  ).join('');

  document.querySelector('#runs').innerHTML =
    '<table><thead><tr><th>Run</th><th>Status</th><th>Workflow</th><th>Events</th><th>Models</th><th>Updated</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';

  document.querySelectorAll('tr[data-run]').forEach(row =>
    row.addEventListener('click', () => loadRun(row.dataset.run))
  );
}

function renderModels(models) {
  if (!models.length) {
    document.querySelector('#models').innerHTML = '<div class="empty">No completed model calls indexed yet.</div>';
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
      '<td>' + duration(item.averageLatencyMs) + '</td>' +
      '<td>' + fmt.format(item.retries) + '</td>' +
      '<td>' + fmt.format(item.fallbacks) + '</td>' +
    '</tr>'
  ).join('');

  document.querySelector('#models').innerHTML =
    '<table><thead><tr><th>Role</th><th>Provider</th><th>Model</th><th>Effort</th><th>Calls</th><th>Tokens</th><th>Cost</th><th>Latency</th><th>Retries</th><th>Fallbacks</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function loadRun(runId) {
  const target = document.querySelector('#detail');
  target.textContent = 'Loading ' + runId + '…';

  try {
    const detail = await api('/api/runs/' + encodeURIComponent(runId));
    const run = detail.run;
    const tabs = ['events', 'modelCalls', 'artifacts'];

    target.innerHTML =
      '<div><code>' + esc(run.runId) + '</code></div>' +
      '<div class="muted">' + esc(run.repository) + (run.pullRequest ? ' · PR #' + run.pullRequest : '') + '</div>' +
      '<div style="margin-top:8px"><span class="pill status-' + esc(run.status) + '">' + esc(run.status) + '</span> ' +
        (run.humanRequired ? '<span class="pill human">HUMAN REQUIRED</span>' : '') + '</div>' +
      '<div class="tabs">' +
        tabs.map(tab => '<button data-tab="' + tab + '">' + tab + '</button>').join('') +
      '</div><pre id="run-payload"></pre>';

    const payload = target.querySelector('#run-payload');
    const show = key => { payload.textContent = JSON.stringify(detail[key], null, 2); };
    target.querySelectorAll('button[data-tab]').forEach(button =>
      button.addEventListener('click', () => show(button.dataset.tab))
    );
    show('events');
  } catch (error) {
    target.innerHTML = '<span class="error">' + esc(error.message) + '</span>';
  }
}

load();
setInterval(load, 15000);
</script>
</body>
</html>`;
