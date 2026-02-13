// Example graphs and loaders

var App = window.App || (window.App = {});

function makeExample(kind){
  if(!App.graph) return;
  stopSimulation();
  App.history.lock = true;
  App.graph.clear();
  App.history.lock = false;
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  if(kind==='simple'){
    const s=LiteGraph.createNode('factory/source'); s.pos=[60,200];
    const e1=LiteGraph.createNode('factory/equip'); e1.pos=[360,200]; e1.properties.processTime=1;
    const e2=LiteGraph.createNode('factory/equip'); e2.pos=[660,200]; e2.properties.processTime=1;
    const k=LiteGraph.createNode('factory/sink'); k.pos=[960,200];
    App.graph.add(s); App.graph.add(e1); App.graph.add(e2); App.graph.add(k);
    s.connect(0,e1,0); e1.connect(0,e2,0); e2.connect(0,k,0);
  }else if(kind==='branch'){
    const s=LiteGraph.createNode('factory/source'); s.pos=[60,240];
    const sp=LiteGraph.createNode('factory/split'); sp.pos=[360,240];
    const a=LiteGraph.createNode('factory/equip'); a.title='Line A'; a.pos=[660,160]; a.properties.processTime=1;
    const b=LiteGraph.createNode('factory/equip'); b.title='Line B'; b.pos=[660,320]; b.properties.processTime=2;
    const k=LiteGraph.createNode('factory/sink'); k.pos=[960,240];
    App.graph.add(s); App.graph.add(sp); App.graph.add(a); App.graph.add(b); App.graph.add(k);
    s.connect(0,sp,0); sp.connect(0,a,0); sp.connect(1,b,0); a.connect(0,k,0); b.connect(0,k,0);
  }
  // reset time display (no auto start)
  updateSimTime();
  try{ if(App.canvas && App.canvas.draw) App.canvas.draw(true,true); }catch(e){}
  resetHistory();
  attachTimeline();
}

function applyExampleData(data){
  if(!App.graph) return;
  stopSimulation();
  App.history.lock = true;
  App.graph.clear();
  App.graph.configure(data);
  App.history.lock = false;
  configureGraphClock(App.graph);
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  updateSimTime();
  try{ if(App.canvas && App.canvas.draw) App.canvas.draw(true,true); }catch(e){}
  resetHistory();
  attachTimeline();
}

function loadExampleFromFile(path){
  if(!App.graph) return;
  fetch(path)
    .then(r=>{ if(!r.ok) throw new Error(`Load failed: ${r.status}`); return r.json(); })
    .then(data=>{ applyExampleData(data); })
    .catch(err=>{ alert('JSON読込失敗'); console.error(err); });
}

function initExamples(){
  const sel = document.getElementById('exampleSelect');
  if(sel){
    sel.addEventListener('change', e=>{
      const v = e.target.value; if(!v) return;
      if(v === 'sample_line1'){
        const data = window.EXAMPLES && window.EXAMPLES.sample_line1;
        if(data) applyExampleData(data);
        else loadExampleFromFile('sample/sample_line1.json');
        return;
      }
      makeExample(v);
    });
  }

  // Default example: sample_line1
  if(sel) sel.value = 'sample_line1';
  const data = window.EXAMPLES && window.EXAMPLES.sample_line1;
  if(data) applyExampleData(data);
  else loadExampleFromFile('sample/sample_line1.json');
}

