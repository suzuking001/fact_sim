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

const simModeSelect = document.getElementById('simModeSelect');
if(simModeSelect){
  let currentMode = (App.setSimMode ? App.setSimMode('dt') : 'dt');
  simModeSelect.value = currentMode;
  simModeSelect.addEventListener('change', ()=>{
    const mode = (App.setSimMode ? App.setSimMode(simModeSelect.value) : simModeSelect.value);
    simModeSelect.value = mode;
    if(typeof window.updateSimTime === 'function') window.updateSimTime();
    if(typeof window.isSimRunning === 'function' && window.isSimRunning()){
      stopSimulation();
      startSimulation();
    }
    App.showToast(`Engine: ${mode}`);
  });
}

const renderFpsSelect = document.getElementById('renderFpsSelect');
if(renderFpsSelect){
  let fps = (typeof App.setRenderFps === 'function') ? App.setRenderFps(60) : 60;
  renderFpsSelect.value = String(fps);
  renderFpsSelect.addEventListener('change', ()=>{
    const next = (typeof App.setRenderFps === 'function')
      ? App.setRenderFps(renderFpsSelect.value)
      : Number(renderFpsSelect.value) || 60;
    renderFpsSelect.value = String(next);
    try{
      if(App.timelineChart && typeof App.timelineChart.draw === 'function') App.timelineChart.draw();
      if(App.canvas && typeof App.canvas.draw === 'function') App.canvas.draw(true, true);
    }catch(_e){}
    App.showToast(`Render FPS: ${next}`);
  });
}

// Benchmark result modal
(function(){
  const modal = document.getElementById('benchmarkModal');
  const closeBtn = document.getElementById('benchmarkClose');
  const table = document.getElementById('benchmarkTable');
  const body = document.getElementById('benchmarkBody');
  const summary = document.getElementById('benchmarkSummary');
  const legend = document.getElementById('benchmarkLegend');
  const progressWrap = document.getElementById('benchmarkProgressWrap');
  const progressLabel = document.getElementById('benchmarkProgressLabel');
  const progressBar = document.getElementById('benchmarkProgressBar');
  if(!modal || !closeBtn || !table || !body || !summary || !legend || !progressWrap || !progressLabel || !progressBar) return;

  let running = false;

  const close = ()=>{
    if(running) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  };

  const open = ()=>{
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
  };

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e)=>{ if(e.target === modal) close(); });
  window.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && modal.style.display === 'block') close();
  });

  App.showBenchmarkProgress = function(progress, text){
    const ratio = Math.max(0, Math.min(1, Number(progress) || 0));
    const percent = Math.round(ratio * 100);
    running = true;

    closeBtn.disabled = true;
    progressWrap.style.display = 'block';
    progressBar.style.width = `${percent}%`;
    progressLabel.textContent = text || `Benchmark running... ${percent}%`;

    summary.style.display = 'none';
    legend.style.display = 'none';
    table.style.display = 'none';
    body.innerHTML = '';

    open();
    return true;
  };

  App.stopBenchmarkProgress = function(){
    running = false;
    closeBtn.disabled = false;
    progressWrap.style.display = 'none';
    progressBar.style.width = '0%';
    progressLabel.textContent = 'Benchmark running...';
    summary.style.display = 'block';
    legend.style.display = 'block';
    table.style.display = 'table';
  };

  App.showBenchmarkModal = function(bench){
    const rows = (bench && Array.isArray(bench.results)) ? bench.results.slice() : [];
    if(!rows.length) return false;
    App.stopBenchmarkProgress();

    const sorted = rows.sort((a,b)=> b.speed - a.speed);
    const best = sorted[0];
    const bestSpeed = Math.max(best.speed, 0.0001);

    const wallSec = (Number(bench.wallMs) || 0) / 1000;
    const realStep = Number(bench.realStepMs) || 0;
    const cases = Array.from(new Set(sorted.map(r=> String(r.renderLabel || 'render:off')))).join(', ');
    summary.style.display = 'block';
    legend.style.display = 'block';
    table.style.display = 'table';
    summary.textContent = `計測条件: wall=${wallSec.toFixed(2)}s, realStep=${realStep.toFixed(0)}ms, cases=${cases} | 最速: ${best.modeLabel} + ${best.renderLabel || 'render:off'} (${best.speed.toFixed(2)}x)`;

    body.innerHTML = '';
    sorted.forEach((r, idx)=>{
      const tr = document.createElement('tr');
      if(idx === 0) tr.classList.add('bench-best');

      const engineTd = document.createElement('td');
      engineTd.textContent = r.modeLabel;
      tr.appendChild(engineTd);

      const caseTd = document.createElement('td');
      caseTd.textContent = r.renderLabel || 'render:off';
      tr.appendChild(caseTd);

      const speedTd = document.createElement('td');
      speedTd.className = 'benchSpeedCell';
      const speedText = document.createElement('div');
      speedText.className = 'benchSpeedText';
      speedText.textContent = `${r.speed.toFixed(2)}x`;
      const track = document.createElement('div');
      track.className = 'benchBarTrack';
      const fill = document.createElement('div');
      fill.className = 'benchBarFill';
      const ratio = (r.speed / bestSpeed) * 100;
      fill.style.width = `${Math.max(3, Math.min(100, ratio)).toFixed(1)}%`;
      track.appendChild(fill);
      speedTd.appendChild(speedText);
      speedTd.appendChild(track);
      tr.appendChild(speedTd);

      const simTd = document.createElement('td');
      simTd.className = 'benchMono';
      simTd.textContent = `${r.simSec.toFixed(2)}s`;
      tr.appendChild(simTd);

      const wallTd = document.createElement('td');
      wallTd.className = 'benchMono';
      wallTd.textContent = `${(r.wallMs/1000).toFixed(2)}s`;
      tr.appendChild(wallTd);

      const loopTd = document.createElement('td');
      loopTd.className = 'benchMono';
      loopTd.textContent = Number(r.loops || 0).toLocaleString();
      tr.appendChild(loopTd);

      body.appendChild(tr);
    });

    open();
    return true;
  };
})();

