// Selection tools (box select) and clipboard handlers

function rectsOverlap(a, b){
  return !(a[0] > b[0] + b[2] ||
           a[0] + a[2] < b[0] ||
           a[1] > b[1] + b[3] ||
           a[1] + a[3] < b[1]);
}

function installBoxSelect(c){
  if(!c || c.__boxSelectHooked) return;
  const el = c.canvas;
  if(!el) return;
  let selecting = false;

  const getCanvasPos = (e)=>{
    try{
      // graph coordinates (accounts for zoom/pan)
      return c.convertEventToCanvasOffset(e);
    }catch(_e){
      return [e.offsetX || 0, e.offsetY || 0];
    }
  };

  el.addEventListener('mousedown', (e)=>{
    if(e.button !== 0) return;
    const useCtrl = e.ctrlKey || e.metaKey;
    if(!useCtrl) return;
    const p = getCanvasPos(e);
    const node = c.getNodeOnPos(p[0], p[1]);
    if(node) return;
    selecting = true;
    c.dragging_rectangle = new Float32Array([p[0], p[1], 1, 1]);
    c.setDirty(true, true);
    e.preventDefault();
    e.stopPropagation();
  }, true);

  el.addEventListener('mousemove', (e)=>{
    if(!selecting || !c.dragging_rectangle) return;
    const p = getCanvasPos(e);
    c.dragging_rectangle[2] = p[0] - c.dragging_rectangle[0];
    c.dragging_rectangle[3] = p[1] - c.dragging_rectangle[1];
    c.setDirty(true);
  }, true);

  window.addEventListener('mouseup', (e)=>{
    if(!selecting) return;
    selecting = false;
    c.__rectSelectForce = false;
    const rect = c.dragging_rectangle;
    c.dragging_rectangle = null;
    if(rect && c.graph){
      const x = rect[2] < 0 ? rect[0] + rect[2] : rect[0];
      const y = rect[3] < 0 ? rect[1] + rect[3] : rect[1];
      const w = Math.abs(rect[2]);
      const h = Math.abs(rect[3]);
      if(w > 10 && h > 10){
        const r = [x, y, w, h];
        const nodes = [];
        const nb = new Float32Array(4);
        for(const n of c.graph._nodes){
          n.getBounding(nb);
          if(rectsOverlap(r, nb)) nodes.push(n);
        }
        c.selectNodes(nodes, false);
      }
    }
    c.setDirty(true, true);
  }, true);

  c.__boxSelectHooked = true;
}

function installBoxSelectOverlay(c){
  if(!c || c.__boxSelectOverlayHooked) return;
  const prev = c.onDrawOverlay;
  c.onDrawOverlay = function(ctx){
    try{
      if(typeof prev === 'function') prev.call(this, ctx);
      const rect = this.dragging_rectangle;
      if(!rect) return;
      const x = rect[2] < 0 ? rect[0] + rect[2] : rect[0];
      const y = rect[3] < 0 ? rect[1] + rect[3] : rect[1];
      const w = Math.abs(rect[2]);
      const h = Math.abs(rect[3]);
      if(w < 1 || h < 1) return;
      ctx.save();
      // Draw in graph space, but keep stroke width/dash visible under zoom
      if(this.ds && typeof this.ds.toCanvasContext === 'function'){
        this.ds.toCanvasContext(ctx);
      }
      const scale = (this.ds && this.ds.scale) ? this.ds.scale : 1;
      ctx.lineWidth = 2.5 / scale;
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.95)';
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(x + 0.5 / scale, y + 0.5 / scale, w, h);
      ctx.setLineDash([]);
      ctx.restore();
    }catch(_e){}
  };
  c.__boxSelectOverlayHooked = true;
}

function doCopy(){
  if(!canvas) return;
  if(canvas.selected_nodes && Object.keys(canvas.selected_nodes).length){
    canvas.copyToClipboard();
    showToast('コピーしました');
  }
}

function doPaste(){
  if(!canvas) return;
  if(!canvas.__last_mouse){
    const scale = canvas.ds.scale || 1;
    const cx = canvas.ds.offset[0] + (canvas.canvas.width * 0.5 / scale);
    const cy = canvas.ds.offset[1] + (canvas.canvas.height * 0.5 / scale);
    canvas.graph_mouse[0] = cx; canvas.graph_mouse[1] = cy;
  }
  canvas.pasteFromClipboard(false);
  showToast('ペーストしました');
}

function installClipboardHandlers(c){
  if(!c || c.__clipboardHooked) return;
  const el = c.canvas;
  if(!el) return;

  const updateMouse = (e)=>{
    try{
      const rect = el.getBoundingClientRect();
      if(e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom){
        return;
      }
      const p = (typeof c.convertEventToCanvasOffset === 'function')
        ? c.convertEventToCanvasOffset(e)
        : c.convertEventToCanvas(e);
      c.graph_mouse[0] = p[0];
      c.graph_mouse[1] = p[1];
      c.__last_mouse = p;
    }catch(_e){}
  };
  el.addEventListener('mousemove', updateMouse, true);

  window.addEventListener('keydown', (e)=>{
    if(e.target && (e.target.localName === 'input' || e.target.localName === 'textarea')) return;
    const mod = e.metaKey || e.ctrlKey;
    if(!mod) return;
    if(e.code === 'KeyC'){
      doCopy();
      e.preventDefault();
    }else if(e.code === 'KeyZ'){
      if(e.shiftKey){
        redo();
        showToast('やり直しました');
      }else{
        undo();
        showToast('元に戻しました');
      }
      e.preventDefault();
    }else if(e.code === 'KeyY'){
      redo();
      showToast('やり直しました');
      e.preventDefault();
    }else if(e.code === 'KeyV'){
      doPaste();
      e.preventDefault();
    }
  }, true);

  c.__clipboardHooked = true;
}

function bindHistoryButtons(){
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  if(btnUndo) btnUndo.addEventListener('click', ()=>{
    undo();
    showToast('元に戻しました');
  });
  if(btnRedo) btnRedo.addEventListener('click', ()=>{
    redo();
    showToast('やり直しました');
  });
}
