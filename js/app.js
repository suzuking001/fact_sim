// App wiring: script editor UI, graph init, examples, save/load, controls

// Script editor UI
const scriptEditorTextarea = document.getElementById('scriptEditorTextarea');
document.getElementById('scriptEditorSave').onclick = ()=>{
  const n = window.editingNode;
  if(n){ n.properties.script = scriptEditorTextarea.value; n._compiled = null; n.setDirtyCanvas(true,true); }
  document.getElementById('scriptEditorModal').style.display = 'none';
  window.editingNode = null;
};
document.getElementById('scriptEditorCancel').onclick = ()=>{
  document.getElementById('scriptEditorModal').style.display = 'none';
  window.editingNode = null;
};

// Graph init
let graph, canvas;

function configureGraphClock(g){
  if(!g) return;
  const dt = (typeof window.getSimDtSec === 'function') ? window.getSimDtSec() : 0.1;
  g.fixedtime_lapse = dt;
  g.fixedtime = 0;
  g.globaltime = 0;
  g.elapsed_time = 0;
  g.iteration = 0;
  g.status = LGraph.STATUS_STOPPED;
}

function startSimulation(){
  if(!graph) return;
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()) return;
  graph.status = LGraph.STATUS_RUNNING;
  graph.starttime = LiteGraph.getTime();
  graph.last_update_time = graph.starttime;
  graph.sendEventToAllNodes("onStart");
  window.startSimLoop(()=> graph.runStep(1, !graph.catch_errors));
}

function stopSimulation(){
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()){
    window.stopSimLoop();
  }
  if(graph && graph.status !== LGraph.STATUS_STOPPED){
    graph.status = LGraph.STATUS_STOPPED;
    graph.sendEventToAllNodes("onStop");
  }
}

function initGraph(){
  if(graph) stopSimulation();
  workCounter = 0;
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  graph = new LGraph();
  configureGraphClock(graph);
  canvas = new LGraphCanvas(graphElement, graph);
  // expose for other helpers that hook into canvas
  window.canvas = canvas;
  if(typeof window.__attachTitleEditor === 'function') window.__attachTitleEditor(canvas);
  // Make the canvas background white (node area backdrop)
  canvas.bgcolor = "#ffffff";
  function resize(){
    const r = canvas.canvas.getBoundingClientRect(), d = window.devicePixelRatio||1;
    canvas.canvas.width = r.width*d; canvas.canvas.height = r.height*d;
    canvas.resize(r.width, r.height); canvas.draw(true);
  }
  window.addEventListener('resize', resize); resize();
  // Place initial nodes lower so they don't hide under menus
  const src = LiteGraph.createNode('factory/source'); src.pos=[60,180];
  const eq  = LiteGraph.createNode('factory/equip');  eq.pos=[360,180];
  graph.add(src); graph.add(eq); src.connect(0,eq,0);
}
initGraph();

// Examples
function makeExample(kind){
  if(!graph) return; stopSimulation(); graph.clear(); if(typeof window.resetSimClock === 'function') window.resetSimClock();
  if(kind==='simple'){
    const s=LiteGraph.createNode('factory/source'); s.pos=[60,200];
    const e1=LiteGraph.createNode('factory/equip'); e1.pos=[360,200]; e1.properties.processTime=1;
    const e2=LiteGraph.createNode('factory/equip'); e2.pos=[660,200]; e2.properties.processTime=1;
    const k=LiteGraph.createNode('factory/sink'); k.pos=[960,200];
    graph.add(s); graph.add(e1); graph.add(e2); graph.add(k);
    s.connect(0,e1,0); e1.connect(0,e2,0); e2.connect(0,k,0);
  }else if(kind==='branch'){
    const s=LiteGraph.createNode('factory/source'); s.pos=[60,240];
    const sp=LiteGraph.createNode('factory/split'); sp.pos=[360,240];
    const a=LiteGraph.createNode('factory/equip'); a.title='Line A'; a.pos=[660,160]; a.properties.processTime=1;
    const b=LiteGraph.createNode('factory/equip'); b.title='Line B'; b.pos=[660,320]; b.properties.processTime=2;
    const k=LiteGraph.createNode('factory/sink'); k.pos=[960,240];
    graph.add(s); graph.add(sp); graph.add(a); graph.add(b); graph.add(k);
    s.connect(0,sp,0); sp.connect(0,a,0); sp.connect(1,b,0); a.connect(0,k,0); b.connect(0,k,0);
  }
  // reset time display (no auto start)
  updateSimTime();
  try{ if(canvas && canvas.draw) canvas.draw(true,true); }catch(e){}
}

function applyExampleData(data){
  if(!graph) return;
  stopSimulation();
  graph.clear();
  graph.configure(data);
  configureGraphClock(graph);
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  updateSimTime();
  try{ if(canvas && canvas.draw) canvas.draw(true,true); }catch(e){}
}

