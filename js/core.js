// Core: timing, helpers, and UI time display

// Canvas element
const graphElement = document.getElementById('graph');

// Time management (simulation clock)
const SIM_DT_SEC = 0.1;
const SPEED_LEVELS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
let speed = 1;
let simTimeMs = 0;
let simRunning = false;
let simRafId = null;
let lastRealMs = 0;

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

function clampSpeedLevelIndex(i){
  const max = SPEED_LEVELS.length - 1;
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
  const n = Number(v);
  if(!isFinite(n)) return '1x';
  if(Number.isInteger(n)) return `${n}x`;
  return `${n.toFixed(2).replace(/0+$/,'').replace(/\.$/, '')}x`;
}

function reflectSpeedUI(v){
  try{
    const range = document.getElementById('speedRange');
    if(range){
      range.min = '0';
      range.max = String(SPEED_LEVELS.length - 1);
      range.step = '1';
      range.value = String(speedLevelIndexFromValue(v));
    }
    const sf = document.getElementById('speedFactor');
    if(sf) sf.textContent = formatSpeedLabel(v);
  }catch(e){}
}

function setSpeed(v){
  const n = Number(v);
  if(!isFinite(n)) return;
  speed = clampSpeed(n);
  updateSimTime();
  reflectSpeedUI(speed);
}

// Bind speed control (range slider preferred; fall back to numeric input if present)
(function(){
  const range = document.getElementById('speedRange');
  if(range){
    range.min = '0';
    range.max = String(SPEED_LEVELS.length - 1);
    range.step = '1';
    range.value = String(speedLevelIndexFromValue(speed));
    range.addEventListener('input', e=>{
      const idx = clampSpeedLevelIndex(parseInt(e.target.value, 10));
      setSpeed(SPEED_LEVELS[idx]);
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
  const tick = (ts)=>{
    if(!simRunning) return;
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
  updateSimTime();
}

function isSimRunning(){ return simRunning; }
function getSimDtSec(){ return SIM_DT_SEC; }

function drawStateBelow(ctx, node, lines, x=8, margin=6){
  try{
    ctx.save();
    ctx.font = '12px sans-serif';
    let w = 0; for(const t of lines){ w = Math.max(w, ctx.measureText(String(t)).width); }
    const lh = 14; const pad = 6; const h = lines.length * lh + pad*2;
    const yTop = node.size[1] + margin;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x-4, yTop, w+pad*2, h);
    ctx.fillStyle = '#fff';
    let yy = yTop + pad + 8; for(const t of lines){ ctx.fillText(String(t), x, yy); yy += lh; }
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
window.drawStateBelow = drawStateBelow;
