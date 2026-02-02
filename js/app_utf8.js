// App wiring: script editor UI, graph init, examples, save/load, controls

// Script editor UI
const scriptEditorTextarea = document.getElementById('scriptEditorTextarea');
document.getElementById('scriptEditorSave').onclick = ()=>{
  const n = window.editingNode;
  if(n){ n.properties.script = scriptEditorTextarea.value; n._compiled = null; n.setDirtyCanvas(true,true); }
  document.getElementById('scriptEditorModal').style.display = 'none';
  window.editingNode = null;
};
document.getElementById('scriptEditorCancel').onclick = ()=>{
  document.getElementById('scriptEditorModal').style.display = 'none';
  window.editingNode = null;
};

// Graph init
let graph, canvas;

function configureGraphClock(g){
  if(!g) return;
  const dt = (typeof window.getSimDtSec === 'function') ? window.getSimDtSec() : 0.1;
  g.fixedtime_lapse = dt;
  g.fixedtime = 0;
  g.globaltime = 0;
  g.elapsed_time = 0;
  g.iteration = 0;
  g.status = LGraph.STATUS_STOPPED;
}

function startSimulation(){
  if(!graph) return;
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()) return;
  graph.status = LGraph.STATUS_RUNNING;
  graph.starttime = LiteGraph.getTime();
  graph.last_update_time = graph.starttime;
  graph.sendEventToAllNodes("onStart");
  window.startSimLoop(()=> graph.runStep(1, !graph.catch_errors));
}

function stopSimulation(){
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()){
    window.stopSimLoop();
  }
  if(graph && graph.status !== LGraph.STATUS_STOPPED){
    graph.status = LGraph.STATUS_STOPPED;
    graph.sendEventToAllNodes("onStop");
  }
}
function initGraph(){
  if(graph) stopSimulation();
  workCounter = 0;
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  graph = new LGraph();
  configureGraphClock(graph);
  canvas = new LGraphCanvas(graphElement, graph);
  // Make the canvas background white (node area backdrop)
  canvas.bgcolor = "#ffffff";
  function resize(){
    const r = canvas.canvas.getBoundingClientRect(), d = window.devicePixelRatio||1;
    canvas.canvas.width = r.width*d; canvas.canvas.height = r.height*d;
    canvas.resize(r.width, r.height); canvas.draw(true);
  }
  window.addEventListener('resize', resize); resize();
  // Place initial nodes lower so they don't hide under menus
  const src = LiteGraph.createNode('factory/source'); src.pos=[60,180];
  const eq  = LiteGraph.createNode('factory/equip');  eq.pos=[360,180];
  graph.add(src); graph.add(eq); src.connect(0,eq,0);
}
initGraph();

// Examples
function makeExample(kind){
  if(!graph) return; stopSimulation(); graph.clear(); if(typeof window.resetSimClock === 'function') window.resetSimClock();
  if(kind==='simple'){
    const s=LiteGraph.createNode('factory/source'); s.pos=[60,200];
    const e1=LiteGraph.createNode('factory/equip'); e1.pos=[360,200]; e1.properties.processTime=1;
    const e2=LiteGraph.createNode('factory/equip'); e2.pos=[660,200]; e2.properties.processTime=1;
    const k=LiteGraph.createNode('factory/sink'); k.pos=[960,200];
    graph.add(s); graph.add(e1); graph.add(e2); graph.add(k);
    s.connect(0,e1,0); e1.connect(0,e2,0); e2.connect(0,k,0);
  }else if(kind==='branch'){
    const s=LiteGraph.createNode('factory/source'); s.pos=[60,240];
    const sp=LiteGraph.createNode('factory/split'); sp.pos=[360,240];
    const a=LiteGraph.createNode('factory/equip'); a.title='Line A'; a.pos=[660,160]; a.properties.processTime=1;
    const b=LiteGraph.createNode('factory/equip'); b.title='Line B'; b.pos=[660,320]; b.properties.processTime=2;
    const k=LiteGraph.createNode('factory/sink'); k.pos=[960,240];
    graph.add(s); graph.add(sp); graph.add(a); graph.add(b); graph.add(k);
    s.connect(0,sp,0); sp.connect(0,a,0); sp.connect(1,b,0); a.connect(0,k,0); b.connect(0,k,0);
  }
  // reset time display (no auto start)
  updateSimTime();
  try{ if(canvas && canvas.draw) canvas.draw(true,true); }catch(e){}
}

document.getElementById('exampleSelect').addEventListener('change', e=>{ const v=e.target.value; if(!v) return; makeExample(v); });

// Save / Load
document.getElementById('btnSave').onclick = ()=>{
  const blob = new Blob([JSON.stringify(graph.serialize(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'graph.json'; a.click();
  URL.revokeObjectURL(url);
};

document.getElementById('btnLoad').onclick = ()=> document.getElementById('fileInput').click();
document.getElementById('fileInput').addEventListener('change', e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => { try{ graph.clear(); graph.configure(JSON.parse(r.result)); } catch(err){ alert('JSON隱ｭ霎ｼ螟ｱ謨・); console.error(err); } };
  r.readAsText(f);
});

// Controls
document.getElementById('btnStart').onclick = ()=>{
  startSimulation();
};
document.getElementById('btnStop').onclick = ()=>{
  stopSimulation();
};
document.getElementById('btnReset').onclick = ()=>{
  stopSimulation();
  initGraph();
};

