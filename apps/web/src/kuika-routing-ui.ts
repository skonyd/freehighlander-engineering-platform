export const FH_KUIKA_ROUTING_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA · Models & Routing</title>
  <style>
    :root {
      color-scheme: dark;
      --bg:#0b0f14; --panel:#121821; --line:#263241;
      --text:#e8eef6; --muted:#93a4b8; --accent:#7dd3fc;
      --good:#86efac; --warn:#fde68a; --bad:#fca5a5;
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
    a { color:var(--accent); text-decoration:none; }
    a:hover,a:focus-visible { text-decoration:underline; }
    .eyebrow {
      color:var(--accent); text-transform:uppercase; font-size:11px;
      letter-spacing:.14em; font-weight:700;
    }
    .muted { color:var(--muted); }
    .card {
      background:color-mix(in srgb,var(--panel) 92%,transparent);
      border:1px solid var(--line); border-radius:12px; padding:16px;
    }
    .controls {
      display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:14px;
    }
    label { display:grid; gap:5px; color:var(--muted); font-size:12px; }
    select,input {
      background:#0d141d; color:var(--text); border:1px solid var(--line);
      border-radius:8px; padding:8px;
    }
    button {
      margin-top:14px; background:#12324a; color:var(--accent); border:1px solid #225773;
      border-radius:8px; padding:8px 11px; cursor:pointer;
    }
    table { width:100%; border-collapse:collapse; margin-top:14px; }
    th,td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
    th { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
    .good { color:var(--good); }
    .bad { color:var(--bad); }
    code { color:#c4d7ec; }
    .boundary {
      margin-top:16px; padding:12px; border:1px solid var(--line);
      border-radius:10px; color:var(--muted);
    }
    @media (max-width:850px) {
      .controls { grid-template-columns:1fr 1fr; }
      header { flex-direction:column; }
    }
    @media (max-width:520px) { .controls { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="eyebrow">FH-KUIKA · Integrate</div>
      <h1>Models & Routing</h1>
      <div class="muted">Deterministic pre-call routing simulation.</div>
    </div>
    <a href="/modules/fh-kuika/integrate">← Integrate</a>
  </header>
  <main>
    <section class="card">
      <div class="controls">
        <label>Risk
          <select id="risk">
            <option>NORMAL</option><option selected>HIGH</option><option>CRITICAL</option>
          </select>
        </label>
        <label>Data
          <select id="data">
            <option>PUBLIC</option><option selected>INTERNAL</option>
            <option>CONFIDENTIAL</option><option>SECRET</option>
          </select>
        </label>
        <label>Context tokens
          <input id="context" type="number" min="1" max="10000000" value="50000" />
        </label>
        <label>Preferred health
          <select id="health">
            <option selected>AVAILABLE</option><option>RATE_LIMITED</option>
            <option>QUOTA_EXHAUSTED</option><option>PROVIDER_UNAVAILABLE</option>
            <option>AUTH_FAILED</option><option>UNKNOWN</option>
          </select>
        </label>
      </div>
      <button id="simulate">Simulate routing</button>
      <div id="result" class="muted" style="margin-top:16px">Run a simulation.</div>
    </section>
    <div class="boundary">
      Simulation is advisory and pre-call only. Semantic outputs, findings and verdicts are not
      routing inputs. This page cannot execute a model call, mutate bindings or grant authority.
    </div>
  </main>
<script>
const esc = value => String(value ?? '—').replace(/[&<>"']/g, ch => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]
));

async function simulate() {
  const params = new URLSearchParams({
    risk: document.querySelector('#risk').value,
    data: document.querySelector('#data').value,
    context: document.querySelector('#context').value,
    preferredHealth: document.querySelector('#health').value
  });
  const response = await fetch('/api/modules/fh-kuika/routing/simulate?' + params, {
    cache: 'no-store'
  });
  const body = await response.json();
  if (!response.ok) {
    document.querySelector('#result').textContent = body.error || response.statusText;
    return;
  }

  const decision = body.decision;
  const rows = decision.evaluations.map(item =>
    '<tr><td><code>' + esc(item.bindingId) + '</code></td>' +
    '<td class="' + (item.eligible ? 'good' : 'bad') + '">' +
      (item.eligible ? 'ELIGIBLE' : 'EXCLUDED') + '</td>' +
    '<td>' + esc(item.exclusionReasons.join(', ') || '—') + '</td></tr>'
  ).join('');

  document.querySelector('#result').innerHTML =
    '<h2>Decision</h2>' +
    '<p>Selected: <code>' + esc(decision.selectedBindingId) + '</code></p>' +
    '<p>' + esc(decision.reason) + '</p>' +
    '<table><thead><tr><th>Binding</th><th>Status</th><th>Reason</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

document.querySelector('#simulate').addEventListener('click', simulate);
simulate();
</script>
</body>
</html>`;

export function routingPageCanInvokeModel(): false {
  return false;
}

export function routingPageCanMutateBindings(): false {
  return false;
}

export function routingPageCanGrantAuthority(): false {
  return false;
}
