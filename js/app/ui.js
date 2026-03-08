// UI wiring (controls, modals, sidebar, title editor, add node panel)

var App = window.App || (window.App = {});

function initLiteContextMenuStyler(){
  if(App.__liteContextMenuStylerReady) return;
  App.__liteContextMenuStylerReady = true;

  const DANGER_RE = /^(delete|clear|reset memo style)/i;
  const MUTED_RE = /^(rename|resize|fit view|fit to screen|auto layout|center view|select nodes|duplicate)/i;
  const UI_FONT = '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  const ACCENT_BG = 'rgba(10,132,255,0.12)';
  const ACCENT_BORDER = 'rgba(10,132,255,0.22)';
  const ACCENT_TEXT = '#005ecb';
  const shouldSuppressContextMenu = ()=> Number(App.__suppressContextMenusUntil || 0) > Date.now();

  const clampMenuToViewport = (menu)=>{
    if(!(menu instanceof HTMLElement)) return;
    const padding = 12;
    const maxHeight = Math.max(220, window.innerHeight - padding * 2);
    menu.style.maxHeight = `${maxHeight}px`;
    menu.style.overflowY = 'auto';
    menu.style.overflowX = 'hidden';
    requestAnimationFrame(()=>{
      const rect = menu.getBoundingClientRect();
      let left = rect.left;
      let top = rect.top;
      if(rect.right > window.innerWidth - padding){
        left -= rect.right - (window.innerWidth - padding);
      }
      if(rect.bottom > window.innerHeight - padding){
        top -= rect.bottom - (window.innerHeight - padding);
      }
      left = Math.max(padding, left);
      top = Math.max(padding, top);
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
    });
  };

  const pruneRedundantEntries = (menu)=>{
    if(!(menu instanceof HTMLElement)) return;
    const entries = Array.from(menu.querySelectorAll('.litemenu-entry'));
    const hasEditGroupDialog = entries.some((entry)=> String(entry.textContent || '').trim() === 'Edit Group...');
    if(hasEditGroupDialog){
      entries.forEach((entry)=>{
        const text = String(entry.textContent || '').trim();
        if(text !== 'Edit Group') return;
        if(entry.classList.contains('has_submenu')){
          entry.remove();
        }
      });
    }
    const nextEntries = Array.from(menu.querySelectorAll('.litemenu-entry'));
    nextEntries.forEach((entry, index)=>{
      const text = String(entry.textContent || '').trim();
      if(text) return;
      const prev = nextEntries[index - 1];
      const next = nextEntries[index + 1];
      if(!prev || !next || !String(prev.textContent || '').trim() || !String(next.textContent || '').trim()){
        entry.remove();
      }
    });
  };

  const applyEntryStyles = (entry)=>{
    if(!(entry instanceof HTMLElement) || entry.__factStyledEntry) return;
    entry.__factStyledEntry = true;
    const text = String(entry.textContent || '').trim();
    entry.style.setProperty('background', 'transparent', 'important');
    entry.style.setProperty('background-color', 'transparent', 'important');
    entry.style.setProperty('background-image', 'none', 'important');
    entry.style.setProperty('color', '#1d1d1f', 'important');
    entry.style.setProperty('border-radius', '13px', 'important');
    entry.style.setProperty('border', '1px solid transparent', 'important');
    entry.style.setProperty('font-family', UI_FONT, 'important');

    if(entry.classList.contains('separator')){
      entry.style.setProperty('min-height', '0', 'important');
      entry.style.setProperty('padding', '0', 'important');
      entry.style.setProperty('margin', '6px 2px', 'important');
      entry.style.setProperty('border-radius', '0', 'important');
      entry.style.setProperty('border', '0', 'important');
      entry.style.setProperty('border-bottom', '1px solid rgba(17,17,17,0.08)', 'important');
      return;
    }

    if(DANGER_RE.test(text)) entry.classList.add('fact-menu-danger');
    else if(MUTED_RE.test(text)) entry.classList.add('fact-menu-muted');

    entry.addEventListener('mouseenter', ()=>{
      if(entry.classList.contains('fact-menu-danger')){
        entry.style.setProperty('background', 'rgba(180,35,24,0.08)', 'important');
        entry.style.setProperty('background-color', 'rgba(180,35,24,0.08)', 'important');
        entry.style.setProperty('border-color', 'rgba(180,35,24,0.16)', 'important');
        entry.style.setProperty('color', '#7a1d16', 'important');
      }else{
        entry.style.setProperty('background', ACCENT_BG, 'important');
        entry.style.setProperty('background-color', ACCENT_BG, 'important');
        entry.style.setProperty('border-color', ACCENT_BORDER, 'important');
        entry.style.setProperty('color', ACCENT_TEXT, 'important');
      }
    });
    entry.addEventListener('mouseleave', ()=>{
      entry.style.setProperty('background', 'transparent', 'important');
      entry.style.setProperty('background-color', 'transparent', 'important');
      entry.style.setProperty('border-color', 'transparent', 'important');
      let color = '#111111';
      if(entry.classList.contains('disabled')) color = 'rgba(29,29,31,0.42)';
      else if(entry.classList.contains('fact-menu-danger')) color = '#b42318';
      else if(entry.classList.contains('fact-menu-muted')) color = 'rgba(60,60,67,0.68)';
      entry.style.setProperty('color', color, 'important');
    });
  };

  const applyMenuStyles = (menu)=>{
    if(!(menu instanceof HTMLElement)) return;
    if(shouldSuppressContextMenu()){
      menu.remove();
      return;
    }
    pruneRedundantEntries(menu);
    if(!menu.__factStyledMenu){
      menu.__factStyledMenu = true;
      Object.assign(menu.style, {
        border: '1px solid rgba(255,255,255,0.88)',
        borderRadius: '20px',
        background: 'rgba(255,255,255,0.82)',
        boxShadow: '0 28px 72px rgba(15,23,42,0.18)',
        backdropFilter: 'blur(22px) saturate(1.35)',
        padding: '8px',
        minWidth: '236px',
        color: '#1d1d1f',
        fontFamily: UI_FONT
      });
    }
    clampMenuToViewport(menu);
    menu.querySelectorAll('.litemenu-entry').forEach(applyEntryStyles);
  };

  const scan = ()=>{
    document.querySelectorAll('.litegraph.litecontextmenu').forEach(applyMenuStyles);
  };

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
}

