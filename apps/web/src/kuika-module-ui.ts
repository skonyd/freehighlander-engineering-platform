export const FH_KUIKA_MODULE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA</title>
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
    h1 { margin: 0; font-size: 26px; letter-spacing: -.03em; }
    h2 { margin: 0 0 8px; font-size: 17px; }
    a { color: var(--accent); text-decoration: none; }
    a:hover, a:focus-visible { text-decoration: underline; }
    .eyebrow { color: var(--accent); text-transform: uppercase; font-size: 11px; letter-spacing: .14em; font-weight: 700; }
    .muted { color: var(--muted); }
    .badge { border: 1px solid #225773; background: #102838; color: var(--accent); padding: 6px 9px; border-radius: 999px; font-size: 11px; white-space: nowrap; }
    .status { margin-top: 6px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }
    .card { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1px solid var(--line); border-radius: 12px; padding: 16px; min-height: 118px; }
    .card p { margin: 0; color: var(--muted); }
    .overview { margin-top: 18px; display: grid; grid-template-columns: 1.4fr .6fr; gap: 14px; }
    .metric { display: flex; justify-content: space-between; gap: 14px; padding: 7px 0; border-top: 1px solid var(--line); }
    .metric:first-child { border-top: 0; }
    .metric span { color: var(--muted); }
    .good { color: var(--good); }
    .warn { color: var(--warn); }
    .footer-note { margin-top: 22px; color: var(--muted); font-size: 12px; }
    @media (max-width: 850px) {
      .grid { grid-template-columns: 1fr 1fr; }
      .overview { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      header, main { padding: 16px; }
      header { flex-direction: column; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="eyebrow">FreeHighlander · Modules</div>
      <h1>FH-KUIKA</h1>
      <div class="muted">Optional productization module</div>
      <div id="module-status" class="status muted" role="status" aria-live="polite">Loading deterministic module status…</div>
    </div>
    <div>
      <a href="/">← Core Home</a>
      <span class="badge">OPTIONAL · READ ONLY SHELL</span>
    </div>
  </header>

  <main>
    <section class="overview">
      <div class="card">
        <h2>Overview</h2>
        <p>FH-KUIKA adds optional productized workflows and tools on top of the existing FreeHighlander AI work structure. It does not own authority or replace Core execution.</p>
      </div>
      <div class="card" id="module-health">
        <div class="metric"><span>Authority</span><strong>—</strong></div>
        <div class="metric"><span>Attention</span><strong>—</strong></div>
        <div class="metric"><span>Fallbacks</span><strong>—</strong></div>
      </div>
    </section>

    <section class="grid" aria-label="FH-KUIKA module areas">
      <div class="card"><h2>Workbench</h2><p>Ask, Plan, Execute and Review modes. Mode selection never grants authority.</p></div>
      <div class="card"><h2>Build</h2><p>Blueprints, Workflow Studio, roles and solution packs.</p></div>
      <div class="card"><h2>Integrate</h2><p>Connector Hub, model routing and routines.</p></div>
      <div class="card"><h2>Knowledge</h2><p>Engineering graph, evidence and deterministic search surfaces.</p></div>
      <div class="card"><h2>Operate</h2><p>Operations, approvals, errors, routing and audit views.</p></div>
      <div class="card"><h2>Module boundary</h2><p>Disable this module and Core runtime remains valid and usable.</p></div>
    </section>

    <div class="footer-note">
      This shell reads Core Home state only. It does not invoke a model, mutate runtime state or grant authority.
    </div>
  </main>

<script>
const fmt = new Intl.NumberFormat();

async function loadModuleStatus() {
  const target = document.querySelector('#module-status');
  const health = document.querySelector('#module-health');
  try {
    const response = await fetch('/api/home', { cache: 'no-store' });
    const home = await response.json();
    if (!response.ok) throw new Error(home.message || home.error || response.statusText);

    const fallbacks = (home.roleBindings || []).filter(item => item.state === 'FALLBACK_ACTIVE').length;
    const stale = (home.sourceFreshness?.staleSources || []).length;

    target.textContent = stale
      ? 'Enabled · Core state partially stale'
      : 'Enabled · Core state current';

    health.innerHTML =
      '<div class="metric"><span>Authority</span><strong>' +
        String(home.authority?.v3Authority || 'UNKNOWN') + '</strong></div>' +
      '<div class="metric"><span>Attention</span><strong>' +
        fmt.format(home.attention?.total || 0) + '</strong></div>' +
      '<div class="metric"><span>Fallbacks</span><strong>' +
        fmt.format(fallbacks) + '</strong></div>';
  } catch (error) {
    target.textContent = 'Module shell available · Core status unavailable';
    health.innerHTML =
      '<div class="metric"><span>Status</span><strong class="warn">UNKNOWN</strong></div>';
  }
}

void loadModuleStatus();
</script>
</body>
</html>`;
