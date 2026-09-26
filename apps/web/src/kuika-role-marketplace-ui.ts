export const FH_KUIKA_ROLE_MARKETPLACE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>FreeHighlander · FH-KUIKA Roles & Solution Packs</title>
<style>
:root{color-scheme:dark;--bg:#0b0f14;--panel:#121821;--line:#263241;--text:#e8eef6;--muted:#93a4b8;--accent:#7dd3fc;--good:#86efac;--warn:#fde68a}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui}
header,main{max-width:1180px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
h1{margin:0;font-size:25px}h2{margin:0 0 8px;font-size:16px}a{color:var(--accent);text-decoration:none}.muted{color:var(--muted)}
.eyebrow{color:var(--accent);text-transform:uppercase;font-size:11px;letter-spacing:.14em;font-weight:700}
.tabs{display:flex;gap:8px;margin-bottom:14px}.tabs button{background:#171f2a;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 11px;cursor:pointer}
.tabs button[aria-selected="true"]{border-color:var(--accent);color:var(--accent)}
.layout{display:grid;grid-template-columns:minmax(0,.78fr) minmax(0,1.22fr);gap:14px}.card{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:12px;padding:16px}
.list button{display:block;width:100%;text-align:left;background:transparent;color:var(--text);border:0;border-top:1px solid var(--line);padding:11px 0;cursor:pointer}.list button:first-child{border-top:0}
.badge{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-size:10px;margin-right:6px}.good{color:var(--good)}.warn{color:var(--warn)}
.meta{display:grid;grid-template-columns:150px minmax(0,1fr);gap:6px 12px;margin-top:12px}.meta span:nth-child(odd){color:var(--muted)}code{overflow-wrap:anywhere}
pre{white-space:pre-wrap;word-break:break-word;background:#090d12;border:1px solid var(--line);border-radius:9px;padding:12px;max-height:300px;overflow:auto}
@media(max-width:820px){.layout{grid-template-columns:1fr}header{flex-direction:column}.meta{grid-template-columns:1fr}}
</style>
</head>
<body>
<header><div><div class="eyebrow">FH-KUIKA · Build</div><h1>Roles & Solution Packs</h1><div id="status" class="muted">Loading pinned marketplace metadata…</div></div><div><a href="/modules/fh-kuika/build">← Build</a> · <a href="/">Core Home</a></div></header>
<main>
<div class="tabs" role="tablist"><button id="roles-tab" aria-selected="true">Roles</button><button id="packs-tab" aria-selected="false">Solution Packs</button></div>
<section class="layout"><div class="card"><h2 id="list-title">Role Marketplace</h2><div id="list" class="list"></div></div><div class="card"><h2>Detail / Install plan</h2><div id="detail" class="muted">Select an item.</div></div></section>
</main>
<script>
const esc=v=>String(v??'—').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function api(path){const r=await fetch(path,{cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.message||b.error||r.statusText);return b}
let mode='roles',roles=[],packs=[];
function renderList(){const items=mode==='roles'?roles:packs;document.querySelector('#list-title').textContent=mode==='roles'?'Role Marketplace':'Solution Packs';document.querySelector('#list').innerHTML=items.map(i=>'<button data-id="'+esc(i.id)+'"><strong>'+esc(i.id)+'</strong><div class="muted">'+esc(i.purpose)+'</div><span class="badge">v'+esc(i.version)+'</span></button>').join('');document.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>void detail(b.dataset.id)));if(items[0])void detail(items[0].id)}
async function detail(id){const t=document.querySelector('#detail');t.textContent='Loading…';try{if(mode==='roles'){const b=await api('/api/modules/fh-kuika/roles/'+encodeURIComponent(id));const r=b.role;t.innerHTML='<div><span class="badge">'+esc(r.authority.join(', '))+'</span></div><div class="meta"><span>Purpose</span><strong>'+esc(r.purpose)+'</strong><span>Risk</span><strong>'+esc(r.allowedRiskTiers.join(', '))+'</strong><span>Allowed actions</span><strong>'+esc(r.allowedActions.join(', '))+'</strong><span>Forbidden actions</span><strong>'+esc(r.forbiddenActions.join(', '))+'</strong><span>Sandbox</span><code>'+esc(r.sandboxPolicy)+'</code><span>Provenance</span><code>'+esc(r.provenance.digest.slice(0,18))+'…</code><span>Install authority</span><strong>'+esc(r.installAuthority)+'</strong></div><div class="warn" style="margin-top:14px">Marketplace metadata cannot register or activate this role.</div>'}else{const b=await api('/api/modules/fh-kuika/solution-packs/'+encodeURIComponent(id)+'/plan');const p=b.pack,plan=b.plan;t.innerHTML='<div class="meta"><span>Purpose</span><strong>'+esc(p.purpose)+'</strong><span>Roles</span><strong>'+esc(p.roleRefs.join(', '))+'</strong><span>Blueprints</span><strong>'+esc(p.blueprintRefs.join(', '))+'</strong><span>Connectors</span><strong>'+esc(p.connectorRefs.join(', ')||'none')+'</strong><span>Core review ready</span><strong>'+esc(plan.readyForCoreReview)+'</strong><span>Install authority</span><strong>'+esc(plan.installAuthority)+'</strong></div><div class="muted" style="margin-top:12px">Install planner</div><pre>'+esc(JSON.stringify(plan,null,2))+'</pre><div class="warn">Activation is not available from this surface.</div>'}}catch(e){t.textContent='Detail unavailable: '+e.message}}
function select(next){mode=next;document.querySelector('#roles-tab').setAttribute('aria-selected',String(next==='roles'));document.querySelector('#packs-tab').setAttribute('aria-selected',String(next==='packs'));renderList()}
document.querySelector('#roles-tab').addEventListener('click',()=>select('roles'));document.querySelector('#packs-tab').addEventListener('click',()=>select('packs'));
async function load(){try{const [r,p]=await Promise.all([api('/api/modules/fh-kuika/roles'),api('/api/modules/fh-kuika/solution-packs')]);roles=r.roles||[];packs=p.packs||[];document.querySelector('#status').textContent=roles.length+' roles · '+packs.length+' solution packs · authority NONE';renderList()}catch(e){document.querySelector('#status').textContent='Marketplace unavailable: '+e.message}}
void load();
</script>
</body>
</html>`;

export function roleMarketplacePageCanInvokeModel(): false {
  return false;
}

export function roleMarketplacePageCanGrantAuthority(): false {
  return false;
}

export function roleMarketplacePageCanInstall(): false {
  return false;
}
