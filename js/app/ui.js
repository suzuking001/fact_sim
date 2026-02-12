// UI wiring (controls, modals, sidebar, title editor, add node panel)

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
      graph.add(node);
      try{ if(canvas && canvas.draw) canvas.draw(true,true); }catch(e){}
    }catch(e){ console.error(e); }
  });
})();
