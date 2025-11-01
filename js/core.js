// Core: timing, helpers, and UI time display

// Canvas element
const graphElement = document.getElementById('graph');

// Time management (real-time scaled clock)
let speed = 1;
let realAnchor = Date.now();
let simAnchor = realAnchor;

function simNow(){
  return simAnchor + (Date.now() - realAnchor) * speed;
}

function setSpeed(v){
  if(v <= 0 || v > 100) return;
  const now = Date.now();
  simAnchor = simNow();
  realAnchor = now;
  speed = v;
  updateSimTime();
}

document.getElementById('speedInput')
  .addEventListener('input', e => setSpeed(parseFloat(e.target.value)));

let simInterval, simStart, simAccum = 0;

function updateSimTime(){
  const elapsed = simAccum + (simStart ? simNow() - simStart : 0);
  document.getElementById('simTime').textContent = (elapsed/1000).toFixed(1) + ' s';
}

// Drawing helpers
function drawState(ctx, lines, x=8, y=16){
  try{
    ctx.save();
    ctx.font = '12px sans-serif';
    let w = 0; for(const t of lines){ w = Math.max(w, ctx.measureText(String(t)).width); }
    const lh = 14; const pad = 6; const h = lines.length * lh + pad*2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x-4, y-12, w+pad*2, h);
    ctx.fillStyle = '#fff';
    let yy = y; for(const t of lines){ ctx.fillText(String(t), x, yy); yy += lh; }
  }catch(e){}
  finally{ try{ ctx.restore(); }catch(_e){} }
}

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
window.drawState = drawState;
window.drawStateBelow = drawStateBelow;