initLiteContextMenuStyler();

// Controls
const btnStart = document.getElementById('btnStart');
if(btnStart) btnStart.onclick = ()=>{ startSimulation(); };

const btnStop = document.getElementById('btnStop');
if(btnStop) btnStop.onclick = ()=>{ stopSimulation(); };

const btnReset = document.getElementById('btnReset');
if(btnReset) btnReset.onclick = ()=>{ stopSimulation(); initGraph(); };

const btnFit = document.getElementById('btnFit');
if(btnFit) btnFit.addEventListener('click', ()=> fitToScreen());

const btnAutoLayout = document.getElementById('btnAutoLayout');
if(btnAutoLayout){
  const layoutModeSelect = document.getElementById('autoLayoutMode');
  btnAutoLayout.addEventListener('click', ()=>{
    if(typeof autoLayoutGraph === 'function'){
      const mode = String(layoutModeSelect?.value || 'flow');
      if(!autoLayoutGraph({ mode, spacing:80, fit:true })){
        App.showToast('Auto layout unavailable');
      }
    }
  });
}

const btnSelectionLayout = document.getElementById('btnSelectionLayout');
if(btnSelectionLayout){
  const selectionLayoutMode = document.getElementById('selectionLayoutMode');
  btnSelectionLayout.addEventListener('click', ()=>{
    if(typeof applySelectionLayout !== 'function'){
      App.showToast('Selection layout unavailable');
      return;
    }
    const action = String(selectionLayoutMode?.value || 'align-left');
    const ok = applySelectionLayout(action);
    if(!ok){
      if(action === 'distribute-h' || action === 'distribute-v'){
        App.showToast('Select 3+ nodes for distribute');
      }else{
        App.showToast('Select 2+ nodes first');
      }
    }
  });
}

const btnResizeNodes = document.getElementById('btnResizeNodes');
if(btnResizeNodes){
  const resizeMode = document.getElementById('resizeMode');
  btnResizeNodes.addEventListener('click', ()=>{
    if(typeof applySelectionResize !== 'function'){
      App.showToast('Resize unavailable');
      return;
    }
    const mode = String(resizeMode?.value || 'set-size');
    let ok = false;
    if(mode === 'min-size'){
      ok = applySelectionResize('min-size');
    }else{
      const wIn = window.prompt('Width (px)', '180');
      if(wIn == null) return;
      const hIn = window.prompt('Height (px)', '90');
      if(hIn == null) return;
      const w = Number(wIn);
      const h = Number(hIn);
      if(!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0){
        App.showToast('Invalid width/height');
        return;
      }
      ok = applySelectionResize('set-size', { width: w, height: h });
    }
    if(!ok){
      App.showToast('Select 1+ nodes first');
    }
  });
}

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
    summary.textContent = `Conditions: wall=${wallSec.toFixed(2)}s, realStep=${realStep.toFixed(0)}ms, cases=${cases} | Fastest: ${best.modeLabel} + ${best.renderLabel || 'render:off'} (${best.speed.toFixed(2)}x)`;

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

