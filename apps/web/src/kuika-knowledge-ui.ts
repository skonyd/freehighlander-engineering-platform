export const FH_KUIKA_KNOWLEDGE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>FreeHighlander · FH-KUIKA Knowledge</title>
<style>
:root{color-scheme:dark;--bg:#0b0f14;--panel:#121821;--panel2:#171f2a;--line:#263241;--text:#e8eef6;--muted:#93a4b8;--accent:#7dd3fc;--good:#86efac;--warn:#fde68a}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui}
header,main{max-width:1180px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
h1{margin:0;font-size:25px}h2{margin:0 0 10px;font-size:16px}a{color:var(--accent);text-decoration:none}.muted{color:var(--muted)}
.eyebrow{color:var(--accent);text-transform:uppercase;font-size:11px;letter-spacing:.14em;font-weight:700}
.card{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:12px;padding:16px}
.search{display:grid;grid-template-columns:minmax(0,1fr) 180px auto;gap:10px;margin-bottom:14px}
input,select,button{background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:9px 10px}
button{cursor:pointer}button:hover{border-color:var(--accent)}.tabs{display:flex;gap:8px;margin:14px 0}.tabs button[aria-selected="true"]{border-color:var(--accent);color:var(--accent)}
.result{padding:12px 0;border-top:1px solid var(--line)}.result:first-child{border-top:0}.badge{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-size:10px;margin-right:6px}
.authoritative{color:var(--good)}.discovery{color:var(--warn)}.meta{display:grid;grid-template-columns:130px minmax(0,1fr);gap:5px 10px;margin-top:8px;font-size:12px}.meta span:nth-child(odd){color:var(--muted)}
pre{white-space:pre-wrap;word-break:break-word;background:#090d12;border:1px solid var(--line);border-radius:9px;padding:12px;max-height:340px;overflow:auto}
@media(max-width:760px){header{flex-direction:column}.search{grid-template-columns:1fr}.meta{grid-template-columns:1fr}}
</style>
</head>
<body>
<header><div><div class="eyebrow">FH-KUIKA · Knowledge</div><h1>Engineering Knowledge</h1><div id="status" class="muted">Lineage-first · deterministic · authority NONE</div></div><div><a href="/modules/fh-kuika">← Module</a> · <a href="/">Core Home</a></div></header>
<main>
<section class="card">
  <div class="search">
    <input id="query" placeholder="Artifact ID or engineering query" aria-label="Knowledge query"/>
    <select id="mode" aria-label="Query mode">
      <option value="HYBRID">Hybrid</option>
      <option value="EXACT_ENTITY">Exact entity</option>
      <option value="EXACT_REVISION">Exact revision</option>
    </select>
    <button id="search" type="button">Search</button>
  </div>
  <div class="tabs" role="tablist"><button data-tab="results" aria-selected="true">Search</button><button data-tab="graph" aria-selected="false">Graph</button><button data-tab="evidence" aria-selected="false">Evidence</button></div>
  <div id="content" class="muted">Search uses recorded engineering state only. Semantic discovery is off by default.</div>
</section>
</main>
<script>
const esc=v=>String(v??'—').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let last=null,tab='results';
async function api(path){const r=await fetch(path,{cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.message||b.error||r.statusText);return b}
function render(){const t=document.querySelector('#content');if(!last){t.textContent='Search uses recorded engineering state only. Semantic discovery is off by default.';return}
if(tab==='graph'){const edges=last.results.filter(x=>x.relationType);t.innerHTML=edges.length?edges.map(x=>'<div class="result"><span class="badge authoritative">AUTHORITATIVE</span><strong>'+esc(x.label)+'</strong><div class="muted">'+esc(x.relationType)+'</div></div>').join(''):'<div class="muted">No recorded authoritative lineage relations for this query. FreeHighlander will not invent graph edges.</div>';return}
if(tab==='evidence'){const items=last.results.filter(x=>x.provenance.sourceKind==='EVIDENCE'||(x.provenance.evidenceIds||[]).length);t.innerHTML=items.length?items.map(renderResult).join(''):'<div class="muted">No evidence-bound results for this query.</div>';return}
t.innerHTML=last.results.length?last.results.map(renderResult).join(''):'<div class="muted">No deterministic result found.</div>'}
function renderResult(x){const cls=x.resultClass==='AUTHORITATIVE'?'authoritative':'discovery';const rev=x.provenance.revision?x.provenance.revision.repository+'@'+x.provenance.revision.sha.slice(0,12):'—';return '<div class="result"><span class="badge '+cls+'">'+esc(x.resultClass)+'</span><strong>'+esc(x.label)+'</strong><div class="meta"><span>Source</span><code>'+esc(x.provenance.sourceKind)+' · '+esc(x.provenance.sourceId)+'</code><span>Revision</span><code>'+esc(rev)+'</code><span>Evidence</span><code>'+esc((x.provenance.evidenceIds||[]).join(', ')||'—')+'</code><span>Authority</span><strong>'+esc(x.authority)+'</strong></div></div>'}
async function search(){const q=document.querySelector('#query').value.trim();const mode=document.querySelector('#mode').value;if(!q){document.querySelector('#content').textContent='Enter an artifact ID or query.';return}const p=new URLSearchParams({text:q,mode});if(mode==='EXACT_ENTITY')p.set('entityId',q);if(mode==='EXACT_REVISION'){const at=q.lastIndexOf('@');if(at<1){document.querySelector('#content').textContent='Exact revision format: repository@40-or-64-char-sha';return}p.set('repository',q.slice(0,at));p.set('sha',q.slice(at+1))}
document.querySelector('#status').textContent='Searching deterministic knowledge sources…';try{last=await api('/api/modules/fh-kuika/knowledge/query?'+p.toString());document.querySelector('#status').textContent=last.results.length+' results · model calls 0 · authority NONE';render()}catch(e){document.querySelector('#status').textContent='Knowledge query failed';document.querySelector('#content').textContent=e.message}}
document.querySelector('#search').addEventListener('click',()=>void search());document.querySelector('#query').addEventListener('keydown',e=>{if(e.key==='Enter')void search()});document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));render()}));
</script>
</body>
</html>`;

export function knowledgePageCanInvokeModel(): false { return false; }
export function knowledgePageCanGrantAuthority(): false { return false; }
export function knowledgePageCanMutateDomain(): false { return false; }