function loadExampleFromFile(path){
  if(!graph) return;
  fetch(path)
    .then(r=>{ if(!r.ok) throw new Error(`Load failed: ${r.status}`); return r.json(); })
    .then(data=>{ applyExampleData(data); })
    .catch(err=>{ alert('JSON読込失敗'); console.error(err); });
}

document.getElementById('exampleSelect').addEventListener('change', e=>{
  const v = e.target.value; if(!v) return;
  if(v === 'sample_line1'){
    const data = window.EXAMPLES && window.EXAMPLES.sample_line1;
    if(data) applyExampleData(data);
    else loadExampleFromFile('sample/sample_line1.json');
    return;
  }
  makeExample(v);
});

// Default example: sample_line1
(function(){
  const sel = document.getElementById('exampleSelect');
  if(sel) sel.value = 'sample_line1';
  const data = window.EXAMPLES && window.EXAMPLES.sample_line1;
  if(data) applyExampleData(data);
  else loadExampleFromFile('sample/sample_line1.json');
})();


// Save / Load
document.getElementById('btnSave').onclick = ()=>{
  const blob = new Blob([JSON.stringify(graph.serialize(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'graph.json'; a.click();
  URL.revokeObjectURL(url);
};

document.getElementById('btnLoad').onclick = ()=> document.getElementById('fileInput').click();
document.getElementById('fileInput').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => { try{ graph.clear(); graph.configure(JSON.parse(r.result)); } catch(err){ alert('JSON読込失敗'); console.error(err); } };
  r.readAsText(f);
});

// Controls
document.getElementById('btnStart').onclick = ()=>{
  startSimulation();
};
document.getElementById('btnStop').onclick = ()=>{
  stopSimulation();
};
document.getElementById('btnReset').onclick = ()=>{
  stopSimulation();
  initGraph();
};

// About / Licenses modal wiring
(function(){
  const m = document.getElementById('aboutModal');
  const openBtn = document.getElementById('btnAbout');
  const closeBtn = document.getElementById('aboutClose');
  if(!m || !openBtn || !closeBtn) return;
  const open = ()=>{ m.style.display = 'block'; };
  const close = ()=>{ m.style.display = 'none'; };
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  m.addEventListener('click', (e)=>{ if(e.target === m) close(); });
  window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });
})();

// Sidebar toggle (hamburger)
(function(){
  const btn = document.getElementById('menuToggle');
  const body = document.body;
  if(!btn) return;
  // initial state from localStorage
  try{
    const saved = localStorage.getItem('sidebar-hidden');
    if(saved === '1') body.classList.add('sidebar-hidden');
  }catch(e){}
  const updateAria = () => {
    const hidden = body.classList.contains('sidebar-hidden');
    btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    btn.title = hidden ? 'Open menu' : 'Close menu';
  };
  updateAria();
  btn.addEventListener('click',()=>{
    body.classList.toggle('sidebar-hidden');
    try{ localStorage.setItem('sidebar-hidden', body.classList.contains('sidebar-hidden') ? '1' : '0'); }catch(e){}
    updateAria();
    try{ if(canvas && canvas.draw) canvas.draw(true,true); }catch(e){}
  });
})();

// Inline node title editor (double-click node to rename)
(function(){
  const input = document.getElementById('nodeTitleEditor');
  if(!input) return;
  let editingNode = null;
  function hide(){ editingNode=null; input.style.display='none'; input.onblur=null; input.onkeydown=null; }
  function commit(){ if(!editingNode) return hide(); const v=input.value.trim(); if(v){ editingNode.title=v; editingNode.setDirtyCanvas(true,true);} hide(); }
  function openAt(evt, node){
    editingNode = node;
    input.value = node.title || '';
    const e = evt || {}; const x = (e.clientX ?? 0) + 6; const y = (e.clientY ?? 0) + 6;
    input.style.left = x + 'px'; input.style.top = y + 'px';
    input.style.display = 'block';
    input.focus(); input.select();
    input.onblur = commit;
    input.onkeydown = (ke)=>{ if(ke.key==='Enter') commit(); else if(ke.key==='Escape') hide(); };
  }
  function install(c){
    if(!c || c.__titleEditHooked) return;
    const handler = (e)=>{
      if(e.button !== 0) return;
      if(e.type === 'mousedown' && e.detail !== 2) return;
      try{
        const p = c.convertEventToCanvas(e);
        const node = c.getNodeOnPos(p[0], p[1]);
        if(!node) return;
        if(e.stopPropagation) e.stopPropagation();
        if(e.preventDefault) e.preventDefault();
        openAt(e, node);
      }catch(_err){}
    };
    const targets = [c.canvas, c.bgcanvas, c.top_canvas].filter(Boolean);
    targets.forEach(t=>{
      t.addEventListener('mousedown', handler, true);
      t.addEventListener('dblclick', handler, true);
    });
    c.__titleEditHooked = true;
  }
  window.__attachTitleEditor = install;
  if(window.canvas) install(window.canvas);
})();

