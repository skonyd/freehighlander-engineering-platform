export const FH_KUIKA_WORKFLOW_STUDIO_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA Workflow Studio</title>
  <style>
    :root {
      color-scheme:dark;
      --bg:#0b0f14; --panel:#121821; --panel2:#171f2a; --line:#263241;
      --text:#e8eef6; --muted:#93a4b8; --accent:#7dd3fc; --warn:#fde68a;
    }
    *{box-sizing:border-box}
    body{margin:0;background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    header,main{max-width:1320px;margin:auto;padding:24px}
    header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
    h1{margin:0;font-size:25px} h2{margin:0 0 10px;font-size:15px}
    a{color:var(--accent);text-decoration:none} a:hover,a:focus-visible{text-decoration:underline}
    .eyebrow{color:var(--accent);text-transform:uppercase;font-size:11px;letter-spacing:.14em;font-weight:700}
    .muted{color:var(--muted)}
    .layout{display:grid;grid-template-columns:210px minmax(0,1fr) 300px;gap:14px}
    .card{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:12px;padding:14px}
    .palette{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    button{background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 9px;cursor:pointer}
    button:hover,button:focus-visible{border-color:var(--accent);outline:none}
    .canvas{min-height:520px;display:flex;flex-direction:column;gap:10px}
    .canvas-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
    .node-list{display:grid;gap:9px}
    .node{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#0d131b;display:flex;justify-content:space-between;gap:10px;align-items:center;cursor:pointer}
    .node[selected]{border-color:var(--accent)}
    .node-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
    .pill{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-size:10px}
    .inspector-row{border-top:1px solid var(--line);padding:8px 0}
    .inspector-row:first-child{border-top:0}
    .inspector-row span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}
    .inspector-row strong,.inspector-row code{display:block;margin-top:3px;overflow-wrap:anywhere}
    .boundary{margin-top:14px;color:var(--muted);border:1px solid var(--line);border-radius:9px;padding:10px}
    .toolbar{display:flex;gap:8px;flex-wrap:wrap}
    .empty{color:var(--muted);padding:50px 10px;text-align:center}
    @media(max-width:980px){.layout{grid-template-columns:1fr}.palette{grid-template-columns:repeat(5,minmax(0,1fr))}}
    @media(max-width:650px){.palette{grid-template-columns:repeat(2,minmax(0,1fr))}header{flex-direction:column}}
  </style>
</head>
<body>
<header>
  <div>
    <div class="eyebrow">FH-KUIKA · Build</div>
    <h1>Workflow Studio</h1>
    <div class="muted">Local draft canvas · no publish · no execution</div>
  </div>
  <div><a href="/modules/fh-kuika/build">← Build</a> · <a href="/modules/fh-kuika">Overview</a></div>
</header>
<main>
  <section class="layout">
    <aside class="card">
      <h2>Node palette</h2>
      <div id="palette" class="palette"></div>
      <div class="boundary">Adding a node changes browser-local draft state only.</div>
    </aside>

    <section class="card canvas">
      <div class="canvas-head">
        <div>
          <h2>Canvas</h2>
          <div id="draft-status" class="muted">Draft has 0 nodes.</div>
        </div>
        <div class="toolbar">
          <button type="button" id="validate">Validate</button>
          <button type="button" id="simulate">Simulate</button>
          <button type="button" id="review-diff">Review diff</button>
          <button type="button" id="reset">Reset</button>
          <span class="pill">AUTHORITY NONE</span>
        </div>
      </div>
      <div id="nodes" class="node-list"><div class="empty">Choose a node type from the palette.</div></div>
      <div>
        <h2>Validation / Simulation</h2>
        <pre id="validation-output" class="boundary">No validation performed yet.</pre>
      </div>
    </section>

    <aside class="card">
      <h2>Inspector</h2>
      <div id="inspector" class="muted">Select a node.</div>
      <div class="boundary">
        Publish and Execute are intentionally unavailable. Canonical validation remains owned by Core.
      </div>
    </aside>
  </section>
</main>
<script>
const kinds=['MODEL','COMMAND','GATE','CONDITION','PARALLEL','AGGREGATE','DEBATE','LOOP','HUMAN','SUBWORKFLOW'];
let nodes=[];
let selectedId=null;
const esc=value=>String(value??'—').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

async function api(path){
  const response=await fetch(path,{cache:'no-store'});
  const body=await response.json();
  if(!response.ok) throw new Error(body.message||body.error||response.statusText);
  return body;
}

function buildDefinition(){
  return {
    id:'workflow-studio-draft',
    version:'1.0.0',
    nodes:nodes.map(node=>({...node})),
    edges:nodes.slice(1).map((node,index)=>({from:nodes[index].id,to:node.id}))
  };
}

async function inspectDraft(mode){
  const output=document.querySelector('#validation-output');
  const labels={
    validate:'Validating canonical draft…',
    simulate:'Simulating deterministic draft…',
    diff:'Building non-authoritative version diff…'
  };
  output.textContent=labels[mode];
  try{
    const definition=encodeURIComponent(JSON.stringify(buildDefinition()));
    const suffix=mode==='simulate'?'simulate':mode==='diff'?'diff':'validate';
    const result=await api('/api/modules/fh-kuika/workflows/'+suffix+'?definition='+definition);
    output.textContent=JSON.stringify(result,null,2);
  }catch(error){
    output.textContent='Inspection failed: '+error.message;
  }
}

function nextId(kind){
  const prefix=kind.toLowerCase().replaceAll('_','-');
  let index=1;
  while(nodes.some(node=>node.id===prefix+'-'+index)) index+=1;
  return prefix+'-'+index;
}

function addNode(kind){
  const node={id:nextId(kind),kind};
  if(kind==='LOOP') node.maxIterations=1;
  nodes=[...nodes,node];
  selectedId=node.id;
  render();
}

function render(){
  document.querySelector('#draft-status').textContent='Draft has '+nodes.length+' node'+(nodes.length===1?'':'s')+'.';
  const target=document.querySelector('#nodes');
  target.innerHTML=nodes.length
    ? nodes.map(node=>
        '<div class="node" tabindex="0" data-id="'+esc(node.id)+'"'+(node.id===selectedId?' selected':'')+'>'+
          '<div><strong>'+esc(node.kind)+'</strong><div class="node-id">'+esc(node.id)+'</div></div>'+
          '<span class="pill">DRAFT</span>'+
        '</div>'
      ).join('')
    : '<div class="empty">Choose a node type from the palette.</div>';

  target.querySelectorAll('[data-id]').forEach(element=>{
    const select=()=>{selectedId=element.dataset.id;render();};
    element.addEventListener('click',select);
    element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}});
  });
  renderInspector();
}

