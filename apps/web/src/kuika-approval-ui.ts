export const FH_KUIKA_APPROVALS_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA Approvals</title>
  <style>
    :root { color-scheme: dark; --bg:#0b0f14; --panel:#121821; --line:#263241; --text:#e8eef6; --muted:#93a4b8; --accent:#7dd3fc; --warn:#fde68a; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 ui-sans-serif,system-ui; }
    header,main { max-width:1100px; margin:auto; padding:24px; }
    header { display:flex; justify-content:space-between; gap:16px; }
    a { color:var(--accent); text-decoration:none; }
    .muted { color:var(--muted); }
    .grid { display:grid; gap:14px; grid-template-columns:repeat(3,minmax(0,1fr)); }
    .card { border:1px solid var(--line); border-radius:12px; background:var(--panel); padding:16px; }
    .approval { border-top:1px solid var(--line); padding:12px 0; }
    .approval:first-child { border-top:0; }
    .pill { display:inline-flex; border:1px solid var(--line); border-radius:999px; padding:2px 7px; font-size:11px; }
    .warn { color:var(--warn); }
    code { word-break:break-all; }
    @media (max-width:760px){ .grid{grid-template-columns:1fr;} header{flex-direction:column;} }
  </style>
</head>
<body>
<header>
  <div>
    <div class="muted">FH-KUIKA · Approval Inbox</div>
    <h1>Human approvals</h1>
    <div id="status" class="muted" role="status">Loading deterministic approval state…</div>
  </div>
  <div><a href="/modules/fh-kuika/operate">← Operate</a></div>
</header>
<main>
  <section id="counts" class="grid"></section>
  <section class="card" style="margin-top:14px">
    <h2>Pending</h2>
    <div id="pending"></div>
  </section>
  <section class="card" style="margin-top:14px">
    <h2>Stale / unknown</h2>
    <div id="stale"></div>
  </section>
</main>
<script>
const esc=value=>String(value??'—').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function itemHtml(item){
  return '<div class="approval">'+
    '<div><strong>'+esc(item.workflowId||'workflow unknown')+'</strong> · <span class="pill">'+esc(item.currentness)+'</span></div>'+
    '<div class="muted">Run <code>'+esc(item.runId)+'</code>'+(item.nodeId?' · node '+esc(item.nodeId):'')+'</div>'+
    '<div>Binding: <span class="'+(item.bindingState==='EXACT_SCOPE_BOUND'?'':'warn')+'">'+esc(item.bindingState)+'</span></div>'+
    '<div class="muted">Revision: <code>'+esc(item.exactRevision)+'</code></div>'+
    (item.reviewScopeHash?'<div class="muted">Review scope: <code>'+esc(item.reviewScopeHash)+'</code></div>':'')+
    (item.scopeHash?'<div class="muted">Scope: <code>'+esc(item.scopeHash)+'</code></div>':'')+
    '<div class="muted">Requested '+esc(new Date(item.requestedAt).toLocaleString())+'</div>'+
  '</div>';
}
async function load(){
  try{
    const response=await fetch('/api/modules/fh-kuika/approvals',{cache:'no-store'});
    const data=await response.json();
    if(!response.ok) throw new Error(data.message||data.error||response.statusText);
    document.querySelector('#status').textContent='Read-only inbox · decisions require control-plane authority';
    document.querySelector('#counts').innerHTML=
      '<div class="card"><div class="muted">Pending</div><strong>'+data.counts.pending+'</strong></div>'+
      '<div class="card"><div class="muted">Stale</div><strong>'+data.counts.stale+'</strong></div>'+
      '<div class="card"><div class="muted">Resolved</div><strong>'+data.counts.resolved+'</strong></div>';
    document.querySelector('#pending').innerHTML=data.pending.length?data.pending.map(itemHtml).join(''):'<div class="muted">No current approvals.</div>';
    document.querySelector('#stale').innerHTML=data.stale.length?data.stale.map(itemHtml).join(''):'<div class="muted">No stale approvals.</div>';
  }catch(error){ document.querySelector('#status').textContent='Approval state unavailable: '+error.message; }
}
void load();
</script>
</body>
</html>`;
