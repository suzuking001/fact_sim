// Graph initialization

var App = window.App || (window.App = {});

function applyGraphVisualTheme(){
  if(!window.LiteGraph || !window.LGraphCanvas) return;

  const readThemeValue = (name, fallback)=>{
    try{
      const value = String(getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim();
      return value || fallback;
    }catch(_e){
      return fallback;
    }
  };

  // LiteGraph defaults to mouse-only listeners. Prefer pointer events so
  // touch devices can pan and interact with the graph canvas.
  if(window.PointerEvent){
    LiteGraph.pointerevents_method = 'pointer';
  }else if(('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0)){
    LiteGraph.pointerevents_method = 'touch';
  }

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

  App.__graphThemeCache = {
    gridMinor: readThemeValue('--graph-grid-minor', 'rgba(17,17,17,0.045)'),
    gridMinorDense: readThemeValue('--graph-grid-minor-dense', 'rgba(17,17,17,0.03)'),
    gridMajor: readThemeValue('--graph-grid-major', 'rgba(10,132,255,0.08)'),
    gridMajorDense: readThemeValue('--graph-grid-major-dense', 'rgba(10,132,255,0.055)'),
    canvasClear: readThemeValue('--graph-canvas-clear', '#f6f8fb'),
    canvasBg: readThemeValue('--graph-canvas-bg', 'rgba(248,250,253,0.9)'),
    selectedLink: readThemeValue('--graph-link-selected', '#6d28d9'),
    selectedLinkGlow: readThemeValue('--graph-link-selected-glow', 'rgba(109,40,217,0.34)')
  };

  LiteGraph.NODE_TEXT_SIZE = 12;
  LiteGraph.NODE_TITLE_HEIGHT = 26;
  LiteGraph.NODE_SLOT_HEIGHT = 18;
  LiteGraph.NODE_TITLE_COLOR = readThemeValue('--graph-node-title', '#111111');
  LiteGraph.NODE_SELECTED_TITLE_COLOR = readThemeValue('--graph-node-title', '#111111');
  LiteGraph.NODE_DEFAULT_COLOR = readThemeValue('--graph-node-title-fill', '#e8f2ff');
  LiteGraph.NODE_DEFAULT_BGCOLOR = readThemeValue('--graph-node-bg', '#ffffff');
  LiteGraph.NODE_DEFAULT_BOXCOLOR = readThemeValue('--graph-node-accent', '#0a84ff');
  LiteGraph.NODE_BOX_OUTLINE_COLOR = readThemeValue('--graph-node-outline', '#d4dde9');
  LiteGraph.LINK_COLOR = readThemeValue('--graph-link', '#b9bec8');
  LiteGraph.EVENT_LINK_COLOR = readThemeValue('--graph-event-link', '#0a84ff');

  LGraphCanvas.link_type_colors = Object.assign({}, LGraphCanvas.link_type_colors || {}, {
    '-1': readThemeValue('--graph-link', '#b9bec8'),
    number: readThemeValue('--graph-link', '#b9bec8'),
    string: readThemeValue('--graph-link', '#b9bec8'),
    boolean: readThemeValue('--graph-event-link', '#0a84ff'),
    event: readThemeValue('--graph-event-link', '#0a84ff'),
    action: readThemeValue('--graph-event-link', '#0a84ff')
  });

  if(!LGraphCanvas.prototype.__factSelectedLinkContrastPatched){
    const prevRenderLink = LGraphCanvas.prototype.renderLink;
    LGraphCanvas.prototype.renderLink = function(ctx, start, end, link){
      const linkId = link && link.id;
      const highlighted = linkId != null && !!this.highlighted_links?.[linkId];
      if(!highlighted) return prevRenderLink.apply(this, arguments);

      const args = Array.from(arguments);
      const theme = App.__graphThemeCache || {};
      const selectedColor = theme.selectedLink || '#6d28d9';
      const selectedGlow = theme.selectedLinkGlow || 'rgba(109,40,217,0.34)';
      const scale = Math.max(0.0001, Number(this.ds?.scale) || 1);
      const previousWidth = Number(this.connections_width) || 2;
      const hadHighlight = Object.prototype.hasOwnProperty.call(this.highlighted_links, linkId);
      const previousHighlight = this.highlighted_links[linkId];
      args[6] = selectedColor;

      try{
        delete this.highlighted_links[linkId];
        this.connections_width = Math.max(previousWidth, 2.8 / scale);
        ctx.save();
        ctx.shadowColor = selectedGlow;
        ctx.shadowBlur = 8 / scale;
        return prevRenderLink.apply(this, args);
      }finally{
        ctx.restore();
        this.connections_width = previousWidth;
        if(hadHighlight) this.highlighted_links[linkId] = previousHighlight;
      }
    };
    LGraphCanvas.prototype.__factSelectedLinkContrastPatched = true;
  }

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

  App.refreshGraphTheme = function(){
    applyGraphVisualTheme();
    if(App.graph && Array.isArray(App.graph._nodes)){
      for(const node of App.graph._nodes){
        if(node && typeof node._applyTheme === 'function'){
          try{ node._applyTheme(); }catch(_e){}
        }else if(node && typeof node.onThemeChanged === 'function'){
          try{ node.onThemeChanged('light'); }catch(_e){}
        }
      }
    }
    if(!App.canvas) return;
    App.canvas.background_image = null;
    App.canvas.pattern = null;
    App.canvas.clear_background_color = App.__graphThemeCache.canvasClear;
    App.canvas.bgcolor = App.__graphThemeCache.canvasBg;
    try{
      if(typeof App.canvas.setDirty === 'function') App.canvas.setDirty(true, true);
      if(typeof App.canvas.draw === 'function') App.canvas.draw(true);
    }catch(_e){}
  };
}

function drawEditorGrid(ctx, visibleArea, canvas){
  if(!ctx || !visibleArea || !canvas || !canvas.ds) return;
  const bgMeta = (App.backgroundLayout && typeof App.backgroundLayout.getMeta === 'function')
    ? App.backgroundLayout.getMeta()
    : null;
  if(bgMeta && bgMeta.enabled && bgMeta.hasImage) return;

  const scale = Math.max(0.0001, Number(canvas.ds.scale) || 1);
  const left = Number(visibleArea[0]) || 0;
  const top = Number(visibleArea[1]) || 0;
  const width = Number(visibleArea[2]) || 0;
  const height = Number(visibleArea[3]) || 0;
  if(width <= 0 || height <= 0) return;

  const baseMinor = 24;
  const baseMajor = 120;
  const minorScreenStep = baseMinor * scale;
  const majorScreenStep = baseMajor * scale;
  const lineWidth = Math.min(1.5, Math.max(0.5, 1 / scale));

  const theme = App.__graphThemeCache || {};

  const drawLines = (step, color)=>{
    if(step * scale < 14) return;
    const right = left + width;
    const bottom = top + height;
    const startX = Math.floor(left / step) * step;
    const startY = Math.floor(top / step) * step;
    ctx.beginPath();
    for(let x = startX; x <= right + step; x += step){
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for(let y = startY; y <= bottom + step; y += step){
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };

  ctx.save();
  drawLines(baseMinor, minorScreenStep >= 20
    ? (theme.gridMinor || 'rgba(17,17,17,0.045)')
    : (theme.gridMinorDense || 'rgba(17,17,17,0.03)'));
  drawLines(baseMajor, majorScreenStep >= 20
    ? (theme.gridMajor || 'rgba(10,132,255,0.08)')
    : (theme.gridMajorDense || 'rgba(10,132,255,0.055)'));
  ctx.restore();
}

function installTouchPanZoom(canvas){
  if(!canvas || canvas.__factTouchPanZoomHooked) return;
  const el = canvas.canvas;
  if(!el || typeof window.PointerEvent === 'undefined') return;
  const hasTouch = ('ontouchstart' in window) || ((navigator && navigator.maxTouchPoints) ? navigator.maxTouchPoints > 0 : false);
  if(!hasTouch) return;

  const activePointers = new Map();
  let pinch = null;
  let suppressContextMenuUntil = 0;

  const isTouchPointer = (event)=> !!event && (event.pointerType === 'touch' || event.pointerType === 'pen');
  const nowMs = ()=> (window.performance && typeof window.performance.now === 'function')
    ? window.performance.now()
    : Date.now();
  const bumpContextMenuSuppression = (ms = 900)=>{
    suppressContextMenuUntil = Math.max(suppressContextMenuUntil, nowMs() + Math.max(0, Number(ms) || 0));
  };
  const closeContextMenus = ()=>{
    try{
      if(window.LiteGraph && typeof window.LiteGraph.closeAllContextMenus === 'function'){
        window.LiteGraph.closeAllContextMenus(window);
        return;
      }
    }catch(_e){}
    try{
      document.querySelectorAll('.litegraph.litecontextmenu').forEach((menu)=> menu.remove());
    }catch(_e){}
  };
  const shouldSuppressContextMenu = ()=> !!pinch || activePointers.size > 0 || nowMs() < suppressContextMenuUntil;
  const readPoints = ()=>{
    const values = Array.from(activePointers.values());
    if(values.length < 2) return null;
    return [values[0], values[1]];
  };
  const centerOf = (a, b)=> ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });
  const distanceOf = (a, b)=> Math.hypot(a.x - b.x, a.y - b.y);
  const cancelCanvasDrag = ()=>{
    try{ canvas.dragging_canvas = false; }catch(_e){}
    try{ canvas.dragging_rectangle = null; }catch(_e){}
    try{ canvas.node_dragged = null; }catch(_e){}
    try{ canvas.last_mouse_dragging = false; }catch(_e){}
    try{ canvas.pointer_is_down = false; }catch(_e){}
  };
  const beginPinch = ()=>{
    const points = readPoints();
    if(!points) return;
    const [a, b] = points;
    pinch = {
      startScale: Number(canvas.ds && canvas.ds.scale) || 1,
      startDistance: Math.max(1, distanceOf(a, b)),
      lastCenter: centerOf(a, b)
    };
    bumpContextMenuSuppression(1200);
    closeContextMenus();
    cancelCanvasDrag();
  };
  const updatePinch = ()=>{
    if(!pinch) return;
    const points = readPoints();
    if(!points){
      pinch = null;
      return;
    }
    const [a, b] = points;
    const distance = Math.max(1, distanceOf(a, b));
    const center = centerOf(a, b);
    const nextScale = pinch.startScale * (distance / pinch.startDistance);
    if(canvas.ds && typeof canvas.ds.changeScale === 'function'){
      canvas.ds.changeScale(nextScale, [center.x, center.y]);
      const currentScale = Number(canvas.ds.scale) || 1;
      const dx = center.x - pinch.lastCenter.x;
      const dy = center.y - pinch.lastCenter.y;
      canvas.ds.offset[0] += dx / currentScale;
      canvas.ds.offset[1] += dy / currentScale;
      pinch.lastCenter = center;
    }
    try{
      if(typeof canvas.setDirty === 'function') canvas.setDirty(true, true);
      if(canvas.graph && typeof canvas.graph.change === 'function') canvas.graph.change();
    }catch(_e){}
  };

  const onPointerDown = (event)=>{
    if(!isTouchPointer(event)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    bumpContextMenuSuppression();
    if(activePointers.size === 2){
      beginPinch();
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onPointerMove = (event)=>{
    if(!isTouchPointer(event) || !activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    bumpContextMenuSuppression();
    if(!pinch || activePointers.size < 2) return;
    updatePinch();
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerEnd = (event)=>{
    if(!isTouchPointer(event)) return;
    bumpContextMenuSuppression();
    if(activePointers.has(event.pointerId)) activePointers.delete(event.pointerId);
    if(activePointers.size < 2){
      pinch = null;
      closeContextMenus();
    }
    if(canvas && typeof canvas.setDirty === 'function') canvas.setDirty(true, true);
    if(shouldSuppressContextMenu()){
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onContextMenu = (event)=>{
    if(!shouldSuppressContextMenu()) return;
    closeContextMenus();
    event.preventDefault();
    event.stopPropagation();
  };

  el.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
  el.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
  el.addEventListener('pointerup', onPointerEnd, { capture: true, passive: false });
  el.addEventListener('pointercancel', onPointerEnd, { capture: true, passive: false });
  el.addEventListener('pointerleave', onPointerEnd, { capture: true, passive: false });
  el.addEventListener('contextmenu', onContextMenu, { capture: true, passive: false });
  canvas.__factTouchPanZoomCleanup = ()=>{
    el.removeEventListener('pointerdown', onPointerDown, true);
    el.removeEventListener('pointermove', onPointerMove, true);
    el.removeEventListener('pointerup', onPointerEnd, true);
    el.removeEventListener('pointercancel', onPointerEnd, true);
    el.removeEventListener('pointerleave', onPointerEnd, true);
    el.removeEventListener('contextmenu', onContextMenu, true);
    activePointers.clear();
    pinch = null;
  };
  canvas.__factTouchPanZoomHooked = true;
}

function disposeGraphCanvas(canvas){
  if(!canvas) return;
  try{
    if(typeof canvas.__factTouchPanZoomCleanup === 'function') canvas.__factTouchPanZoomCleanup();
  }catch(_e){}
  try{
    if(typeof canvas.__factMenuPointerTrackingCleanup === 'function') canvas.__factMenuPointerTrackingCleanup();
  }catch(_e){}
  try{
    if(typeof canvas.stopRendering === 'function') canvas.stopRendering();
  }catch(_e){}
  try{
    if(typeof canvas.setGraph === 'function') canvas.setGraph(null);
  }catch(_e){}
  try{
    // setCanvas(null) invokes LiteGraph's unbindEvents() for the shared HTML
    // canvas. Without this, every initGraph() leaves another renderer and
    // pointer-listener set painting the previous graph into the same element.
    if(typeof canvas.setCanvas === 'function') canvas.setCanvas(null);
    else if(typeof canvas.unbindEvents === 'function') canvas.unbindEvents();
  }catch(_e){}
}
App.disposeGraphCanvas = disposeGraphCanvas;

function initGraph(){
  applyGraphVisualTheme();
  if(App.graph) stopSimulation();
  if(typeof App.clearRuntimeVisualState === 'function'){
    App.clearRuntimeVisualState(App.graph || null);
  }
  workCounter = 0;
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  if(App.stopGroups && typeof App.stopGroups.clearRuntimeState === 'function'){
    App.stopGroups.clearRuntimeState();
  }
  const previousCanvas = App.canvas;
  App.canvas = null;
  disposeGraphCanvas(previousCanvas);
  App.graph = new LGraph();
  if(typeof App.restoreEntityModel === 'function'){
    App.restoreEntityModel(App.graph, { __factSimEntityModel: { schemaVersion: 3, types: [] } }, true);
  }
  App.graph.onAfterChange = ()=>{
    if(App.stopGroups && typeof App.stopGroups.onGraphChanged === 'function'){
      App.stopGroups.onGraphChanged();
    }
    pushHistory();
  };
  configureGraphClock(App.graph);
  App.canvas = new LGraphCanvas(graphElement, App.graph);
  App.canvas.render_canvas_border = false;
  if(graphElement && graphElement.style){
    graphElement.style.touchAction = 'none';
  }
  if(App.timelineChart && typeof App.timelineChart.attachGraph === 'function'){
    App.timelineChart.attachGraph(App.graph);
  }
  if(App.nodePropsPanel && typeof App.nodePropsPanel.attachGraph === 'function'){
    App.nodePropsPanel.attachGraph(App.graph);
  }
  if(App.selectionInspector){
    if(typeof App.selectionInspector.attachGraph === 'function'){
      App.selectionInspector.attachGraph(App.graph);
    }
    if(typeof App.selectionInspector.attachCanvas === 'function'){
      App.selectionInspector.attachCanvas(App.canvas);
    }
  }
  App.canvas.onDrawBackground = function(ctx, visibleArea){
    drawEditorGrid(ctx, visibleArea, this);
  };
  if(typeof window.installContextMenuPointerTracking === 'function'){
    window.installContextMenuPointerTracking(App.canvas);
  }
  if(typeof App.installCanvasRenderThrottle === 'function'){
    App.installCanvasRenderThrottle(App.canvas);
  }
  App.canvas.multi_select = true;
  installTouchPanZoom(App.canvas);
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
  if(typeof window.installWorkLinkAnimationLayer === 'function'){
    window.installWorkLinkAnimationLayer(App.canvas);
  }
  if(typeof window.installNodeDetailOverlayLayer === 'function'){
    window.installNodeDetailOverlayLayer(App.canvas);
  }
  // expose for other helpers that hook into canvas
  window.canvas = App.canvas;
  // Let the CSS workspace background show through; do not use LiteGraph's bitmap pattern.
  App.canvas.background_image = null;
  App.canvas.pattern = null;
  App.canvas.clear_background_color = (App.__graphThemeCache && App.__graphThemeCache.canvasClear) || '#f6f8fb';
  App.canvas.bgcolor = (App.__graphThemeCache && App.__graphThemeCache.canvasBg) || 'rgba(248,250,253,0.9)';
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
  const src = LiteGraph.createNode('factory/basic');
  if(typeof App.configureBasicSequenceGenerator === 'function') App.configureBasicSequenceGenerator(src);
  src.title = 'Source';
  src.pos=[60,180];
  const eq = LiteGraph.createNode('factory/basic');
  App.applyBasicTemplate?.(eq, 'machine');
  eq.pos=[360,180];
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

