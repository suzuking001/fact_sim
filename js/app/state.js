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
  suppressAll: false
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
App.bumpGraphLoadRevision = function(){
  App._graphLoadRevision = (Number(App._graphLoadRevision) || 0) + 1;
  return App._graphLoadRevision;
};
App.getGraphLoadRevision = function(){
  return Number(App._graphLoadRevision) || 0;
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

App.isRenderSuppressed = function(){
  return !!(App.render && App.render.suppressAll);
};

App.setRenderSuppressed = function(enabled){
  if(!App.render) return false;
  const next = !!enabled;
  if(App.render.suppressAll === next) return next;
  App.render.suppressAll = next;
  App.resetRenderBudget();
  return next;
};

App.setRenderFps = function(value){
  const fps = App.normalizeRenderFps(value);
  App.render.fps = fps;
  App.resetRenderBudget();
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
    return rawDraw(forceForeground, forceBackground);
  };
  canvas.__fpsThrottlePatched = true;
  return canvas;
};