function renderInspector(){
  const node=nodes.find(item=>item.id===selectedId);
  const target=document.querySelector('#inspector');
  if(!node){target.innerHTML='<div class="muted">Select a node.</div>';return;}
  target.innerHTML=
    '<div class="inspector-row"><span>ID</span><code>'+esc(node.id)+'</code></div>'+
    '<div class="inspector-row"><span>Kind</span><strong>'+esc(node.kind)+'</strong></div>'+
    '<div class="inspector-row"><span>Authority</span><strong>NONE</strong></div>'+
    (node.kind==='LOOP'
      ? '<div class="inspector-row"><span>Max iterations</span><strong>'+esc(node.maxIterations)+'</strong></div>'
      : '')+
    '<div class="inspector-row"><span>Runtime effect</span><strong>NONE</strong></div>';
}

document.querySelector('#palette').innerHTML=kinds.map(kind=>
  '<button type="button" data-kind="'+kind+'">'+kind+'</button>'
).join('');
document.querySelectorAll('[data-kind]').forEach(button=>
  button.addEventListener('click',()=>addNode(button.dataset.kind))
);
document.querySelector('#validate').addEventListener('click',()=>void inspectDraft('validate'));
document.querySelector('#simulate').addEventListener('click',()=>void inspectDraft('simulate'));
document.querySelector('#review-diff').addEventListener('click',()=>void inspectDraft('diff'));
document.querySelector('#reset').addEventListener('click',()=>{
  nodes=[];
  selectedId=null;
  document.querySelector('#validation-output').textContent='No validation performed yet.';
  render();
});
render();
</script>
</body>
</html>`;
