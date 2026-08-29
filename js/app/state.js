// Shared app state and small UI helpers

var App = window.App || (window.App = {});

App.graph = null;
App.canvas = null;
App.timelineChart = null;
App.toastTimer = null;
App.engine = null;
// Basic/Flow nodes perform considerably more work per fixed dt tick than the
// original specialized nodes.  The heap scheduler preserves the same model
// semantics while executing only nodes whose state or event time changed, so
// use it as the production default.  A user's explicit choice is restored by
// ui.js and dt remains available as the strict validation baseline.
App.simMode = App.simMode || 'event';
App._controllers = App._controllers || {};
App.placement = App.placement || { active: false, kind: '', item: null, pendingChange: false };
App.render = App.render || {
  fps: 60,
  effectiveFps: 60,
  lastGraphDrawMs: 0,
  lastTimelineDrawMs: 0,
  suppressAll: false,
  lastFrameAtMs: 0,
  frameFps: 0,
  frameFpsSmooth: 0,
  visualMode: 'normal',
  adaptive: false,
  adaptiveSinceMs: 0,
  lowFpsSinceMs: 0,
  recoverySinceMs: 0,
  probeStartedAtMs: 0,
  timelineDrawCount: 0,
  timelineDrawSkipCount: 0
};

// Keep newly-added render fields available when an older page state is reused.
Object.assign(App.render, {
  effectiveFps: Number(App.render.effectiveFps) || Number(App.render.fps) || 60,
  visualMode: String(App.render.visualMode || 'normal'),
  adaptive: !!App.render.adaptive,
  adaptiveSinceMs: Number(App.render.adaptiveSinceMs) || 0,
  lowFpsSinceMs: Number(App.render.lowFpsSinceMs) || 0,
  recoverySinceMs: Number(App.render.recoverySinceMs) || 0,
  probeStartedAtMs: Number(App.render.probeStartedAtMs) || 0,
  timelineDrawCount: Number(App.render.timelineDrawCount) || 0,
  timelineDrawSkipCount: Number(App.render.timelineDrawSkipCount) || 0
});

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

App.getEffectiveRenderFps = function(){
  const configured = App.getRenderFps();
  const effective = App.normalizeRenderFps(App.render && App.render.effectiveFps);
  App.render.effectiveFps = Math.min(configured, effective);
  return App.render.effectiveFps;
};

App.getVisualPerformanceMode = function(){
  return String(App.render && App.render.visualMode || 'normal');
};

App._setVisualPerformanceMode = function(mode, effectiveFps, nowMs){
  if(!App.render) return false;
  const configured = App.getRenderFps();
  const nextMode = String(mode || 'normal');
  const nextEffective = Math.min(configured, App.normalizeRenderFps(effectiveFps));
  const changed = App.render.visualMode !== nextMode || App.render.effectiveFps !== nextEffective;
  App.render.visualMode = nextMode;
  App.render.effectiveFps = nextEffective;
  App.render.adaptive = nextMode === 'adaptive' || nextMode === 'probing';
  if(nextMode === 'adaptive' && !App.render.adaptiveSinceMs){
    App.render.adaptiveSinceMs = Number(nowMs) || 0;
  }
  if(changed) App.resetRenderBudget();
  try{
    const body = document.body;
    if(body){
      const running = nextMode !== 'normal';
      body.classList.toggle('sim-running', running);
      body.classList.toggle('performance-adaptive', App.render.adaptive);
    }
  }catch(_e){}
  return changed;
};

