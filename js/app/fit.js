// Fit-to-screen helpers

function fitToScreen(){
  if(!canvas || !graph) return;
  if(!graph._nodes || graph._nodes.length === 0){
    try{
      if(canvas.ds && canvas.ds.reset) canvas.ds.reset();
      canvas.setDirty(true,true);
    }catch(_e){}
    return;
  }
  const b = new Float32Array(4);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(const n of graph._nodes){
    if(!n) continue;
    if(typeof n.getBounding === 'function'){
      n.getBounding(b);
      minX = Math.min(minX, b[0]);
      minY = Math.min(minY, b[1]);
      maxX = Math.max(maxX, b[0] + b[2]);
      maxY = Math.max(maxY, b[1] + b[3]);
    }else{
      const x = n.pos ? n.pos[0] : 0;
      const y = n.pos ? n.pos[1] : 0;
      const w = n.size ? n.size[0] : 0;
      const h = n.size ? n.size[1] : 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  }
  if(!isFinite(minX) || !isFinite(minY)) return;
  const rect = canvas.canvas.getBoundingClientRect();
  const cw = rect.width || canvas.canvas.clientWidth || canvas.canvas.width || 800;
  const ch = rect.height || canvas.canvas.clientHeight || canvas.canvas.height || 600;
  const margin = 32;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  let scale = Math.min((cw - margin * 2) / w, (ch - margin * 2) / h);
  if(canvas.ds){
    if(canvas.ds.max_scale) scale = Math.min(scale, canvas.ds.max_scale);
    if(canvas.ds.min_scale && scale < canvas.ds.min_scale){
      // allow fit to go beyond min_scale when needed
      canvas.ds.min_scale = scale;
    }
  }
  if(!isFinite(scale) || scale <= 0) scale = 1;
  const cx = minX + w / 2;
  const cy = minY + h / 2;
  if(canvas.ds){
    canvas.ds.scale = scale;
    canvas.ds.offset[0] = (cw / 2) / scale - cx;
    canvas.ds.offset[1] = (ch / 2) / scale - cy;
  }
  canvas.setDirty(true,true);
  showToast('画面フィット');
}

function installFitHandlers(c){
  if(!c || c.__fitHooked) return;
  const el = c.canvas;
  if(!el) return;
  let lastMid = 0;
  el.addEventListener('mousedown', (e)=>{
    if(e.button !== 1) return;
    const now = performance.now();
    if(now - lastMid < 350){
      fitToScreen();
      lastMid = 0;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    lastMid = now;
    e.preventDefault();
  }, true);
  c.__fitHooked = true;
}
