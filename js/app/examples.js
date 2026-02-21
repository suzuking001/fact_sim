// Example graphs and loaders

var App = window.App || (window.App = {});

const EXAMPLE_ALIASES = {
  agv_config: 'carrier',
  carrier_config: 'carrier'
};

const EXAMPLE_FILES = {
  simple: 'sample/simple.json',
  branch: 'sample/branch.json',
  shuttle_line5: 'sample/shuttle_line5.json',
  carrier: 'sample/carrier.json',
  sample_line1: 'sample/sample_line1.json'
};

function resolveExampleKey(kind){
  const key = String(kind || '').trim();
  if(!key) return '';
  return EXAMPLE_ALIASES[key] || key;
}

function makeExample(kind){
  const key = resolveExampleKey(kind);
  if(!key) return;
  const data = window.EXAMPLES && window.EXAMPLES[key];
  if(data){
    applyExampleData(data);
    return;
  }
  const file = EXAMPLE_FILES[key] || `sample/${key}.json`;
  loadExampleFromFile(file);
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
    .catch(err=>{ alert('Failed to load JSON'); console.error(err); });
}

function initExamples(){
  const sel = document.getElementById('exampleSelect');
  if(sel){
    sel.addEventListener('change', e=>{
      const v = e.target.value; if(!v) return;
      makeExample(v);
    });
  }

  // Default example: sample_line1
  if(sel) sel.value = 'sample_line1';
  makeExample('sample_line1');
}

