export const FH_KUIKA_KNOWLEDGE_EXPLORER_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA Knowledge Explorer</title>
  <style>
    :root{color-scheme:dark;--bg:#0b0f14;--panel:#121821;--panel2:#171f2a;--line:#263241;--text:#e8eef6;--muted:#93a4b8;--accent:#7dd3fc;--good:#86efac;--warn:#fde68a}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    header,main{max-width:1180px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
    h1{margin:0;font-size:25px}h2{margin:0 0 12px;font-size:16px}a{color:var(--accent);text-decoration:none}.muted{color:var(--muted)}
    .eyebrow{color:var(--accent);text-transform:uppercase;font-size:11px;letter-spacing:.14em;font-weight:700}
    .card{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:12px;padding:16px}
    .query{display:grid;grid-template-columns:minmax(0,1fr) 180px auto;gap:8px}input,select,button{background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:9px 10px}
    button{cursor:pointer}button:hover,button:focus-visible,input:focus-visible,select:focus-visible{border-color:var(--accent);outline:none}
    .layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:14px;margin-top:14px}.results{display:grid;gap:9px}
    .result{border:1px solid var(--line);border-radius:9px;padding:11px;background:#0e141c}.row{display:flex;justify-content:space-between;gap:10px;align-items:center}
    .pill{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-size:11px}.authoritative{color:var(--good)}.discovery{color:var(--warn)}
    details{margin-top:8px}.provenance{display:grid;grid-template-columns:120px minmax(0,1fr);gap:5px 8px;margin-top:8px}.provenance>span:nth-child(odd){color:var(--muted)}
    code{color:#c4d7ec;font-size:12px;overflow-wrap:anywhere}.trace{display:grid;gap:7px}.trace-item{border-left:2px solid var(--line);padding-left:9px}.empty{color:var(--muted);padding:24px 0;text-align:center}
    .boundary{margin-top:14px;color:var(--muted);border:1px solid var(--line);border-radius:9px;padding:10px}
    @media(max-width:820px){.layout{grid-template-columns:1fr}.query{grid-template-columns:1fr}header{flex-direction:column}}
  </style>
</head>
<body>
<header>
  <div><div class="eyebrow">FH-KUIKA · Knowledge</div><h1>Knowledge Explorer</h1><div class="muted">Lineage first · semantic discovery remains non-authoritative</div></div>
  <div><a href="/modules/fh-kuika/knowledge">← Knowledge</a> · <a href="/modules/fh-kuika">Overview</a></div>
</header>
<main>
  <section class="card">
    <form id="query-form" class="query">
      <input id="query-text" maxlength="2000" required placeholder="Search engineering knowledge…" aria-label="Knowledge query" />
      <select id="query-mode" aria-label="Query mode">
        <option value="HYBRID">Hybrid</option>
        <option value="EXACT_ENTITY">Exact entity</option>
        <option value="LINEAGE_TRAVERSAL">Lineage traversal</option>
        <option value="EVIDENCE_LOOKUP">Evidence lookup</option>
      </select>
      <button type="submit">Explore</button>
    </form>
    <div class="boundary">Inspection invokes no model and grants no authority. Semantic results are always labeled DISCOVERY.</div>
  </section>
  <section class="layout">
    <div class="card"><h2>Results</h2><div id="results" class="empty">Enter a query.</div></div>
    <aside class="card"><h2>Retrieval trace</h2><div id="trace" class="muted">No query yet.</div></aside>
  </section>
</main>
<script>
const esc=value=>String(value??'—').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function api(path){const response=await fetch(path,{cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.message||body.error||response.statusText);return body;}
function render(payload){
  const target=document.querySelector('#results');
  const trace=document.querySelector('#trace');
  if(!payload.sourceAvailable){
    target.innerHTML='<div class="empty">Authoritative lineage/evidence source is not configured for this web process.</div>';
  }else if(!payload.retrieval.results.length){
    target.innerHTML='<div class="empty">No deterministic results.</div>';
  }else{
    target.innerHTML='<div class="results">'+payload.retrieval.results.map(item=>{
      const p=item.provenance;
      return '<article class="result"><div class="row"><strong>'+esc(item.label)+'</strong><span class="pill '+(item.resultClass==='AUTHORITATIVE'?'authoritative':'discovery')+'">'+esc(item.resultClass)+'</span></div>'+
        (item.relationType?'<div class="muted">Relation · '+esc(item.relationType)+'</div>':'')+
        '<details><summary>Provenance</summary><div class="provenance">'+
        '<span>Source</span><code>'+esc(p.sourceKind)+' · '+esc(p.sourceId)+'</code>'+
        '<span>Revision</span><code>'+esc(p.revision?p.revision.repository+'@'+p.revision.sha:'—')+'</code>'+
        '<span>Digest</span><code>'+esc(p.sourceDigest||'—')+'</code>'+
        '<span>Evidence</span><span>'+esc((p.evidenceIds||[]).join(', ')||'—')+'</span>'+
        (item.semanticScore===undefined?'':'<span>Discovery score</span><strong>'+esc(item.semanticScore.toFixed(3))+'</strong>')+
        '</div></details></article>';
    }).join('')+'</div>';
  }
  const stages=payload.retrieval?.trace||payload.plan.orderedStages.map(stage=>({stage,executed:false,resultCount:0}));
  trace.innerHTML='<div class="trace">'+stages.map(item=>'<div class="trace-item"><strong>'+esc(item.stage)+'</strong><div class="muted">executed '+esc(item.executed)+' · '+esc(item.resultCount)+' results</div></div>').join('')+'</div>'+
    '<div class="boundary">Semantic discovery authority: FORBIDDEN</div>';
}
document.querySelector('#query-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const text=document.querySelector('#query-text').value.trim();
  const mode=document.querySelector('#query-mode').value;
  const target=document.querySelector('#results');target.innerHTML='<div class="empty">Retrieving…</div>';
  try{
    const params=new URLSearchParams({text,mode});
    if(mode==='EXACT_ENTITY'||mode==='LINEAGE_TRAVERSAL') params.set('entityId',text);
    render(await api('/api/modules/fh-kuika/knowledge/query?'+params.toString()));
  }catch(error){target.innerHTML='<div class="empty">'+esc(error.message)+'</div>';}
});
</script>
</body>
</html>`;

export function knowledgeExplorerPageCanInvokeModel(): false {
  return false;
}

export function knowledgeExplorerPageCanGrantAuthority(): false {
  return false;
}

export function knowledgeExplorerPageCanMutateRuntime(): false {
  return false;
}
