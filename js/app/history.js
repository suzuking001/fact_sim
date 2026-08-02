// Undo/redo history

var App = window.App || (window.App = {});

function _captureHistory(){
  if(App.history.lock || !App.graph) return;
  let snap;
  try{
    const data = App.graph.serialize();
    if(App.stopGroups && typeof App.stopGroups.injectSerializedData === 'function'){
      App.stopGroups.injectSerializedData(data, App.graph);
    }
    snap = JSON.stringify(data);
  }catch(_e){ return; }
  if(App.history.last === snap) return;
  App.history.undo.push(snap);
  if(App.history.undo.length > App.history.max) App.history.undo.shift();
  App.history.redo = [];
  App.history.last = snap;
}

function flushHistory(){
  if(App.history._timer){
    clearTimeout(App.history._timer);
    App.history._timer = null;
    _captureHistory();
  }
}

function pushHistory(){
  if(App.history.lock || !App.graph) return;
  const delay = App.history.debounceMs || 0;
  if(delay <= 0){
    _captureHistory();
    return;
  }
  if(App.history._timer) clearTimeout(App.history._timer);
  App.history._timer = setTimeout(()=>{
    App.history._timer = null;
    _captureHistory();
  }, delay);
}

function resetHistory(){
  if(!App.graph) return;
  try{
    App.history.lock = true;
    if(App.history._timer){
      clearTimeout(App.history._timer);
      App.history._timer = null;
    }
    const data = App.graph.serialize();
    if(App.stopGroups && typeof App.stopGroups.injectSerializedData === 'function'){
      App.stopGroups.injectSerializedData(data, App.graph);
    }
    const snap = JSON.stringify(data);
    App.history.undo = [snap];
    App.history.redo = [];
    App.history.last = snap;
  }finally{
    App.history.lock = false;
  }
}

function applySnapshot(snap){
  if(!App.graph || !snap) return;
  App.history.lock = true;
  try{
    const data = JSON.parse(snap);
    App.graph.clear();
    if(typeof App.resetEntityStore === 'function') App.resetEntityStore(App.graph);
    App.graph.configure(data);
    if(typeof window.normalizeGraphOverlaySizes === 'function'){
      window.normalizeGraphOverlaySizes(App.graph);
    }
    if(App.repairGraphLinks && typeof App.repairGraphLinks === "function"){
      App.repairGraphLinks(App.graph);
    }
    if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
      App.stopGroups.restoreSerializedData(App.graph, data, false);
    }
    configureGraphClock(App.graph);
    try{ if(App.canvas && App.canvas.draw) App.canvas.draw(true,true); }catch(_e){}
  }finally{
    App.history.lock = false;
  }
}

function undo(){
  flushHistory();
  if(App.history.lock || App.history.undo.length <= 1) return;
  const cur = App.history.undo.pop();
  App.history.redo.push(cur);
  const prev = App.history.undo[App.history.undo.length - 1];
  App.history.last = prev;
  applySnapshot(prev);
}

function redo(){
  flushHistory();
  if(App.history.lock || App.history.redo.length === 0) return;
  const snap = App.history.redo.pop();
  App.history.undo.push(snap);
  App.history.last = snap;
  applySnapshot(snap);
}


