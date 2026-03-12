// Example graphs and loaders

var App = window.App || (window.App = {});

const EXAMPLE_ALIASES = {
  agv_config: 'carrier',
  carrier_config: 'carrier'
};
const DEFAULT_EXAMPLE_KEY = 'sample_line2';

const EXAMPLE_FILES = {
  simple: 'sample/simple.json',
  branch: 'sample/branch.json',
  shuttle_line5: 'sample/shuttle_line5.json',
  carrier: 'sample/graph (3).json',
  pallet_station_demo: 'sample/pallet_station_demo.json',
  sample_line1: 'sample/sample_line1.json',
  sample_line2: 'sample/sample_line2.json?v=20260313a'
};

function shouldAutoStartFromUrl(){
  try{
    const qs = new URLSearchParams(window.location.search || '');
    return qs.get('autoStart') === '1';
  }catch(_e){
    return false;
  }
}

function queueAutoStart(){
  let attempts = 0;
  const maxAttempts = 80;
  const tryStart = ()=>{
    if(typeof window.startSimulation !== 'function') return false;
    if(window.App && window.App.graph && typeof window.App.graph.status === 'number' && window.App.graph.status === window.LGraph.STATUS_RUNNING){
      return true;
    }
    try{
      window.startSimulation();
      return true;
    }catch(_e){
      return false;
    }
  };
  if(tryStart()) return;
  const timer = window.setInterval(()=>{
    attempts += 1;
    if(tryStart() || attempts >= maxAttempts){
      window.clearInterval(timer);
    }
  }, 250);
}

function resolveExampleKey(kind){
  const key = String(kind || '').trim();
  if(!key) return '';
  return EXAMPLE_ALIASES[key] || key;
}

function getDefaultExampleKey(){
  return DEFAULT_EXAMPLE_KEY;
}

function syncExampleSelection(kind){
  const sel = document.getElementById('exampleSelect');
  if(!sel) return;
  const key = resolveExampleKey(kind) || DEFAULT_EXAMPLE_KEY;
  sel.value = key;
}

function encodeRequestPath(path){
  const raw = String(path || '');
  const qIndex = raw.indexOf('?');
  const hashIndex = raw.indexOf('#');
  const splitIndex = [qIndex, hashIndex].filter((v)=> v >= 0).sort((a, b)=> a - b)[0];
  const pathname = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const suffix = splitIndex >= 0 ? raw.slice(splitIndex) : '';
  return pathname
    .split('/')
    .map((segment, index)=>{
      if(index === 0 && segment === '') return '';
      return encodeURIComponent(segment);
    })
    .join('/') + suffix;
}

function _nextGraphLoadToken(){
  if(typeof App.bumpGraphLoadRevision === 'function'){
    return App.bumpGraphLoadRevision();
  }
  App._graphLoadRevision = (Number(App._graphLoadRevision) || 0) + 1;
  return App._graphLoadRevision;
}

function _isLatestGraphLoadToken(token){
  const current = (typeof App.getGraphLoadRevision === 'function')
    ? App.getGraphLoadRevision()
    : (Number(App._graphLoadRevision) || 0);
  return token === current;
}

function makeExample(kind){
  const token = _nextGraphLoadToken();
  const key = resolveExampleKey(kind);
  if(!key) return;
  const data = window.EXAMPLES && window.EXAMPLES[key];
  const isFileProtocol = String(window.location?.protocol || '').toLowerCase() === 'file:';
  if(isFileProtocol && data){
    // file:// cannot fetch local JSON in many browsers; use bundled JS examples.
    if(_isLatestGraphLoadToken(token)) applyExampleData(data);
    return Promise.resolve(true);
  }
  const file = EXAMPLE_FILES[key] || `sample/${key}.json`;
  if(file){
    return loadExampleFromFile(file, key, data, token);
  }
  if(data){
    if(_isLatestGraphLoadToken(token)) applyExampleData(data);
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
}

function applyExampleData(data){
  if(!App.graph) return;
  let payload = data;
  try{
    payload = JSON.parse(JSON.stringify(data));
  }catch(_e){
    payload = data;
  }
  if(typeof App.applyGraphData === 'function'){
    App.applyGraphData(payload, { source: 'example' });
  }else{
    stopSimulation();
    App.history.lock = true;
    try{
      App.graph.clear();
      App.graph.configure(payload);
      if(typeof window.normalizeGraphOverlaySizes === 'function'){
        window.normalizeGraphOverlaySizes(App.graph);
      }
      if(App.repairGraphLinks && typeof App.repairGraphLinks === "function"){
        App.repairGraphLinks(App.graph);
      }
      if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
        App.stopGroups.restoreSerializedData(App.graph, payload, false);
      }
    }finally{
      App.history.lock = false;
    }
    configureGraphClock(App.graph);
    if(typeof window.resetSimClock === 'function') window.resetSimClock();
    updateSimTime();
    if(App.backgroundLayout && typeof App.backgroundLayout.restore === 'function'){
      App.backgroundLayout.restore(payload.__factSimBackground || null);
    }
    try{ if(App.canvas && App.canvas.draw) App.canvas.draw(true,true); }catch(e){}
    resetHistory();
    attachTimeline();
  }
  try{
    if(typeof App.refreshSidebarChrome === 'function') App.refreshSidebarChrome();
  }catch(_e){}
}

function loadExampleFromFile(path, key, fallbackData, token){
  if(!App.graph) return Promise.resolve(false);
  const requestPath = encodeRequestPath(path);
  return fetch(requestPath)
    .then(r=>{ if(!r.ok) throw new Error(`Load failed: ${r.status}`); return r.json(); })
    .then(data=>{
      if(!_isLatestGraphLoadToken(token)) return false;
      applyExampleData(data);
      return true;
    })
    .catch(err=>{
      if(!_isLatestGraphLoadToken(token)) return false;
      const fallback = fallbackData || (window.EXAMPLES && window.EXAMPLES[resolveExampleKey(key)]);
      if(fallback){
        console.warn(`[examples] fallback to embedded data for "${key}"`, err);
        applyExampleData(fallback);
        return true;
      }
      alert('Failed to load JSON');
      console.error(err);
      return false;
    });
}

function initExamples(){
  const sel = document.getElementById('exampleSelect');
  if(sel){
    sel.addEventListener('change', e=>{
      const v = e.target.value; if(!v) return;
      Promise.resolve(makeExample(v)).then(()=>{
        try{
          if(typeof App.refreshSidebarChrome === 'function') App.refreshSidebarChrome();
        }catch(_e){}
      });
    });
  }

  // Default example: sample_line2
  syncExampleSelection(DEFAULT_EXAMPLE_KEY);
  const loadPromise = makeExample(DEFAULT_EXAMPLE_KEY);
  Promise.resolve(loadPromise).then(()=>{
    try{
      if(typeof App.refreshSidebarChrome === 'function') App.refreshSidebarChrome();
    }catch(_e){}
  });
  if(shouldAutoStartFromUrl()){
    Promise.resolve(loadPromise).then(()=>{
      queueAutoStart();
    });
  }
}

App.getDefaultExampleKey = getDefaultExampleKey;
App.loadDefaultExample = function(){
  const key = getDefaultExampleKey();
  syncExampleSelection(key);
  return Promise.resolve(makeExample(key));
};
App.resetToInitialState = function(){
  if(typeof window.stopSimulation === 'function'){
    try{ window.stopSimulation(); }catch(_e){}
  }
  if(typeof App.loadDefaultExample === 'function'){
    return App.loadDefaultExample();
  }
  return Promise.resolve(false);
};



