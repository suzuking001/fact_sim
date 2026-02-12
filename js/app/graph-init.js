// Graph initialization

function initGraph(){
  if(graph) stopSimulation();
  workCounter = 0;
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  graph = new LGraph();
  graph.onAfterChange = ()=> pushHistory();
  configureGraphClock(graph);
  canvas = new LGraphCanvas(graphElement, graph);
  canvas.multi_select = true;
  installBoxSelect(canvas);
  installBoxSelectOverlay(canvas);
  installClipboardHandlers(canvas);
  bindHistoryButtons();
  installFitHandlers(canvas);
  // expose for other helpers that hook into canvas
  window.canvas = canvas;
  if(typeof window.__attachTitleEditor === 'function') window.__attachTitleEditor(canvas);
  // Make the canvas background white (node area backdrop)
  canvas.bgcolor = '#ffffff';
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
  resetHistory();
  attachTimeline();
}
