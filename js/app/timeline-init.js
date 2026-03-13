// Timeline chart init and wiring

var App = window.App || (window.App = {});

function initTimeline(){
  const tCanvas = document.getElementById('timelineCanvas');
  const dock = document.getElementById('timelineDock');
  const body = document.getElementById('timelineBody');
  const revealHandle = document.getElementById('timelineRevealHandle');
  if(!tCanvas || !dock || !body || typeof TimelineChart === 'undefined') return;
  const rootBody = document.body;
  App.timelineChart = new TimelineChart(tCanvas);
  window.timelineChart = App.timelineChart;
  if(typeof App.NodePropsPanel === 'function'){
    const root = document.getElementById('nodePropsPanel');
    if(root) App.nodePropsPanel = new App.NodePropsPanel(root);
  }
  if(typeof App.SelectionInspector === 'function'){
    const root = document.getElementById('selectionInspectorPanel');
    if(root) App.selectionInspector = new App.SelectionInspector(root);
  }

  const tabChart = document.getElementById('timelineTabChart');
  const tabProps = document.getElementById('timelineTabProps');
  const tabInspector = document.getElementById('timelineTabInspector');
  const chartPanel = document.getElementById('timelineChartPanel');
  const chartPopoutBtn = document.getElementById('timelineChartPopoutBtn');
  const propsPopoutBtn = document.getElementById('timelinePropsPopoutBtn');
  const inspectorPopoutBtn = document.getElementById('timelineInspectorPopoutBtn');
  const propsMeta = document.getElementById('timelinePropsMeta');
  if(propsMeta) propsMeta.textContent = 'Browse nodes and open Inspector.';
  const minH = 120;
  const hideSnapH = 72;
  const clamp = (v, min, max)=> Math.max(min, Math.min(max, v));
  const maxH = ()=> Math.max(minH, window.innerHeight - 120);
  const applyHeight = (h)=>{
    const next = clamp(h, minH, maxH());
    document.documentElement.style.setProperty('--timeline-height', `${Math.round(next)}px`);
    if(App.timelineChart && dock.dataset.view === 'chart' && typeof App.timelineChart.resize === 'function'){
      App.timelineChart.resize();
    }
    window.dispatchEvent(new Event('resize'));
  };
  const setTimelineHidden = (hidden, options)=>{
    const opt = options || {};
    const next = !!hidden;
    const prev = rootBody.classList.contains('timeline-hidden');
    if(prev === next) return false;
    rootBody.classList.toggle('timeline-hidden', next);
    try{
      if(App.canvas && typeof App.canvas.setDirty === 'function') App.canvas.setDirty(true, true);
      if(App.timelineChart && !next && dock.dataset.view === 'chart' && typeof App.timelineChart.resize === 'function'){
        App.timelineChart.resize();
      }
      window.dispatchEvent(new Event('resize'));
    }catch(_e){}
    if(opt.toast !== false && typeof App.showToast === 'function'){
      App.showToast(next ? 'Bottom panel hidden' : 'Bottom panel shown');
    }
    return true;
  };
  App.setTimelineHidden = setTimelineHidden;
  App.isTimelineHidden = ()=> rootBody.classList.contains('timeline-hidden');
  App.toggleTimelineHidden = ()=> setTimelineHidden(!rootBody.classList.contains('timeline-hidden'));
  const setView = (mode)=>{
    const view = (mode === 'props' || mode === 'inspector') ? mode : 'chart';
    dock.dataset.view = view;
    body.classList.toggle('view-chart', view === 'chart');
    body.classList.toggle('view-props', view === 'props');
    body.classList.toggle('view-inspector', view === 'inspector');
    if(tabChart){
      const active = view === 'chart';
      tabChart.classList.toggle('is-active', active);
      tabChart.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if(tabProps){
      const active = view === 'props';
      tabProps.classList.toggle('is-active', active);
      tabProps.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if(tabInspector){
      const active = view === 'inspector';
      tabInspector.classList.toggle('is-active', active);
      tabInspector.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if(propsMeta){
      if(view === 'props') propsMeta.textContent = 'Browse nodes and open Inspector.';
      else if(view === 'inspector') propsMeta.textContent = 'Edit the selected node or group with focused controls.';
    }
    if(view === 'chart'){
      if(App.timelineChart && typeof App.timelineChart.resize === 'function') App.timelineChart.resize();
    }else if(view === 'props'){
      if(App.nodePropsPanel && typeof App.nodePropsPanel.refresh === 'function') App.nodePropsPanel.refresh();
    }else if(App.selectionInspector && typeof App.selectionInspector.refresh === 'function'){
      App.selectionInspector.refresh();
    }
    if(typeof App.syncWorkspacePopouts === 'function') App.syncWorkspacePopouts();
  };
  App.setTimelineDockView = setView;
  if(tabChart) tabChart.addEventListener('click', ()=> setView('chart'));
  if(tabProps) tabProps.addEventListener('click', ()=> setView('props'));
  if(tabInspector) tabInspector.addEventListener('click', ()=> setView('inspector'));
  setView('chart');
  // Always show timeline by default on load.
  rootBody.classList.remove('timeline-hidden');

  const followBtn = document.getElementById('timelineFollowBtn');
  if(followBtn){
    App.timelineChart.onFollowChange = (v)=>{
      followBtn.textContent = v ? 'Auto Follow: ON' : 'Auto Follow: OFF';
      if(typeof App.syncWorkspacePopouts === 'function') App.syncWorkspacePopouts();
    };
    followBtn.addEventListener('click', ()=>{
      App.timelineChart.setFollow(!App.timelineChart.follow);
      App.timelineChart.draw();
    });
  }
  const exportBtn = document.getElementById('timelineExportBtn');
  if(exportBtn){
    exportBtn.addEventListener('click', ()=>{
      if(App.timelineChart && typeof App.timelineChart.exportCsv === 'function'){
        App.timelineChart.exportCsv();
      }
    });
  }
  const autoOrderBtn = document.getElementById('timelineAutoOrderBtn');
  if(autoOrderBtn){
    autoOrderBtn.addEventListener('click', ()=>{
      if(!App.timelineChart || typeof App.timelineChart.resetTimelineOrderToAuto !== 'function') return;
      const changed = App.timelineChart.resetTimelineOrderToAuto();
      if(typeof App.showToast === 'function'){
        if(changed > 0) App.showToast('Timeline order reset to auto');
        else App.showToast('Timeline already auto order');
      }
    });
  }
  const propsRefreshBtn = document.getElementById('nodePropsRefreshBtn');
  if(propsRefreshBtn){
    propsRefreshBtn.addEventListener('click', ()=>{
      if(App.nodePropsPanel && typeof App.nodePropsPanel.refresh === 'function'){
        App.nodePropsPanel.refresh();
        if(typeof App.showToast === 'function') App.showToast('Properties refreshed');
      }
    });
  }
  const inspectorRefreshBtn = document.getElementById('selectionInspectorRefreshBtn');
  if(inspectorRefreshBtn){
    inspectorRefreshBtn.addEventListener('click', ()=>{
      if(App.selectionInspector && typeof App.selectionInspector.refresh === 'function'){
        App.selectionInspector.refresh();
        if(typeof App.showToast === 'function') App.showToast('Inspector refreshed');
      }
    });
  }
  const inspectorClearBtn = document.getElementById('selectionInspectorClearBtn');
  if(inspectorClearBtn){
    inspectorClearBtn.addEventListener('click', ()=>{
      if(App.selectionInspector && typeof App.selectionInspector.clear === 'function'){
        App.selectionInspector.clear(true);
        if(typeof App.showToast === 'function') App.showToast('Inspector cleared');
      }
    });
  }

  const popoutStates = {};
  const popupConfigs = {
    chart: {
      title: 'Timeline',
      panel: chartPanel,
      button: chartPopoutBtn,
      metaText: ()=> (document.getElementById('timelineSelection')?.textContent || 'Selection: -'),
      createActions(doc, close){
        const actions = [];
        actions.push(makePopupActionButton(doc, 'Reset Order', ()=>{
          if(App.timelineChart && typeof App.timelineChart.resetTimelineOrderToAuto === 'function'){
            App.timelineChart.resetTimelineOrderToAuto();
            if(typeof App.showToast === 'function') App.showToast('Timeline order reset to auto');
          }
        }));
        actions.push(makePopupActionButton(doc, 'Export CSV', ()=>{
          if(App.timelineChart && typeof App.timelineChart.exportCsv === 'function'){
            App.timelineChart.exportCsv();
          }
        }));
        const followAction = makePopupActionButton(doc, App.timelineChart && App.timelineChart.follow ? 'Auto Follow: ON' : 'Auto Follow: OFF', ()=>{
          if(App.timelineChart){
            App.timelineChart.setFollow(!App.timelineChart.follow);
            App.timelineChart.draw();
            if(typeof App.syncWorkspacePopouts === 'function') App.syncWorkspacePopouts();
          }
        });
        actions.push(followAction);
        actions.push(makePopupActionButton(doc, 'Return to Dock', close));
        return { buttons: actions, followButton: followAction };
      },
      onOpen(state){
        if(App.timelineChart){
          if(typeof App.timelineChart.bindInteractionWindow === 'function') App.timelineChart.bindInteractionWindow(state.popup);
          if(typeof App.timelineChart.resize === 'function') App.timelineChart.resize();
        }
      },
      onClose(){
        if(App.timelineChart){
          if(typeof App.timelineChart.bindInteractionWindow === 'function') App.timelineChart.bindInteractionWindow(window);
          if(typeof App.timelineChart.resize === 'function') App.timelineChart.resize();
        }
      }
    },
    props: {
      title: 'Table',
      panel: document.getElementById('nodePropsPanel'),
      button: propsPopoutBtn,
      metaText: ()=>{
        const meta = document.getElementById('timelinePropsMeta')?.textContent || 'Browse nodes and open Inspector.';
        const summary = document.getElementById('nodePropsSummary')?.textContent || '';
        return summary ? `${meta} ${String(meta).endsWith('.') ? '' : '•'} ${summary}`.trim() : meta;
      },
      createActions(doc, close){
        return {
          buttons: [
            makePopupActionButton(doc, 'Refresh', ()=>{
              if(App.nodePropsPanel && typeof App.nodePropsPanel.refresh === 'function'){
                App.nodePropsPanel.refresh();
                if(typeof App.syncWorkspacePopouts === 'function') App.syncWorkspacePopouts();
              }
            }),
            makePopupActionButton(doc, 'Return to Dock', close)
          ]
        };
      }
    },
    inspector: {
      title: 'Inspector',
      panel: document.getElementById('selectionInspectorPanel'),
      button: inspectorPopoutBtn,
      metaText: ()=> (document.getElementById('timelinePropsMeta')?.textContent || 'Edit the selected node or group with focused controls.'),
      createActions(doc, close){
        return {
          buttons: [
            makePopupActionButton(doc, 'Refresh', ()=>{
              if(App.selectionInspector && typeof App.selectionInspector.refresh === 'function'){
                App.selectionInspector.refresh();
                if(typeof App.syncWorkspacePopouts === 'function') App.syncWorkspacePopouts();
              }
            }),
            makePopupActionButton(doc, 'Clear', ()=>{
              if(App.selectionInspector && typeof App.selectionInspector.clear === 'function'){
                App.selectionInspector.clear(true);
                if(typeof App.syncWorkspacePopouts === 'function') App.syncWorkspacePopouts();
              }
            }),
            makePopupActionButton(doc, 'Return to Dock', close)
          ]
        };
      }
    }
  };

  function makePopupActionButton(doc, label, onClick){
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'timelineBtn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function copyStylesToPopup(doc){
    const sources = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
    for(const source of sources){
      try{
        const clone = source.cloneNode(true);
        doc.head.appendChild(clone);
      }catch(_e){}
    }
  }

  function buildPlaceholder(view, close){
    const placeholder = document.createElement('div');
    placeholder.className = 'workspacePopoutPlaceholder';
    placeholder.dataset.view = view;
    const card = document.createElement('div');
    card.className = 'workspacePopoutPlaceholderCard';
    const title = document.createElement('div');
    title.className = 'workspacePopoutPlaceholderTitle';
    title.textContent = `${popupConfigs[view].title} is open in a separate window`;
    const text = document.createElement('div');
    text.className = 'workspacePopoutPlaceholderText';
    text.textContent = 'You can move it to another monitor. Use the button below to return it to the dock.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'timelineBtn';
    btn.textContent = 'Return to Dock';
    btn.addEventListener('click', close);
    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(btn);
    placeholder.appendChild(card);
    return placeholder;
  }

  function ensureSyncTimer(){
    if(App._workspacePopoutSyncTimer) return;
    App._workspacePopoutSyncTimer = window.setInterval(()=>{
      if(typeof App.syncWorkspacePopouts === 'function') App.syncWorkspacePopouts();
    }, 300);
  }

  function clearSyncTimerIfIdle(){
    const hasOpen = Object.values(popoutStates).some((state)=> state && state.popup && !state.popup.closed);
    if(hasOpen) return;
    if(App._workspacePopoutSyncTimer){
      window.clearInterval(App._workspacePopoutSyncTimer);
      App._workspacePopoutSyncTimer = null;
    }
  }

  function syncPopoutButtons(){
    Object.keys(popupConfigs).forEach((view)=>{
      const state = popoutStates[view];
      const btn = popupConfigs[view].button;
      if(!btn) return;
      const opened = !!(state && state.popup && !state.popup.closed);
      btn.textContent = opened ? 'Return to Dock' : 'Open Window';
      btn.classList.toggle('is-active', opened);
    });
  }

  function syncPopouts(){
    Object.keys(popupConfigs).forEach((view)=>{
      const state = popoutStates[view];
      if(!state) return;
      const popup = state.popup;
      if(!popup || popup.closed){
        closePopout(view, { fromPopup: true, suppressClose: true });
        return;
      }
      try{
        if(state.metaEl) state.metaEl.textContent = popupConfigs[view].metaText();
        if(state.followButton && App.timelineChart){
          state.followButton.textContent = App.timelineChart.follow ? 'Auto Follow: ON' : 'Auto Follow: OFF';
        }
      }catch(_e){}
    });
    syncPopoutButtons();
    clearSyncTimerIfIdle();
  }

  function openPopout(view){
    const config = popupConfigs[view];
    if(!config || !config.panel) return false;
    const existing = popoutStates[view];
    if(existing && existing.popup && !existing.popup.closed){
      try{ existing.popup.focus(); }catch(_e){}
      return true;
    }
    const popup = window.open('', `factsim-workspace-${view}`, 'popup=yes,width=1280,height=760');
    if(!popup){
      if(typeof App.showToast === 'function') App.showToast('Popup window was blocked');
      return false;
    }
    const doc = popup.document;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>FACT_SIM Workspace</title></head><body></body></html>');
    doc.close();
    try{ doc.title = `${config.title} - FACT_SIM`; }catch(_e){}
    copyStylesToPopup(doc);

    const root = doc.createElement('div');
    root.className = 'workspacePopoutRoot';
    const header = doc.createElement('div');
    header.className = 'workspacePopoutHeader';
    const heading = doc.createElement('div');
    heading.className = 'workspacePopoutHeading';
    const eyebrow = doc.createElement('div');
    eyebrow.className = 'workspacePopoutEyebrow';
    eyebrow.textContent = 'Workspace Panel';
    const title = doc.createElement('div');
    title.className = 'workspacePopoutTitle';
    title.textContent = config.title;
    const meta = doc.createElement('div');
    meta.className = 'workspacePopoutMeta';
    meta.textContent = config.metaText();
    const actions = doc.createElement('div');
    actions.className = 'workspacePopoutActions';
    heading.appendChild(eyebrow);
    heading.appendChild(title);
    header.appendChild(heading);
    header.appendChild(actions);
    header.appendChild(meta);
    root.appendChild(header);
    const content = doc.createElement('div');
    content.className = 'workspacePopoutContent';
    root.appendChild(content);
    doc.body.appendChild(root);

    const close = ()=> closePopout(view);
    const actionBundle = config.createActions ? config.createActions(doc, close) : { buttons: [] };
    const buttons = Array.isArray(actionBundle.buttons) ? actionBundle.buttons : [];
    buttons.forEach((btn)=> actions.appendChild(btn));

    const placeholder = buildPlaceholder(view, close);
    const panel = config.panel;
    const originalParent = panel.parentNode;
    originalParent.insertBefore(placeholder, panel);
    content.appendChild(panel);

    const state = {
      view,
      popup,
      panel,
      placeholder,
      originalParent,
      metaEl: meta,
      followButton: actionBundle.followButton || null,
      closing: false,
      resizeHandler: null
    };
    popoutStates[view] = state;

    popup.addEventListener('beforeunload', ()=>{
      if(state.closing) return;
      state.closing = true;
      closePopout(view, { fromPopup: true, suppressClose: true });
    });
    state.resizeHandler = ()=>{
      if(view === 'chart' && App.timelineChart && typeof App.timelineChart.resize === 'function'){
        App.timelineChart.resize();
      }
    };
    popup.addEventListener('resize', state.resizeHandler);

    if(typeof config.onOpen === 'function') config.onOpen(state);
    ensureSyncTimer();
    syncPopouts();
    if(typeof App.showToast === 'function') App.showToast(`${config.title} opened in a separate window`);
    return true;
  }

  function closePopout(view, options){
    const state = popoutStates[view];
    if(!state) return false;
    const opts = options || {};
    state.closing = true;
    try{
      if(state.panel && state.originalParent && state.placeholder && state.placeholder.parentNode === state.originalParent){
        state.originalParent.insertBefore(state.panel, state.placeholder);
      }
    }catch(_e){}
    try{
      if(state.placeholder && state.placeholder.parentNode) state.placeholder.parentNode.removeChild(state.placeholder);
    }catch(_e){}
    try{
      if(state.popup && state.resizeHandler) state.popup.removeEventListener('resize', state.resizeHandler);
    }catch(_e){}
    if(typeof popupConfigs[view].onClose === 'function') popupConfigs[view].onClose(state);
    if(state.popup && !opts.fromPopup && !opts.suppressClose){
      try{ state.popup.close(); }catch(_e){}
    }
    delete popoutStates[view];
    syncPopouts();
    return true;
  }

  App.openWorkspacePopout = openPopout;
  App.closeWorkspacePopout = closePopout;
  App.syncWorkspacePopouts = syncPopouts;

  if(chartPopoutBtn) chartPopoutBtn.addEventListener('click', ()=> (popoutStates.chart ? closePopout('chart') : openPopout('chart')));
  if(propsPopoutBtn) propsPopoutBtn.addEventListener('click', ()=> (popoutStates.props ? closePopout('props') : openPopout('props')));
  if(inspectorPopoutBtn) inspectorPopoutBtn.addEventListener('click', ()=> (popoutStates.inspector ? closePopout('inspector') : openPopout('inspector')));
  syncPopoutButtons();

  const handle = document.getElementById('timelineResizeHandle');
  if(dock && handle){
    let mode = '';
    let startY = 0;
    let startH = 0;
    handle.addEventListener('mousedown', (e)=>{
      mode = 'dock';
      startY = e.clientY;
      startH = dock.getBoundingClientRect().height;
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
    });
    if(revealHandle){
      revealHandle.addEventListener('mousedown', (e)=>{
        mode = 'reveal';
        document.body.style.cursor = 'ns-resize';
        setTimelineHidden(false, { toast:false });
        const next = window.innerHeight - e.clientY;
        applyHeight(next);
        e.preventDefault();
      });
    }
    window.addEventListener('mousemove', (e)=>{
      if(!mode) return;
      if(mode === 'dock'){
        const dy = startY - e.clientY;
        const desired = startH + dy;
        if(desired <= hideSnapH){
          setTimelineHidden(true, { toast:false });
          return;
        }
        if(rootBody.classList.contains('timeline-hidden')){
          setTimelineHidden(false, { toast:false });
        }
        applyHeight(desired);
        return;
      }
      if(mode === 'reveal'){
        const desired = window.innerHeight - e.clientY;
        if(desired <= hideSnapH){
          setTimelineHidden(true, { toast:false });
          return;
        }
        if(rootBody.classList.contains('timeline-hidden')){
          setTimelineHidden(false, { toast:false });
        }
        applyHeight(desired);
      }
    });
    window.addEventListener('mouseup', ()=>{
      if(!mode) return;
      const wasMode = mode;
      mode = '';
      document.body.style.cursor = '';
      if(typeof App.showToast === 'function'){
        const hidden = rootBody.classList.contains('timeline-hidden');
        if(wasMode === 'dock' || wasMode === 'reveal'){
          App.showToast(hidden ? 'Bottom panel hidden' : 'Bottom panel shown');
        }
      }
    });
  }

  window.addEventListener('resize', ()=>{
    if(rootBody.classList.contains('timeline-hidden')) return;
    if(App.timelineChart && dock.dataset.view === 'chart') App.timelineChart.resize();
  });
}

function attachTimeline(){
  if(App.timelineChart && App.graph) App.timelineChart.attachGraph(App.graph);
  if(App.nodePropsPanel && App.graph) App.nodePropsPanel.attachGraph(App.graph);
  if(App.selectionInspector && App.graph) App.selectionInspector.attachGraph(App.graph);
  if(App.selectionInspector && App.canvas) App.selectionInspector.attachCanvas(App.canvas);
}

