// Core: timing, helpers, and UI time display

// Canvas element
const graphElement = document.getElementById('graph');

// Time management (simulation clock)
const SIM_DT_SEC = 0.1;
const SPEED_LEVELS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
const FASTEST_MODE_LABEL = 'FASTEST';
const FASTEST_MODE_INDEX = SPEED_LEVELS.length;
const FASTEST_BASE_SPEED = SPEED_LEVELS[SPEED_LEVELS.length - 1];
const FASTEST_STEP_REAL_MS = 16;
const FASTEST_FRAME_BUDGET_MS = 14;
const FASTEST_LOOP_LIMIT = 1200;
const FASTEST_UI_INTERVAL_MS = 120;
const REALTIME_FACTOR_WINDOW_MS = 1000;
const REALTIME_FACTOR_KEEP_MS = 2500;
const REALTIME_FACTOR_MAX_SAMPLES = 360;
let speed = 1;
let fastMode = false;
let simTimeMs = 0;
let simRunning = false;
let simRafId = null;
let lastRealMs = 0;
let lastUiUpdateMs = 0;
let realtimeFactorSamples = [];

function wallNowMs(){
  if(typeof performance !== 'undefined' && typeof performance.now === 'function'){
    return performance.now();
  }
  return Date.now();
}

function simNow(){
  return simTimeMs;
}

function advanceSimTime(ms){
  const delta = Number(ms);
  if(!isFinite(delta) || delta <= 0) return;
  simTimeMs += delta;
}

function setSimTime(ms){
  const t = Number(ms);
  simTimeMs = (isFinite(t) && t >= 0) ? t : 0;
}

function clampSpeed(v){
  const min = SPEED_LEVELS[0];
  const max = SPEED_LEVELS[SPEED_LEVELS.length - 1];
  if(!isFinite(v)) return min;
  if(v < min) return min;
  if(v > max) return max;
  return v;
}

function clampSpeedLevelIndex(i, includeFast){
  const max = includeFast ? SPEED_LEVELS.length : (SPEED_LEVELS.length - 1);
  if(!isFinite(i)) return 0;
  const idx = Math.round(i);
  if(idx < 0) return 0;
  if(idx > max) return max;
  return idx;
}

