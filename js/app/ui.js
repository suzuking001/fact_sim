// UI wiring (controls, modals, sidebar, title editor, add node panel)

var App = window.App || (window.App = {});

// Controls
const btnStart = document.getElementById('btnStart');
if(btnStart) btnStart.onclick = ()=>{ startSimulation(); };

const btnStop = document.getElementById('btnStop');
if(btnStop) btnStop.onclick = ()=>{ stopSimulation(); };

const btnReset = document.getElementById('btnReset');
if(btnReset) btnReset.onclick = ()=>{ stopSimulation(); initGraph(); };

const btnFit = document.getElementById('btnFit');
if(btnFit) btnFit.addEventListener('click', ()=> fitToScreen());

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
    try{ if(App.canvas && App.canvas.draw) App.canvas.draw(true,true); }catch(e){}
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
  if(App.canvas) install(App.canvas);
})();

// Node placement mode (follow cursor, click to place)
function installPlacementHandlers(c){
  if(!c || c.__placementHooked) return;
  const controller = App.resetListenerController('__placementController');
  const opts = App.listenerOptions(true, controller);
  const el = c.canvas;
  if(!el) return;

  const getCanvasPos = (e)=>{
    try{
      const rect = el.getBoundingClientRect();
      if(e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom){
        return null;
      }
      if(typeof c.convertEventToCanvasOffset === 'function') return c.convertEventToCanvasOffset(e);
      if(typeof c.convertEventToCanvas === 'function') return c.convertEventToCanvas(e);
      return [e.offsetX || 0, e.offsetY || 0];
    }catch(_e){ return null; }
  };

  el.addEventListener('mousemove', (e)=>{
    if(!App.placement || !App.placement.active) return;
    const p = getCanvasPos(e);
    if(!p) return;
    const n = App.placement.node;
    if(!n) return;
    const w = n.size ? n.size[0] : 0;
    const h = n.size ? n.size[1] : 0;
    n.pos = [p[0] - w/2, p[1] - h/2];
    if(typeof n.setDirtyCanvas === 'function') n.setDirtyCanvas(true,true);
    c.setDirty(true,true);
  }, opts);

  el.addEventListener('mousedown', (e)=>{
    if(!App.placement || !App.placement.active) return;
    if(e.button === 0){
      App.placement.active = false;
      App.placement.node = null;
      c.setDirty(true,true);
      e.preventDefault();
      e.stopPropagation();
    }else if(e.button === 2){
      const n = App.placement.node;
      App.placement.active = false;
      App.placement.node = null;
      if(App.graph && n) App.graph.remove(n);
      c.setDirty(true,true);
      e.preventDefault();
      e.stopPropagation();
    }else{
      e.preventDefault();
      e.stopPropagation();
    }
  }, opts);

  window.addEventListener('keydown', (e)=>{
    if(!App.placement || !App.placement.active) return;
    if(e.key === 'Escape'){
      const n = App.placement.node;
      App.placement.active = false;
      App.placement.node = null;
      if(App.graph && n) App.graph.remove(n);
      c.setDirty(true,true);
      e.preventDefault();
    }
  }, opts);

  c.__placementHooked = true;
}

function _defaultGraphPos(){
  if(!App.canvas) return [0,0];
  const scale = App.canvas.ds?.scale || 1;
  const cx = App.canvas.ds.offset[0] + (App.canvas.canvas.width * 0.5 / scale);
  const cy = App.canvas.ds.offset[1] + (App.canvas.canvas.height * 0.5 / scale);
  return [cx, cy];
}

function beginNodePlacement(node){
  if(!App.graph || !App.canvas || !node) return;
  if(App.placement && App.placement.active){
    const prev = App.placement.node;
    if(App.graph && prev) App.graph.remove(prev);
  }
  App.placement.active = true;
  App.placement.node = node;
  App.graph.add(node);
  const p = App.canvas.__last_mouse || _defaultGraphPos();
  const w = node.size ? node.size[0] : 0;
  const h = node.size ? node.size[1] : 0;
  node.pos = [p[0] - w/2, p[1] - h/2];
  if(typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true,true);
  App.canvas.selectNode(node);
  App.canvas.setDirty(true,true);
  App.showToast('左クリックで配置 / 右クリック or Escでキャンセル');
}

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
          const el = propsWrap.querySelector(`[data-field="${def.key}"]`);
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
      beginNodePlacement(node);
    }catch(e){ console.error(e); }
  });
})();

