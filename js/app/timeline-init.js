// Timeline chart init and wiring

var App = window.App || (window.App = {});

function initTimeline(){
  const tCanvas = document.getElementById('timelineCanvas');
  if(!tCanvas || typeof TimelineChart === 'undefined') return;
  App.timelineChart = new TimelineChart(tCanvas);
  window.timelineChart = App.timelineChart;

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

  const dock = document.getElementById('timelineDock');
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
      if(App.timelineChart) App.timelineChart.resize();
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

  window.addEventListener('resize', ()=> App.timelineChart && App.timelineChart.resize());
}

function attachTimeline(){
  if(App.timelineChart && App.graph) App.timelineChart.attachGraph(App.graph);
}

