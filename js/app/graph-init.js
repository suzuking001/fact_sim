// Graph initialization

var App = window.App || (window.App = {});

function initGraph(){
  if(App.graph) stopSimulation();
  workCounter = 0;
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  App.graph = new LGraph();
  App.graph.onAfterChange = ()=> pushHistory();
  configureGraphClock(App.graph);
  App.canvas = new LGraphCanvas(graphElement, App.graph);
  if(typeof App.installCanvasRenderThrottle === 'function'){
    App.installCanvasRenderThrottle(App.canvas);
  }
  App.canvas.multi_select = true;
  installBoxSelect(App.canvas);
  installBoxSelectOverlay(App.canvas);
  installClipboardHandlers(App.canvas);
  installTimelineNodeSelection(App.canvas);
  bindHistoryButtons();
  installFitHandlers(App.canvas);
  if(typeof installPlacementHandlers === 'function') installPlacementHandlers(App.canvas);
  // expose for other helpers that hook into canvas
  window.canvas = App.canvas;
  if(typeof window.__attachTitleEditor === 'function') window.__attachTitleEditor(App.canvas);
  // Make the canvas background white (node area backdrop)
  App.canvas.bgcolor = '#ffffff';
  function resize(){
    const r = App.canvas.canvas.getBoundingClientRect(), d = window.devicePixelRatio||1;
    App.canvas.canvas.width = r.width*d; App.canvas.canvas.height = r.height*d;
    App.canvas.resize(r.width, r.height); App.canvas.draw(true);
  }
  const controller = App.resetListenerController('__graphResizeController');
  const opts = App.listenerOptions(false, controller);
  window.addEventListener('resize', resize, opts);
  resize();
  // Place initial nodes lower so they don't hide under menus
  const src = LiteGraph.createNode('factory/source'); src.pos=[60,180];
  const eq  = LiteGraph.createNode('factory/equip');  eq.pos=[360,180];
  App.graph.add(src); App.graph.add(eq); src.connect(0,eq,0);
  resetHistory();
  attachTimeline();
}