// (Removed) Property inspector panel and hooks

// Add Node (from sidebar select + button)
(function(){
  const sel = document.getElementById('nodeKindSelect');
  const btn = document.getElementById('btnAddNode');
  const propsWrap = document.getElementById('addNodeProps');
  if(!sel || !btn || !propsWrap) return;
  const NODE_SCHEMAS = {
    equip:{
      type:'factory/equip',
      props:[
        { key:'title', label:'Title', type:'text', default:'Equipment', target:'title' },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 }
      ]
    },
    merge2:{
      type:'factory/merge2',
      props:[
        { key:'title', label:'Title', type:'text', default:'Merge2', target:'title' },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 }
      ]
    },
    source:{
      type:'factory/source',
      props:[
        { key:'title', label:'Title', type:'text', default:'Source', target:'title' },
        { key:'sequence', label:'Sequence (comma separated)', type:'textarea', default:'A,B' }
      ]
    },
    sink:{
      type:'factory/sink',
      props:[
        { key:'title', label:'Title', type:'text', default:'Sink', target:'title' }
      ]
    },
    split:{
      type:'factory/split',
      props:[
        { key:'title', label:'Title', type:'text', default:'Split', target:'title' },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 },
        { key:'ratio', label:'Ratio (0-1)', type:'number', min:0, max:1, step:0.1, default:0.5 }
      ]
    },
    agvroute:{
      type:'factory/agvroute',
      props:[
        { key:'title', label:'Title', type:'text', default:'AGV Route', target:'title' },
        { key:'processTime', label:'Travel Time (s)', type:'number', min:0, step:0.1, default:3 },
        { key:'downTime', label:'Dispatch Delay (s)', type:'number', min:0, step:0.1, default:0.5 },
        { key:'agvCapacity', label:'AGV Capacity', type:'number', min:1, step:1, default:2 },
        { key:'agvIds', label:'Initial AGV IDs', type:'textarea', default:'AGV-1,AGV-2' }
      ]
    }
  };

  function makeField(def){
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.textContent = def.label || def.key;
    wrap.appendChild(label);
    let input;
    if(def.type === 'textarea'){
      input = document.createElement('textarea');
      if(def.rows) input.rows = def.rows;
      input.value = def.default ?? '';
    }else if(def.type === 'number'){
      input = document.createElement('input');
      input.type = 'number';
      if(typeof def.step !== 'undefined') input.step = String(def.step);
      if(typeof def.min !== 'undefined') input.min = String(def.min);
      if(typeof def.max !== 'undefined') input.max = String(def.max);
      input.value = def.default ?? 0;
    }else if(def.type === 'checkbox'){
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!def.default;
    }else{
      input = document.createElement('input');
      input.type = 'text';
      input.value = def.default ?? '';
    }
    input.dataset.field = def.key;
    wrap.appendChild(input);
    return wrap;
  }

  function renderFields(kind){
    const schema = NODE_SCHEMAS[kind] || NODE_SCHEMAS.equip;
    propsWrap.innerHTML = '';
    if(!schema.props || !schema.props.length){
      const div = document.createElement('div'); div.className='placeholder'; div.textContent='No configurable properties.'; propsWrap.appendChild(div); return;
    }
    schema.props.forEach(def=>{ propsWrap.appendChild(makeField(def)); });
  }

  renderFields(sel.value || 'equip');
  sel.addEventListener('change', ()=> renderFields(sel.value || 'equip'));

  btn.addEventListener('click', ()=>{
    try{
      const kind = sel.value || 'equip';
      const schema = NODE_SCHEMAS[kind] || NODE_SCHEMAS.equip;
      const node = LiteGraph.createNode(schema.type);
      if(!node) return;
      // Position near top-left with slight offset to avoid perfect overlap
      const baseX = 60, baseY = 120;
      const jitterX = Math.floor(Math.random()*60);
      const jitterY = Math.floor(Math.random()*60);
      node.pos = [baseX + jitterX, baseY + jitterY];
      if(schema.props && schema.props.length){
        schema.props.forEach(def=>{
          const el = propsWrap.querySelector(`[data-field=\"${def.key}\"]`);
          if(!el) return;
          let val;
          if(def.type === 'number'){
            const parsed = parseFloat(el.value);
            val = isNaN(parsed) ? def.default : parsed;
          }else if(def.type === 'checkbox'){
            val = el.checked;
          }else{
            val = el.value;
          }
          if(def.target === 'title'){
            if(typeof val === 'string' && val.trim()) node.title = val.trim();
          }else if(def.apply){
            def.apply(node, val);
          }else{
            node.properties = node.properties || {};
            node.properties[def.key] = val;
            if(typeof node.onPropertyChanged === 'function') node.onPropertyChanged(def.key);
          }
        });
        if(typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true,true);
      }
      graph.add(node);
      try{ if(canvas && canvas.draw) canvas.draw(true,true); }catch(e){}
    }catch(e){ console.error(e); }
  });
})();




