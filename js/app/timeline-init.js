// Timeline chart init and wiring

var App = window.App || (window.App = {});

function initTimeline(){
  const tCanvas = document.getElementById('timelineCanvas');
  const dock = document.getElementById('timelineDock');
  const body = document.getElementById('timelineBody');
  if(!tCanvas || !dock || !body || typeof TimelineChart === 'undefined') return;
  App.timelineChart = new TimelineChart(tCanvas);
  window.timelineChart = App.timelineChart;
  if(typeof App.NodePropsPanel === 'function'){
    const root = document.getElementById('nodePropsPanel');
    if(root) App.nodePropsPanel = new App.NodePropsPanel(root);
  }

  const tabChart = document.getElementById('timelineTabChart');
  const tabProps = document.getElementById('timelineTabProps');
  const propsMeta = document.getElementById('timelinePropsMeta');
  if(propsMeta) propsMeta.textContent = 'Edit node properties in a spreadsheet-style table.';
  const setView = (mode)=>{
    const view = (mode === 'props') ? 'props' : 'chart';
    dock.dataset.view = view;
    body.classList.toggle('view-chart', view === 'chart');
    body.classList.toggle('view-props', view === 'props');
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
    if(view === 'chart'){
      if(App.timelineChart && typeof App.timelineChart.resize === 'function') App.timelineChart.resize();
    }else{
      if(App.nodePropsPanel && typeof App.nodePropsPanel.refresh === 'function') App.nodePropsPanel.refresh();
    }
  };
  App.setTimelineDockView = setView;
  if(tabChart) tabChart.addEventListener('click', ()=> setView('chart'));
  if(tabProps) tabProps.addEventListener('click', ()=> setView('props'));
  setView('chart');

  const followBtn = document.getElementById('timelineFollowBtn');
  if(followBtn){
    App.timelineChart.onFollowChange = (v)=>{
      followBtn.textContent = v ? 'Follow: ON' : 'Follow: OFF';
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

  const handle = document.getElementById('timelineResizeHandle');
  if(dock && handle){
    let resizing = false;
    let startY = 0;
    let startH = 0;
    const minH = 120;
    const clamp = (v, min, max)=> Math.max(min, Math.min(max, v));
    const setHeight = (h)=>{
      const maxH = Math.max(minH, window.innerHeight - 120);
      const next = clamp(h, minH, maxH);
      document.documentElement.style.setProperty('--timeline-height', `${Math.round(next)}px`);
      if(App.timelineChart && dock.dataset.view !== 'props') App.timelineChart.resize();
      window.dispatchEvent(new Event('resize'));
    };
    handle.addEventListener('mousedown', (e)=>{
      resizing = true;
      startY = e.clientY;
      startH = dock.getBoundingClientRect().height;
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e)=>{
      if(!resizing) return;
      const dy = startY - e.clientY;
      setHeight(startH + dy);
    });
    window.addEventListener('mouseup', ()=>{
      if(!resizing) return;
      resizing = false;
      document.body.style.cursor = '';
    });
  }

  window.addEventListener('resize', ()=>{
    if(App.timelineChart && dock.dataset.view !== 'props') App.timelineChart.resize();
  });
}

function attachTimeline(){
  if(App.timelineChart && App.graph) App.timelineChart.attachGraph(App.graph);
  if(App.nodePropsPanel && App.graph) App.nodePropsPanel.attachGraph(App.graph);
}