const btnBenchmark = document.getElementById('btnBenchmark');
if(btnBenchmark){
  btnBenchmark.addEventListener('click', async ()=>{
    if(btnBenchmark.disabled) return;
    if(typeof window.isSimRunning === 'function' && window.isSimRunning()){
      stopSimulation();
    }
    const prevText = btnBenchmark.textContent;
    btnBenchmark.disabled = true;
    btnBenchmark.textContent = 'Benchmarking...';

    try{
      if(typeof App.runEngineBenchmark !== 'function') throw new Error('benchmark API is unavailable');
      if(typeof App.showBenchmarkProgress === 'function'){
        App.showBenchmarkProgress(0, 'Benchmark running... 0%');
      }

      let bench;
      const benchOptions = {
        wallMs: 5000,
        realStepMs: 16,
        modes: ['dt', 'event'],
        renderCases: ['headless', 'render']
      };
      if(typeof App.runEngineBenchmarkAsync === 'function'){
        bench = await App.runEngineBenchmarkAsync({
          ...benchOptions,
          onProgress: (ratio, info)=>{
            if(typeof App.showBenchmarkProgress === 'function'){
              const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
              let label = `Benchmark running... ${pct}%`;
              if(info && info.modeLabel && info.renderLabel){
                label = `Benchmark running... ${pct}% (${info.modeLabel}, ${info.renderLabel})`;
              }
              App.showBenchmarkProgress(ratio, label);
            }
          }
        });
      }else{
        bench = App.runEngineBenchmark(benchOptions);
      }

      const rows = (bench && Array.isArray(bench.results)) ? bench.results : [];
      if(!rows.length) throw new Error('no benchmark result');

      rows.forEach(r=>{
        console.log(`[benchmark] ${r.modeLabel}, ${r.renderLabel || 'render:off'}: speed=${r.speed.toFixed(2)}x (sim=${r.simSec.toFixed(2)}s / wall=${(r.wallMs/1000).toFixed(2)}s), loops=${r.loops}`);
      });

      const sorted = rows.slice().sort((a,b)=> b.speed - a.speed);
      const best = sorted[0];
      if(typeof App.showBenchmarkModal === 'function'){
        App.showBenchmarkModal(bench);
      }else{
        alert(`Best: ${best.modeLabel} + ${best.renderLabel || 'render:off'} (${best.speed.toFixed(2)}x)`);
      }
      App.showToast(`Best: ${best.modeLabel} + ${best.renderLabel || 'render:off'} ${best.speed.toFixed(2)}x`);
    }catch(err){
      console.error(err);
      if(typeof App.stopBenchmarkProgress === 'function') App.stopBenchmarkProgress();
      alert('Benchmark failed');
    }finally{
      btnBenchmark.disabled = false;
      btnBenchmark.textContent = prevText;
    }
  });
}

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
    merge:{
      type:'factory/merge',
      props:[
        { key:'title', label:'Title', type:'text', default:'Merge', target:'title' },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'processTime2', label:'Process Time N (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 }
      ]
    },
    join:{
      type:'factory/join',
      props:[
        { key:'title', label:'Title', type:'text', default:'Join', target:'title' },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:5 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:6 }
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
    branch:{
      type:'factory/branch',
      props:[
        { key:'title', label:'Title', type:'text', default:'Branch', target:'title' },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 }
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