App.updateAdaptiveRenderMode = function(nowMs){
  if(!App.render) return 'normal';
  const now = Number.isFinite(Number(nowMs))
    ? Number(nowMs)
    : ((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now());
  const configured = App.getRenderFps();
  const running = (typeof window.isSimRunning === 'function') ? !!window.isSimRunning() : false;

  if(!running){
    App.render.lowFpsSinceMs = 0;
    App.render.recoverySinceMs = 0;
    App.render.probeStartedAtMs = 0;
    App.render.adaptiveSinceMs = 0;
    App._setVisualPerformanceMode('normal', configured, now);
    return 'normal';
  }

  const nodeCount = Array.isArray(App.graph && App.graph._nodes) ? App.graph._nodes.length : 0;
  const largeGraph = nodeCount >= 300;
  const measuredFps = Number(App.getRealtimeRenderFps()) || 0;
  let mode = App.getVisualPerformanceMode();
  if(mode === 'normal') mode = 'light';

  // Explicit 15/30 FPS choices are never raised by the adaptive controller.
  if(configured <= 30){
    App.render.lowFpsSinceMs = 0;
    App.render.recoverySinceMs = 0;
    App.render.probeStartedAtMs = 0;
    App.render.adaptiveSinceMs = 0;
    App._setVisualPerformanceMode(largeGraph ? 'adaptive' : 'light', configured, now);
    return App.getVisualPerformanceMode();
  }

  if(largeGraph){
    App.render.lowFpsSinceMs = 0;
    App.render.recoverySinceMs = 0;
    App.render.probeStartedAtMs = 0;
    App._setVisualPerformanceMode('adaptive', 30, now);
    return 'adaptive';
  }

  if(mode === 'adaptive'){
    const adaptiveForMs = now - (Number(App.render.adaptiveSinceMs) || now);
    if(adaptiveForMs >= 5000){
      App.render.probeStartedAtMs = now;
      App.render.lowFpsSinceMs = 0;
      App.render.recoverySinceMs = 0;
      App._setVisualPerformanceMode('probing', configured, now);
      return 'probing';
    }
    App._setVisualPerformanceMode('adaptive', 30, now);
    return 'adaptive';
  }

  if(measuredFps > 0 && measuredFps < 48){
    if(!App.render.lowFpsSinceMs) App.render.lowFpsSinceMs = now;
    App.render.recoverySinceMs = 0;
    if((now - App.render.lowFpsSinceMs) >= 750){
      App.render.adaptiveSinceMs = now;
      App.render.probeStartedAtMs = 0;
      App._setVisualPerformanceMode('adaptive', 30, now);
      return 'adaptive';
    }
  }else if(measuredFps >= 56){
    App.render.lowFpsSinceMs = 0;
    if(mode === 'probing'){
      if(!App.render.recoverySinceMs) App.render.recoverySinceMs = now;
      if((now - App.render.recoverySinceMs) >= 2000){
        App.render.adaptiveSinceMs = 0;
        App.render.probeStartedAtMs = 0;
        App.render.recoverySinceMs = 0;
        App._setVisualPerformanceMode('light', configured, now);
        return 'light';
      }
    }
  }else{
    App.render.lowFpsSinceMs = 0;
    App.render.recoverySinceMs = 0;
  }

  if(mode === 'probing' && App.render.probeStartedAtMs && (now - App.render.probeStartedAtMs) >= 3000){
    App.render.adaptiveSinceMs = now;
    App.render.probeStartedAtMs = 0;
    App.render.lowFpsSinceMs = 0;
    App.render.recoverySinceMs = 0;
    App._setVisualPerformanceMode('adaptive', 30, now);
    return 'adaptive';
  }

  App._setVisualPerformanceMode(mode === 'probing' ? 'probing' : 'light', configured, now);
  return App.getVisualPerformanceMode();
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
  App.render.effectiveFps = fps;
  App.render.adaptive = false;
  App.render.adaptiveSinceMs = 0;
  App.render.lowFpsSinceMs = 0;
  App.render.recoverySinceMs = 0;
  App.render.probeStartedAtMs = 0;
  App.resetRenderBudget();
  App.resetRenderFpsStats();
  App.updateAdaptiveRenderMode();
  return fps;
};

App.shouldRenderFrame = function(kind, force){
  if(!force && App.isRenderSuppressed()) return false;
  if(typeof window.isSimRunning === 'function' && !window.isSimRunning()) return true;

  const fps = App.getEffectiveRenderFps();
  const intervalMs = 1000 / fps;
  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  const key = (kind === 'timeline') ? 'lastTimelineDrawMs' : 'lastGraphDrawMs';
  const last = Number(App.render[key]) || 0;
  if(force || last <= 0 || (now - last) >= Math.max(1, intervalMs - 0.75)){
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

