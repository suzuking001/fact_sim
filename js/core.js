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
  const app = window.App;
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

function _isNodeHovered(node){
  try{
    const canvas = _nodeOverlayCanvas();
    if(!canvas) return false;
    const mouse = Array.isArray(canvas.graph_mouse) ? canvas.graph_mouse : null;
    const pos = Array.isArray(node && node.pos) ? node.pos : null;
    const size = Array.isArray(node && node.size) ? node.size : null;
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

function _shouldShowNodeDetails(node){
  return _isNodeHovered(node) || _isNodeSelected(node);
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

function _buildPropertySummaryLines(node){
  const props = (node && node.properties && typeof node.properties === 'object') ? node.properties : null;
  if(!props) return [];
  const keys = Object.keys(props);
  if(!keys.length) return [];
  keys.sort((a,b)=>a.localeCompare(b));
  const lines = ['Properties:'];
  for(const k of keys){
    lines.push(`- ${k}: ${_stringifyPropValue(props[k])}`);
  }
  return lines;
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

function _scoreCompactOverlayLine(text){
  const s = String(text || '').trim().toLowerCase();
  if(/^state\s*:/.test(s)) return 0;
  if(/^work\s*:/.test(s)) return 1;
  if(/^remain/.test(s)) return 2;
  if(/^proc/.test(s) || /^process/.test(s) || /^down/.test(s)) return 3;
  if(/^tph/.test(s) || /^ratio/.test(s) || /^downstream/.test(s) || /^next/.test(s)) return 4;
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
  ctx.font = '10.5px sans-serif';
  const lineHeight = 11;
  const padX = 6;
  const padY = 4;
  const outerPad = 5;
  const titleGap = 20;
  const width = Number(node.size && node.size[0]) || 0;
  const height = Number(node.size && node.size[1]) || 0;
  const portBottom = _measureOverlayPortBottom(node);
  const contentTop = Math.max(titleGap, portBottom + 4);
  const availableWidth = Math.max(64, width - outerPad * 2);
  const availableHeight = Math.max(lineHeight + padY * 2, height - contentTop - outerPad);
  const wrapped = [];
  let preferredTextWidth = 0;
  let naturalTextWidth = 0;
  for(const raw of safeLines){
    naturalTextWidth = Math.max(naturalTextWidth, ctx.measureText(String(raw)).width);
    const rows = _wrapOverlayText(ctx, String(raw), Math.max(16, availableWidth - padX * 2));
    for(const row of rows){
      wrapped.push(row);
      preferredTextWidth = Math.max(preferredTextWidth, ctx.measureText(String(row)).width);
    }
  }
  if(!wrapped.length) return null;
  const targetInnerWidth = Math.max(96, Math.min(170, Math.ceil(naturalTextWidth)));
  const boxWidth = Math.max(72, Math.min(availableWidth, Math.max(Math.ceil(preferredTextWidth + padX * 2), targetInnerWidth + padX * 2)));
  const maxLines = Math.max(1, Math.floor((availableHeight - padY * 2) / lineHeight));
  const visible = wrapped.slice(0, maxLines);
  const boxHeight = visible.length * lineHeight + padY * 2;
  const boxX = Math.max(outerPad, outerPad + Math.floor((availableWidth - boxWidth) * 0.5));
  const boxY = contentTop;
  return {
    lines: visible,
    lineHeight,
    padX,
    padY,
    boxX,
    boxY,
    boxWidth,
    boxHeight,
    textMaxWidth: Math.max(12, boxWidth - padX * 2),
    minWidth: Math.ceil(Math.max(128, outerPad * 2 + targetInnerWidth + padX * 2)),
    minHeight: Math.ceil(contentTop + outerPad + wrapped.length * lineHeight + padY * 2)
  };
}

function _drawCompactLinesInsideNode(ctx, node, lines){
  const layout = _getCompactOverlayLayout(ctx, node, lines);
  if(!layout) return;
  ctx.save();
  try{
    ctx.font = '10.5px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(layout.boxX, layout.boxY, layout.boxWidth, layout.boxHeight);
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1;
    ctx.strokeRect(layout.boxX + 0.5, layout.boxY + 0.5, layout.boxWidth - 1, layout.boxHeight - 1);
    ctx.fillStyle = 'rgba(0,0,0,0.76)';
    ctx.textBaseline = 'top';
    let yy = layout.boxY + layout.padY;
    for(const raw of layout.lines){
      ctx.fillText(_trimOverlayText(ctx, String(raw), layout.textMaxWidth), layout.boxX + layout.padX, yy, layout.textMaxWidth);
      yy += layout.lineHeight;
    }
  }finally{
    ctx.restore();
  }
}

function _drawHoverDetailBox(ctx, node, lines, x, margin){
  if(!Array.isArray(lines) || !lines.length) return;
  const pad = 8;
  const lineHeight = 14;
  const maxBoxWidth = Math.min(460, Math.max(240, node.size[0] * 2.4));
  ctx.save();
  try{
    ctx.font = '12px sans-serif';
    const contentWidth = maxBoxWidth - pad * 2;
    const wrapped = [];
    for(const raw of lines){
      const rows = _wrapOverlayText(ctx, String(raw), contentWidth);
      for(const row of rows) wrapped.push(row);
    }
    if(wrapped.length > 60){
      wrapped.length = 60;
      wrapped.push('...');
    }
    let textWidth = 0;
    for(const row of wrapped) textWidth = Math.max(textWidth, ctx.measureText(row).width);
    const boxWidth = Math.min(maxBoxWidth, Math.max(180, Math.ceil(textWidth + pad * 2)));
    const boxHeight = wrapped.length * lineHeight + pad * 2;
    const yTop = node.size[1] + margin;
    const boxX = x - 4;
    ctx.fillStyle = 'rgba(10,10,12,0.88)';
    ctx.fillRect(boxX, yTop, boxWidth + 8, boxHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, yTop + 0.5, boxWidth + 7, boxHeight - 1);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    let yy = yTop + pad;
    for(const row of wrapped){
      ctx.fillText(row, x, yy, boxWidth - pad * 2);
      yy += lineHeight;
    }
  }finally{
    ctx.restore();
  }
}

function drawStateBelow(ctx, node, lines, x=8, margin=6){
  try{
    const baseLines = _getOverlaySourceLines(node, lines);

    const sigLines = _buildSignalSummaryLines(node);
    const propLines = _buildPropertySummaryLines(node);
    const compactSrc = baseLines.length ? baseLines : sigLines;
    const importantCount = Math.max(1, Math.min(6, Number(node?.properties?.overlayImportantCount) || 4));
    const compactLines = _pickCompactOverlayLines(compactSrc, importantCount);
    if(enforceNodeOverlayMinSize(node, compactLines)) return;
    _drawCompactLinesInsideNode(ctx, node, compactLines);

    if(!_shouldShowNodeDetails(node)) return;

    const detailLines = [];
    if(baseLines.length) detailLines.push(...baseLines);
    if(sigLines.length){
      if(detailLines.length) detailLines.push('');
      detailLines.push(...sigLines);
    }
    if(propLines.length){
      if(detailLines.length) detailLines.push('');
      detailLines.push(...propLines);
    }
    _drawHoverDetailBox(ctx, node, detailLines, x, margin);
  }catch(_e){}
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
  if(!node || !Array.isArray(node.size)) return false;
  const minSize = getNodeOverlayMinimumSize(node, lines || []);
  if(!minSize) return false;
  const nextW = Math.max(Number(node.size[0]) || 0, minSize[0]);
  const nextH = Math.max(Number(node.size[1]) || 0, minSize[1]);
  if(nextW !== node.size[0] || nextH !== node.size[1]){
    node.size = [nextW, nextH];
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
