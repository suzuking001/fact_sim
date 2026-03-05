// Graph initialization

var App = window.App || (window.App = {});

function applyGraphVisualTheme(){
  if(!window.LiteGraph || !window.LGraphCanvas) return;
  if(App.__graphVisualThemeApplied) return;
  App.__graphVisualThemeApplied = true;

  LiteGraph.NODE_TEXT_SIZE = 13;
  LiteGraph.NODE_TITLE_HEIGHT = 28;
  LiteGraph.NODE_SLOT_HEIGHT = 18;
  LiteGraph.NODE_TITLE_COLOR = '#111111';
  LiteGraph.NODE_SELECTED_TITLE_COLOR = '#111111';
  LiteGraph.NODE_DEFAULT_COLOR = '#f8f8f8';
  LiteGraph.NODE_DEFAULT_BGCOLOR = '#ffffff';
  LiteGraph.NODE_DEFAULT_BOXCOLOR = '#7c3aed';
  LiteGraph.NODE_BOX_OUTLINE_COLOR = '#111111';
  LiteGraph.LINK_COLOR = '#a3a3a3';
  LiteGraph.EVENT_LINK_COLOR = '#7c3aed';

  LGraphCanvas.link_type_colors = Object.assign({}, LGraphCanvas.link_type_colors || {}, {
    '-1': '#a3a3a3',
    number: '#a3a3a3',
    string: '#a3a3a3',
    boolean: '#7c3aed',
    event: '#7c3aed',
    action: '#7c3aed'
  });
}

function initGraph(){
  applyGraphVisualTheme();
  if(App.graph) stopSimulation();
  workCounter = 0;
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  if(App.stopGroups && typeof App.stopGroups.clearRuntimeState === 'function'){
    App.stopGroups.clearRuntimeState();
  }
  App.graph = new LGraph();
  App.graph.onAfterChange = ()=>{
    if(App.stopGroups && typeof App.stopGroups.onGraphChanged === 'function'){
      App.stopGroups.onGraphChanged();
    }
    pushHistory();
  };
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
  if(App.backgroundLayout && typeof App.backgroundLayout.attachCanvas === 'function'){
    App.backgroundLayout.attachCanvas(App.canvas);
  }
  // expose for other helpers that hook into canvas
  window.canvas = App.canvas;
  if(typeof window.__attachTitleEditor === 'function') window.__attachTitleEditor(App.canvas);
  // Keep canvas slightly translucent so the CSS grid stays visible.
  App.canvas.bgcolor = 'rgba(255,255,255,0.82)';
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
  if(App.backgroundLayout && typeof App.backgroundLayout.restore === 'function'){
    App.backgroundLayout.restore(null);
  }
  resetHistory();
  attachTimeline();
}

