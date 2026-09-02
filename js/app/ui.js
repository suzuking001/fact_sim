// UI wiring (controls, modals, sidebar, title editor, add node panel)

var App = window.App || (window.App = {});

function initLiteContextMenuStyler(){
  if(App.__liteContextMenuStylerReady) return;
  App.__liteContextMenuStylerReady = true;

  const DANGER_RE = /^(delete|clear|reset memo style)/i;
  const MUTED_RE = /^(rename|resize|fit view|fit to screen|auto layout|center view|select nodes|duplicate)/i;
  const UI_FONT = '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  const shouldSuppressContextMenu = ()=> Number(App.__suppressContextMenusUntil || 0) > Date.now();
  const MENU_PALETTE = Object.freeze({
    baseText: '#1d1d1f',
    disabledText: 'rgba(29,29,31,0.42)',
    mutedText: 'rgba(60,60,67,0.68)',
    dangerText: '#b42318',
    separatorBorder: '1px solid rgba(17,17,17,0.08)',
    hoverBg: 'rgba(10,132,255,0.12)',
    hoverBorder: 'rgba(10,132,255,0.22)',
    hoverText: '#005ecb',
    dangerHoverBg: 'rgba(180,35,24,0.08)',
    dangerHoverBorder: 'rgba(180,35,24,0.16)',
    dangerHoverText: '#7a1d16',
    menuBorder: '1px solid rgba(255,255,255,0.88)',
    menuBg: 'rgba(255,255,255,0.82)',
    menuShadow: '0 28px 72px rgba(15,23,42,0.18)',
    menuText: '#1d1d1f'
  });

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
    if(!(entry instanceof HTMLElement)) return;
    const text = String(entry.textContent || '').trim();
    const theme = MENU_PALETTE;
    entry.style.setProperty('background', 'transparent', 'important');
    entry.style.setProperty('background-color', 'transparent', 'important');
    entry.style.setProperty('background-image', 'none', 'important');
    entry.style.setProperty('color', theme.baseText, 'important');
    entry.style.setProperty('border-radius', '13px', 'important');
    entry.style.setProperty('border', '1px solid transparent', 'important');
    entry.style.setProperty('font-family', UI_FONT, 'important');

    if(entry.classList.contains('separator')){
      entry.style.setProperty('min-height', '0', 'important');
      entry.style.setProperty('padding', '0', 'important');
      entry.style.setProperty('margin', '6px 2px', 'important');
      entry.style.setProperty('border-radius', '0', 'important');
      entry.style.setProperty('border', '0', 'important');
      entry.style.setProperty('border-bottom', theme.separatorBorder, 'important');
      return;
    }

    if(DANGER_RE.test(text)) entry.classList.add('fact-menu-danger');
    else if(MUTED_RE.test(text)) entry.classList.add('fact-menu-muted');

    if(!entry.__factStyledEntry){
      entry.__factStyledEntry = true;
      entry.addEventListener('mouseenter', ()=>{
        const hoverTheme = MENU_PALETTE;
        if(entry.classList.contains('fact-menu-danger')){
          entry.style.setProperty('background', hoverTheme.dangerHoverBg, 'important');
          entry.style.setProperty('background-color', hoverTheme.dangerHoverBg, 'important');
          entry.style.setProperty('border-color', hoverTheme.dangerHoverBorder, 'important');
          entry.style.setProperty('color', hoverTheme.dangerHoverText, 'important');
        }else{
          entry.style.setProperty('background', hoverTheme.hoverBg, 'important');
          entry.style.setProperty('background-color', hoverTheme.hoverBg, 'important');
          entry.style.setProperty('border-color', hoverTheme.hoverBorder, 'important');
          entry.style.setProperty('color', hoverTheme.hoverText, 'important');
        }
      });
      entry.addEventListener('mouseleave', ()=> applyEntryStyles(entry));
    }

    if(entry.matches(':hover')) return;
    entry.style.setProperty('background', 'transparent', 'important');
    entry.style.setProperty('background-color', 'transparent', 'important');
    entry.style.setProperty('border-color', 'transparent', 'important');
    let color = theme.baseText;
    if(entry.classList.contains('disabled')) color = theme.disabledText;
    else if(entry.classList.contains('fact-menu-danger')) color = theme.dangerText;
    else if(entry.classList.contains('fact-menu-muted')) color = theme.mutedText;
    entry.style.setProperty('color', color, 'important');
  };

  const applyMenuStyles = (menu)=>{
    if(!(menu instanceof HTMLElement)) return;
    if(shouldSuppressContextMenu()){
      menu.remove();
      return;
    }
    const theme = MENU_PALETTE;
    pruneRedundantEntries(menu);
    Object.assign(menu.style, {
      border: theme.menuBorder,
      borderRadius: '20px',
      background: theme.menuBg,
      boxShadow: theme.menuShadow,
      backdropFilter: 'blur(22px) saturate(1.35)',
      padding: '8px',
      minWidth: '236px',
      color: theme.menuText,
      fontFamily: UI_FONT
    });
    clampMenuToViewport(menu);
    menu.querySelectorAll('.litemenu-entry').forEach(applyEntryStyles);
  };

  const scan = ()=>{
    document.querySelectorAll('.litegraph.litecontextmenu').forEach(applyMenuStyles);
  };

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  App.refreshLiteContextMenuStyles = scan;
  scan();
}

