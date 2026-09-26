export const FH_KUIKA_CONNECTOR_HUB_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>FreeHighlander · FH-KUIKA Connector Hub</title>
<style>
:root{color-scheme:dark;--bg:#0b0f14;--panel:#121821;--line:#263241;--text:#e8eef6;--muted:#93a4b8;--accent:#7dd3fc;--warn:#fde68a}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui}
header,main{max-width:1180px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
h1{margin:0;font-size:25px}h2{margin:0 0 8px;font-size:16px}a{color:var(--accent);text-decoration:none}.muted{color:var(--muted)}
.eyebrow{color:var(--accent);text-transform:uppercase;font-size:11px;letter-spacing:.14em;font-weight:700}
.layout{display:grid;grid-template-columns:minmax(0,.75fr) minmax(0,1.25fr);gap:14px}.card{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:12px;padding:16px}
.list button{width:100%;text-align:left;background:transparent;color:var(--text);border:0;border-top:1px solid var(--line);padding:11px 0;cursor:pointer}.list button:first-child{border-top:0}
.badge{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-size:10px;margin-right:6px}.warn{color:var(--warn)}
.meta{display:grid;grid-template-columns:150px minmax(0,1fr);gap:6px 12px;margin-top:12px}.meta span:nth-child(odd){color:var(--muted)}
pre{white-space:pre-wrap;word-break:break-word;background:#090d12;border:1px solid var(--line);border-radius:9px;padding:12px;max-height:360px;overflow:auto}
@media(max-width:820px){.layout{grid-template-columns:1fr}header{flex-direction:column}.meta{grid-template-columns:1fr}}
</style>
</head>
<body>
<header><div><div class="eyebrow">FH-KUIKA · Integrate</div><h1>Connector Hub</h1><div id="status" class="muted">Loading connector catalog…</div></div><div><a href="/modules/fh-kuika/integrate">← Integrate</a> · <a href="/">Core Home</a></div></header>
<main><section class="layout"><div class="card"><h2>Connectors</h2><div id="list" class="list"></div></div><div class="card"><h2>Install / permission review</h2><div id="detail" class="muted">Select a connector.</div></div></section></main>
<script>
const esc=v=>String(v??'—').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function api(path){const r=await fetch(path,{cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.message||b.error||r.statusText);return b}
async function load(){try{const body=await api('/api/modules/fh-kuika/connectors');const items=body.connectors||[];document.querySelector('#status').textContent=items.length+' connectors · inspection only';document.querySelector('#list').innerHTML=items.map(i=>'<button data-id="'+esc(i.id)+'"><strong>'+esc(i.name)+'</strong><div class="muted">'+esc(i.protocol)+' · '+esc(i.trustLevel)+'</div></button>').join('');document.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>void detail(b.dataset.id)));if(items[0])void detail(items[0].id)}catch(e){document.querySelector('#status').textContent='Connector catalog unavailable: '+e.message}}
async function detail(id){const t=document.querySelector('#detail');t.textContent='Loading review…';try{const body=await api('/api/modules/fh-kuika/connectors/'+encodeURIComponent(id)+'/review');const r=body.review;t.innerHTML='<div><span class="badge">'+esc(r.trustLevel)+'</span><span class="badge">'+esc(r.protocol)+'</span></div><div class="meta"><span>Source</span><code>'+esc(r.source)+'</code><span>Version</span><strong>'+esc(r.version)+'</strong><span>Capabilities</span><strong>'+esc(r.requestedCapabilityCount)+'</strong><span>Mutation</span><strong>'+esc(r.mutationCapable)+'</strong><span>Filesystem</span><strong>'+esc(r.filesystemScopes.join(', ')||'none')+'</strong><span>Network</span><strong>'+esc(r.networkDestinations.join(', ')||'none')+'</strong><span>Secret handles</span><strong>'+esc(r.secretHandleRefs.join(', ')||'none')+'</strong><span>Install authority</span><strong>'+esc(r.installAuthority)+'</strong></div><div class="muted" style="margin-top:14px">Warnings</div><pre>'+esc(JSON.stringify(r.warnings,null,2))+'</pre><div class="warn">Activation is not available from this surface.</div>'}catch(e){t.textContent='Review unavailable: '+e.message}}
void load();
</script>
</body>
</html>`;

export function connectorHubPageCanInvokeModel(): false {
  return false;
}

export function connectorHubPageCanGrantAuthority(): false {
  return false;
}

export function connectorHubPageCanActivate(): false {
  return false;
}
