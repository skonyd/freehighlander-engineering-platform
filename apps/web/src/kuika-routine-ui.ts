export const FH_KUIKA_ROUTINES_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA · Routines</title>
  <style>
    :root {
      color-scheme: dark;
      --bg:#0b0f14; --panel:#121821; --line:#263241;
      --text:#e8eef6; --muted:#93a4b8; --accent:#7dd3fc; --good:#86efac;
    }
    * { box-sizing:border-box; }
    body {
      margin:0;
      background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);
      color:var(--text);
      font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    header,main { max-width:1180px; margin:auto; padding:24px; }
    header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
    h1 { margin:0; font-size:25px; }
    h2 { margin:0; font-size:16px; }
    p { color:var(--muted); margin:8px 0 0; }
    a { color:var(--accent); text-decoration:none; }
    a:hover,a:focus-visible { text-decoration:underline; }
    .eyebrow {
      color:var(--accent); text-transform:uppercase; font-size:11px;
      letter-spacing:.14em; font-weight:700;
    }
    .muted { color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .card {
      background:color-mix(in srgb,var(--panel) 92%,transparent);
      border:1px solid var(--line); border-radius:12px; padding:16px;
    }
    .row { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
    .badge {
      border:1px solid var(--line); border-radius:999px; padding:2px 7px;
      color:var(--good); font-size:10px; white-space:nowrap;
    }
    code { color:#c4d7ec; font-size:12px; }
    .meta { display:grid; gap:6px; margin-top:12px; color:var(--muted); }
    .boundary {
      margin-top:16px; padding:12px; border:1px solid var(--line);
      border-radius:10px; color:var(--muted);
    }
    @media (max-width:800px) {
      .grid { grid-template-columns:1fr; }
      header { flex-direction:column; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="eyebrow">FH-KUIKA · Integrate</div>
      <h1>Routines</h1>
      <div class="muted">Event and schedule trigger definitions. Preparation only.</div>
    </div>
    <a href="/modules/fh-kuika/integrate">← Integrate</a>
  </header>
  <main>
    <section id="routines" class="grid">
      <div class="card muted">Loading routine templates…</div>
    </section>
    <div class="boundary">
      Routine inspection is read-only. This page cannot enable a routine, accept a webhook,
      execute a workflow, invoke a model or grant authority. Activation remains subject to
      FH-20 and normal system-policy gates.
    </div>
  </main>
<script>
const esc = value => String(value ?? '—').replace(/[&<>"']/g, ch => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]
));

async function load() {
  const target = document.querySelector('#routines');
  try {
    const response = await fetch('/api/modules/fh-kuika/routines', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || response.statusText);

    target.innerHTML = body.routines.map(routine =>
      '<article class="card">' +
        '<div class="row"><h2>' + esc(routine.name) + '</h2>' +
        '<span class="badge">DRAFT</span></div>' +
        '<div class="meta">' +
          '<div>Trigger: <strong>' + esc(routine.trigger.kind) + '</strong></div>' +
          '<div>Workflow: <code>' + esc(routine.workflowRef) + '</code></div>' +
          '<div>Concurrency: ' + esc(routine.concurrency) + '</div>' +
          '<div>Activation: not authorized</div>' +
        '</div>' +
      '</article>'
    ).join('');
  } catch (error) {
    target.innerHTML = '<div class="card muted">' + esc(error.message) + '</div>';
  }
}

load();
</script>
</body>
</html>`;

export function routinesPageCanInvokeModel(): false {
  return false;
}

export function routinesPageCanActivate(): false {
  return false;
}

export function routinesPageCanGrantAuthority(): false {
  return false;
}
