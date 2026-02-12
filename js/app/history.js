// Undo/redo history

function pushHistory(){
  if(history.lock || !graph) return;
  let snap;
  try{ snap = JSON.stringify(graph.serialize()); }catch(_e){ return; }
  if(history.last === snap) return;
  history.undo.push(snap);
  if(history.undo.length > history.max) history.undo.shift();
  history.redo = [];
  history.last = snap;
}

function resetHistory(){
  if(!graph) return;
  try{
    history.lock = true;
    const snap = JSON.stringify(graph.serialize());
    history.undo = [snap];
    history.redo = [];
    history.last = snap;
  }finally{
    history.lock = false;
  }
}

function applySnapshot(snap){
  if(!graph || !snap) return;
  history.lock = true;
  try{
    graph.clear();
    graph.configure(JSON.parse(snap));
    configureGraphClock(graph);
    try{ if(canvas && canvas.draw) canvas.draw(true,true); }catch(_e){}
  }finally{
    history.lock = false;
  }
}

function undo(){
  if(history.lock || history.undo.length <= 1) return;
  const cur = history.undo.pop();
  history.redo.push(cur);
  const prev = history.undo[history.undo.length - 1];
  history.last = prev;
  applySnapshot(prev);
}

function redo(){
  if(history.lock || history.redo.length === 0) return;
  const snap = history.redo.pop();
  history.undo.push(snap);
  history.last = snap;
  applySnapshot(snap);
}
