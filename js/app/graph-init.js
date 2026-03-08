// Graph initialization

var App = window.App || (window.App = {});

function applyGraphVisualTheme(){
  if(!window.LiteGraph || !window.LGraphCanvas) return;
  if(App.__graphVisualThemeApplied) return;
  App.__graphVisualThemeApplied = true;

  const clamp01 = (v)=> Math.max(0, Math.min(1, Number(v) || 0));
  const parseColor = (value)=>{
    const s = String(value || '').trim();
    if(!s) return null;
    let m = s.match(/^#([0-9a-f]{3})$/i);
    if(m){
      const hex = m[1];
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16)
      ];
    }
    m = s.match(/^#([0-9a-f]{6})$/i);
    if(m){
      const hex = m[1];
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    }
    m = s.match(/^rgba?\(([^)]+)\)$/i);
    if(m){
      const parts = m[1].split(',').map(v => Number(v.trim()));
      if(parts.length >= 3 && parts.every(v => isFinite(v))){
        return parts.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(v))));
      }
    }
    return null;
  };
  const mixColor = (from, to, amount)=>{
    const a = parseColor(from);
    const b = parseColor(to);
    if(!a || !b) return from;
    const t = clamp01(amount);
    const rgb = a.map((v, i)=> Math.round(v + (b[i] - v) * t));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  };

  LiteGraph.NODE_TEXT_SIZE = 12;
  LiteGraph.NODE_TITLE_HEIGHT = 26;
  LiteGraph.NODE_SLOT_HEIGHT = 18;
  LiteGraph.NODE_TITLE_COLOR = '#111111';
  LiteGraph.NODE_SELECTED_TITLE_COLOR = '#111111';
  LiteGraph.NODE_DEFAULT_COLOR = '#e8f2ff';
  LiteGraph.NODE_DEFAULT_BGCOLOR = '#ffffff';
  LiteGraph.NODE_DEFAULT_BOXCOLOR = '#0a84ff';
  LiteGraph.NODE_BOX_OUTLINE_COLOR = '#d4dde9';
  LiteGraph.LINK_COLOR = '#b9bec8';
  LiteGraph.EVENT_LINK_COLOR = '#0a84ff';

  LGraphCanvas.link_type_colors = Object.assign({}, LGraphCanvas.link_type_colors || {}, {
    '-1': '#b9bec8',
    number: '#b9bec8',
    string: '#b9bec8',
    boolean: '#0a84ff',
    event: '#0a84ff',
    action: '#0a84ff'
  });

  if(!LGraphCanvas.prototype.__factZoomContrastPatched){
    const prevDrawNodeShape = LGraphCanvas.prototype.drawNodeShape;
    LGraphCanvas.prototype.drawNodeShape = function(node, ctx, size, fgcolor, bgcolor, selected, mouse_over){
      const scale = Number(this && this.ds && this.ds.scale) || 1;
      let nextFg = fgcolor;
      let nextBg = bgcolor;
      if(scale < 0.78){
        const strength = clamp01((0.78 - scale) / 0.38);
        const accent = (node && (node.boxcolor || node.color)) || fgcolor || '#111111';
        nextFg = mixColor(fgcolor, accent, 0.18 + strength * 0.28);
        nextBg = mixColor(bgcolor, accent, 0.08 + strength * 0.18);
      }

      const result = prevDrawNodeShape.call(this, node, ctx, size, nextFg, nextBg, selected, mouse_over);

      if(scale < 0.78 && node && !(node.flags && node.flags.collapsed)){
        const strength = clamp01((0.78 - scale) / 0.38);
        const titleMode = node.constructor && node.constructor.title_mode;
        const showTitle = !(titleMode === LiteGraph.TRANSPARENT_TITLE || titleMode === LiteGraph.NO_TITLE) ||
          (titleMode === LiteGraph.AUTOHIDE_TITLE && mouse_over);
        const titleHeight = showTitle ? (LiteGraph.NODE_TITLE_HEIGHT || 26) : 0;
        const top = showTitle ? -titleHeight : 0;
        const totalHeight = (Number(size && size[1]) || 0) + titleHeight;
        ctx.save();
        ctx.strokeStyle = mixColor((node.boxcolor || nextFg || '#111111'), '#111111', 0.12);
        ctx.globalAlpha = 0.26 + strength * 0.34 + (selected ? 0.1 : 0);
        ctx.lineWidth = Math.min(3.2, 1.15 / Math.max(scale, 0.42));
        ctx.strokeRect(0.5, top + 0.5, (Number(size && size[0]) || 0), Math.max(0, totalHeight - 1));
        ctx.restore();
      }
      return result;
    };
    LGraphCanvas.prototype.__factZoomContrastPatched = true;
  }
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
  if(typeof window.installContextMenuPointerTracking === 'function'){
    window.installContextMenuPointerTracking(App.canvas);
  }
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
  // Let the CSS workspace background show through; do not use LiteGraph's bitmap pattern.
  App.canvas.background_image = null;
  App.canvas.pattern = null;
  App.canvas.clear_background_color = '#f6f8fb';
  App.canvas.bgcolor = 'rgba(248,250,253,0.9)';
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
  if(typeof window.enforceNodeOverlayMinSize === 'function'){
    try{ window.enforceNodeOverlayMinSize(src); }catch(_e){}
    try{ window.enforceNodeOverlayMinSize(eq); }catch(_e){}
  }
  App.graph.add(src); App.graph.add(eq); src.connect(0,eq,0);
  if(App.backgroundLayout && typeof App.backgroundLayout.restore === 'function'){
    App.backgroundLayout.restore(null);
  }
  resetHistory();
  attachTimeline();
}