initLiteContextMenuStyler();

(function initUiAppearance(){
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', '#f5f5f7');
  if(typeof App.refreshGraphTheme === 'function') App.refreshGraphTheme();
  try{
    const refreshTimeline = ()=>{
      if(!App.timelineChart) return;
      if(typeof App.timelineChart.draw === 'function') App.timelineChart.draw();
      if(typeof App.timelineChart.resize === 'function') App.timelineChart.resize();
    };
    if(typeof window.requestAnimationFrame === 'function'){
      window.requestAnimationFrame(()=> refreshTimeline());
    }else{
      refreshTimeline();
    }
  }catch(_e){}
  if(typeof App.refreshLiteContextMenuStyles === 'function') App.refreshLiteContextMenuStyles();
})();

// Controls
const btnStart = document.getElementById('btnStart');
if(btnStart) btnStart.onclick = ()=>{
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()){
    stopSimulation();
  }else{
    startSimulation();
  }
};

const btnReset = document.getElementById('btnReset');
if(btnReset) btnReset.onclick = ()=>{
  if(typeof App.resetToInitialState === 'function'){
    Promise.resolve(App.resetToInitialState()).catch((err)=>{
      console.error(err);
      alert('Reset failed');
    });
    return;
  }
  stopSimulation();
  initGraph();
};

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
  const supportedModes = (typeof App.getSupportedSimModes === 'function')
    ? App.getSupportedSimModes()
    : ['dt', 'event', 'event-fast'];
  for(const mode of supportedModes){
    const value = String(mode || '').trim();
    if(!value) continue;
    const exists = Array.from(simModeSelect.options || []).some((option)=> option.value === value);
    if(exists) continue;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = (typeof App.getSimModeLabel === 'function') ? App.getSimModeLabel(value) : value;
    simModeSelect.appendChild(option);
  }
  const readPreferredMode = ()=>{
    try{ return String(localStorage.getItem('fact_sim_sim_mode') || '').trim(); }catch(_e){ return ''; }
  };
  const savePreferredMode = (mode)=>{
    try{ localStorage.setItem('fact_sim_sim_mode', String(mode || 'event')); }catch(_e){}
  };
  const updateModeHint = (mode)=>{
    const hint = document.getElementById('simModeHint');
    if(!hint) return;
    if(mode === 'dt'){
      hint.innerHTML = '<strong>dt</strong> is the fixed-step validation baseline. Use <strong>event</strong> for faster production runs.';
    }else if(mode === 'event'){
      hint.innerHTML = '<strong>Recommended.</strong> Event scheduling skips unchanged nodes and preserves strict parity with dt.';
    }else{
      hint.innerHTML = 'Fast engines are useful for benchmarks and large models. Validate changes against dt before release.';
    }
  };
  const preferredMode = readPreferredMode() || App.simMode || 'event';
  const supportedValues = Array.from(simModeSelect.options || []).map((option)=>option.value);
  const initialMode = supportedValues.includes(preferredMode) ? preferredMode : 'event';
  let currentMode = (App.setSimMode ? App.setSimMode(initialMode) : initialMode);
  simModeSelect.value = currentMode;
  updateModeHint(currentMode);
  simModeSelect.addEventListener('change', ()=>{
    const mode = (App.setSimMode ? App.setSimMode(simModeSelect.value) : simModeSelect.value);
    simModeSelect.value = mode;
    savePreferredMode(mode);
    updateModeHint(mode);
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
    App.showToast(`Render FPS target: ${next}`);
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
        wallMs: 2000,
        realStepMs: 16,
        modes: (typeof App.getBenchmarkSimModes === 'function') ? App.getBenchmarkSimModes() : ((typeof App.getSupportedSimModes === 'function') ? App.getSupportedSimModes() : ['dt', 'event', 'event-fast']),
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

// Sidebar drawer (drag rail)
(function(){
  const rail = document.getElementById('sidebarDragRail');
  const sidebar = document.getElementById('sidebar');
  const body = document.body;
  if(!rail || !sidebar || !body) return;

  const hideSnapW = 72;
  let mode = '';
  let sidebarWidth = 0;
  let currentVisibleWidth = 0;
  const readSavedState = ()=>{
    try{
      return localStorage.getItem('sidebar-hidden') === '1';
    }catch(_e){
      return false;
    }
  };
  const getSidebarWidth = ()=>{
    const rect = sidebar.getBoundingClientRect();
    if(rect && rect.width > 0) return rect.width;
    try{
      const raw = String(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width') || '').trim();
      const parsed = parseFloat(raw);
      if(isFinite(parsed) && parsed > 0) return parsed;
    }catch(_e){}
    return 340;
  };
  const canUseDesktopDrag = ()=> !body.classList.contains('mobile-ui') && !body.classList.contains('tablet-ui');
  const setCursor = (value)=>{
    const next = value || '';
    try{ document.documentElement.style.cursor = next; }catch(_e){}
    body.style.cursor = next;
  };
  const clearDragStyles = ()=>{
    body.classList.remove('sidebar-dragging');
    sidebar.style.removeProperty('transform');
    rail.style.removeProperty('left');
    setCursor('');
  };
  const clampVisibleWidth = (value)=>{
    const width = sidebarWidth || getSidebarWidth();
    const next = Number(value);
    if(!isFinite(next)) return width;
    return Math.max(0, Math.min(width, next));
  };
  const positionRail = (visibleWidth)=>{
    const left = Math.max(0, Math.round(clampVisibleWidth(visibleWidth) - 8));
    rail.style.left = `${left}px`;
  };
  const applySidebarPreview = (visibleWidth)=>{
    const desired = clampVisibleWidth(visibleWidth);
    currentVisibleWidth = desired;
    const width = sidebarWidth || getSidebarWidth();
    sidebar.style.transform = `translateX(${Math.round(desired - width)}px)`;
    positionRail(desired);
  };
  // initial state from localStorage
  try{
    if(readSavedState()) body.classList.add('sidebar-hidden');
  }catch(e){}
  const updateRailState = ()=>{
    const hidden = body.classList.contains('sidebar-hidden');
    rail.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    const label = hidden ? 'Drag right to show side panel' : 'Drag left on edge to hide side panel';
    rail.setAttribute('aria-label', label);
    rail.title = label;
  };
  const setSidebarHidden = (hidden, options)=>{
    const opt = options || {};
    const next = !!hidden;
    clearDragStyles();
    body.classList.toggle('sidebar-hidden', next);
    if(opt.persist !== false && !body.classList.contains('mobile-ui')){
      try{ localStorage.setItem('sidebar-hidden', next ? '1' : '0'); }catch(_e){}
    }
    updateRailState();
    try{ if(App.canvas && App.canvas.draw) App.canvas.draw(true,true); }catch(_e){}
    try{
      if(opt.syncMobileUi === false) return;
      if(typeof App.syncMobileUiState === 'function') App.syncMobileUiState();
    }catch(_e){}
  };
  App.isSidebarHidden = ()=> body.classList.contains('sidebar-hidden');
  App.setSidebarHidden = setSidebarHidden;
  App.toggleSidebarHidden = ()=> setSidebarHidden(!body.classList.contains('sidebar-hidden'));
  App.getSavedSidebarHidden = readSavedState;
  updateRailState();

  rail.addEventListener('mousedown', (event)=>{
    if(!canUseDesktopDrag() || event.button !== 0) return;
    sidebarWidth = getSidebarWidth();
    currentVisibleWidth = body.classList.contains('sidebar-hidden') ? 0 : sidebarWidth;
    mode = body.classList.contains('sidebar-hidden') ? 'reveal' : 'dock';
    body.classList.add('sidebar-dragging');
    setCursor('ew-resize');
    if(mode === 'reveal'){
      setSidebarHidden(false, { persist:false, syncMobileUi:false });
      body.classList.add('sidebar-dragging');
      setCursor('ew-resize');
      applySidebarPreview(sidebarWidth);
    }
    event.preventDefault();
  });

  window.addEventListener('mousemove', (event)=>{
    if(!mode) return;
    const desired = clampVisibleWidth(event.clientX);
    if(desired <= hideSnapW){
      currentVisibleWidth = 0;
      setSidebarHidden(true, { persist:false, syncMobileUi:false });
      body.classList.add('sidebar-dragging');
      setCursor('ew-resize');
      positionRail(0);
      return;
    }
    if(body.classList.contains('sidebar-hidden')){
      setSidebarHidden(false, { persist:false, syncMobileUi:false });
      body.classList.add('sidebar-dragging');
      setCursor('ew-resize');
    }
    applySidebarPreview(desired);
  });

  rail.addEventListener('keydown', (event)=>{
    if(event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    App.toggleSidebarHidden();
  });

  window.addEventListener('mouseup', ()=>{
    if(!mode) return;
    const wasMode = mode;
    const shouldHide = currentVisibleWidth <= hideSnapW;
    mode = '';
    setSidebarHidden(shouldHide);
    if(typeof App.showToast === 'function' && (wasMode === 'dock' || wasMode === 'reveal')){
      App.showToast(shouldHide ? 'Menu hidden' : 'Menu shown');
    }
  });

  window.addEventListener('resize', ()=>{
    mode = '';
    clearDragStyles();
    updateRailState();
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

// Phone viewer layout and bottom navigation
(function(){
  const body = document.body;
  const nav = document.getElementById('mobileNav');
  const dock = document.getElementById('timelineDock');
  if(!nav || !dock) return;
  const buttons = Array.from(nav.querySelectorAll('.mobileNavBtn[data-mobile-panel]'));
  const query = window.matchMedia('(max-width: 760px)');
  let activePanel = 'graph';
  let desktopSidebarHidden = !!(typeof App.getSavedSidebarHidden === 'function'
    ? App.getSavedSidebarHidden()
    : body.classList.contains('sidebar-hidden'));
  let desktopTimelineHidden = body.classList.contains('timeline-hidden');

  const panelToDockView = (panel)=>{
    if(panel === 'nodes') return 'props';
    if(panel === 'details') return 'inspector';
    return 'chart';
  };

  const detectActivePanel = ()=>{
    if(!body.classList.contains('mobile-ui')) return activePanel;
    if(!body.classList.contains('sidebar-hidden')) return 'run';
    if(!body.classList.contains('timeline-hidden')){
      const view = dock.dataset.view || 'chart';
      if(view === 'props') return 'nodes';
      if(view === 'inspector') return 'details';
      return 'timeline';
    }
    return 'graph';
  };

  const syncButtons = ()=>{
    const panel = detectActivePanel();
    activePanel = panel;
    nav.dataset.activePanel = panel;
    buttons.forEach((button)=>{
      const isActive = button.dataset.mobilePanel === panel;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const schedulePanelEnforcement = (panel)=>{
    window.requestAnimationFrame(()=>{
      if(!body.classList.contains('mobile-ui')) return;
      if(activePanel !== panel) return;
      if(panel === 'run'){
        if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(true, { toast:false });
        if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(false, { persist:false, syncMobileUi:false });
      }else if(panel === 'graph'){
        if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(true, { persist:false, syncMobileUi:false });
        if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(true, { toast:false });
      }else{
        const dockView = panelToDockView(panel);
        if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(true, { persist:false, syncMobileUi:false });
        if(typeof App.setTimelineDockView === 'function') App.setTimelineDockView(dockView);
        if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(false, { toast:false });
      }
      syncButtons();
    });
  };

  const applyMobilePanel = (panel)=>{
    const requestedPanel = String(panel || 'graph');
    activePanel = requestedPanel;
    if(!body.classList.contains('mobile-ui')){
      syncButtons();
      return;
    }
    if(requestedPanel === 'run'){
      if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(true, { toast:false });
      if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(false, { persist:false, syncMobileUi:false });
    }else if(requestedPanel === 'graph'){
      if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(true, { persist:false, syncMobileUi:false });
      if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(true, { toast:false });
    }else{
      if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(true, { persist:false, syncMobileUi:false });
      if(typeof App.setTimelineDockView === 'function') App.setTimelineDockView(panelToDockView(requestedPanel));
      if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(false, { toast:false });
    }
    activePanel = requestedPanel;
    syncButtons();
    schedulePanelEnforcement(requestedPanel);
    window.dispatchEvent(new Event('resize'));
  };

  App.setMobileUiPanel = applyMobilePanel;
  App.syncMobileUiState = syncButtons;

  buttons.forEach((button)=>{
    button.addEventListener('click', ()=> applyMobilePanel(button.dataset.mobilePanel));
  });

  ['timelineTabChart', 'timelineTabProps', 'timelineTabInspector'].forEach((id)=>{
    const button = document.getElementById(id);
    if(!button) return;
    button.addEventListener('click', ()=>{
      if(!body.classList.contains('mobile-ui')) return;
      syncButtons();
    });
  });

  const updateMode = ()=>{
    const mobile = query.matches;
    body.classList.toggle('mobile-ui', mobile);
    if(mobile){
      desktopSidebarHidden = body.classList.contains('sidebar-hidden');
      desktopTimelineHidden = body.classList.contains('timeline-hidden');
      applyMobilePanel('graph');
    }else{
      if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(desktopSidebarHidden, { persist:false });
      if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(desktopTimelineHidden, { toast:false });
      syncButtons();
    }
    window.dispatchEvent(new Event('resize'));
  };

  const syncFromMutations = ()=>{
    if(!body.classList.contains('mobile-ui')) return;
    syncButtons();
  };

  const bodyObserver = new MutationObserver(syncFromMutations);
  bodyObserver.observe(body, { attributes:true, attributeFilter:['class'] });
  const dockObserver = new MutationObserver(syncFromMutations);
  dockObserver.observe(dock, { attributes:true, attributeFilter:['data-view'] });

  if(typeof query.addEventListener === 'function'){
    query.addEventListener('change', updateMode);
  }else if(typeof query.addListener === 'function'){
    query.addListener(updateMode);
  }

  window.addEventListener('resize', syncFromMutations);
  window.addEventListener('load', ()=>{
    if(!body.classList.contains('mobile-ui')) return;
    window.setTimeout(()=> applyMobilePanel('graph'), 0);
    window.setTimeout(()=> applyMobilePanel('graph'), 240);
  });
  updateMode();
})();

// Tablet light editor action bar
(function(){
  const body = document.body;
  const bar = document.getElementById('tabletActionBar');
  if(!bar) return;
  const buttons = Array.from(bar.querySelectorAll('.tabletActionBtn[data-tablet-action]'));
  const query = window.matchMedia('(min-width: 761px) and (max-width: 1180px)');
  let activeAction = 'run';
  let desktopSidebarHidden = !!(typeof App.getSavedSidebarHidden === 'function'
    ? App.getSavedSidebarHidden()
    : body.classList.contains('sidebar-hidden'));
  let desktopTimelineHidden = body.classList.contains('timeline-hidden');

  const syncButtons = ()=>{
    buttons.forEach((button)=>{
      const isActive = button.dataset.tabletAction === activeAction;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    bar.dataset.activeAction = activeAction;
  };

  const removeSelectedNodes = ()=>{
    if(!App.graph || !App.canvas) return 0;
    const selected = Object.values(App.canvas.selected_nodes || {}).filter(Boolean);
    if(!selected.length) return 0;
    try{
      if(typeof App.graph.beforeChange === 'function') App.graph.beforeChange();
      selected.forEach((node)=>{
        try{ App.graph.remove(node); }catch(_e){}
      });
      if(typeof App.graph.afterChange === 'function') App.graph.afterChange();
    }catch(_e){}
    try{
      if(typeof App.canvas.setDirty === 'function') App.canvas.setDirty(true, true);
    }catch(_e){}
    return selected.length;
  };

  const applyAction = (action)=>{
    activeAction = String(action || 'run');
    if(!body.classList.contains('tablet-ui')){
      syncButtons();
      return;
    }
    if(activeAction === 'run'){
      if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(true, { toast:false });
      if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(false, { persist:false, syncMobileUi:false });
    }else if(activeAction === 'add-node'){
      if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(true, { toast:false });
      if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(false, { persist:false, syncMobileUi:false });
      if(typeof App.focusSidebarPanel === 'function') App.focusSidebarPanel('addNodePanel');
      if(typeof App.showToast === 'function') App.showToast('Add Node is ready');
    }else if(activeAction === 'timeline'){
      if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(true, { persist:false, syncMobileUi:false });
      if(typeof App.setTimelineDockView === 'function') App.setTimelineDockView('chart');
      if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(false, { toast:false });
    }else if(activeAction === 'details'){
      if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(true, { persist:false, syncMobileUi:false });
      if(typeof App.setTimelineDockView === 'function') App.setTimelineDockView('inspector');
      if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(false, { toast:false });
    }else if(activeAction === 'delete'){
      const removed = removeSelectedNodes();
      if(typeof App.showToast === 'function'){
        App.showToast(removed ? `Deleted ${removed} node${removed === 1 ? '' : 's'}` : 'No selected nodes');
      }
    }
    syncButtons();
    window.dispatchEvent(new Event('resize'));
  };

  App.setTabletUiAction = applyAction;

  buttons.forEach((button)=>{
    button.addEventListener('click', ()=> applyAction(button.dataset.tabletAction));
  });

  const updateMode = ()=>{
    const tablet = query.matches;
    body.classList.toggle('tablet-ui', tablet);
    if(tablet){
      desktopSidebarHidden = body.classList.contains('sidebar-hidden');
      desktopTimelineHidden = body.classList.contains('timeline-hidden');
      if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(true, { persist:false, syncMobileUi:false });
      if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(true, { toast:false });
      activeAction = 'run';
      syncButtons();
    }else{
      if(typeof App.setSidebarHidden === 'function') App.setSidebarHidden(desktopSidebarHidden, { persist:false, syncMobileUi:false });
      if(typeof App.setTimelineHidden === 'function') App.setTimelineHidden(desktopTimelineHidden, { toast:false });
      syncButtons();
    }
    window.dispatchEvent(new Event('resize'));
  };

  if(typeof query.addEventListener === 'function'){
    query.addEventListener('change', updateMode);
  }else if(typeof query.addListener === 'function'){
    query.addListener(updateMode);
  }

  window.addEventListener('load', ()=>{
    if(!body.classList.contains('tablet-ui')) return;
    window.setTimeout(()=> applyAction('run'), 0);
    window.setTimeout(()=> applyAction('run'), 240);
  });

  updateMode();
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
  const inputEvents = (typeof App.getCanvasInputEvents === 'function')
    ? App.getCanvasInputEvents()
    : { down:'mousedown', move:'mousemove' };

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
    target.addEventListener(inputEvents.move, handleMouseMove, opts);
    target.addEventListener(inputEvents.down, handleMouseDown, opts);
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
  if(!sel || !btn) return;
  const NODE_SCHEMAS = {
    machine:{ type:'factory/basic', props:[
      { key:'title', label:'Title', type:'text', default:'Machine', target:'title' },
      { key:'presetId', label:'Preset', type:'select', default:'machine', options:['machine'] },
      { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
      { key:'contentCapacity', label:'Capacity', type:'number', min:1, step:1, default:1 }
    ]},
    inspection:{ type:'factory/basic', props:[
      { key:'title', label:'Title', type:'text', default:'Inspection', target:'title' },
      { key:'presetId', label:'Preset', type:'select', default:'inspection', options:['inspection'] },
      { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 }
    ]},
    buffer:{ type:'factory/basic', props:[
      { key:'title', label:'Title', type:'text', default:'Buffer', target:'title' },
      { key:'presetId', label:'Preset', type:'select', default:'buffer', options:['buffer'] },
      { key:'contentCapacity', label:'Capacity', type:'number', min:1, step:1, default:10 }
    ]},
    conveyor:{ type:'factory/basic', props:[
      { key:'title', label:'Title', type:'text', default:'Conveyor', target:'title' },
      { key:'presetId', label:'Preset', type:'select', default:'conveyor', options:['conveyor'] },
      { key:'processTime', label:'Travel Time (s)', type:'number', min:0, step:0.1, default:1 }
    ]},
    router:{ type:'factory/basic', props:[
      { key:'title', label:'Title', type:'text', default:'Router', target:'title' },
      { key:'presetId', label:'Preset', type:'select', default:'router', options:['router'] }
    ]},
    pack:{ type:'factory/basic', props:[
      { key:'title', label:'Title', type:'text', default:'Attach', target:'title' },
      { key:'presetId', label:'Preset', type:'select', default:'pack', options:['pack'] },
      { key:'processTime', label:'Handling Time (s)', type:'number', min:0, step:0.1, default:1 }
    ]},
    unpack:{ type:'factory/basic', props:[
      { key:'title', label:'Title', type:'text', default:'Detach', target:'title' },
      { key:'presetId', label:'Preset', type:'select', default:'unpack', options:['unpack'] },
      { key:'processTime', label:'Handling Time (s)', type:'number', min:0, step:0.1, default:1 }
    ]},
    basic:{ type:'factory/basic', props:[
      { key:'title', label:'Title', type:'text', default:'Basic Node', target:'title' },
      { key:'presetId', label:'Preset', type:'select', default:'basic', options:['basic'] },
      { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:0 },
      { key:'contentCapacity', label:'Capacity', type:'number', min:1, step:1, default:1 }
    ]},
    equip:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Equipment', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'machine', options:['machine'] },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 }
      ]
    },
    note:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Memo', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'note', options:['note'] },
        { key:'text', label:'Text', type:'textarea', rows:6, default:'Equipment memo...' },
        { key:'fontSize', label:'Font Size (px)', type:'number', min:10, max:64, step:1, default:13 },
        { key:'backgroundColor', label:'Background Color', type:'color', default:'#f8fafc' },
        { key:'textColor', label:'Text Color', type:'color', default:'#0f172a' }
      ]
    },
    signal:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Signal', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'signal', options:['signal'] }
      ]
    },
    shuttle:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Shuttle Stage', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'shuttle', options:['shuttle'] },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 }
      ]
    },
    merge:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Merge', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'merge', options:['merge'] },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'processTime2', label:'Process Time N (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 }
      ]
    },
    join:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Join', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'join', options:['join'] },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:5 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:6 }
      ]
    },
    source:{
      type:'factory/basic',
      flowTemplate:'sequence',
      props:[
        { key:'title', label:'Title', type:'text', default:'Source', target:'title' }
      ]
    },
    entitysource:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Entity Source', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'source', options:['source'] },
        { key:'sourceMode', label:'Source Mode', type:'select', default:'entity', options:['entity'] },
        { key:'rootKind', label:'Root Kind', type:'select', default:'container', options:['pallet', 'carrier', 'container', 'ship'] },
        { key:'rootId', label:'Root ID', type:'text', default:'Container-1' },
        { key:'capacity', label:'Child Capacity', type:'number', min:0, step:1, default:20 },
        { key:'accepts', label:'Accepted Kinds', type:'text', default:'pallet' },
        { key:'initialContents', label:'Initial Hierarchy Paths', type:'textarea', rows:5, default:'pallet:P-1[6]/work:W-1\npallet:P-1[6]/work:W-2' }
      ]
    },
    sink:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Sink', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'sink', options:['sink'] }
      ]
    },
    split:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Split', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'split', options:['split'] },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 },
        { key:'ratio', label:'Ratio (0-1)', type:'number', min:0, max:1, step:0.1, default:0.5 }
      ]
    },
    branch:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Branch', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'router', options:['router'] },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 }
      ]
    },
    agvroute:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Transport Route', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'carrier_route', options:['carrier_route'] },
        { key:'transportMode', label:'Transport Mode', type:'select', default:'agv', options:['agv'] },
        { key:'processTime', label:'Travel Time (s)', type:'number', min:0, step:0.1, default:3 },
        { key:'downTime', label:'Dispatch Delay (s)', type:'number', min:0, step:0.1, default:0.5 },
        { key:'agvCapacity', label:'AGV Capacity', type:'number', min:1, step:1, default:2 },
        { key:'agvIds', label:'Initial AGV IDs', type:'textarea', default:'AGV-1,AGV-2' }
      ]
    },
    carrierroute:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Transport Route', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'carrier_route', options:['carrier_route'] },
        { key:'transportMode', label:'Transport Mode', type:'select', default:'carrier', options:['carrier'] },
        { key:'processTime', label:'Travel Time (s)', type:'number', min:0, step:0.1, default:3 },
        { key:'downTime', label:'Dispatch Delay (s)', type:'number', min:0, step:0.1, default:0.5 },
        { key:'initialCarrier', label:'Initial Carrier ID', type:'text', default:'' },
        { key:'outSequence', label:'Carrier OUT Sequence (1-based, comma)', type:'textarea', default:'' }
      ]
    },
    station:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Store', target:'title' },
        { key:'presetId', label:'Preset', type:'select', default:'station', options:['station'] },
        { key:'processTime', label:'Process Time (s)', type:'number', min:0, step:0.1, default:2 },
        { key:'downTime', label:'Down Time (s)', type:'number', min:0, step:0.1, default:3 },
        { key:'palletWorkCapacity', label:'Pallet Work Capacity', type:'number', min:1, step:1, default:6 }
      ]
    },
    transferstation:{
      type:'factory/basic',
      props:[
        { key:'title', label:'Title', type:'text', default:'Transfer Station', target:'title' },
        { key:'presetId', label:'Node Preset', type:'select', default:'transfer', options:['transfer'] },
        { key:'preset', label:'Preset', type:'select', default:'work_to_pallet', options:[
          { value:'work_to_pallet', label:'Work → Pallet' },
          { value:'work_to_carrier', label:'Work → Carrier' },
          { value:'pallet_to_agv', label:'Pallet → AGV' },
          { value:'pallet_to_container', label:'Pallet → Container' },
          { value:'container_to_ship', label:'Container → Ship' },
          { value:'unload_one', label:'Unload one' },
          { value:'unload_all', label:'Unload all' },
          { value:'transfer_one', label:'Transfer one' },
          { value:'custom', label:'Custom' }
        ]},
        { key:'processTime', label:'Handling Time (s)', type:'number', min:0, step:0.1, default:1 },
        { key:'downTime', label:'Handoff Time (s)', type:'number', min:0, step:0.1, default:0.2 },
        { key:'quantity', label:'Quantity', type:'number', min:1, step:1, default:1 }
      ]
    }
  };

  const NODE_TEMPLATE_IDS = {
    equip:'machine', branch:'router', entitysource:'source', agvroute:'carrier_route',
    carrierroute:'carrier_route', transferstation:'transfer'
  };
  Object.entries(NODE_SCHEMAS).forEach(([kind, schema])=>{
    schema.templateId = NODE_TEMPLATE_IDS[kind] || kind;
    if(kind === 'note' || kind === 'signal') schema.type = `factory/${kind}`;
    if(kind !== 'note' && kind !== 'signal'){
      const titleField = (Array.isArray(schema.props) ? schema.props : []).find((field)=>field.key === 'title');
      schema.props = [titleField || { key:'title', label:'Title', type:'text', default:'Basic Node', target:'title' }];
    }else if(Array.isArray(schema.props)){
      schema.props = schema.props.filter((field)=>field.key !== 'presetId');
    }
  });

  const NODE_META = {
    machine:{ label:'Machine', description:'Process a selected Entity using shared Input / Output Rules.' },
    inspection:{ label:'Inspection', description:'Inspect an Entity and update runtime attributes for routing.' },
    buffer:{ label:'Buffer', description:'Hold Entity roots up to a configured node capacity.' },
    conveyor:{ label:'Conveyor', description:'Move an Entity subtree after a configured travel time.' },
    router:{ label:'Router', description:'Route Entities using ordered Output Rules.' },
    pack:{ label:'Attach', description:'Attach one incoming Entity as a child of another Entity.' },
    unpack:{ label:'Detach', description:'Detach a nested Entity and release parent and child separately.' },
    basic:{ label:'Basic Node', description:'Start from the common node model and configure rules manually.' },
    equip:{ label:'Equipment', description:'Process an Entity with standard process / wait / down behavior.' },
    note:{ label:'Memo', description:'Place text notes on the graph for layout comments and instructions.' },
    signal:{ label:'Signal', description:'Run signal-only scripts and combine logic without Entity transport.' },
    shuttle:{ label:'Shuttle Stage', description:'Synchronize grouped stages and move one Entity per stage together.' },
    merge:{ label:'Merge', description:'Merge matching Entity IDs from multiple inputs into one output.' },
    join:{ label:'Join', description:'Pass through the first-arriving Entity from multiple upstream nodes.' },
    source:{ label:'Source', description:'Generate Entities from a configured Type sequence.' },
    entitysource:{ label:'Source', description:'Create an Entity with an arbitrary initial child hierarchy.' },
    sink:{ label:'Sink', description:'Collect completed Entities and monitor throughput.' },
    split:{ label:'Split', description:'Duplicate one Entity into multiple synchronized downstream branches.' },
    branch:{ label:'Branch', description:'Route Entities by Type to different output ports.' },
    agvroute:{ label:'Transport Route', description:'Transport Entities along a timed route.' },
    carrierroute:{ label:'Transport Route', description:'Transport Entities along a timed route.' },
    station:{ label:'Store', description:'Store a root Entity and transfer its children through role-based ports.' },
    transferstation:{ label:'Transfer', description:'Attach, detach, or transfer any nested Entity.' }
  };
  function getNodeMeta(kind){
    return NODE_META[kind] || { label: kind, description: '' };
  }

  function populateNodeSelect(){
    const kinds = Object.keys(NODE_SCHEMAS);
    sel.innerHTML = '';
    kinds.forEach((kind)=>{
      const opt = document.createElement('option');
      opt.value = kind;
      opt.textContent = getNodeMeta(kind).label;
      sel.appendChild(opt);
    });
    sel.value = kinds.includes('equip') ? 'equip' : (kinds[0] || '');
  }

  function updateNodeBuilderUi(){
    const active = !!(App.placement && App.placement.active && App.placement.kind === 'node');
    btn.disabled = !sel.options.length;
    btn.classList.toggle('is-cancel', active);
    btn.textContent = active ? 'Cancel Placement' : 'Place Node';
  }
  App.refreshNodeBuilderUI = updateNodeBuilderUi;

  populateNodeSelect();
  updateNodeBuilderUi();

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
      if(node.type === 'factory/basic' && typeof App.applyBasicTemplate === 'function'){
        App.applyBasicTemplate(node, schema.templateId || kind);
      }
      // Position near top-left with slight offset to avoid perfect overlap
      const baseX = 60, baseY = 120;
      const jitterX = Math.floor(Math.random()*60);
      const jitterY = Math.floor(Math.random()*60);
      node.pos = [baseX + jitterX, baseY + jitterY];
      if(node.type === 'factory/basic' && typeof App.ensureBasicTemplateFlowRules === 'function'){
        App.ensureBasicTemplateFlowRules(node, { force: false, templateId:schema.templateId || kind });
      }
      if(schema.flowTemplate === 'sequence' && typeof App.configureBasicSequenceGenerator === 'function'){
        App.configureBasicSequenceGenerator(node);
      }
      if(typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true,true);
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
    backgroundPanel: false,
    entityTypesPanel: true,
    addNodePanel: true,
    addGroupPanel: true,
    advancedPanel: true,
    shortcutPanel: true,
    fileControls: true
  };
  const collapsibleIds = ['controls', 'backgroundPanel', 'entityTypesPanel', 'addNodePanel', 'addGroupPanel', 'advancedPanel', 'shortcutPanel', 'fileControls'];
  const accordionIds = ['backgroundPanel', 'entityTypesPanel', 'addNodePanel', 'addGroupPanel', 'advancedPanel', 'shortcutPanel', 'fileControls'];
  const collapseKey = 'fact_sim_sidebar_panels_v6';

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

  function revealSidebarPanel(panel){
    if(!panel || !sidebar || typeof panel.getBoundingClientRect !== 'function') return;
    window.requestAnimationFrame(()=>{
      try{
        const panelRect = panel.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();
        const topGap = panelRect.top - sidebarRect.top;
        const bottomGap = panelRect.bottom - sidebarRect.bottom;
        if(topGap < 12){
          sidebar.scrollTop += topGap - 12;
          return;
        }
        if(bottomGap > -12){
          sidebar.scrollTop += bottomGap + 12;
        }
      }catch(_e){}
    });
  }

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
    revealSidebarPanel(document.getElementById(panelId));
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
        else{
          setPanelCollapsed(panel, false);
          revealSidebarPanel(panel);
        }
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
    if(!collapsed) revealSidebarPanel(panel);
    return true;
  };

  App.focusSidebarPanel = function(panelId){
    const panel = document.getElementById(panelId);
    if(!panel) return false;
    if(accordionIds.includes(panelId)) expandPanelExclusive(panelId);
    else{
      setPanelCollapsed(panel, false);
      revealSidebarPanel(panel);
    }
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
      overviewQuickTip.textContent = `Place ${label} on the canvas. Right-click or Esc cancels.`;
      return;
    }
    if(count > 0){
      overviewQuickTip.textContent = `${count} node${count === 1 ? '' : 's'} selected. Open Details to edit them.`;
      return;
    }
    if(exampleSelect?.value){
      overviewQuickTip.textContent = `${getSelectedOptionLabel(exampleSelect, 'Example')} is ready. Press Start to simulate it.`;
      return;
    }
    overviewQuickTip.textContent = 'Choose an example to learn the app, or open Add Node to build your own flow.';
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

    const configuredFps = (typeof App.getRenderFps === 'function') ? App.getRenderFps() : (Number(renderFpsSelect?.value) || 60);
    const effectiveFps = (typeof App.getEffectiveRenderFps === 'function') ? App.getEffectiveRenderFps() : configuredFps;
    const visualMode = (typeof App.getVisualPerformanceMode === 'function') ? App.getVisualPerformanceMode() : 'normal';
    const renderMeta = effectiveFps < configuredFps
      ? `${configuredFps}/${effectiveFps} fps · ${visualMode}`
      : `${configuredFps} fps${visualMode !== 'normal' ? ` · ${visualMode}` : ''}`;
    setPanelMeta('advancedPanel', `${getSelectedOptionLabel(simModeSelect, 'dt')} · ${renderMeta}`);
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
    if(typeof App.updateAdaptiveRenderMode === 'function') App.updateAdaptiveRenderMode();
    if(btnStart){
      btnStart.textContent = running ? '■ Stop' : '▶ Start';
      btnStart.dataset.runState = running ? 'stop' : 'start';
      btnStart.setAttribute('aria-pressed', running ? 'true' : 'false');
      btnStart.setAttribute('aria-label', running ? 'Stop simulation' : 'Start simulation');
      btnStart.title = running ? 'Stop simulation' : 'Start simulation';
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
    if(simStatusRender){
      const configuredFps = (typeof App.getRenderFps === 'function') ? App.getRenderFps() : (Number(renderFpsSelect?.value) || 60);
      const effectiveFps = (typeof App.getEffectiveRenderFps === 'function') ? App.getEffectiveRenderFps() : configuredFps;
      const visualMode = (typeof App.getVisualPerformanceMode === 'function') ? App.getVisualPerformanceMode() : 'normal';
      simStatusRender.textContent = effectiveFps < configuredFps
        ? `${configuredFps}/${effectiveFps} FPS · ${visualMode}`
        : `${configuredFps} FPS${visualMode !== 'normal' ? ` · ${visualMode}` : ''}`;
    }
    if(simStatusRealtime) simStatusRealtime.textContent = realtimeFactor?.textContent || '--';
    if(simStatusSelection){
      const selectedMap = App.canvas && App.canvas.selected_nodes ? App.canvas.selected_nodes : null;
      const count = selectedMap ? Object.keys(selectedMap).length : 0;
      simStatusSelection.textContent = count ? `${count} node${count === 1 ? '' : 's'}` : 'None';
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

