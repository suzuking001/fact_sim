// Core: timing, helpers, and UI time display

// Canvas element
const graphElement = document.getElementById('graph');

// Time management (simulation clock)
const SIM_DT_SEC = 0.1;
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

function setSpeed(v){
  if(isNaN(v)) return;
  if(v <= 1){
    v = Math.round(v * 10) / 10;
    if(v < 0.1) v = 0.1;
  }else{
    v = Math.round(v);
  }
  // clamp to reasonable range
  if(v > 100) v = 100;
  speed = v;
  updateSimTime();
  // reflect to UI controls
  try{
    const range = document.getElementById('speedRange');
    if(range){
      const max = parseFloat(range.max||'10');
      const min = parseFloat(range.min||'0.1');
      if(v >= min && v <= max){
        range.step = (v <= 1 ? '0.1' : '1');
        range.value = (v < 1 ? v.toFixed(1) : String(v));
      }
    }
    const sf = document.getElementById('speedFactor');
    if(sf) sf.textContent = (v < 1 ? v.toFixed(1) : String(v)) + 'x';
  }catch(e){}
}

// Bind speed control (range slider preferred; fall back to numeric input if present)
(function(){
  const range = document.getElementById('speedRange');
  if(range){
    range.addEventListener('input', e => setSpeed(parseFloat(e.target.value)));
    // initialize UI label
    try{
      const sf=document.getElementById('speedFactor');
      if(sf){
        const v = parseFloat(range.value);
        sf.textContent = (v < 1 ? v.toFixed(1) : String(parseInt(range.value,10))) + 'x';
      }
    }catch(e){}
    try{
      const v = parseFloat(range.value);
      range.step = (v <= 1 ? '0.1' : '1');
    }catch(e){}
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
