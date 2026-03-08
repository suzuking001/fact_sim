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

