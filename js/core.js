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
let speed = 1;
let fastMode = false;
let simTimeMs = 0;
let simRunning = false;
let simRafId = null;
let lastRealMs = 0;
let lastUiUpdateMs = 0;

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
  const dtEl = document.getElementById('simDt');
  if(dtEl){
    if(typeof window.getSimMetaText === 'function') dtEl.textContent = window.getSimMetaText();
    else dtEl.textContent = `dt: ${SIM_DT_SEC.toFixed(1)} s (fixed)`;
  }
}

function resetSimClock(){
  simTimeMs = 0;
  lastRealMs = 0;
  updateSimTime();
}

function startSimLoop(stepFn){
  if(simRunning) return;
  simRunning = true;
  lastRealMs = 0;
  lastUiUpdateMs = 0;
  applyRenderSuppression(fastMode);
  updateFastestModeNotice();
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

function drawStateBelow(ctx, node, lines, x=8, margin=6){
  try{
    const baseLines = Array.isArray(lines) ? lines.slice() : [];
    const sigLines = _buildSignalSummaryLines(node);
    const allLines = baseLines.concat(sigLines);

    ctx.save();
    ctx.font = '12px sans-serif';
    let w = 0; for(const t of allLines){ w = Math.max(w, ctx.measureText(String(t)).width); }
    const lh = 14; const pad = 6; const h = allLines.length * lh + pad*2;
    const yTop = node.size[1] + margin;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x-4, yTop, w+pad*2, h);
    ctx.fillStyle = '#fff';
    let yy = yTop + pad + 8;
    for(const t of allLines){
      ctx.fillText(String(t), x, yy);
      yy += lh;
    }
  }catch(e){}
  finally{ try{ ctx.restore(); }catch(_e){} }
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
