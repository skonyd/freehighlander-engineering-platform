export const FH_KUIKA_WORKBENCH_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA Workbench</title>
  <style>
    :root {
      color-scheme: dark;
      --bg:#0b0f14; --panel:#121821; --panel2:#171f2a; --line:#263241;
      --text:#e8eef6; --muted:#93a4b8; --accent:#7dd3fc; --warn:#fde68a;
    }
    * { box-sizing:border-box; }
    body {
      margin:0; background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);
      color:var(--text); font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    header,main { max-width:1180px; margin:auto; padding:24px; }
    header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
    h1 { margin:0; font-size:25px; }
    h2 { margin:0 0 10px; font-size:16px; }
    a { color:var(--accent); text-decoration:none; }
    a:hover,a:focus-visible { text-decoration:underline; }
    .eyebrow { color:var(--accent); text-transform:uppercase; font-size:11px; letter-spacing:.14em; font-weight:700; }
    .muted { color:var(--muted); }
    .layout { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(300px,.55fr); gap:14px; }
    .card { background:color-mix(in srgb,var(--panel) 92%,transparent); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .modes { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
    button {
      background:var(--panel2); color:var(--text); border:1px solid var(--line);
      border-radius:8px; padding:8px 12px; cursor:pointer;
    }
    button[aria-selected="true"] { border-color:var(--accent); color:var(--accent); }
    button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
    textarea {
      width:100%; min-height:180px; resize:vertical; background:#090d12; color:var(--text);
      border:1px solid var(--line); border-radius:9px; padding:12px; font:inherit;
    }
    .mode-note { margin:10px 0 14px; color:var(--muted); min-height:42px; }
    .context-row { border-top:1px solid var(--line); padding:9px 0; }
    .context-row:first-child { border-top:0; padding-top:0; }
    .context-row span { display:block; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
    .context-row strong, .context-row code { display:block; margin-top:3px; overflow-wrap:anywhere; }
    .preflight { margin-top:14px; border-top:1px solid var(--line); padding-top:12px; }
    .pill { display:inline-flex; border:1px solid var(--line); border-radius:999px; padding:2px 7px; font-size:11px; }
    .warn { color:var(--warn); }
    .action {
      margin-top:12px; display:flex; justify-content:space-between; gap:10px; align-items:center;
      padding:10px 12px; background:var(--panel2); border-radius:9px;
    }
    @media (max-width:820px) { .layout { grid-template-columns:1fr; } header { flex-direction:column; } }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="eyebrow">FH-KUIKA · Workbench</div>
      <h1>AI Workbench</h1>
      <div id="status" class="muted" role="status" aria-live="polite">Loading project context…</div>
    </div>
    <a href="/modules/fh-kuika">← FH-KUIKA Overview</a>
  </header>

  <main>
    <section class="layout">
      <div class="card">
        <div class="modes" role="tablist" aria-label="Workbench mode">
          <button type="button" data-mode="ASK" role="tab" aria-selected="true">Ask</button>
          <button type="button" data-mode="PLAN" role="tab" aria-selected="false">Plan</button>
          <button type="button" data-mode="EXECUTE" role="tab" aria-selected="false">Execute</button>
          <button type="button" data-mode="REVIEW" role="tab" aria-selected="false">Review</button>
        </div>

        <h2 id="mode-title">Ask</h2>
        <div id="mode-note" class="mode-note">Read-only project and engineering questions.</div>

        <textarea id="prompt" aria-label="Workbench request" placeholder="Describe the work or question…"></textarea>

        <div class="action">
          <span id="action-status" class="muted">Mode selection is local UI state only.</span>
          <span class="pill">NO MODEL CALL ON SELECT</span>
        </div>
      </div>

      <aside class="card">
        <h2>Context</h2>
        <div id="context">
          <div class="context-row"><span>Repository</span><strong>Loading…</strong></div>
        </div>
        <div class="preflight">
          <h2>Preflight</h2>
          <div id="preflight" class="muted">Loading authority state…</div>
        </div>
      </aside>
    </section>
  </main>

<script>
const modeViews = {
  ASK: {
    title:'Ask',
    purpose:'Read-only project and engineering questions.',
    mutation:false,
    requiresEnabled:false
  },
  PLAN: {
    title:'Plan',
    purpose:'Produce candidate plans and structured engineering work proposals.',
    mutation:false,
    requiresEnabled:false
  },
  EXECUTE: {
    title:'Execute',
    purpose:'Request a bounded writer workflow through normal control-plane policy.',
    mutation:true,
    requiresEnabled:true
  },
  REVIEW: {
    title:'Review',
    purpose:'Request independent review bound to an exact revision and evidence set.',
    mutation:false,
    requiresEnabled:false
  }
};

let homeState = null;

const esc = value => String(value ?? '—').replace(
  /[&<>"']/g,
  ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])
);

function selectMode(mode) {
  const view = modeViews[mode];
  document.querySelectorAll('button[data-mode]').forEach(button =>
    button.setAttribute('aria-selected', String(button.dataset.mode === mode))
  );
  document.querySelector('#mode-title').textContent = view.title;
  document.querySelector('#mode-note').textContent = view.purpose;

  const authority = homeState?.authority?.v3Authority || 'UNKNOWN';
  const blocked = view.requiresEnabled && authority !== 'ENABLED';
  document.querySelector('#action-status').innerHTML = blocked
    ? '<span class="warn">Execute request unavailable while V3 authority is ' + esc(authority) + '.</span>'
    : 'Mode selected. Starting work is not wired in this preparation slice.';
}

function renderContext(home) {
  const project = home.project || {};
  const sha = project.headSha ? String(project.headSha).slice(0,12) : 'unknown';
  document.querySelector('#status').textContent =
    'Read-only preparation surface · authority ' + (home.authority?.v3Authority || 'UNKNOWN');

  document.querySelector('#context').innerHTML =
    '<div class="context-row"><span>Repository</span><strong>' + esc(project.repository || 'Unknown') + '</strong></div>' +
    '<div class="context-row"><span>Branch</span><strong>' + esc(project.branch || 'Unknown') + '</strong></div>' +
    '<div class="context-row"><span>Exact revision</span><code>' + esc(sha) + '</code></div>' +
    '<div class="context-row"><span>Attention</span><strong>' + esc(home.attention?.total || 0) + '</strong></div>';

  document.querySelector('#preflight').innerHTML =
    '<div>Selection authority: <strong>NONE</strong></div>' +
    '<div>Execution owner: <strong>CONTROL_PLANE</strong></div>' +
    '<div>V3 authority: <strong>' + esc(home.authority?.v3Authority || 'UNKNOWN') + '</strong></div>';
}

async function load() {
  try {
    const response = await fetch('/api/home', { cache:'no-store' });
    const home = await response.json();
    if (!response.ok) throw new Error(home.message || home.error || response.statusText);
    homeState = home;
    renderContext(home);
    selectMode('ASK');
  } catch (error) {
    document.querySelector('#status').textContent = 'Project context unavailable: ' + error.message;
  }
}

document.querySelectorAll('button[data-mode]').forEach(button =>
  button.addEventListener('click', () => selectMode(button.dataset.mode))
);

void load();
</script>
</body>
</html>`;
