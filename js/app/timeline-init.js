// Timeline chart init and wiring

function initTimeline(){
  const tCanvas = document.getElementById('timelineCanvas');
  if(!tCanvas || typeof TimelineChart === 'undefined') return;
  timelineChart = new TimelineChart(tCanvas);
  window.timelineChart = timelineChart;

  const followBtn = document.getElementById('timelineFollowBtn');
  if(followBtn){
    timelineChart.onFollowChange = (v)=>{
      followBtn.textContent = v ? 'Follow: ON' : 'Follow: OFF';
    };
    followBtn.addEventListener('click', ()=>{
      timelineChart.setFollow(!timelineChart.follow);
      timelineChart.draw();
    });
  }
  const exportBtn = document.getElementById('timelineExportBtn');
  if(exportBtn){
    exportBtn.addEventListener('click', ()=>{
      if(timelineChart && typeof timelineChart.exportCsv === 'function'){
        timelineChart.exportCsv();
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
      if(timelineChart) timelineChart.resize();
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

  window.addEventListener('resize', ()=> timelineChart && timelineChart.resize());
}

function attachTimeline(){
  if(timelineChart && graph) timelineChart.attachGraph(graph);
}
