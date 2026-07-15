// Shared app state and small UI helpers

var App = window.App || (window.App = {});

App.graph = null;
App.canvas = null;
App.timelineChart = null;
App.toastTimer = null;
App.engine = null;
App.simMode = App.simMode || 'dt';
App._controllers = App._controllers || {};
App.placement = App.placement || { active: false, kind: '', item: null, pendingChange: false };
App.render = App.render || {
  fps: 60,
  lastGraphDrawMs: 0,
  lastTimelineDrawMs: 0,
  suppressAll: false,
  lastFrameAtMs: 0,
  frameFps: 0,
  frameFpsSmooth: 0
};

App.showToast = function(msg){
  const toast = document.getElementById('toast');
  if(!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if(App.toastTimer) clearTimeout(App.toastTimer);
  App.toastTimer = setTimeout(()=> toast.classList.remove('show'), 1000);
};

App.history = {
  undo: [],
  redo: [],
  lock: false,
  last: null,
  max: 50,
  debounceMs: 150,
  _timer: null
};

// Monotonic token for any async graph load/apply path.
App._graphLoadRevision = Number(App._graphLoadRevision) || 0;
// Separate counter for graph payloads that were actually applied. A load token is
// allocated before fetch/decompression starts, so it must not be used as a
// readiness signal by the landing preview.
App._graphApplyRevision = Number(App._graphApplyRevision) || 0;
App.bumpGraphLoadRevision = function(){
  App._graphLoadRevision = (Number(App._graphLoadRevision) || 0) + 1;
  return App._graphLoadRevision;
};
App.getGraphLoadRevision = function(){
  return Number(App._graphLoadRevision) || 0;
};
App.markGraphApplied = function(){
  App._graphApplyRevision = (Number(App._graphApplyRevision) || 0) + 1;
  return App._graphApplyRevision;
};
App.getGraphApplyRevision = function(){
  return Number(App._graphApplyRevision) || 0;
};

// LiteGraph is configured for Pointer Events on modern browsers. Custom canvas
// interactions must use the same event family; preventing a pointer event can
// suppress the compatibility mouse event entirely.
App.getCanvasInputEvents = function(){
  const usePointer = (typeof window !== 'undefined') && (typeof window.PointerEvent === 'function');
  return usePointer
    ? { down:'pointerdown', move:'pointermove', up:'pointerup', leave:'pointerleave' }
    : { down:'mousedown', move:'mousemove', up:'mouseup', leave:'mouseleave' };
};

App.resetListenerController = function(key){
  try{
    const prev = App._controllers[key];
    if(prev && typeof prev.abort === 'function') prev.abort();
  }catch(_e){}
  if(typeof AbortController !== 'function'){
    const dummy = { signal: null, abort: ()=>{} };
    App._controllers[key] = dummy;
    return dummy;
  }
  const controller = new AbortController();
  App._controllers[key] = controller;
  return controller;
};

App.listenerOptions = function(capture, controller){
  if(controller && controller.signal) return { capture: !!capture, signal: controller.signal };
  return !!capture;
};

App.getRenderFpsOptions = function(){
  return [15, 30, 60];
};

App.normalizeRenderFps = function(value){
  const options = App.getRenderFpsOptions();
  const n = Number(value);
  if(!isFinite(n)) return 60;
  let best = options[0];
  let bestDiff = Math.abs(best - n);
  for(let i = 1; i < options.length; i++){
    const diff = Math.abs(options[i] - n);
    if(diff < bestDiff){
      best = options[i];
      bestDiff = diff;
    }
  }
  return best;
};

App.getRenderFps = function(){
  const fps = App.normalizeRenderFps(App.render && App.render.fps);
  App.render.fps = fps;
  return fps;
};

App.resetRenderBudget = function(){
  if(!App.render) return;
  App.render.lastGraphDrawMs = 0;
  App.render.lastTimelineDrawMs = 0;
};

App.resetRenderFpsStats = function(){
  if(!App.render) return;
  App.render.lastFrameAtMs = 0;
  App.render.frameFps = 0;
  App.render.frameFpsSmooth = 0;
};

App.recordRenderedFrame = function(nowMs){
  if(!App.render) return;
  const now = Number(nowMs);
  if(!isFinite(now)) return;
  const prev = Number(App.render.lastFrameAtMs) || 0;
  App.render.lastFrameAtMs = now;
  if(prev <= 0) return;
  const dt = now - prev;
  if(!isFinite(dt) || dt <= 0) return;
  const instant = 1000 / dt;
  App.render.frameFps = instant;
  const prevSmooth = Number(App.render.frameFpsSmooth) || 0;
  if(prevSmooth <= 0){
    App.render.frameFpsSmooth = instant;
  }else{
    const alpha = 0.18;
    App.render.frameFpsSmooth = prevSmooth + (instant - prevSmooth) * alpha;
  }
};

App.getRealtimeRenderFps = function(){
  if(!App.render) return 0;
  const smooth = Number(App.render.frameFpsSmooth) || 0;
  if(!isFinite(smooth) || smooth <= 0) return 0;
  const lastAt = Number(App.render.lastFrameAtMs) || 0;
  if(lastAt <= 0) return 0;
  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  if((now - lastAt) > 1200) return 0;
  return smooth;
};

App.isRenderSuppressed = function(){
  return !!(App.render && App.render.suppressAll);
};

App.setRenderSuppressed = function(enabled){
  if(!App.render) return false;
  const next = !!enabled;
  if(App.render.suppressAll === next) return next;
  App.render.suppressAll = next;
  App.resetRenderBudget();
  if(next) App.resetRenderFpsStats();
  return next;
};

App.setRenderFps = function(value){
  const fps = App.normalizeRenderFps(value);
  App.render.fps = fps;
  App.resetRenderBudget();
  App.resetRenderFpsStats();
  return fps;
};

App.shouldRenderFrame = function(kind, force){
  if(!force && App.isRenderSuppressed()) return false;
  if(force) return true;
  if(typeof window.isSimRunning === 'function' && !window.isSimRunning()) return true;

  const fps = App.getRenderFps();
  if(fps >= 60) return true;

  const intervalMs = 1000 / fps;
  const now = performance.now();
  const key = (kind === 'timeline') ? 'lastTimelineDrawMs' : 'lastGraphDrawMs';
  const last = Number(App.render[key]) || 0;
  if((now - last) >= intervalMs){
    App.render[key] = now;
    return true;
  }
  return false;
};

App.installCanvasRenderThrottle = function(canvas){
  if(!canvas || typeof canvas.draw !== 'function') return canvas;
  if(canvas.__fpsThrottlePatched) return canvas;

  const rawDraw = canvas.draw.bind(canvas);
  canvas.__rawDraw = rawDraw;
  canvas.draw = function(forceForeground, forceBackground){
    const forced = !!forceForeground || !!forceBackground;
    if(!App.shouldRenderFrame('graph', forced)) return;
    const out = rawDraw(forceForeground, forceBackground);
    if(typeof App.recordRenderedFrame === 'function'){
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      App.recordRenderedFrame(now);
    }
    return out;
  };
  canvas.__fpsThrottlePatched = true;
  return canvas;
};

