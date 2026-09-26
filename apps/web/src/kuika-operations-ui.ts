export const FH_KUIKA_OPERATIONS_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA Operate</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0f14;
      --panel: #121821;
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
    header, main { max-width: 1180px; margin: auto; padding: 24px; }
    header { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
    h1 { margin: 0; font-size: 25px; }
    h2 { margin: 0 0 12px; font-size: 16px; }
    a { color: var(--accent); text-decoration: none; }
    a:hover, a:focus-visible { text-decoration: underline; }
    .eyebrow { color: var(--accent); text-transform: uppercase; font-size: 11px; letter-spacing: .14em; font-weight: 700; }
    .muted { color: var(--muted); }
    .grid { display: grid; gap: 14px; }
    .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .layout { grid-template-columns: minmax(0, .75fr) minmax(0, 1.25fr); margin-top: 14px; }
    .card { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
    .metric strong { display: block; font-size: 20px; margin-top: 4px; }
    .metric span { color: var(--muted); font-size: 12px; }
    .attention { border-top: 1px solid var(--line); padding: 10px 0; }
    .attention:first-child { border-top: 0; padding-top: 0; }
    .pill { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 2px 7px; font-size: 11px; }
    .good { color: var(--good); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    button {
      width: 100%;
      text-align: left;
      background: transparent;
      color: var(--text);
      border: 0;
      border-top: 1px solid var(--line);
      padding: 10px 0;
      cursor: pointer;
    }
    button:first-child { border-top: 0; padding-top: 0; }
    button:hover, button:focus-visible { color: var(--accent); outline: none; }
    .error-card { border: 1px solid #6b3030; background: #1b1113; border-radius: 9px; padding: 12px; margin-top: 10px; }
    .error-card strong { color: var(--bad); }
    .error-grid { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 5px 10px; margin-top: 9px; }
    .error-grid span:nth-child(odd) { color: var(--muted); }
    .empty { color: var(--muted); padding: 18px 0; }
    @media (max-width: 820px) {
      .metrics { grid-template-columns: 1fr; }
      .layout { grid-template-columns: 1fr; }
      header { flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="eyebrow">FH-KUIKA · Operate</div>
      <h1>Explainable Operations</h1>
      <div id="status" class="muted" role="status" aria-live="polite">Loading deterministic operations state…</div>
    </div>
    <div><a href="/modules/fh-kuika">← FH-KUIKA Overview</a></div>
  </header>

  <main>
    <section id="metrics" class="grid metrics"></section>

    <section class="grid layout">
      <div class="card">
        <h2>Needs attention</h2>
        <div id="attention"><div class="empty">Loading attention…</div></div>
      </div>

      <div class="card">
        <h2>Provider / fallback state</h2>
        <div id="bindings"><div class="empty">Loading binding state…</div></div>
      </div>
    </section>

    <section class="grid layout">
      <div class="card">
        <h2>Recent runs</h2>
        <div id="runs"><div class="empty">Loading runs…</div></div>
      </div>

      <div class="card">
        <h2>Selected run diagnostics</h2>
        <div id="diagnostics"><div class="empty">Select a run to inspect structured runtime errors.</div></div>
      </div>
    </section>
  </main>

<script>
const fmt = new Intl.NumberFormat();
const esc = value => String(value ?? '—').replace(
  /[&<>"']/g,
  ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])
);

async function api(path) {
  const response = await fetch(path, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.error || response.statusText);
  return body;
}

function stateClass(value) {
  if (value === 'ACTIVE' || value === 'HEALTHY') return 'good';
  if (value === 'FALLBACK_ACTIVE' || value === 'DEGRADED' || value === 'WARNING') return 'warn';
  if (value === 'CRITICAL' || value === 'ERROR' || value === 'FAILED') return 'bad';
  return 'muted';
}

function renderHome(home) {
  document.querySelector('#status').textContent =
    'Read-only module surface · authority ' + (home.authority?.v3Authority || 'UNKNOWN');

  const fallbackCount = (home.roleBindings || []).filter(item => item.state === 'FALLBACK_ACTIVE').length;
  document.querySelector('#metrics').innerHTML =
    '<div class="card metric"><span>Attention</span><strong>' + fmt.format(home.attention?.total || 0) + '</strong></div>' +
    '<div class="card metric"><span>Provider state</span><strong class="' + stateClass(home.system?.providers) + '">' +
      esc(home.system?.providers || 'UNKNOWN') + '</strong></div>' +
    '<div class="card metric"><span>Fallbacks</span><strong>' + fmt.format(fallbackCount) + '</strong></div>';

  const attention = home.attention?.items || [];
  document.querySelector('#attention').innerHTML = attention.length
    ? attention.map(item =>
        '<div class="attention">' +
          '<div><span class="pill ' + stateClass(item.severity) + '">' + esc(item.severity) + '</span> ' +
            '<strong>' + esc(item.headline) + '</strong></div>' +
          (item.nextAction ? '<div class="muted">' + esc(item.nextAction) + '</div>' : '') +
        '</div>'
      ).join('')
    : '<div class="empty">Nothing currently requires attention.</div>';

  const bindings = home.roleBindings || [];
  document.querySelector('#bindings').innerHTML = bindings.length
    ? bindings.map(item => {
        const preferred = item.preferredModel || item.preferredBindingId || 'Unknown';
        const active = item.activeModel || item.activeBindingId || 'Unknown';
        const recovery = item.nextCheckAt
          ? '<div class="muted">Recovery check ' + esc(new Date(item.nextCheckAt).toLocaleString()) + '</div>'
          : '';
        return '<div class="attention">' +
          '<strong>' + esc(item.logicalRole) + '</strong> ' +
          '<span class="pill ' + stateClass(item.state) + '">' + esc(item.state) + '</span>' +
          '<div class="muted">' + esc(preferred) + (preferred !== active ? ' → ' + esc(active) : '') + '</div>' +
          recovery +
        '</div>';
      }).join('')
    : '<div class="empty">No provider binding projection is available.</div>';
}

function renderRuns(runs) {
  document.querySelector('#runs').innerHTML = runs.length
    ? runs.slice(0, 12).map(run =>
        '<button data-run="' + esc(run.runId) + '">' +
          '<strong>' + esc(run.status || 'UNKNOWN') + '</strong> · <code>' + esc(run.runId.slice(0, 12)) + '</code>' +
          '<div class="muted">' + esc(run.workflowId || 'workflow unknown') + '</div>' +
        '</button>'
      ).join('')
    : '<div class="empty">No runs indexed yet.</div>';

  document.querySelectorAll('button[data-run]').forEach(button =>
    button.addEventListener('click', () => void loadRun(button.dataset.run))
  );
}

async function loadRun(runId) {
  const target = document.querySelector('#diagnostics');
  target.innerHTML = '<div class="empty">Loading diagnostics…</div>';

  try {
    const detail = await api('/api/runs/' + encodeURIComponent(runId));
    const errors = detail.runtimeErrors || [];

    if (!errors.length) {
      target.innerHTML =
        '<div><code>' + esc(runId) + '</code></div>' +
        '<div class="empty">No structured runtime errors are recorded for this run.</div>';
      return;
    }

    target.innerHTML =
      '<div><code>' + esc(runId) + '</code></div>' +
      errors.map(error =>
        '<div class="error-card">' +
          '<strong>[' + esc(error.code) + '] ' + esc(error.headline) + '</strong>' +
          '<div class="error-grid">' +
            '<span>Cause</span><span>' + esc(error.rootCause) + '</span>' +
            '<span>Source</span><span>' + esc(error.sourceComponent) + '/' + esc(error.sourceOperation) + '</span>' +
            '<span>Failed</span><span>' + esc(error.failedStep) + '</span>' +
            '<span>Signal</span><span>' + esc(error.observedSignal) + '</span>' +
            '<span>Next</span><span>' + esc(error.nextAction) + '</span>' +
            '<span>Correlation</span><span><code>' + esc(error.correlationId) + '</code></span>' +
          '</div>' +
        '</div>'
      ).join('');
  } catch (error) {
    target.innerHTML = '<div class="bad">' + esc(error.message) + '</div>';
  }
}

async function load() {
  try {
    const [home, runs] = await Promise.all([
      api('/api/home'),
      api('/api/runs?limit=20')
    ]);
    renderHome(home);
    renderRuns(runs.runs || []);
  } catch (error) {
    document.querySelector('#status').textContent = 'Operations state unavailable: ' + error.message;
  }
}

void load();
</script>
</body>
</html>`;