// Add Group (stop groups)
(function(){
  const typeSel = document.getElementById('groupKindSelect');
  const propsWrap = document.getElementById('addGroupProps');
  const rateEl = document.getElementById('groupStopRate');
  const btn = document.getElementById('btnAddGroup');
  const settingsDetails = document.getElementById('groupSettingsDetails');
  const descriptionEl = document.getElementById('groupKindDescription');
  if(!typeSel || !propsWrap || !rateEl || !btn) return;
  if(!App.stopGroups || typeof App.stopGroups.getTypeDefinitions !== 'function') return;

  const defs = App.stopGroups.getTypeDefinitions()
    .filter((d)=> d && d.key && Array.isArray(d.uiFields))
    .sort((a, b)=> String(a.label || a.key).localeCompare(String(b.label || b.key)));

  if(!defs.length) return;

  const GROUP_DESCRIPTIONS = {
    random: 'Stop all nodes inside the group using randomized interval and duration distributions.',
    scheduled: 'Stop all nodes inside the group at fixed intervals for planned pauses and breaks.'
  };

  typeSel.innerHTML = '';
  defs.forEach((def)=>{
    const opt = document.createElement('option');
    opt.value = def.key;
    opt.textContent = def.label || def.key;
    typeSel.appendChild(opt);
  });

  const makeField = (def)=>{
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.textContent = def.label || def.key;
    wrap.appendChild(label);

    let input = null;
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
    }else if(def.type === 'color'){
      input = document.createElement('input');
      input.type = 'color';
      input.value = def.default ?? '#ffffff';
    }else{
      input = document.createElement('input');
      input.type = 'text';
      input.value = def.default ?? '';
    }
    input.dataset.field = def.key;
    wrap.appendChild(input);
    return wrap;
  };

  const getDef = ()=>{
    const key = typeSel.value || defs[0].key;
    return defs.find((d)=> d.key === key) || defs[0];
  };

  const formatDowntimeEstimate = (meta)=>{
    try{
      const pct = App.stopGroups.estimateStopRatePercent(meta.type, meta.props);
      return `${pct.toFixed(1)}%`;
    }catch(_e){
      return '-';
    }
  };

  const readMeta = ()=>{
    const def = getDef();
    const meta = {
      type: def.key,
      title: def.defaultTitle || 'Stop Group',
      props: {}
    };
    for(const field of def.uiFields){
      const el = propsWrap.querySelector(`[data-field="${field.key}"]`);
      if(!el) continue;
      let value = null;
      if(field.type === 'number'){
        const parsed = parseFloat(el.value);
        value = isNaN(parsed) ? (field.default ?? 0) : parsed;
      }else{
        value = el.value;
      }
      if(field.target === 'title'){
        const t = String(value == null ? '' : value).trim();
        if(t) meta.title = t;
      }else{
        meta.props[field.key] = value;
      }
    }
    return App.stopGroups.normalizeMeta(meta);
  };

  const updateStopRate = ()=>{
    try{
      const meta = readMeta();
      const rateText = formatDowntimeEstimate(meta);
      rateEl.dataset.rateText = rateText;
      rateEl.textContent = `Downtime: ${rateText}`;
    }catch(_e){
      rateEl.dataset.rateText = '-';
      rateEl.textContent = 'Downtime: -';
    }
  };

  const updateGroupBuilderUi = ()=>{
    const def = getDef();
    const active = !!(App.placement && App.placement.active && App.placement.kind === 'group');
    const label = active
      ? _getPlacementItemLabel('group', App.placement.item)
      : String(def.label || 'Stop Group');
    btn.classList.toggle('is-cancel', active);
    btn.textContent = active ? 'Cancel Placement' : `Place ${label}`;
    if(descriptionEl){
      descriptionEl.textContent = active
        ? `Place ${label} on the canvas. Right-click or Esc cancels.`
        : (GROUP_DESCRIPTIONS[def.key] || 'Choose a pattern. Open settings only when timing needs tuning.');
    }
    if(active && settingsDetails) settingsDetails.open = true;
  };
  App.refreshGroupBuilderUI = updateGroupBuilderUi;

  const renderFields = ()=>{
    const def = getDef();
    propsWrap.innerHTML = '';
    for(const field of def.uiFields){
      propsWrap.appendChild(makeField(field));
    }
    propsWrap.querySelectorAll('input,textarea,select').forEach((el)=>{
      el.addEventListener('input', updateStopRate);
      el.addEventListener('change', updateStopRate);
    });
    if(settingsDetails){
      settingsDetails.hidden = !def.uiFields.length;
      const summary = settingsDetails.querySelector('summary');
      if(summary) summary.textContent = `Pattern Settings (${def.uiFields.length})`;
    }
    updateStopRate();
    updateGroupBuilderUi();
  };

  typeSel.addEventListener('change', renderFields);
  renderFields();

  btn.addEventListener('click', ()=>{
    if(App.placement && App.placement.active && App.placement.kind === 'group'){
      App.finishPlacement(false);
      if(App.canvas && typeof App.canvas.setDirty === 'function') App.canvas.setDirty(true, true);
      return;
    }
    if(!App.graph || !App.canvas) return;
    try{
      const meta = readMeta();
      const group = App.stopGroups.createGroup(meta);
      beginGroupPlacement(group);
    }catch(err){
      console.error(err);
    }
  });
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
  const sidebar = document.getElementById('sidebar');
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

  // Sidebar should always be wheel-scrollable even if graph handlers consume wheel events.
  if(sidebar && !sidebar.__wheelScrollHooked){
    sidebar.addEventListener('wheel', (e)=>{
      if(body.classList.contains('sidebar-hidden')) return;
      const max = Math.max(0, sidebar.scrollHeight - sidebar.clientHeight);
      if(max <= 0) return;
      const delta = Number(e.deltaY) || 0;
      if(delta === 0) return;
      const next = Math.max(0, Math.min(max, sidebar.scrollTop + delta));
      if(next === sidebar.scrollTop) return;
      sidebar.scrollTop = next;
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    sidebar.__wheelScrollHooked = true;
  }
})();

// Placement mode (node/group follows cursor, left click to place)
function _clearPlacementState(){
  if(!App.placement) return;
  App.placement.active = false;
  App.placement.kind = '';
  App.placement.item = null;
  App.placement.pendingChange = false;
}

function _removePlacementItem(item){
  if(!App.graph || !item) return;
  try{ App.graph.remove(item); }catch(_e){}
}

function _closeContextMenus(){
  try{
    document.querySelectorAll('.litegraph.litecontextmenu').forEach((menu)=> menu.remove());
  }catch(_e){}
}

function _getPlacementItemLabel(kind, item){
  if(!item) return kind === 'group' ? 'Stop Group' : 'Node';
  if(_isNodePlacementItem(kind, item)){
    return String(item.title || item.type || 'Node').trim() || 'Node';
  }
  const meta = (typeof App.stopGroups?.getGroupMeta === 'function')
    ? App.stopGroups.getGroupMeta(item)
    : null;
  return String(meta?.title || item.title || 'Stop Group').trim() || 'Stop Group';
}

function _notifyPlacementUi(){
  try{
    if(typeof App.onPlacementStateChange === 'function'){
      App.onPlacementStateChange({
        active: !!App.placement?.active,
        kind: String(App.placement?.kind || ''),
        item: App.placement?.item || null,
        label: _getPlacementItemLabel(App.placement?.kind || '', App.placement?.item || null)
      });
    }
  }catch(_e){}
}

function _finishPlacement(commit){
  if(!App.placement || !App.placement.active) return;
  const item = App.placement.item;
  const kind = String(App.placement.kind || '');
  const label = _getPlacementItemLabel(kind, item);
  const pending = !!App.placement.pendingChange;
  if(!commit && item){
    _removePlacementItem(item);
  }
  if(pending && App.graph && typeof App.graph.afterChange === 'function'){
    try{ App.graph.afterChange(); }catch(_e){}
  }
  _clearPlacementState();
  _notifyPlacementUi();
  if(typeof App.showToast === 'function'){
    App.showToast(commit ? `${label} placed` : `${label} placement canceled`);
  }
}
App.finishPlacement = _finishPlacement;

function _isNodePlacementItem(kind, item){
  if(kind === 'node') return true;
  if(item && typeof item.onExecute === 'function') return true;
  return false;
}

function _setPlacementItemPos(item, kind, p){
  if(!item || !p) return;
  if(_isNodePlacementItem(kind, item)){
    const w = item.size ? item.size[0] : 0;
    const h = item.size ? item.size[1] : 0;
    item.pos = [p[0] - w / 2, p[1] - h / 2];
    if(typeof item.setDirtyCanvas === 'function') item.setDirtyCanvas(true, true);
    return;
  }

  if(item._bounding && item._bounding.length >= 4){
    const w = Number(item._bounding[2]) || 0;
    const h = Number(item._bounding[3]) || 0;
    item._bounding[0] = p[0] - w / 2;
    item._bounding[1] = p[1] - h / 2;
  }else{
    const size = Array.isArray(item.size) ? item.size : [300, 180];
    item.pos = [p[0] - size[0] / 2, p[1] - size[1] / 2];
  }
}

function installPlacementHandlers(c){
  if(!c || c.__placementHooked) return;
  const controller = App.resetListenerController('__placementController');
  const opts = App.listenerOptions(true, controller);
  const el = c.canvas;
  if(!el) return;
  const targets = [c.canvas, c.bgcanvas, c.top_canvas].filter(Boolean);

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

  const handleMouseMove = (e)=>{
    if(!App.placement || !App.placement.active) return;
    const p = getCanvasPos(e);
    if(!p) return;
    const item = App.placement.item;
    if(!item) return;
    _setPlacementItemPos(item, App.placement.kind, p);
    c.setDirty(true, true);
  };

  const handleMouseDown = (e)=>{
    if(!App.placement || !App.placement.active) return;
    if(e.button === 0){
      _finishPlacement(true);
      c.setDirty(true, true);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if(e.button === 2){
      App.__suppressContextMenusUntil = Date.now() + 400;
      _finishPlacement(false);
      c.setDirty(true, true);
      e.preventDefault();
      e.stopPropagation();
      _closeContextMenus();
      requestAnimationFrame(_closeContextMenus);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const handleContextMenu = (e)=>{
    if(!App.placement || !App.placement.active) return;
    App.__suppressContextMenusUntil = Date.now() + 400;
    _finishPlacement(false);
    c.setDirty(true, true);
    e.preventDefault();
    e.stopPropagation();
    _closeContextMenus();
    requestAnimationFrame(_closeContextMenus);
    window.setTimeout(_closeContextMenus, 0);
    window.setTimeout(_closeContextMenus, 80);
    window.setTimeout(_closeContextMenus, 180);
  };

  targets.forEach((target)=>{
    target.addEventListener('mousemove', handleMouseMove, opts);
    target.addEventListener('mousedown', handleMouseDown, opts);
    target.addEventListener('contextmenu', handleContextMenu, opts);
  });

  window.addEventListener('keydown', (e)=>{
    if(!App.placement || !App.placement.active) return;
    if(e.key === 'Escape'){
      _finishPlacement(false);
      c.setDirty(true, true);
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
    _finishPlacement(false);
  }
  if(typeof window.enforceNodeOverlayMinSize === 'function'){
    try{ window.enforceNodeOverlayMinSize(node); }catch(_e){}
  }
  if(typeof App.graph.beforeChange === 'function'){
    try{ App.graph.beforeChange(); }catch(_e){}
  }
  App.placement.active = true;
  App.placement.kind = 'node';
  App.placement.item = node;
  App.placement.pendingChange = true;
  App.graph.add(node);
  const p = App.canvas.__last_mouse || _defaultGraphPos();
  _setPlacementItemPos(node, 'node', p);
  if(typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true, true);
  App.canvas.selectNode(node);
  App.canvas.setDirty(true, true);
  if(typeof App.focusSidebarPanel === 'function') App.focusSidebarPanel('addNodePanel');
  _notifyPlacementUi();
  App.showToast(`Placing ${_getPlacementItemLabel('node', node)}. Click on the canvas to place it. Right-click or press Esc to cancel.`);
}
window.beginNodePlacement = beginNodePlacement;

function beginGroupPlacement(group){
  if(!App.graph || !App.canvas || !group) return;
  if(App.placement && App.placement.active){
    _finishPlacement(false);
  }
  if(typeof App.graph.beforeChange === 'function'){
    try{ App.graph.beforeChange(); }catch(_e){}
  }
  App.placement.active = true;
  App.placement.kind = 'group';
  App.placement.item = group;
  App.placement.pendingChange = true;
  App.graph.add(group);
  const p = App.canvas.__last_mouse || _defaultGraphPos();
  _setPlacementItemPos(group, 'group', p);
  App.canvas.setDirty(true, true);
  if(typeof App.focusSidebarPanel === 'function') App.focusSidebarPanel('addGroupPanel');
  _notifyPlacementUi();
  App.showToast(`Placing ${_getPlacementItemLabel('group', group)}. Click on the canvas to place it. Right-click or press Esc to cancel.`);
}
window.beginGroupPlacement = beginGroupPlacement;

// Add Node (from sidebar select + button)
(function(){
  const addNodePanel = document.getElementById('addNodePanel');
  const sel = document.getElementById('nodeKindSelect');
  const btn = document.getElementById('btnAddNode');
  const propsWrap = document.getElementById('addNodeProps');
  const searchInput = document.getElementById('nodeTypeSearch');
  const categoryTabsWrap = document.getElementById('nodeCategoryTabs');
  const quickPicksWrap = document.getElementById('nodeQuickPicks');
  const browseDetails = document.getElementById('nodeTypeBrowseDetails');
  const settingsDetails = document.getElementById('nodeSettingsDetails');
  const descriptionEl = document.getElementById('nodeKindDescription');
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
    note:{
      type:'factory/note',
      props:[
        { key:'title', label:'Title', type:'text', default:'Memo', target:'title' },
        { key:'text', label:'Text', type:'textarea', rows:6, default:'Equipment memo...' },
        { key:'fontSize', label:'Font Size (px)', type:'number', min:10, max:64, step:1, default:13 },
        { key:'backgroundColor', label:'Background Color', type:'color', default:'#f8fafc' },
        { key:'textColor', label:'Text Color', type:'color', default:'#0f172a' }
      ]
    },
    signal:{
      type:'factory/signal',
      props:[
        { key:'title', label:'Title', type:'text', default:'Signal', target:'title' }
      ]
    },
    shuttle:{
      type:'factory/shuttle_stage',
      props:[
        { key:'title', label:'Title', type:'text', default:'Shuttle Stage', target:'title' },
        { key:'groupId', label:'Group ID', type:'text', default:'shuttle-1' },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 }
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
    carrierconfig:{
      type:'factory/carrierconfig',
      props:[
        { key:'title', label:'Title', type:'text', default:'Carrier Config', target:'title' },
        { key:'carrierId', label:'Carrier ID', type:'text', default:'Carrier-1' },
        { key:'capacity', label:'Carrier Capacity (work)', type:'number', min:1, step:1, default:2 }
      ]
    },
    palletcarrierconfig:{
      type:'factory/palletcarrierconfig',
      props:[
        { key:'title', label:'Title', type:'text', default:'Pallet Carrier Config', target:'title' },
        { key:'carrierId', label:'Carrier ID', type:'text', default:'Carrier-1' },
        { key:'palletCapacity', label:'Pallet Capacity (count)', type:'number', min:1, step:1, default:2 },
        { key:'palletWorkCapacity', label:'Work Capacity / Pallet', type:'number', min:1, step:1, default:6 },
        { key:'initialPalletIds', label:'Initial Pallet IDs (comma)', type:'textarea', default:'P-1' }
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
    },
    carrierroute:{
      type:'factory/carrierroute',
      props:[
        { key:'title', label:'Title', type:'text', default:'Carrier Route', target:'title' },
        { key:'processTime', label:'Travel Time (s)', type:'number', min:0, step:0.1, default:3 },
        { key:'downTime', label:'Dispatch Delay (s)', type:'number', min:0, step:0.1, default:0.5 },
        { key:'initialCarrier', label:'Initial Carrier ID', type:'text', default:'' },
        { key:'outSequence', label:'Carrier OUT Sequence (1-based, comma)', type:'textarea', default:'' }
      ]
    },
    station:{
      type:'factory/station',
      props:[
        { key:'title', label:'Title', type:'text', default:'Station', target:'title' },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 },
        { key:'palletWorkCapacity', label:'Pallet Work Capacity', type:'number', min:1, step:1, default:6 }
      ]
    }
  };

  const NODE_META = {
    equip:{ label:'Equipment', description:'Process work with standard process / wait / down behavior.' },
    note:{ label:'Memo', description:'Place text notes on the graph for layout comments and instructions.' },
    signal:{ label:'Signal', description:'Run signal-only scripts and combine logic without work transport.' },
    shuttle:{ label:'Shuttle Stage', description:'Synchronize grouped shuttle stages and move one work per stage together.' },
    merge:{ label:'Merge', description:'Merge matching work IDs from multiple inputs into one output.' },
    join:{ label:'Join', description:'Pass through the first-arriving work from multiple upstream nodes.' },
    source:{ label:'Source', description:'Generate work items from a configured sequence.' },
    sink:{ label:'Sink', description:'Collect completed work and monitor throughput.' },
    split:{ label:'Split', description:'Duplicate one work ID into multiple synchronized downstream branches.' },
    branch:{ label:'Branch', description:'Route work by work type to different output ports.' },
    carrierconfig:{ label:'Carrier Config', description:'Define carrier IDs and work capacity for route initialization.' },
    palletcarrierconfig:{ label:'Pallet Carrier Config', description:'Define pallet carrier IDs, pallet capacity, and initial pallets.' },
    agvroute:{ label:'AGV Route', description:'Legacy AGV route node with travel time and dispatch behavior.' },
    carrierroute:{ label:'Carrier Route', description:'Transport carriers, work, and pallets along a timed route.' },
    station:{ label:'Station', description:'Store one pallet, feed work in/out, and hand pallets to carriers.' }
  };
  const QUICK_PICK_KINDS = ['equip', 'source', 'sink', 'signal', 'carrierroute', 'station'];
  const CATEGORY_TABS = [
    { key: 'all', label: 'All' },
    { key: 'core', label: 'Core' },
    { key: 'flow', label: 'Flow' },
    { key: 'carrier', label: 'Carrier' },
    { key: 'utility', label: 'Utility' }
  ];
  const NODE_CATEGORY = {
    equip: 'core',
    source: 'core',
    sink: 'core',
    split: 'flow',
    branch: 'flow',
    merge: 'flow',
    join: 'flow',
    shuttle: 'flow',
    carrierconfig: 'carrier',
    palletcarrierconfig: 'carrier',
    carrierroute: 'carrier',
    station: 'carrier',
    agvroute: 'carrier',
    signal: 'utility',
    note: 'utility'
  };
  let activeCategory = 'all';

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
    }else if(def.type === 'color'){
      input = document.createElement('input');
      input.type = 'color';
      input.value = def.default ?? '#ffffff';
    }else{
      input = document.createElement('input');
      input.type = 'text';
      input.value = def.default ?? '';
    }
    input.dataset.field = def.key;
    wrap.appendChild(input);
    return wrap;
  }

  function getNodeMeta(kind){
    return NODE_META[kind] || { label: kind, description: '' };
  }

  function getNodeCategory(kind){
    return NODE_CATEGORY[kind] || 'utility';
  }

  function listNodeKinds(filterText){
    const filter = String(filterText || '').trim().toLowerCase();
    return Object.keys(NODE_SCHEMAS).filter((kind)=>{
      if(activeCategory !== 'all' && getNodeCategory(kind) !== activeCategory) return false;
      if(!filter) return true;
      const meta = getNodeMeta(kind);
      const schema = NODE_SCHEMAS[kind];
      const haystack = [
        kind,
        meta.label,
        meta.description,
        schema && schema.type
      ].join(' ').toLowerCase();
      return haystack.includes(filter);
    });
  }

  function renderCategoryTabs(){
    if(!categoryTabsWrap) return;
    categoryTabsWrap.innerHTML = '';
    CATEGORY_TABS.forEach((tab)=>{
      const btnEl = document.createElement('button');
      btnEl.type = 'button';
      btnEl.className = 'categoryTabBtn' + (tab.key === activeCategory ? ' is-active' : '');
      btnEl.textContent = tab.label;
      btnEl.setAttribute('role', 'tab');
      btnEl.setAttribute('aria-selected', tab.key === activeCategory ? 'true' : 'false');
      btnEl.addEventListener('click', ()=>{
        activeCategory = tab.key;
        renderCategoryTabs();
        if(!rebuildNodeSelect(searchInput?.value || '')) return;
        renderFields(sel.value || 'equip');
      });
      categoryTabsWrap.appendChild(btnEl);
    });
  }

  function renderQuickPicks(activeKind){
    if(!quickPicksWrap) return;
    quickPicksWrap.innerHTML = '';
    QUICK_PICK_KINDS.forEach((kind)=>{
      const meta = getNodeMeta(kind);
      if(!meta) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'quickPickBtn' + (kind === activeKind ? ' is-active' : '');
      chip.textContent = meta.label;
      chip.title = meta.description || meta.label;
      chip.addEventListener('click', ()=>{
        if(searchInput) searchInput.value = '';
        activeCategory = 'all';
        renderCategoryTabs();
        rebuildNodeSelect('');
        sel.value = kind;
        renderFields(kind);
      });
      quickPicksWrap.appendChild(chip);
    });
  }

  function rebuildNodeSelect(filterText){
    const current = sel.value || 'equip';
    const kinds = listNodeKinds(filterText);
    sel.innerHTML = '';
    if(!kinds.length){
      btn.disabled = true;
      btn.classList.remove('is-cancel');
      btn.textContent = 'No Matching Types';
      propsWrap.innerHTML = '<div class="placeholder">No node types match this filter.</div>';
      if(descriptionEl) descriptionEl.textContent = 'Try a different search term.';
      renderQuickPicks('');
      return false;
    }
    kinds.forEach((kind)=>{
      const opt = document.createElement('option');
      opt.value = kind;
      opt.textContent = getNodeMeta(kind).label;
      sel.appendChild(opt);
    });
    btn.disabled = false;
    sel.value = kinds.includes(current) ? current : kinds[0];
    return true;
  }

  function updateNodeBuilderUi(){
    const selectedKind = sel.value || 'equip';
    const meta = getNodeMeta(selectedKind);
    const active = !!(App.placement && App.placement.active && App.placement.kind === 'node');
    const label = active
      ? _getPlacementItemLabel('node', App.placement.item)
      : String(meta.label || 'Node');
    btn.disabled = !sel.options.length;
    btn.classList.toggle('is-cancel', active);
    btn.textContent = active ? 'Cancel Placement' : `Place ${label}`;
    if(descriptionEl && !active){
      descriptionEl.textContent = meta.description || 'Choose a preset. Open settings only when you need custom defaults.';
    }
    if(active && settingsDetails) settingsDetails.open = true;
  }
  App.refreshNodeBuilderUI = updateNodeBuilderUi;

  function syncNodeBuilderDetails(kind){
    const selectedKind = kind || sel.value || 'equip';
    const filterText = String(searchInput?.value || '').trim();
    if(browseDetails){
      browseDetails.open = !!filterText || !QUICK_PICK_KINDS.includes(selectedKind);
    }
    if(settingsDetails){
      const schema = NODE_SCHEMAS[selectedKind] || NODE_SCHEMAS.equip;
      const count = Array.isArray(schema?.props) ? schema.props.length : 0;
      settingsDetails.hidden = count <= 0;
      const summary = settingsDetails.querySelector('summary');
      if(summary) summary.textContent = count > 0 ? `Node Settings (${count})` : 'Node Settings';
    }
  }

  function renderFields(kind){
    const schema = NODE_SCHEMAS[kind] || NODE_SCHEMAS.equip;
    const meta = getNodeMeta(kind);
    propsWrap.innerHTML = '';
    const active = !!(App.placement && App.placement.active && App.placement.kind === 'node');
    if(descriptionEl){
      descriptionEl.textContent = active
        ? `Place ${_getPlacementItemLabel('node', App.placement.item)} on the canvas. Right-click or Esc cancels.`
        : (meta.description || 'Choose a preset. Open settings only when you need custom defaults.');
    }
    if(!schema.props || !schema.props.length){
      const div = document.createElement('div'); div.className='placeholder'; div.textContent='No configurable properties.'; propsWrap.appendChild(div);
      renderQuickPicks(kind);
      syncNodeBuilderDetails(kind);
      updateNodeBuilderUi();
      return;
    }
    schema.props.forEach(def=>{ propsWrap.appendChild(makeField(def)); });
    renderQuickPicks(kind);
    syncNodeBuilderDetails(kind);
    updateNodeBuilderUi();
  }

  rebuildNodeSelect('');
  renderCategoryTabs();
  renderFields(sel.value || 'equip');
  sel.addEventListener('change', ()=> renderFields(sel.value || 'equip'));
  if(searchInput){
    searchInput.addEventListener('input', ()=>{
      if(!rebuildNodeSelect(searchInput.value)) return;
      renderFields(sel.value || 'equip');
    });
    if(!searchInput.__globalShortcutHooked){
      window.addEventListener('keydown', (e)=>{
        const target = e.target;
        const tag = String(target?.tagName || '').toUpperCase();
        const isTypingTarget = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
        if(e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget){
          e.preventDefault();
          if(typeof App.focusSidebarPanel === 'function') App.focusSidebarPanel('addNodePanel');
          searchInput.focus();
          searchInput.select();
          return;
        }
        if(e.key === 'Escape' && document.activeElement === searchInput && searchInput.value){
          searchInput.value = '';
          if(rebuildNodeSelect('')) renderFields(sel.value || 'equip');
        }
      });
      searchInput.__globalShortcutHooked = true;
    }
  }

  btn.addEventListener('click', ()=>{
    if(App.placement && App.placement.active && App.placement.kind === 'node'){
      App.finishPlacement(false);
      if(App.canvas && typeof App.canvas.setDirty === 'function') App.canvas.setDirty(true, true);
      return;
    }
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
      if(typeof window.enforceNodeOverlayMinSize === 'function'){
        try{ window.enforceNodeOverlayMinSize(node); }catch(_e){}
      }
      beginNodePlacement(node);
    }catch(e){ console.error(e); }
  });
})();

(function(){
  const sidebar = document.getElementById('sidebar');
  const exampleSelect = document.getElementById('exampleSelect');
  const renderFpsSelect = document.getElementById('renderFpsSelect');
  const speedFactor = document.getElementById('speedFactor');
  const realtimeFactor = document.getElementById('realtimeFactorValue');
  const simStatusBadge = document.getElementById('simStatusBadge');
  const simStatusEngine = document.getElementById('simStatusEngine');
  const simStatusSpeed = document.getElementById('simStatusSpeed');
  const simStatusRender = document.getElementById('simStatusRender');
  const simStatusRealtime = document.getElementById('simStatusRealtime');
  const simStatusSelection = document.getElementById('simStatusSelection');
  const addNodePanel = document.getElementById('addNodePanel');
  const addGroupPanel = document.getElementById('addGroupPanel');
  const btnAddNode = document.getElementById('btnAddNode');
  const btnAddGroup = document.getElementById('btnAddGroup');
  const nodeKindSelect = document.getElementById('nodeKindSelect');
  const groupKindSelect = document.getElementById('groupKindSelect');
  const groupStopRate = document.getElementById('groupStopRate');
  const overviewQuickTip = document.getElementById('overviewQuickTip');
  const bgLayoutEnabled = document.getElementById('bgLayoutEnabled');
  if(!sidebar) return;
  const defaultCollapseState = {
    controls: false,
    backgroundPanel: true,
    addNodePanel: true,
    addGroupPanel: true,
    advancedPanel: true,
    shortcutPanel: true,
    fileControls: true
  };
  const collapsibleIds = ['controls', 'backgroundPanel', 'addNodePanel', 'addGroupPanel', 'advancedPanel', 'shortcutPanel', 'fileControls'];
  const accordionIds = ['backgroundPanel', 'addNodePanel', 'addGroupPanel', 'advancedPanel', 'shortcutPanel', 'fileControls'];
  const collapseKey = 'fact_sim_sidebar_panels_v4';

  function readCollapseState(){
    try{
      const raw = localStorage.getItem(collapseKey);
      if(raw) return { ...defaultCollapseState, ...(JSON.parse(raw) || {}) };
    }catch(_e){
      /* ignore */
    }
    return { ...defaultCollapseState };
  }

  function writeCollapseState(next){
    try{ localStorage.setItem(collapseKey, JSON.stringify(next || {})); }catch(_e){}
  }

  const collapseState = readCollapseState();

  function ensureHeaderChrome(header){
    if(!header || header.__headerChromeReady) return header;
    const labelText = String(header.textContent || '').trim();
    header.textContent = '';
    const label = document.createElement('span');
    label.className = 'panelHeaderLabel';
    label.textContent = labelText;
    const meta = document.createElement('span');
    meta.className = 'panelHeaderMeta';
    meta.hidden = true;
    header.appendChild(label);
    header.appendChild(meta);
    header.__labelEl = label;
    header.__metaEl = meta;
    header.__headerChromeReady = true;
    return header;
  }

  function setPanelMeta(panelId, text){
    const panel = document.getElementById(panelId);
    const header = ensureHeaderChrome(panel?.querySelector('.panelHeader'));
    const metaEl = header?.__metaEl;
    if(!metaEl) return;
    const value = String(text || '').trim();
    metaEl.hidden = !value;
    metaEl.textContent = value;
  }

  function setPanelCollapsed(panel, collapsed){
    if(!panel) return;
    panel.classList.toggle('sidebar-panel-collapsible', true);
    panel.classList.toggle('is-collapsed', !!collapsed);
    const header = ensureHeaderChrome(panel.querySelector('.panelHeader'));
    if(header){
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      header.dataset.collapsible = 'true';
    }
    collapseState[panel.id] = !!collapsed;
    writeCollapseState(collapseState);
  }

  function expandPanelExclusive(panelId){
    accordionIds.forEach((id)=>{
      const target = document.getElementById(id);
      if(!target) return;
      setPanelCollapsed(target, id !== panelId);
    });
  }

  collapsibleIds.forEach((id)=>{
    const panel = document.getElementById(id);
    if(!panel) return;
    const header = ensureHeaderChrome(panel.querySelector('.panelHeader'));
    if(!header) return;
    setPanelCollapsed(panel, !!collapseState[id]);
    if(header.__collapseHooked) return;
    const toggle = ()=>{
      if(panel.classList.contains('is-collapsed')){
        if(accordionIds.includes(panel.id)) expandPanelExclusive(panel.id);
        else setPanelCollapsed(panel, false);
        return;
      }
      setPanelCollapsed(panel, true);
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e)=>{
      if(e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggle();
    });
    header.__collapseHooked = true;
  });

  App.setSidebarPanelCollapsed = function(panelId, collapsed){
    const panel = document.getElementById(panelId);
    if(!panel) return false;
    if(!collapsed && accordionIds.includes(panelId)){
      expandPanelExclusive(panelId);
      return true;
    }
    setPanelCollapsed(panel, collapsed);
    return true;
  };

  App.focusSidebarPanel = function(panelId){
    const panel = document.getElementById(panelId);
    if(!panel) return false;
    if(accordionIds.includes(panelId)) expandPanelExclusive(panelId);
    else setPanelCollapsed(panel, false);
    return true;
  };

  function getSelectedOptionLabel(selectEl, fallback){
    if(!selectEl) return fallback || '--';
    return String(selectEl.options?.[selectEl.selectedIndex]?.textContent || selectEl.value || fallback || '--').trim();
  }

  function updateOverviewQuickTip(){
    if(!overviewQuickTip) return;
    const selectedMap = App.canvas && App.canvas.selected_nodes ? App.canvas.selected_nodes : null;
    const count = selectedMap ? Object.keys(selectedMap).length : 0;
    if(App.placement?.active){
      const label = _getPlacementItemLabel(App.placement.kind, App.placement.item);
      overviewQuickTip.textContent = `Place ${label}. Right-click or Esc cancels.`;
      return;
    }
    if(count > 0){
      overviewQuickTip.textContent = `${count} node${count === 1 ? '' : 's'} selected. Edit in Inspector.`;
      return;
    }
    if(exampleSelect?.value){
      overviewQuickTip.textContent = `${getSelectedOptionLabel(exampleSelect, 'Example')} is ready. Press Start to run.`;
      return;
    }
    overviewQuickTip.textContent = 'Load an example or open Add Node to begin.';
  }

  function updateSidebarSummaries(){
    const running = (typeof window.isSimRunning === 'function') ? !!window.isSimRunning() : false;
    const readyLabel = running ? 'Running' : (exampleSelect?.value ? 'Ready' : 'Idle');
    setPanelMeta('controls', `${getSelectedOptionLabel(exampleSelect, 'Manual')} · ${readyLabel}`);

    const bgMeta = (App.backgroundLayout && typeof App.backgroundLayout.getMeta === 'function')
      ? App.backgroundLayout.getMeta()
      : null;
    let bgSummary = 'No image';
    if(bgMeta?.hasImage){
      bgSummary = bgMeta.enabled ? 'Visible' : 'Hidden';
      if(bgMeta.mouseEdit) bgSummary += ' · Edit';
    }
    setPanelMeta('backgroundPanel', bgSummary);

    if(App.placement?.active && App.placement.kind === 'node'){
      setPanelMeta('addNodePanel', `Placing ${_getPlacementItemLabel('node', App.placement.item)}`);
    }else{
      setPanelMeta('addNodePanel', getSelectedOptionLabel(nodeKindSelect, 'Quick Add'));
    }

    if(App.placement?.active && App.placement.kind === 'group'){
      setPanelMeta('addGroupPanel', `Placing ${_getPlacementItemLabel('group', App.placement.item)}`);
    }else{
      const groupLabel = getSelectedOptionLabel(groupKindSelect, 'Stop Group');
      const rateText = String(groupStopRate?.dataset?.rateText || '')
        || String(groupStopRate?.textContent || '').replace(/^Downtime:\s*/i, '').trim();
      setPanelMeta('addGroupPanel', rateText && rateText !== '-' ? `${groupLabel} · ${rateText} down` : groupLabel);
    }

    setPanelMeta('advancedPanel', `${getSelectedOptionLabel(simModeSelect, 'dt')} · ${renderFpsSelect?.value || '60'} fps`);
    setPanelMeta('shortcutPanel', 'Undo · Layout');
    setPanelMeta('fileControls', 'Save · Load · Share');
  }

  App.onPlacementStateChange = ()=>{
    if(typeof App.refreshNodeBuilderUI === 'function') App.refreshNodeBuilderUI();
    if(typeof App.refreshGroupBuilderUI === 'function') App.refreshGroupBuilderUI();
    updateOverviewQuickTip();
    updateSidebarSummaries();
  };
  App.refreshSidebarChrome = ()=>{
    updateSimulationSummary();
    updateOverviewQuickTip();
    updateSidebarSummaries();
  };

  function updateSimulationSummary(){
    const running = (typeof window.isSimRunning === 'function') ? !!window.isSimRunning() : false;
    if(btnStart){
      btnStart.disabled = running;
      btnStart.setAttribute('aria-pressed', running ? 'true' : 'false');
    }
    if(btnStop){
      btnStop.disabled = !running;
      btnStop.setAttribute('aria-pressed', running ? 'true' : 'false');
    }
    if(simStatusBadge){
      simStatusBadge.textContent = running ? 'Running' : 'Stopped';
      simStatusBadge.classList.toggle('is-running', running);
    }
    if(simStatusEngine && simModeSelect){
      const label = simModeSelect.options[simModeSelect.selectedIndex]?.textContent || simModeSelect.value || '--';
      simStatusEngine.textContent = label;
    }
    if(simStatusSpeed) simStatusSpeed.textContent = (speedFactor?.textContent || '--').replace(/^0?\.?/, (m)=> m);
    if(simStatusRender) simStatusRender.textContent = renderFpsSelect ? `${renderFpsSelect.value} FPS` : '--';
    if(simStatusRealtime) simStatusRealtime.textContent = realtimeFactor?.textContent || '--';
    if(simStatusSelection){
      const selectedMap = App.canvas && App.canvas.selected_nodes ? App.canvas.selected_nodes : null;
      const count = selectedMap ? Object.keys(selectedMap).length : 0;
      simStatusSelection.textContent = `${count} node${count === 1 ? '' : 's'}`;
    }
    updateOverviewQuickTip();
    updateSidebarSummaries();
  }

  function installSubmitShortcut(panel, actionButton){
    if(!panel || !actionButton || panel.__submitShortcutHooked) return;
    panel.addEventListener('keydown', (e)=>{
      const target = e.target;
      if(!target || target.tagName === 'BUTTON') return;
      if(target.tagName === 'TEXTAREA'){
        if(!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
      }else if(e.key !== 'Enter'){
        return;
      }
      if(actionButton.disabled) return;
      e.preventDefault();
      actionButton.click();
    });
    panel.__submitShortcutHooked = true;
  }

  installSubmitShortcut(addNodePanel, btnAddNode);
  installSubmitShortcut(addGroupPanel, btnAddGroup);

  if(exampleSelect && !exampleSelect.__summaryHooked){
    exampleSelect.addEventListener('change', updateSimulationSummary);
    exampleSelect.__summaryHooked = true;
  }
  if(renderFpsSelect && !renderFpsSelect.__summaryHooked){
    renderFpsSelect.addEventListener('change', updateSimulationSummary);
    renderFpsSelect.__summaryHooked = true;
  }
  if(simModeSelect && !simModeSelect.__summaryHooked){
    simModeSelect.addEventListener('change', updateSimulationSummary);
    simModeSelect.__summaryHooked = true;
  }
  if(nodeKindSelect && !nodeKindSelect.__summaryHooked){
    nodeKindSelect.addEventListener('change', updateSidebarSummaries);
    nodeKindSelect.__summaryHooked = true;
  }
  if(groupKindSelect && !groupKindSelect.__summaryHooked){
    groupKindSelect.addEventListener('change', updateSidebarSummaries);
    groupKindSelect.__summaryHooked = true;
  }
  if(bgLayoutEnabled && !bgLayoutEnabled.__summaryHooked){
    bgLayoutEnabled.addEventListener('change', updateSidebarSummaries);
    bgLayoutEnabled.__summaryHooked = true;
  }

  updateSimulationSummary();
  window.setInterval(updateSimulationSummary, 250);
})();

