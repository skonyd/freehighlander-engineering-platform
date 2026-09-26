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
    h1 { font-size: 26px; margin: 0; letter-spacing: -0.03em; }
    h2 { font-size: 16px; margin: 0 0 14px; }
    h3 { font-size: 13px; margin: 0; }
    .eyebrow { color: var(--accent); text-transform: uppercase; font-size: 11px; letter-spacing: .14em; font-weight: 700; }
    .muted { color: var(--muted); }
    .readonly { border: 1px solid #225773; background: #102838; color: var(--accent); padding: 7px 10px; border-radius: 999px; font-size: 12px; }
    .grid { display: grid; gap: 14px; }
    .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .home-layout { grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr); margin-top: 14px; }
    .telemetry-layout { grid-template-columns: minmax(0, 1.4fr) minmax(360px, .6fr); margin-top: 14px; }
    .card { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1px solid var(--line); border-radius: 12px; padding: 16px; box-shadow: 0 8px 32px #0004; }
    .metric strong { display: block; font-size: 22px; margin-top: 6px; font-variant-numeric: tabular-nums; }
    .metric span { color: var(--muted); font-size: 12px; }
    .context { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; align-items: center; }
    .context code { background: #0b1119; border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; }
    .current-work { min-height: 142px; }
    .work-title { font-size: 18px; font-weight: 650; margin-top: 4px; }
    .work-status { margin-top: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .attention-list { display: grid; gap: 9px; }
    .attention-item { border-top: 1px solid var(--line); padding-top: 10px; }
    .attention-item:first-child { border-top: 0; padding-top: 0; }
    .usage-line { font-size: 19px; font-weight: 650; margin: 6px 0 14px; }
    .status-line { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-top: 1px solid var(--line); }
    .status-line:first-of-type { border-top: 0; }
    .section-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin:26px 0 10px; }
    .section-heading h2 { margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    tr[data-run] { cursor: pointer; }
    tr[data-run]:hover { background: #ffffff08; }
    code { color: #c4d7ec; font-size: 12px; }
    .pill { display: inline-flex; padding: 2px 7px; border: 1px solid var(--line); border-radius: 999px; font-size: 11px; }
    .human { color: var(--warn); border-color: #6d5b22; }
    .good { color: var(--good); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    .status-PASSED, .status-PASS, .status-HEALTHY { color: var(--good); }
    .status-FAILED, .status-FAIL, .status-ATTENTION { color: var(--bad); }
    .status-DEGRADED, .status-UNKNOWN { color: var(--warn); }
    .detail { min-height: 360px; }
    .detail pre { white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto; background: #090d12; border-radius: 8px; padding: 12px; }
    .tabs { display: flex; gap: 7px; margin: 12px 0; flex-wrap: wrap; }
    button { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: 7px; padding: 7px 10px; cursor: pointer; }
    button:hover { border-color: #52677d; }
    .empty { padding: 26px; text-align: center; color: var(--muted); }
    .error { color: var(--bad); }
    .telemetry-details { margin-top: 10px; }
    .telemetry-details > summary { cursor: pointer; color: var(--accent); user-select: none; }
    @media (max-width: 1050px) {
      .metrics { grid-template-columns: repeat(2, 1fr); }
      .home-layout, .telemetry-layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
      header, main { padding: 16px; }
      .metrics { grid-template-columns: 1fr 1fr; }
      .wide { overflow-x: auto; }
      .status-line { display:block; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="eyebrow">FreeHighlander · Core</div>
      <h1>Home</h1>
      <div id="context" class="context muted">Connecting to local read model…</div>
    </div>
    <div class="readonly">ZERO-TOKEN · READ ONLY</div>
  </header>
  <main>
    <section id="home-metrics" class="grid metrics"></section>

    <section class="grid home-layout">
      <div class="card current-work">
        <h2>Current Work</h2>
        <div id="current-work"><div class="empty">Loading current work…</div></div>
      </div>

      <aside class="card">
        <h2>Needs Attention</h2>
        <div id="attention"><div class="empty">Loading attention…</div></div>
      </aside>
    </section>

    <section class="grid home-layout">
      <div class="card">
        <h2>AI Usage</h2>
        <div id="usage"><div class="empty">Loading usage…</div></div>
      </div>
      <aside class="card">
        <h2>Model / Provider State</h2>
        <div id="bindings"><div class="empty">Loading provider state…</div></div>
      </aside>
    </section>

    <details class="telemetry-details">
      <summary>Engineering telemetry</summary>

      <div class="section-heading">
        <h2>Recent Runs</h2>
        <span class="muted">Deterministic telemetry detail</span>
      </div>

      <section class="grid telemetry-layout">
        <div class="card wide">
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
    </details>
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

function metric(label, value, className = '') {
  return '<div class="card metric"><span>' + esc(label) + '</span><strong class="' + esc(className) + '">' + esc(value) + '</strong></div>';
}

async function load() {
  try {
    const home = await api('/api/home');
    renderHome(home);

    if (!home.system.databaseReady) {
      document.querySelector('#runs').innerHTML = '<div class="empty">Run telemetry has not been indexed yet.</div>';
      document.querySelector('#models').innerHTML = '<div class="empty">No model telemetry yet.</div>';
      return;
    }

    const values = await Promise.all([
      api('/api/runs?limit=100'),
      api('/api/models?limit=100')
    ]);
    renderRuns(values[0].runs);
    renderModels(values[1].models);
  } catch (error) {
    document.querySelector('#context').innerHTML = '<span class="error">' + esc(error.message) + '</span>';
  }
}

function renderHome(home) {
  const revision = home.project.exactRevision ? home.project.exactRevision.slice(0, 12) : 'unknown revision';
  const project = home.project.repository || 'No active project';
  const branch = home.project.branch || 'unknown branch';

  document.querySelector('#context').innerHTML =
    '<span>' + esc(project) + '</span>' +
    '<span>·</span><span>' + esc(branch) + '</span>' +
    '<code>' + esc(revision) + '</code>' +
    '<span class="pill">' + esc(home.authority.v3Authority) + '</span>';

  const running = home.recentRuns.filter(run =>
    ['RUNNING', 'ACTIVE', 'IN_PROGRESS'].includes(String(run.status || '').toUpperCase())
  ).length;

  document.querySelector('#home-metrics').innerHTML = [
    metric('Running', fmt.format(running)),
    metric('Attention', fmt.format(home.attention.total), home.attention.total ? 'warn' : 'good'),
    metric('Critical errors', fmt.format(home.system.unresolvedCriticalErrors), home.system.unresolvedCriticalErrors ? 'bad' : 'good'),
    metric('System', home.system.state, 'status-' + home.system.state)
  ].join('');

  renderCurrentWork(home.currentWork, home.recentRuns);
  renderAttention(home.attention);
  renderUsage(home.usage);
  renderBindings(home.roleBindings);
}

function renderCurrentWork(currentWork, recentRuns) {
  const target = document.querySelector('#current-work');

  if (currentWork) {
    target.innerHTML =
      '<div class="work-title">' + esc(currentWork.label) + '</div>' +
      '<div class="work-status"><span class="pill">' + esc(currentWork.state) + '</span>' +
      '<code>' + esc(currentWork.runId.slice(0, 12)) + '</code></div>' +
      '<div class="muted" style="margin-top:12px">Updated ' +
      esc(new Date(currentWork.updatedAt).toLocaleString()) + '</div>';
    return;
  }

  const recent = recentRuns[0];
  if (recent) {
    target.innerHTML =
      '<div class="work-title">No deterministic current-work projection yet</div>' +
      '<div class="muted" style="margin-top:8px">Latest recorded run:</div>' +
      '<div class="work-status"><span class="pill">' + esc(recent.status) + '</span>' +
      '<code>' + esc(recent.runId.slice(0, 12)) + '</code></div>';
    return;
  }

  target.innerHTML = '<div class="empty">No recorded work yet.</div>';
}

function renderAttention(attention) {
  const target = document.querySelector('#attention');
  if (!attention.items.length) {
    target.innerHTML = '<div class="good">Nothing currently requires attention.</div>';
    return;
  }

  target.innerHTML = '<div class="attention-list">' + attention.items.map(item =>
    '<div class="attention-item">' +
      '<div><span class="pill">' + esc(item.severity) + '</span> ' + esc(item.headline) + '</div>' +
      (item.nextAction ? '<div class="muted" style="margin-top:5px">' + esc(item.nextAction) + '</div>' : '') +
    '</div>'
  ).join('') + '</div>';
}

function renderUsage(usage) {
  document.querySelector('#usage').innerHTML =
    '<div class="muted">' + esc(usage.window.replaceAll('_', ' ')) + '</div>' +
    '<div class="usage-line">' +
      fmt.format(usage.modelCalls) + ' calls · ' +
      fmt.format(usage.totalTokens) + ' tokens · ' +
      money.format(usage.actualCostUsd || usage.estimatedCostUsd) +
    '</div>' +
    '<div class="status-line"><span>Cached input</span><strong>' + fmt.format(usage.cachedInputTokens) + '</strong></div>' +
    '<div class="status-line"><span>Retries</span><strong>' + fmt.format(usage.retries) + '</strong></div>' +
    '<div class="status-line"><span>Fallbacks</span><strong>' + fmt.format(usage.fallbacks) + '</strong></div>';
}

function renderBindings(bindings) {
  const target = document.querySelector('#bindings');

  if (!bindings.length) {
    target.innerHTML =
      '<div class="muted">Current binding health projection is not available yet.</div>' +
      '<div class="muted" style="margin-top:8px">FH-04B.5 will add preferred / active / fallback state without model calls.</div>';
    return;
  }

  target.innerHTML = bindings.map(binding =>
    '<div class="status-line">' +
      '<span>' + esc(binding.logicalRole) + '</span>' +
      '<strong>' + esc(binding.activeModel || binding.activeBindingId || binding.state) + '</strong>' +
    '</div>'
  ).join('');
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