function speedLevelIndexFromValue(v){
  const n = Number(v);
  if(!isFinite(n)) return clampSpeedLevelIndex(SPEED_LEVELS.indexOf(1));
  let bestIdx = 0;
  let bestDiff = Math.abs(SPEED_LEVELS[0] - n);
  for(let i = 1; i < SPEED_LEVELS.length; i++){
    const diff = Math.abs(SPEED_LEVELS[i] - n);
    if(diff < bestDiff){
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function formatSpeedLabel(v){
  if(fastMode) return FASTEST_MODE_LABEL;
  const n = Number(v);
  if(!isFinite(n)) return '1x';
  if(Number.isInteger(n)) return `${n}x`;
  return `${n.toFixed(2).replace(/0+$/,'').replace(/\.$/, '')}x`;
}

function updateFastestModeNotice(){
  try{
    const show = !!(fastMode && simRunning);
    const notice = document.getElementById('fastestModeNotice');
    if(notice) notice.classList.toggle('show', show);
    const overlay = document.getElementById('fastestModeOverlay');
    if(overlay){
      overlay.classList.toggle('show', show);
      overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }catch(_e){}
}

function applyRenderSuppression(enabled){
  const app = window.App;
  if(!app || typeof app.setRenderSuppressed !== 'function') return;
  app.setRenderSuppressed(!!enabled);
}

function reflectSpeedUI(v){
  try{
    const range = document.getElementById('speedRange');
    if(range){
      range.min = '0';
      range.max = String(FASTEST_MODE_INDEX);
      range.step = '1';
      const idx = fastMode ? FASTEST_MODE_INDEX : speedLevelIndexFromValue(v);
      range.value = String(idx);
    }
    const sf = document.getElementById('speedFactor');
    if(sf) sf.textContent = formatSpeedLabel(v);
  }catch(e){}
}

function setSpeed(v){
  const n = Number(v);
  if(!isFinite(n)) return;
  speed = clampSpeed(n);
  fastMode = false;
  applyRenderSuppression(simRunning && fastMode);
  updateSimTime();
  reflectSpeedUI(speed);
  updateFastestModeNotice();
}

function setFastestMode(enabled){
  fastMode = !!enabled;
  applyRenderSuppression(simRunning && fastMode);
  updateSimTime();
  reflectSpeedUI(speed);
  updateFastestModeNotice();
}

// Bind speed control (range slider preferred; fall back to numeric input if present)
(function(){
  const range = document.getElementById('speedRange');
  if(range){
    range.min = '0';
    range.max = String(FASTEST_MODE_INDEX);
    range.step = '1';
    range.value = String(speedLevelIndexFromValue(speed));
    range.addEventListener('input', e=>{
      const idx = clampSpeedLevelIndex(parseInt(e.target.value, 10), true);
      if(idx >= SPEED_LEVELS.length){
        setFastestMode(true);
      }else{
        setSpeed(SPEED_LEVELS[idx]);
      }
    });
    reflectSpeedUI(speed);
  }
})();

function updateSimTime(){
  document.getElementById('simTime').textContent = (simTimeMs/1000).toFixed(1) + ' s';
  updateRealtimeFps();
  updateRealtimeFactor();
}

function updateRealtimeFps(){
  const app = window.App;
  if(app && typeof app.updateAdaptiveRenderMode === 'function'){
    app.updateAdaptiveRenderMode();
  }
  const el = document.getElementById('realtimeFpsValue');
  if(!el) return;
  if(!simRunning){
    el.textContent = '--';
    return;
  }
  if(fastMode){
    el.textContent = 'N/A (FASTEST)';
    return;
  }
  const fps = (app && typeof app.getRealtimeRenderFps === 'function') ? app.getRealtimeRenderFps() : 0;
  if(!isFinite(fps) || fps <= 0){
    el.textContent = 'measuring...';
    return;
  }
  el.textContent = `${fps.toFixed(1)} fps`;
}

function resetRealtimeFactorSamples(){
  realtimeFactorSamples.length = 0;
}

function pushRealtimeFactorSample(){
  const nowWall = wallNowMs();
  realtimeFactorSamples.push({ wall: nowWall, sim: simTimeMs });
  const keepFrom = nowWall - REALTIME_FACTOR_KEEP_MS;
  while(realtimeFactorSamples.length > 1 && realtimeFactorSamples[0].wall < keepFrom){
    realtimeFactorSamples.shift();
  }
  if(realtimeFactorSamples.length > REALTIME_FACTOR_MAX_SAMPLES){
    realtimeFactorSamples.splice(0, realtimeFactorSamples.length - REALTIME_FACTOR_MAX_SAMPLES);
  }
}

function computeRealtimeFactor1s(){
  const len = realtimeFactorSamples.length;
  if(len < 2) return NaN;

  const newest = realtimeFactorSamples[len - 1];
  const targetWall = newest.wall - REALTIME_FACTOR_WINDOW_MS;
  let base = realtimeFactorSamples[0];

  for(let i = len - 2; i >= 0; i--){
    const s = realtimeFactorSamples[i];
    if(s.wall <= targetWall){
      const next = realtimeFactorSamples[i + 1];
      if(next && next.wall > s.wall && targetWall > s.wall){
        const t = (targetWall - s.wall) / (next.wall - s.wall);
        base = {
          wall: targetWall,
          sim: s.sim + (next.sim - s.sim) * t
        };
      }else{
        base = s;
      }
      break;
    }
  }

  const wallDelta = newest.wall - base.wall;
  const simDelta = newest.sim - base.sim;
  if(!isFinite(wallDelta) || wallDelta <= 1) return NaN;
  if(!isFinite(simDelta) || simDelta < 0) return NaN;
  return simDelta / wallDelta;
}

function formatRealtimeFactor(v){
  if(!isFinite(v) || v < 0) return '--';
  if(v >= 1000) return `${v.toFixed(0)}x`;
  if(v >= 100) return `${v.toFixed(1)}x`;
  return `${v.toFixed(2)}x`;
}

function updateRealtimeFactor(){
  const el = document.getElementById('realtimeFactorValue');
  if(!el) return;
  if(!simRunning){
    el.textContent = '--';
    return;
  }
  pushRealtimeFactorSample();
  const ratio = computeRealtimeFactor1s();
  if(!isFinite(ratio)){
    el.textContent = 'measuring...';
    return;
  }
  el.textContent = formatRealtimeFactor(ratio);
}

function resetSimClock(){
  simTimeMs = 0;
  lastRealMs = 0;
  resetRealtimeFactorSamples();
  updateSimTime();
}

function startSimLoop(stepFn){
  if(simRunning) return;
  simRunning = true;
  lastRealMs = 0;
  lastUiUpdateMs = 0;
  resetRealtimeFactorSamples();
  pushRealtimeFactorSample();
  try{
    const app = window.App;
    if(app && typeof app.resetRenderFpsStats === 'function') app.resetRenderFpsStats();
    if(app && typeof app.updateAdaptiveRenderMode === 'function') app.updateAdaptiveRenderMode();
  }catch(_e){}
  applyRenderSuppression(fastMode);
  updateFastestModeNotice();
  updateRealtimeFps();
  const tick = (ts)=>{
    if(!simRunning) return;
    if(fastMode){
      const simDeltaMs = FASTEST_STEP_REAL_MS * FASTEST_BASE_SPEED;
      const begin = performance.now();
      let loops = 0;
      while(simRunning && loops < FASTEST_LOOP_LIMIT && (performance.now() - begin) < FASTEST_FRAME_BUDGET_MS){
        if(typeof stepFn === 'function') stepFn(simDeltaMs);
        loops++;
      }
      if(!lastUiUpdateMs || (ts - lastUiUpdateMs) >= FASTEST_UI_INTERVAL_MS){
        updateSimTime();
        lastUiUpdateMs = ts;
      }
      simRafId = window.requestAnimationFrame(tick);
      return;
    }
    if(!lastRealMs) lastRealMs = ts;
    let delta = ts - lastRealMs;
    if(delta < 0) delta = 0;
    lastRealMs = ts;
    const simDeltaMs = delta * speed;
    if(typeof stepFn === 'function') stepFn(simDeltaMs);
    updateSimTime();
    simRafId = window.requestAnimationFrame(tick);
  };
  simRafId = window.requestAnimationFrame(tick);
}

function stopSimLoop(){
  simRunning = false;
  if(simRafId){ window.cancelAnimationFrame(simRafId); simRafId = null; }
  applyRenderSuppression(false);
  try{
    const app = window.App;
    if(app && typeof app.updateAdaptiveRenderMode === 'function') app.updateAdaptiveRenderMode();
  }catch(_e){}
  updateFastestModeNotice();
  updateRealtimeFps();
  updateSimTime();
}

function isSimRunning(){ return simRunning; }
function getSimDtSec(){ return SIM_DT_SEC; }
function isFastestMode(){ return fastMode; }

function _signalValueOn(v){
  if(v === null || typeof v === 'undefined') return false;
  if(typeof v === 'boolean') return v;
  if(typeof v === 'number') return isFinite(v) && v !== 0;
  if(typeof v === 'string'){
    const s = v.trim().toUpperCase();
    if(!s) return false;
    if(s === '0' || s === 'OFF' || s === 'FALSE' || s === 'LOW' || s === 'IDLE' || s === 'NULL' || s === 'NONE') return false;
    return true;
  }
  return true;
}

function _signalPortStates(node, kind){
  const isInput = kind === 'in';
  const ports = isInput ? node?.inputs : node?.outputs;
  if(!Array.isArray(ports) || !ports.length) return [];
  const list = [];
  for(let i = 0; i < ports.length; i++){
    const p = ports[i];
    const name = String(p?.name || '');
    const re = isInput ? /^sigIn(\d+)$/ : /^sigOut(\d+)$/;
    const m = name.match(re);
    if(!m) continue;
    const idx = Number(m[1]);
    const connected = isInput ? (p && p.link != null) : !!(p && Array.isArray(p.links) && p.links.length);
    let val = null;
    try{
      if(isInput && typeof node.getInputData === 'function') val = node.getInputData(i);
      else if(!isInput && typeof node.getOutputData === 'function') val = node.getOutputData(i);
      else if(!isInput && p && Object.prototype.hasOwnProperty.call(p, '_data')) val = p._data;
    }catch(_e){}
    const state = connected ? (_signalValueOn(val) ? 'ON' : 'OFF') : 'NC';
    list.push({ idx, state });
  }
  list.sort((a,b)=>a.idx-b.idx);
  return list;
}

function _buildSignalSummaryLines(node){
  const inStates = _signalPortStates(node, 'in');
  const outStates = _signalPortStates(node, 'out');
  const lines = [];
  const perLine = 4;
  const pushGroup = (label, arr)=>{
    if(!arr.length) return;
    for(let i = 0; i < arr.length; i += perLine){
      const items = arr.slice(i, i + perLine).map(x => `${x.idx}:${x.state}`).join('  ');
      lines.push(i === 0 ? `${label}: ${items}` : `      ${items}`);
    }
  };
  pushGroup('SIG IN', inStates);
  pushGroup('SIG OUT', outStates);
  return lines;
}

function _normalizeStateLabel(node){
  const s = (node && typeof node._state !== 'undefined' && node._state !== null) ? String(node._state) : '';
  const n = (node && typeof node._stateName !== 'undefined' && node._stateName !== null) ? String(node._stateName) : '';
  if(s && n) return `State: ${s} (${n})`;
  if(s) return `State: ${s}`;
  if(n) return `State: ${n}`;
  return 'State: N/A';
}

function _nodeOverlayCanvas(){
  try{
    if(window.canvas && window.canvas.graph) return window.canvas;
    if(typeof LiteGraph !== 'undefined' && LiteGraph.LGraphCanvas && LiteGraph.LGraphCanvas.active_canvas){
      return LiteGraph.LGraphCanvas.active_canvas;
    }
  }catch(_e){}
  return null;
}

function _asVec2Like(value){
  if(!value) return null;
  if(Array.isArray(value)) return value;
  if(typeof value.length === 'number' && value.length >= 2) return value;
  if(typeof value === 'object' && typeof value[0] !== 'undefined' && typeof value[1] !== 'undefined') return value;
  return null;
}

function _isNodeHovered(node){
  try{
    const canvas = _nodeOverlayCanvas();
    if(!canvas) return false;
    const mouse = Array.isArray(canvas.graph_mouse) ? canvas.graph_mouse : null;
    const pos = _asVec2Like(node && node.pos);
    const size = _asVec2Like(node && node.size);
    if(mouse && pos && size){
      const mx = Number(mouse[0]);
      const my = Number(mouse[1]);
      const x = Number(pos[0]);
      const y = Number(pos[1]);
      const w = Number(size[0]);
      const h = Number(size[1]);
      if(isFinite(mx) && isFinite(my) && isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h)){
        return mx >= x && mx <= (x + w) && my >= y && my <= (y + h);
      }
    }
    return !!(canvas.node_over === node);
  }catch(_e){
    return false;
  }
}

function _isNodeSelected(node){
  try{
    const canvas = _nodeOverlayCanvas();
    const selected = canvas && canvas.selected_nodes;
    if(!selected || !node || node.id == null) return false;
    return !!selected[node.id];
  }catch(_e){
    return false;
  }
}

function _isNodeInspectorDetailHovered(node){
  try{
    const canvas = _nodeOverlayCanvas();
    if(!canvas) return false;
    const mouse = Array.isArray(canvas.graph_mouse) ? canvas.graph_mouse : null;
    const rect = node && (node.__factInspectorDetailCardRect || node.__factInspectorDetailActionRect);
    if(!mouse || !rect) return false;
    const mx = Number(mouse[0]);
    const my = Number(mouse[1]);
    const x = Number(rect.x);
    const y = Number(rect.y);
    const w = Number(rect.w);
    const h = Number(rect.h);
    if(!isFinite(mx) || !isFinite(my) || !isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return false;
    return mx >= x && mx <= (x + w) && my >= y && my <= (y + h);
  }catch(_e){
    return false;
  }
}

function _shouldShowNodeDetails(node){
  return _isNodeHovered(node) || _isNodeSelected(node) || _isNodeInspectorDetailHovered(node);
}

function _stringifyPropValue(v){
  if(typeof v === 'undefined') return 'undefined';
  if(v === null) return 'null';
  const t = typeof v;
  if(t === 'number'){
    if(!isFinite(v)) return String(v);
    if(Number.isInteger(v)) return String(v);
    return String(Math.round(v * 1000) / 1000);
  }
  if(t === 'boolean') return v ? 'true' : 'false';
  if(t === 'string') return v;
  if(t === 'function') return '[Function]';
  try{
    const s = JSON.stringify(v);
    if(!s) return String(v);
    return s.length > 140 ? `${s.slice(0, 137)}...` : s;
  }catch(_e){}
  return String(v);
}

function _nodeHoverState(node){
  const raw = node && node._state != null
    ? node._state
    : (node && node._stateName != null ? node._stateName : 'N/A');
  return String(raw || 'N/A').trim().toUpperCase();
}

function _nodeHoverMeta(node){
  const parts = [];
  const presetId = String(node?.properties?.presetId || '').trim();
  const preset = presetId && App.BASIC_NODE_PRESETS ? App.BASIC_NODE_PRESETS[presetId] : null;
  if(preset?.title && String(preset.title) !== String(node?.title || '')) parts.push(String(preset.title));
  if(node?.type) parts.push(String(node.type));
  if(node?.id != null) parts.push(`Node #${node.id}`);
  return [...new Set(parts)].join('  ·  ');
}

function _buildNodeHoverRuntimeRows(lines){
  const rows = [];
  const seen = new Set();
  for(const raw of (Array.isArray(lines) ? lines : [])){
    const text = String(raw || '').trim();
    if(!text || /^state\s*:/i.test(text) || /^properties\s*:?$/i.test(text) || /^-\s+/.test(text)) continue;
    if(/^\d+\s*:\s*(?:ON|OFF|NC)\b/i.test(text) && rows.length){
      rows[rows.length - 1].value += `  ${text}`;
      continue;
    }
    const splitAt = text.indexOf(':');
    const label = splitAt > 0 ? text.slice(0, splitAt).trim() : 'Info';
    const value = splitAt > 0 ? text.slice(splitAt + 1).trim() : text;
    const key = `${label}\u0000${value}`;
    if(seen.has(key)) continue;
    seen.add(key);
    rows.push({ label, value: value || '—' });
  }
  return rows.slice(0, 6);
}

function _nodeHoverPropertyValue(key, value){
  if(Array.isArray(value)){
    const unit = /rules$/i.test(String(key)) ? 'rules' : 'items';
    return `${value.length} ${unit}`;
  }
  if(value && typeof value === 'object') return `${Object.keys(value).length} fields`;
  if(String(key) === 'script') return value ? 'Configured' : 'None';
  const text = _stringifyPropValue(value);
  return text.length > 48 ? `${text.slice(0, 45)}...` : text;
}

function _buildNodeHoverPropertyRows(node){
  const props = (node && node.properties && typeof node.properties === 'object') ? node.properties : null;
  if(!props) return { rows: [], hiddenCount: 0 };
  const priority = ['presetId', 'processTime', 'capacity', 'downTime', 'shuttleGroupId', 'inputRules', 'outputRules'];
  const keys = Object.keys(props).filter((key)=>!key.startsWith('_') && !/^overlay/i.test(key));
  keys.sort((a, b)=>{
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if(ai >= 0 || bi >= 0) return (ai < 0 ? priority.length : ai) - (bi < 0 ? priority.length : bi);
    return a.localeCompare(b);
  });
  let schema = null;
  try{ schema = typeof node.getInspectorSchema === 'function' ? node.getInspectorSchema() : null; }catch(_e){}
  const visible = keys.slice(0, 6).map((key)=>({
    key,
    label: String(schema?.[key]?.label || key),
    value: _nodeHoverPropertyValue(key, props[key])
  }));
  return { rows: visible, hiddenCount: Math.max(0, keys.length - visible.length) };
}

function _trimOverlayText(ctx, text, maxWidth){
  const src = String(text || '');
  if(!src || maxWidth <= 8) return src;
  if(ctx.measureText(src).width <= maxWidth) return src;
  const ellipsis = '...';
  let lo = 0;
  let hi = src.length;
  while(lo < hi){
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = src.slice(0, mid) + ellipsis;
    if(ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return src.slice(0, Math.max(0, lo)) + ellipsis;
}

function _overlayClamp(value, min, max){
  const n = Number(value);
  const lo = Number(min);
  const hi = Number(max);
  if(!isFinite(n)) return isFinite(lo) ? lo : 0;
  if(isFinite(lo) && n < lo) return lo;
  if(isFinite(hi) && n > hi) return hi;
  return n;
}

function _overlayVisibleDomRect(el){
  if(!el || typeof el.getBoundingClientRect !== 'function') return null;
  const rect = el.getBoundingClientRect();
  if(!rect || rect.width <= 1 || rect.height <= 1) return null;
  try{
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if(style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return null;
  }catch(_e){}
  return rect;
}

function _overlayGraphViewportSafeRect(){
  const canvas = _nodeOverlayCanvas();
  const rect = _overlayVisibleDomRect(canvas?.canvas);
  if(!canvas || !rect) return null;

  let safeLeft = rect.left + 14;
  let safeTop = rect.top + 14;
  let safeRight = rect.right - 14;
  let safeBottom = rect.bottom - 14;

  const sidebarRect = _overlayVisibleDomRect(document.getElementById('sidebar'));
  if(sidebarRect && sidebarRect.left < safeRight && sidebarRect.right > safeLeft){
    safeLeft = Math.max(safeLeft, sidebarRect.right + 14);
  }

  const runHudRect = _overlayVisibleDomRect(document.getElementById('editorRunHud'));
  if(runHudRect && runHudRect.left < safeRight && runHudRect.right > safeLeft){
    safeTop = Math.max(safeTop, runHudRect.bottom + 14);
  }

  const dockRect = _overlayVisibleDomRect(document.getElementById('timelineDock'));
  if(dockRect && dockRect.top < safeBottom && dockRect.bottom > safeTop){
    safeBottom = Math.min(safeBottom, dockRect.top - 14);
  }

  if(safeRight <= safeLeft){
    safeLeft = rect.left + 14;
    safeRight = rect.right - 14;
  }
  if(safeBottom <= safeTop){
    safeTop = rect.top + 14;
    safeBottom = rect.bottom - 14;
  }

  const scale = Math.max(0.0001, Number(canvas?.ds?.scale) || 1);
  const ox = Number(canvas?.ds?.offset?.[0]) || 0;
  const oy = Number(canvas?.ds?.offset?.[1]) || 0;
  const toGraphX = (clientX)=> ((clientX - rect.left) / scale) - ox;
  const toGraphY = (clientY)=> ((clientY - rect.top) / scale) - oy;

  return {
    left: toGraphX(safeLeft),
    top: toGraphY(safeTop),
    right: toGraphX(safeRight),
    bottom: toGraphY(safeBottom)
  };
}

function _resolveNodeDetailCardPosition(node, preferredBoxX, preferredBoxY, boxWidth, boxHeight){
  const safe = _overlayGraphViewportSafeRect();
  if(!safe || !node) return { x: preferredBoxX, y: preferredBoxY };

  const totalWidth = boxWidth + 8;
  const minX = safe.left;
  const maxX = Math.max(minX, safe.right - totalWidth);
  const x = _overlayClamp(preferredBoxX, minX, maxX);

  const nodeX = Number(node.pos?.[0]) || 0;
  const nodeY = Number(node.pos?.[1]) || 0;
  const nodeH = Math.max(1, Number(node.size?.[1]) || 1);
  const belowY = preferredBoxY;
  const aboveY = nodeY - boxHeight - 10;
  const insideY = nodeY + 10;

  if((belowY + boxHeight) <= safe.bottom){
    return { x, y: Math.max(safe.top, belowY) };
  }
  if(aboveY >= safe.top){
    return { x, y: aboveY };
  }
  if((insideY + boxHeight) <= safe.bottom){
    return { x, y: insideY };
  }
  const fallbackY = nodeY + Math.min(nodeH + 6, Math.max(10, safe.bottom - safe.top - boxHeight));
  return {
    x,
    y: _overlayClamp(fallbackY, safe.top, Math.max(safe.top, safe.bottom - boxHeight))
  };
}

function _wrapOverlayText(ctx, text, maxWidth){
  const src = String(text || '');
  if(!src) return [''];
  if(maxWidth <= 8) return [src];
  const out = [];
  const words = src.split(/\s+/);
  let line = '';

  const pushChunk = (chunk)=>{
    if(!chunk) return;
    if(ctx.measureText(chunk).width <= maxWidth){
      out.push(chunk);
      return;
    }
    let rest = chunk;
    while(rest.length){
      let cut = rest.length;
      while(cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut--;
      out.push(rest.slice(0, Math.max(1, cut)));
      rest = rest.slice(Math.max(1, cut));
    }
  };

  for(const word of words){
    if(!word){
      if(!line) continue;
      pushChunk(line);
      line = '';
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if(ctx.measureText(next).width <= maxWidth){
      line = next;
      continue;
    }
    if(line) pushChunk(line);
    line = word;
  }
  if(line) pushChunk(line);
  return out.length ? out : [''];
}

const NODE_STATE_PALETTE = Object.freeze({
  IDLE:    { title: '#fbefbe', body: '#fffdf3', accent: '#f1c40f', ink: '#7a5b00' },
  PROCESS: { title: '#d6f5e3', body: '#f4fcf8', accent: '#2ecc71', ink: '#117a45' },
  WAIT:    { title: '#fee8c7', body: '#fff8ee', accent: '#f39c12', ink: '#9a5800' },
  DOWN:    { title: '#d8ecfb', body: '#f4fafe', accent: '#3498db', ink: '#17699e' },
  ERROR:   { title: '#ffd9df', body: '#fff4f6', accent: '#dc4c64', ink: '#b4233c' }
});

const OVERLAY_PALETTE = Object.freeze({
  shadow: 'rgba(15,23,42,0.12)',
  cardFill: 'rgba(255,255,255,0.78)',
  cardStroke: 'rgba(17,17,17,0.08)',
  text: 'rgba(17,17,17,0.82)',
  buttonFill: '#0a84ff',
  buttonText: '#ffffff'
});

function _getOverlayPalette(){
  return OVERLAY_PALETTE;
}

function _getNodeStatePalette(state){
  const key = String(state || 'IDLE').toUpperCase();
  return NODE_STATE_PALETTE[key] || NODE_STATE_PALETTE.IDLE;
}

function _compactOverlayState(node, lines){
  const direct = node && (node._state ?? node._stateName);
  if(direct != null && String(direct).trim()) return String(direct).trim().toUpperCase();
  const stateLine = (Array.isArray(lines) ? lines : []).find((line)=>/^state\s*:/i.test(String(line || '')));
  const raw = stateLine ? String(stateLine).replace(/^state\s*:\s*/i, '').split(/[\s(]/)[0] : '';
  return String(raw || 'IDLE').trim().toUpperCase();
}

function _compactOverlayWork(node, lines){
  const entity = node && (node._currentWork || node._payload || node._activeRoot);
  if(entity && typeof entity === 'object'){
    const id = entity.instanceId ?? entity.id ?? entity.workId ?? entity.palletId ?? entity.carrierId;
    const typeId = entity.typeId ?? entity.type ?? entity.workType ?? entity.kind;
    let type = typeId;
    let category = '';
    try{
      const typeDef = typeId != null && window.App?.entityModelForGraph
        ? window.App.entityModelForGraph(node?.graph || window.App?.graph)?.get?.(typeId)
        : null;
      if(typeDef){
        type = typeDef.name || typeId;
        category = String(typeDef.category || '');
      }
    }catch(_e){}
    return {
      id: id == null || String(id).trim() === '' ? '' : String(id),
      type: type == null || String(type).trim() === '' ? '' : String(type),
      category
    };
  }
  const workLine = (Array.isArray(lines) ? lines : []).find((line)=>/^work\s*:/i.test(String(line || '')));
  if(!workLine || /\(none\)|\bnone\b/i.test(String(workLine))) return null;
  const text = String(workLine).replace(/^work\s*:\s*/i, '');
  const idMatch = text.match(/\bID\s*=\s*([^\s]+)/i);
  const typeMatch = text.match(/\bType\s*=\s*(.+)$/i);
  return {
    id: idMatch ? String(idMatch[1]).trim() : '',
    type: typeMatch ? String(typeMatch[1]).trim() : '',
    category: 'work'
  };
}

function _compactOverlayExtra(lines){
  const rows = [];
  for(const [index, raw] of (Array.isArray(lines) ? lines : []).entries()){
    const text = String(raw || '').trim();
    if(!text || /^(?:state|work|remain|proc(?:ess)?|down|sig)\s*(?:\(|:)/i.test(text)) continue;
    if(/^tip\s*:/i.test(text) || /^properties\s*:?$/i.test(text) || /^-\s+/.test(text)) continue;
    const normalized = text.replace(/^shuttle\s+group\s*:/i, 'Group ').replace(/^([^:]{1,18}):\s*/, '$1 ');
    if(!normalized || rows.some((row)=>row.text === normalized)) continue;
    const priority = /^(?:shuttle\s+)?group\s*:/i.test(text) ? 0
      : /^(?:contents|queue|inputs?|routes?|pallet|received|next|downstream)\b/i.test(text) ? 1
      : /^preset\s*:/i.test(text) ? 8
      : /rules?\s*:/i.test(text) ? 9
      : 4;
    rows.push({ text: normalized, priority, index });
  }
  rows.sort((a, b)=>(a.priority - b.priority) || (a.index - b.index));
  return rows[0]?.text || '';
}

function _formatCompactSeconds(value){
  const seconds = Number(value);
  if(!isFinite(seconds)) return '';
  const rounded = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} s`;
}

function _buildCompactOverlayModel(node, lines){
  const state = _compactOverlayState(node, lines);
  const work = _compactOverlayWork(node, lines);
  const extra = _compactOverlayExtra(lines);
  const now = (typeof simNow === 'function') ? simNow() : 0;
  const until = Number(node && node._until);
  const remainingSec = isFinite(until) ? Math.max(0, until - now) / 1000 : 0;
  const processSec = Number(node?.properties?.processTime);
  const downSec = Number(node?.properties?.downTime);
  const activeDuration = state === 'PROCESS'
    ? (isFinite(processSec) ? Math.max(0, processSec) : 0)
    : (state === 'DOWN' && isFinite(downSec) ? Math.max(0, downSec) : 0);
  const progress = activeDuration > 0
    ? _overlayClamp(1 - (remainingSec / activeDuration), 0, 1)
    : (state === 'WAIT' ? 1 : 0);
  const statusText = ({
    IDLE: 'Available',
    PROCESS: _formatCompactSeconds(remainingSec),
    WAIT: 'Output ready',
    DOWN: _formatCompactSeconds(remainingSec),
    TRANSFER: 'Moving',
    ERROR: 'Check details'
  })[state] || '';
  const entityLabel = work?.category === 'carrier'
    ? 'Carrier'
    : (work?.category === 'container' ? 'Container' : 'Work');
  const primary = work
    ? (work.id ? (/\s#\d+$/.test(work.id) ? work.id : `${entityLabel} #${work.id}`) : `${entityLabel} in process`)
    : ({
        IDLE: 'Ready for input',
        PROCESS: 'Processing',
        WAIT: 'Waiting for output',
        DOWN: 'Recovering',
        TRANSFER: 'Transferring',
        ERROR: 'Attention required'
      })[state] || 'No active work';
  const details = [];
  if(work?.type && !String(work.id || '').startsWith(`${work.type} #`)) details.push(`Type ${work.type}`);
  if(extra) details.push(extra);
  if(!extra && isFinite(processSec) && processSec > 0) details.push(`Cycle ${_formatCompactSeconds(processSec)}`);
  if(!details.length) details.push(state === 'IDLE' ? 'Waiting for entity' : 'Runtime status');
  return {
    state,
    primary,
    secondary: details.slice(0, 2).join('  ·  '),
    statusText,
    progress
  };
}

function _drawCanvasCard(ctx, x, y, width, height, radius){
  const r = Math.max(0, Math.min(Number(radius) || 0, width * 0.5, height * 0.5));
  if(typeof ctx.roundRect === 'function'){
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function _getCurrentCanvasScale(){
  try{
    const scale = Number(window.App && App.canvas && App.canvas.ds && App.canvas.ds.scale);
    return (isFinite(scale) && scale > 0) ? scale : 1;
  }catch(_e){
    return 1;
  }
}

function applyNodeStateTheme(node, state){
  if(!node) return;
  const palette = _getNodeStatePalette(state);
  node.boxcolor = palette.accent;
}

function _scoreCompactOverlayLine(text){
  const s = String(text || '').trim().toLowerCase();
  if(/^state\s*:/.test(s)) return 0;
  if(/^work\s*:/.test(s)) return 1;
  if(/^remain/.test(s)) return 2;
  if(/^(?:shuttle\s+)?group\s*:/.test(s)) return 2;
  if(/^proc/.test(s) || /^process/.test(s) || /^down/.test(s)) return 3;
  if(/^tph/.test(s) || /^ratio/.test(s) || /^downstream/.test(s) || /^next/.test(s) || /^(?:contents|queue|inputs?|routes?|pallet|received)\b/.test(s)) return 4;
  if(/^sig/.test(s)) return 8;
  if(/^properties/.test(s)) return 20;
  if(/^\- /.test(s)) return 21;
  return 10;
}

function _pickCompactOverlayLines(lines, importantCount){
  const safeLines = Array.isArray(lines) ? lines.map(v => String(v)) : [];
  if(!safeLines.length) return [];
  const ranked = safeLines
    .map((text, index)=>({ text, index, score: _scoreCompactOverlayLine(text) }))
    .sort((a, b)=> (a.score - b.score) || (a.index - b.index));
  const count = Math.max(1, Math.min(6, importantCount | 0));
  const picked = ranked.slice(0, count).sort((a, b)=> a.index - b.index).map(x => x.text);
  return picked.length ? picked : safeLines.slice(0, count);
}

function _buildFallbackOverlayLines(node){
  const lines = [];
  lines.push(_normalizeStateLabel(node));

  const work = (node && (node._currentWork || node._payload)) || null;
  if(work && typeof work === 'object'){
    const id = (typeof work.id !== 'undefined' && work.id !== null) ? work.id : '?';
    const type = (typeof work.type !== 'undefined' && work.type !== null) ? work.type : '?';
    lines.push(`Work: ID=${id} Type=${type}`);
  }else{
    lines.push('Work: (none)');
  }

  const until = Number(node && node._until);
  if(isFinite(until)){
    const now = (typeof simNow === 'function') ? simNow() : 0;
    const remainSec = Math.max(0, until - now) / 1000;
    lines.push(`Remain(s): ${remainSec.toFixed(1)}`);
  }

  const proc = Number(node && node.properties && node.properties.processTime);
  const down = Number(node && node.properties && node.properties.downTime);
  if(isFinite(proc) || isFinite(down)){
    const procText = isFinite(proc) ? proc : 0;
    const downText = isFinite(down) ? down : 0;
    lines.push(`Proc(s): ${procText}  Down(s): ${downText}`);
  }

  const sigEnabled = !!(node && node.properties && node.properties.sigEnabled);
  const sigExtra = Number(node && node.properties && node.properties.sigExtra);
  if(sigEnabled || (isFinite(sigExtra) && sigExtra > 0)){
    lines.push(`Sig: enabled=${sigEnabled} extra=${isFinite(sigExtra) ? sigExtra : 0}`);
  }

  return lines.filter(Boolean);
}

function _getOverlaySourceLines(node, lines){
  const explicit = Array.isArray(lines) ? lines.map(v => String(v)).filter(Boolean) : [];
  const baseLines = explicit.length ? explicit : _buildFallbackOverlayLines(node);
  const hasState = baseLines.some(l => /^state\s*:/i.test(String(l || '')));
  if(!hasState) baseLines.unshift(_normalizeStateLabel(node));
  return baseLines;
}

function _measureOverlayPortInsets(ctx, node){
  let left = 10;
  let right = 10;
  const width = Number(node && node.size && node.size[0]) || 0;
  const mid = width * 0.5;
  const consider = (slot, defaultLeft)=>{
    if(!slot) return;
    const label = String(slot.name || '');
    if(!label) return;
    const labelWidth = Math.ceil(ctx.measureText(label).width + 22);
    const slotX = Array.isArray(slot.pos) ? Number(slot.pos[0]) : NaN;
    const onLeft = isFinite(slotX) ? (slotX <= mid) : defaultLeft;
    if(onLeft) left = Math.max(left, labelWidth);
    else right = Math.max(right, labelWidth);
  };
  const inputs = Array.isArray(node && node.inputs) ? node.inputs : [];
  const outputs = Array.isArray(node && node.outputs) ? node.outputs : [];
  inputs.forEach((slot)=> consider(slot, true));
  outputs.forEach((slot)=> consider(slot, false));
  return { left, right };
}

function _measureOverlayPortBottom(node){
  const slotHeight = Number((typeof LiteGraph !== 'undefined' && LiteGraph.NODE_SLOT_HEIGHT) ? LiteGraph.NODE_SLOT_HEIGHT : 18) || 18;
  const startY = Number(node && node.constructor && node.constructor.slot_start_y) || 0;
  let maxY = 0;
  const collect = (slots)=>{
    if(!Array.isArray(slots)) return;
    slots.forEach((slot, idx)=>{
      if(!slot) return;
      const y = Array.isArray(slot.pos) && isFinite(Number(slot.pos[1]))
        ? Number(slot.pos[1])
        : (startY + (idx + 0.7) * slotHeight);
      maxY = Math.max(maxY, y + slotHeight * 0.55);
    });
  };
  collect(node && node.inputs);
  collect(node && node.outputs);
  return Math.ceil(maxY);
}

function _getCompactOverlayLayout(ctx, node, lines){
  const safeLines = Array.isArray(lines) ? lines.map(v => String(v)) : [];
  if(!safeLines.length) return null;
  const model = _buildCompactOverlayModel(node, safeLines);
  const padX = 8;
  const padY = 6;
  const outerPad = 5;
  const titleGap = 20;
  const width = Number(node.size && node.size[0]) || 0;
  const height = Number(node.size && node.size[1]) || 0;
  const portBottom = _measureOverlayPortBottom(node);
  const contentTop = Math.max(titleGap, portBottom + 4);
  const availableWidth = Math.max(80, width - outerPad * 2);
  const availableHeight = Math.max(40, height - contentTop - outerPad);
  const desiredHeight = 56;
  const boxWidth = availableWidth;
  const boxHeight = Math.max(40, Math.min(desiredHeight, availableHeight));
  const boxX = outerPad;
  const boxY = contentTop;
  return {
    model,
    padX,
    padY,
    boxX,
    boxY,
    boxWidth,
    boxHeight,
    textMaxWidth: Math.max(12, boxWidth - padX * 2),
    minWidth: 164,
    minHeight: Math.ceil(contentTop + outerPad + desiredHeight)
  };
}

function _drawCompactLinesInsideNode(ctx, node, lines){
  const layout = _getCompactOverlayLayout(ctx, node, lines);
  if(!layout) return;
  const model = layout.model;
  const palette = _getNodeStatePalette(model.state);
  const overlay = _getOverlayPalette();
  const scale = _getCurrentCanvasScale();
  const lowScale = scale < 0.78;
  ctx.save();
  try{
    ctx.shadowColor = lowScale ? 'transparent' : 'rgba(15,23,42,0.10)';
    ctx.shadowBlur = lowScale ? 0 : 5;
    ctx.shadowOffsetY = lowScale ? 0 : 1.5;
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    _drawCanvasCard(ctx, layout.boxX, layout.boxY, layout.boxWidth, layout.boxHeight, 7);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(100,116,139,0.18)';
    ctx.lineWidth = lowScale ? Math.min(2.2, 1 / Math.max(scale, 0.45)) : 1;
    _drawCanvasCard(ctx, layout.boxX + 0.5, layout.boxY + 0.5, layout.boxWidth - 1, layout.boxHeight - 1, 7);
    ctx.stroke();

    const contentX = layout.boxX + layout.padX;
    const contentRight = layout.boxX + layout.boxWidth - layout.padX;
    const chipY = layout.boxY + 6;
    const chipHeight = 14;
    ctx.font = '700 8px Inter, ui-sans-serif, system-ui, sans-serif';
    const stateWidth = Math.ceil(ctx.measureText(model.state).width) + 19;
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = palette.accent;
    _drawCanvasCard(ctx, contentX, chipY, stateWidth, chipHeight, 999);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(contentX + 7, chipY + chipHeight * 0.5, 2.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.ink || overlay.text;
    ctx.textBaseline = 'middle';
    ctx.fillText(model.state, contentX + 12, chipY + chipHeight * 0.5);

    if(model.statusText){
      ctx.fillStyle = '#64748b';
      ctx.font = '600 8.5px Inter, ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(_trimOverlayText(ctx, model.statusText, Math.max(36, layout.boxWidth - stateWidth - 28)), contentRight, chipY + chipHeight * 0.5);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#172033';
    ctx.font = '650 10.5px Inter, ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(_trimOverlayText(ctx, model.primary, layout.textMaxWidth), contentX, layout.boxY + 24, layout.textMaxWidth);

    ctx.fillStyle = '#667085';
    ctx.font = '8.5px Inter, ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(_trimOverlayText(ctx, model.secondary, layout.textMaxWidth), contentX, layout.boxY + 38, layout.textMaxWidth);

    const trackX = contentX;
    const trackY = layout.boxY + layout.boxHeight - 5;
    const trackWidth = Math.max(8, layout.boxWidth - layout.padX * 2);
    ctx.fillStyle = 'rgba(148,163,184,0.20)';
    _drawCanvasCard(ctx, trackX, trackY, trackWidth, 2.5, 999);
    ctx.fill();
    const fillWidth = trackWidth * _overlayClamp(model.progress, 0, 1);
    if(fillWidth > 0.5){
      ctx.fillStyle = palette.accent;
      _drawCanvasCard(ctx, trackX, trackY, fillWidth, 2.5, 999);
      ctx.fill();
    }
  }finally{
    ctx.restore();
  }
}

function _nodeHoverCycleEntries(node, prefix){
  const props = node?.properties && typeof node.properties === 'object' ? node.properties : {};
  const pattern = new RegExp(`^${prefix}(?:\\d+)?$`);
  const keys = Object.keys(props).filter((key)=>pattern.test(key));
  if(!keys.includes(prefix) && Object.prototype.hasOwnProperty.call(props, prefix)) keys.unshift(prefix);
  return Array.from(new Set(keys)).sort((a, b)=>{
    if(a === prefix) return -1;
    if(b === prefix) return 1;
    return (Number(a.replace(prefix, '')) || 1) - (Number(b.replace(prefix, '')) || 1);
  }).map((key, index)=>({
    key,
    label:`${prefix === 'processTime' ? 'P' : 'D'}${index + 1}`,
    value:Math.max(0, Number(props[key]) || 0)
  }));
}

function _buildNodeHoverCycleModel(node){
  const process = _nodeHoverCycleEntries(node, 'processTime');
  const down = _nodeHoverCycleEntries(node, 'downTime');
  const processTotal = process.reduce((sum, entry)=>sum + entry.value, 0);
  const downTotal = down.reduce((sum, entry)=>sum + entry.value, 0);
  const total = processTotal + downTotal;
  if(total <= 0) return null;
  const processColors = ['#30d158','#18b94f','#0f9f43','#67d986'];
  const downColors = ['#0a84ff','#3a9cff','#006edc','#69b6ff'];
  return {
    process,
    down,
    processTotal,
    downTotal,
    total,
    segments:[
      ...process.map((entry, index)=>({ ...entry, kind:'process', color:processColors[index % processColors.length] })),
      ...down.map((entry, index)=>({ ...entry, kind:'down', color:downColors[index % downColors.length] }))
    ]
  };
}

function _nodeHoverCycleTime(value){
  const rounded = Math.round((Math.max(0, Number(value) || 0)) * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded} s`;
}

function _drawNodeHoverCycle(ctx, model, x, y, width, unit){
  if(!model) return;
  const centerX = x + (45 * unit);
  const centerY = y + (39 * unit);
  const radius = 28 * unit;
  const stroke = 9 * unit;
  ctx.save();
  try{
    ctx.lineCap = 'butt';
    ctx.lineWidth = stroke;
    ctx.strokeStyle = 'rgba(148,163,184,0.20)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    let angle = Math.PI;
    for(const segment of model.segments){
      if(segment.value <= 0) continue;
      const next = angle + ((segment.value / model.total) * Math.PI * 2);
      ctx.strokeStyle = segment.color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, angle, next, false);
      ctx.stroke();
      angle = next;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#64748b';
    ctx.font = `800 ${7 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    ctx.fillText('CYCLE', centerX, centerY - (7 * unit));
    ctx.fillStyle = '#0f172a';
    ctx.font = `750 ${14 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    ctx.fillText(_nodeHoverCycleTime(model.total), centerX, centerY + (6 * unit));

    const legendX = x + (91 * unit);
    const legendWidth = Math.max(90 * unit, width - (91 * unit));
    const drawLegend = (kind, total, entries, top, color, fill)=>{
      ctx.fillStyle = fill;
      _drawCanvasCard(ctx, legendX, top, legendWidth, 31 * unit, 7 * unit);
      ctx.fill();
      ctx.fillStyle = color;
      _drawCanvasCard(ctx, legendX + (7 * unit), top + (7 * unit), 4 * unit, 17 * unit, 2 * unit);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#334155';
      ctx.font = `800 ${8.5 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
      ctx.fillText(kind, legendX + (17 * unit), top + (10 * unit));
      ctx.textAlign = 'right';
      ctx.fillStyle = color;
      ctx.font = `750 ${10 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
      ctx.fillText(_nodeHoverCycleTime(total), legendX + legendWidth - (8 * unit), top + (10 * unit));
      const detail = entries.length > 1
        ? entries.map((entry)=>`${entry.label} ${_nodeHoverCycleTime(entry.value)}`).join('  ·  ')
        : (kind === 'PROCESS' ? 'Processing time' : 'Recovery time');
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = `${7.5 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
      ctx.fillText(_trimOverlayText(ctx, detail, legendWidth - (25 * unit)), legendX + (17 * unit), top + (22 * unit), legendWidth - (25 * unit));
    };
    drawLegend('PROCESS', model.processTotal, model.process, y + (3 * unit), '#16843a', 'rgba(48,209,88,0.09)');
    drawLegend('DOWN', model.downTotal, model.down, y + (38 * unit), '#0969c8', 'rgba(10,132,255,0.09)');
  }finally{
    ctx.restore();
  }
}

function _drawHoverDetailBox(ctx, node, lines, x, margin){
  if(!Array.isArray(lines) || !lines.length){
    if(node){
      node.__factInspectorDetailActionRect = null;
      node.__factInspectorDetailCardRect = null;
    }
    return;
  }
  const scale = Math.max(0.0001, _getCurrentCanvasScale());
  const unit = 1 / scale;
  const pad = 10 * unit;
  const boxWidth = 340 * unit;
  const anchorOffsetX = (Number(x) || 8) * unit;
  const anchorMarginY = (Number(margin) || 6) * unit;
  const palette = _getNodeStatePalette(node && node._state);
  const lowScale = scale < 0.78;
  const title = String(node?.title || node?.type || 'Node');
  const metaText = _nodeHoverMeta(node);
  const stateText = _nodeHoverState(node);
  const cycleModel = _buildNodeHoverCycleModel(node);
  const runtimeRows = _buildNodeHoverRuntimeRows(lines).filter((row)=>{
    if(!cycleModel) return true;
    return !/^(?:proc(?:ess)?|down)(?:\d+|n)?(?:\(s\))?$/i.test(String(row.label || ''));
  });
  const propertyModel = _buildNodeHoverPropertyRows(node);
  const propertyRows = propertyModel.rows.filter((row)=>{
    if(!cycleModel) return true;
    return !/^(?:processTime|downTime)\d*$/i.test(String(row.key || ''));
  });
  const headerHeight = 42 * unit;
  const sectionLabelHeight = 14 * unit;
  const cycleHeight = cycleModel ? sectionLabelHeight + (76 * unit) + (6 * unit) : 0;
  const runtimeHeight = runtimeRows.length ? sectionLabelHeight + runtimeRows.length * (17 * unit) + (6 * unit) : 0;
  const propertyLineCount = Math.ceil(propertyRows.length / 2);
  const propertyHeight = propertyRows.length
    ? sectionLabelHeight + propertyLineCount * (22 * unit) + (propertyModel.hiddenCount ? 14 * unit : 0) + (6 * unit)
    : 0;
  const footerHeight = 28 * unit;
  const boxHeight = pad + headerHeight + cycleHeight + runtimeHeight + propertyHeight + footerHeight;
  const sectionWidth = boxWidth - pad * 2;
  ctx.save();
  try{
    const preferredBoxX = (Number(node.pos?.[0]) || 0) + anchorOffsetX - (4 * unit);
    const preferredBoxY = (Number(node.pos?.[1]) || 0) + (Number(node.size?.[1]) || 0) + anchorMarginY;
    const resolved = _resolveNodeDetailCardPosition(node, preferredBoxX, preferredBoxY, boxWidth, boxHeight);
    const boxX = resolved.x - (Number(node.pos?.[0]) || 0);
    const yTop = resolved.y - (Number(node.pos?.[1]) || 0);
    const contentX = boxX + pad;

    ctx.shadowColor = lowScale ? 'transparent' : 'rgba(15,23,42,0.22)';
    ctx.shadowBlur = lowScale ? 0 : 28 * unit;
    ctx.shadowOffsetY = lowScale ? 0 : 10 * unit;
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    _drawCanvasCard(ctx, boxX, yTop, boxWidth, boxHeight, 12 * unit);
    ctx.fill();
    if(node){
      node.__factInspectorDetailCardRect = {
        x: resolved.x,
        y: resolved.y,
        w: boxWidth,
        h: boxHeight
      };
    }
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(148,163,184,0.40)';
    ctx.lineWidth = 1 * unit;
    _drawCanvasCard(ctx, boxX + (0.5 * unit), yTop + (0.5 * unit), boxWidth - (1 * unit), boxHeight - (1 * unit), 12 * unit);
    ctx.stroke();

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0f172a';
    ctx.font = `600 ${13 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    ctx.fillText(_trimOverlayText(ctx, title, 214 * unit), contentX, yTop + (10 * unit), 214 * unit);

    ctx.font = `800 ${9 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    const stateWidth = Math.ceil(ctx.measureText(stateText).width) + (16 * unit);
    const stateHeight = 18 * unit;
    const stateX = boxX + boxWidth - pad - stateWidth;
    const stateY = yTop + (8 * unit);
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = palette.accent;
    _drawCanvasCard(ctx, stateX, stateY, stateWidth, stateHeight, 999 * unit);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = palette.accent;
    ctx.textBaseline = 'middle';
    ctx.fillText(stateText, stateX + (8 * unit), stateY + stateHeight * 0.5);

    if(metaText){
      ctx.fillStyle = '#64748b';
      ctx.font = `${10 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(_trimOverlayText(ctx, metaText, sectionWidth), contentX, yTop + (30 * unit), sectionWidth);
    }

    let yy = yTop + pad + headerHeight;
    const drawSectionLabel = (label)=>{
      ctx.fillStyle = '#94a3b8';
      ctx.font = `800 ${9 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(label, contentX, yy, sectionWidth);
      yy += sectionLabelHeight;
    };

    if(cycleModel){
      drawSectionLabel('PROCESS CYCLE');
      _drawNodeHoverCycle(ctx, cycleModel, contentX, yy, sectionWidth, unit);
      yy += 82 * unit;
    }

    if(runtimeRows.length){
      drawSectionLabel('RUNTIME');
      for(const row of runtimeRows){
        ctx.fillStyle = '#64748b';
        ctx.font = `${10 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
        ctx.fillText(_trimOverlayText(ctx, row.label, 92 * unit), contentX, yy + (2 * unit), 92 * unit);
        ctx.fillStyle = '#334155';
        ctx.font = `600 ${10.5 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
        ctx.fillText(_trimOverlayText(ctx, row.value, sectionWidth - (98 * unit)), contentX + (98 * unit), yy + (2 * unit), sectionWidth - (98 * unit));
        yy += 17 * unit;
      }
      yy += 6 * unit;
    }

    if(propertyRows.length){
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1 * unit;
      ctx.beginPath();
      ctx.moveTo(contentX, yy - (4 * unit));
      ctx.lineTo(contentX + sectionWidth, yy - (4 * unit));
      ctx.stroke();
      drawSectionLabel('CONFIGURATION');
      const gap = 6 * unit;
      const chipWidth = (sectionWidth - gap) * 0.5;
      const chipHeight = 19 * unit;
      propertyRows.forEach((row, index)=>{
        const col = index % 2;
        const rowIndex = Math.floor(index / 2);
        const chipX = contentX + col * (chipWidth + gap);
        const chipY = yy + rowIndex * (22 * unit);
        ctx.fillStyle = '#f1f5f9';
        _drawCanvasCard(ctx, chipX, chipY, chipWidth, chipHeight, 6 * unit);
        ctx.fill();
        const text = `${row.label}: ${row.value}`;
        ctx.fillStyle = '#475569';
        ctx.font = `${9.5 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(_trimOverlayText(ctx, text, chipWidth - (12 * unit)), chipX + (6 * unit), chipY + chipHeight * 0.5, chipWidth - (12 * unit));
      });
      yy += propertyLineCount * (22 * unit);
      if(propertyModel.hiddenCount){
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${9 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(`+ ${propertyModel.hiddenCount} more settings`, contentX, yy, sectionWidth);
        yy += 14 * unit;
      }
      yy += 6 * unit;
    }

    const footerY = yTop + boxHeight - footerHeight;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1 * unit;
    ctx.beginPath();
    ctx.moveTo(contentX, footerY);
    ctx.lineTo(contentX + sectionWidth, footerY);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${9.5 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Current values · Read only', contentX, footerY + footerHeight * 0.5, 160 * unit);

    const actionLabel = 'Open Details';
    ctx.font = `600 ${9.5 * unit}px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    const actionWidth = Math.ceil(ctx.measureText(actionLabel).width) + (18 * unit);
    const actionHeight = 20 * unit;
    const actionX = boxX + boxWidth - pad - actionWidth;
    const actionY = footerY + (5 * unit);
    ctx.fillStyle = '#0a84ff';
    _drawCanvasCard(ctx, actionX, actionY, actionWidth, actionHeight, 999 * unit);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(actionLabel, actionX + (9 * unit), actionY + actionHeight * 0.5);
    if(node){
      node.__factInspectorDetailActionRect = {
        x: (Number(node.pos?.[0]) || 0) + actionX,
        y: (Number(node.pos?.[1]) || 0) + actionY,
        w: actionWidth,
        h: actionHeight
      };
    }
  }finally{
    ctx.restore();
  }
}

function _queueHoverDetailBox(node, lines, x, margin){
  const canvas = _nodeOverlayCanvas();
  if(!canvas || !node || !Array.isArray(lines) || !lines.length) return false;
  const queue = Array.isArray(canvas.__factNodeDetailOverlayQueue)
    ? canvas.__factNodeDetailOverlayQueue
    : (canvas.__factNodeDetailOverlayQueue = []);
  let priority = 0;
  if(_isNodeSelected(node)) priority += 1;
  if(_isNodeHovered(node)) priority += 10;
  if(_isNodeInspectorDetailHovered(node)) priority += 20;
  queue.push({
    node,
    lines: lines.slice(),
    x: Number(x) || 8,
    margin: Number(margin) || 6,
    priority,
    order: queue.length
  });
  return true;
}

function _flushQueuedHoverDetailBoxes(ctx, canvas){
  const queue = Array.isArray(canvas && canvas.__factNodeDetailOverlayQueue)
    ? canvas.__factNodeDetailOverlayQueue
    : null;
  if(!ctx || !queue || !queue.length) return;
  const items = queue.splice(0, queue.length);
  items.sort((a, b)=> (Number(a.priority) || 0) - (Number(b.priority) || 0) || (Number(a.order) || 0) - (Number(b.order) || 0));
  for(const item of items){
    const node = item && item.node;
    if(!node) continue;
    const nodeX = Number(node.pos?.[0]) || 0;
    const nodeY = Number(node.pos?.[1]) || 0;
    ctx.save();
    try{
      ctx.translate(nodeX, nodeY);
      _drawHoverDetailBox(ctx, node, item.lines, item.x, item.margin);
    }finally{
      ctx.restore();
    }
  }
}

function drawStateBelow(ctx, node, lines, x=8, margin=6){
  try{
    const baseLines = _getOverlaySourceLines(node, lines);

    const sigLines = _buildSignalSummaryLines(node);
    const compactSrc = baseLines.length ? baseLines : sigLines;
    const importantCount = Math.max(1, Math.min(6, Number(node?.properties?.overlayImportantCount) || 4));
    const compactLines = _pickCompactOverlayLines(compactSrc, importantCount);
    const suppressCompact = !!(node && (node.__disableCompactOverlay || node?.properties?.overlayCompactDisabled));
    if(!suppressCompact){
      if(enforceNodeOverlayMinSize(node, compactLines)) return;
      _drawCompactLinesInsideNode(ctx, node, compactLines);
    }

    if(!_shouldShowNodeDetails(node)){
      if(node){
        node.__factInspectorDetailActionRect = null;
        node.__factInspectorDetailCardRect = null;
      }
      return;
    }

    const detailLines = [];
    if(baseLines.length) detailLines.push(...baseLines);
    if(sigLines.length){
      if(detailLines.length) detailLines.push('');
      detailLines.push(...sigLines);
    }
    if(!_queueHoverDetailBox(node, detailLines, x, margin)){
      _drawHoverDetailBox(ctx, node, detailLines, x, margin);
    }
  }catch(_e){}
}

function installNodeDetailOverlayLayer(canvas){
  if(!canvas || canvas.__factNodeDetailOverlayLayerInstalled) return;

  const prevFront = canvas.drawFrontCanvas;
  if(typeof prevFront === 'function'){
    canvas.drawFrontCanvas = function(){
      if(Array.isArray(this.__factNodeDetailOverlayQueue)) this.__factNodeDetailOverlayQueue.length = 0;
      else this.__factNodeDetailOverlayQueue = [];
      return prevFront.apply(this, arguments);
    };
  }else{
    canvas.__factNodeDetailOverlayQueue = [];
  }

  const prevForeground = canvas.onDrawForeground;
  canvas.onDrawForeground = function(ctx){
    if(typeof prevForeground === 'function'){
      try{ prevForeground.call(this, ctx); }catch(_e){}
    }
    _flushQueuedHoverDetailBoxes(ctx, this);
  };

  canvas.__factNodeDetailOverlayLayerInstalled = true;
}

function getNodeOverlayMinimumSize(node, lines){
  try{
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if(!ctx) return null;
    ctx.font = '10.5px sans-serif';
    const baseLines = _getOverlaySourceLines(node, lines);
    const sigLines = _buildSignalSummaryLines(node);
    const compactSrc = baseLines.length ? baseLines : sigLines;
    const importantCount = Math.max(1, Math.min(6, Number(node?.properties?.overlayImportantCount) || 4));
    const layout = _getCompactOverlayLayout(ctx, node, _pickCompactOverlayLines(compactSrc, importantCount));
    if(!layout) return null;
    return [Math.max(80, layout.minWidth), Math.max(40, layout.minHeight)];
  }catch(_e){
    return null;
  }
}

function enforceNodeOverlayMinSize(node, lines){
  const size = _asVec2Like(node && node.size);
  if(!node || !size) return false;
  const minSize = getNodeOverlayMinimumSize(node, lines || []);
  if(!minSize) return false;
  const currentW = Number(size[0]) || 0;
  const currentH = Number(size[1]) || 0;
  const nextW = Math.max(currentW, minSize[0]);
  const nextH = Math.max(currentH, minSize[1]);
  if(nextW !== currentW || nextH !== currentH){
    size[0] = nextW;
    size[1] = nextH;
    if(typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true, true);
    return true;
  }
  return false;
}

function normalizeGraphOverlaySizes(graph){
  const nodes = Array.isArray(graph && graph._nodes) ? graph._nodes : [];
  for(const node of nodes){
    try{ enforceNodeOverlayMinSize(node); }catch(_e){}
  }
}

if(typeof LiteGraph !== 'undefined' && LiteGraph.LGraphNode && !LiteGraph.LGraphNode.prototype.__overlayResizePatched){
  const prevResize = LiteGraph.LGraphNode.prototype.onResize;
  LiteGraph.LGraphNode.prototype.onResize = function(size){
    if(typeof prevResize === 'function') prevResize.call(this, size);
    if(typeof window.enforceNodeOverlayMinSize === 'function'){
      window.enforceNodeOverlayMinSize(this);
    }
  };
  LiteGraph.LGraphNode.prototype.__overlayResizePatched = true;
}

// Export globals needed elsewhere
window.updateSimTime = updateSimTime;
window.simNow = simNow;
window.advanceSimTime = advanceSimTime;
window.setSimTime = setSimTime;
window.resetSimClock = resetSimClock;
window.startSimLoop = startSimLoop;
window.stopSimLoop = stopSimLoop;
window.isSimRunning = isSimRunning;
window.getSimDtSec = getSimDtSec;
window.isFastestMode = isFastestMode;
window.drawStateBelow = drawStateBelow;
window.getNodeOverlayMinimumSize = getNodeOverlayMinimumSize;
window.enforceNodeOverlayMinSize = enforceNodeOverlayMinSize;
window.normalizeGraphOverlaySizes = normalizeGraphOverlaySizes;
window.applyNodeStateTheme = applyNodeStateTheme;
window.installNodeDetailOverlayLayer = installNodeDetailOverlayLayer;
