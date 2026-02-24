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
  carrier: 'sample/graph (3).json',
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
  const isFileProtocol = String(window.location?.protocol || '').toLowerCase() === 'file:';
  if(isFileProtocol && data){
    // file:// cannot fetch local JSON in many browsers; use bundled JS examples.
    applyExampleData(data);
    return;
  }
  const file = EXAMPLE_FILES[key] || `sample/${key}.json`;
  if(file){
    loadExampleFromFile(file, key, data);
    return;
  }
  if(data){
    applyExampleData(data);
    return;
  }
}

function applyExampleData(data){
  if(!App.graph) return;
  stopSimulation();
  let payload = data;
  try{
    payload = JSON.parse(JSON.stringify(data));
  }catch(_e){
    payload = data;
  }
  App.history.lock = true;
  try{
    App.graph.clear();
    App.graph.configure(payload);
    if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
      App.stopGroups.restoreSerializedData(App.graph, payload, false);
    }
  }finally{
    App.history.lock = false;
  }
  configureGraphClock(App.graph);
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  updateSimTime();
  try{ if(App.canvas && App.canvas.draw) App.canvas.draw(true,true); }catch(e){}
  resetHistory();
  attachTimeline();
}

function loadExampleFromFile(path, key, fallbackData){
  if(!App.graph) return;
  const requestPath = encodeURI(path);
  fetch(requestPath)
    .then(r=>{ if(!r.ok) throw new Error(`Load failed: ${r.status}`); return r.json(); })
    .then(data=>{ applyExampleData(data); })
    .catch(err=>{
      const fallback = fallbackData || (window.EXAMPLES && window.EXAMPLES[resolveExampleKey(key)]);
      if(fallback){
        console.warn(`[examples] fallback to embedded data for "${key}"`, err);
        applyExampleData(fallback);
        return;
      }
      alert('Failed to load JSON');
      console.error(err);
    });
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

