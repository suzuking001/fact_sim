// Layout background image (import / show / move / resize / rotate / opacity)

var App = window.App || (window.App = {});

(function(){
  const DEFAULT_OPACITY = 0.35;
  const state = {
    enabled: true,
    mouseEdit: false,
    src: '',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    opacity: DEFAULT_OPACITY
  };
  const image = new Image();
  let loadToken = 0;
  let controls = null;
  let mouseState = null;

  function _num(v, fallback){
    const n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function _clamp(v, lo, hi){
    const n = Number(v);
    if(!isFinite(n)) return lo;
    if(n < lo) return lo;
    if(n > hi) return hi;
    return n;
  }

  function _normalizeAngle(v){
    let n = _num(v, 0);
    if(!isFinite(n)) n = 0;
    while(n > 180) n -= 360;
    while(n <= -180) n += 360;
    return n;
  }

  function _degToRad(v){
    return _normalizeAngle(v) * Math.PI / 180;
  }

  function _center(){
    const w = Math.max(1, Number(state.width) || 1);
    const h = Math.max(1, Number(state.height) || 1);
    return {
      x: (Number(state.x) || 0) + w * 0.5,
      y: (Number(state.y) || 0) + h * 0.5,
      w,
      h
    };
  }

  function _axes(rotationDeg){
    const rad = _degToRad(rotationDeg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      cos,
      sin,
      ux: cos,
      uy: sin,
      vx: -sin,
      vy: cos
    };
  }

  function _worldToLocal(gx, gy, rotationDeg){
    const center = _center();
    const axes = _axes(rotationDeg);
    const dx = (Number(gx) || 0) - center.x;
    const dy = (Number(gy) || 0) - center.y;
    return {
      x: dx * axes.cos + dy * axes.sin,
      y: -dx * axes.sin + dy * axes.cos,
      center,
      axes
    };
  }

  function _drawNow(){
    try{
      const c = App.canvas;
      if(!c || typeof c.draw !== 'function') return;
      c.always_render_background = !!(state && state.enabled && state.src);
      if(typeof c.setDirty === 'function') c.setDirty(true, true);
      c.draw(true, true);
    }catch(_e){}
  }

  function _updateUi(){
    if(!controls) return;
    controls.enabled.checked = !!state.enabled;
    controls.mouseEdit.checked = !!state.mouseEdit;
    controls.x.value = String(Math.round(state.x));
    controls.y.value = String(Math.round(state.y));
    controls.w.value = String(Math.max(0, Math.round(state.width)));
    controls.h.value = String(Math.max(0, Math.round(state.height)));
    controls.rotation.value = String(Math.round(_normalizeAngle(state.rotation)));
    controls.opacity.value = String(state.opacity);
    controls.opacityValue.textContent = Number(state.opacity).toFixed(2);
    const hasImage = !!state.src;
    if(controls.panel){
      controls.panel.classList.toggle('has-image', hasImage);
      controls.panel.classList.toggle('is-empty', !hasImage);
    }
    if(controls.emptyState) controls.emptyState.hidden = hasImage;
    if(controls.adjustDetails && !hasImage) controls.adjustDetails.open = false;
    if(controls.enabledField) controls.enabledField.hidden = !hasImage;
    if(controls.mouseEditField) controls.mouseEditField.hidden = !hasImage;
    if(controls.clearBtn){
      controls.clearBtn.hidden = !hasImage;
      controls.clearBtn.disabled = !hasImage;
    }
    if(controls.loadBtn) controls.loadBtn.style.gridColumn = hasImage ? '' : '1 / -1';
    controls.enabled.disabled = !hasImage;
    controls.mouseEdit.disabled = !hasImage || !state.enabled;
    controls.x.disabled = !hasImage;
    controls.y.disabled = !hasImage;
    controls.w.disabled = !hasImage;
    controls.h.disabled = !hasImage;
    controls.rotation.disabled = !hasImage;
    controls.opacity.disabled = !hasImage;
  }

  function _applyState(next){
    state.enabled = (typeof next.enabled === 'boolean') ? next.enabled : !!state.enabled;
    state.mouseEdit = !!next.mouseEdit;
    state.src = String(next.src || '');
    state.x = _num(next.x, 0);
    state.y = _num(next.y, 0);
    state.width = Math.max(0, _num(next.width, 0));
    state.height = Math.max(0, _num(next.height, 0));
    state.rotation = _normalizeAngle(next.rotation);
    state.opacity = _clamp(_num(next.opacity, DEFAULT_OPACITY), 0.05, 1);
    _updateUi();
    _drawNow();
  }

  function _loadImage(src, preferNatural){
    const token = ++loadToken;
    image.onload = function(){
      if(token !== loadToken) return;
      if(preferNatural || state.width <= 0 || state.height <= 0){
        state.width = Math.max(1, Math.round(image.naturalWidth || 1));
        state.height = Math.max(1, Math.round(image.naturalHeight || 1));
      }
      _updateUi();
      _drawNow();
    };
    image.onerror = function(){
      if(token !== loadToken) return;
      if(typeof App.showToast === 'function') App.showToast('Failed to load background image');
    };
    image.src = src || '';
  }

  function _onFilePicked(file){
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      const src = String(reader.result || '');
      if(!src) return;
      _applyState({
        enabled: true,
        src,
        x: state.x,
        y: state.y,
        width: 0,
        height: 0,
        rotation: state.rotation,
        opacity: state.opacity
      });
      _loadImage(src, true);
      if(controls?.adjustDetails) controls.adjustDetails.open = true;
      if(typeof App.showToast === 'function') App.showToast('Layout image imported');
    };
    reader.readAsDataURL(file);
  }

  function _bindControls(){
    controls = {
      panel: document.getElementById('backgroundPanel'),
      loadBtn: document.getElementById('bgLayoutLoadBtn'),
      clearBtn: document.getElementById('bgLayoutClearBtn'),
      fileInput: document.getElementById('bgLayoutFileInput'),
      emptyState: document.getElementById('bgLayoutEmptyState'),
      enabled: document.getElementById('bgLayoutEnabled'),
      enabledField: document.getElementById('bgLayoutEnabled')?.closest('.field'),
      mouseEdit: document.getElementById('bgLayoutMouseEdit'),
      mouseEditField: document.getElementById('bgLayoutMouseEdit')?.closest('.field'),
      adjustDetails: document.getElementById('bgLayoutAdjustDetails'),
      x: document.getElementById('bgLayoutX'),
      y: document.getElementById('bgLayoutY'),
      w: document.getElementById('bgLayoutW'),
      h: document.getElementById('bgLayoutH'),
      rotation: document.getElementById('bgLayoutRotation'),
      opacity: document.getElementById('bgLayoutOpacity'),
      opacityValue: document.getElementById('bgLayoutOpacityValue')
    };
    if(!controls.panel) return;

    controls.loadBtn.addEventListener('click', ()=>{
      if(controls.fileInput) controls.fileInput.click();
    });
    controls.fileInput.addEventListener('change', (e)=>{
      const f = e.target && e.target.files ? e.target.files[0] : null;
      _onFilePicked(f || null);
      e.target.value = '';
    });
    controls.clearBtn.addEventListener('click', ()=>{
      App.backgroundLayout.restore(null);
      if(typeof App.showToast === 'function') App.showToast('Layout image cleared');
    });
    controls.enabled.addEventListener('change', ()=>{
      state.enabled = !!controls.enabled.checked;
      if(!state.enabled) state.mouseEdit = false;
      _updateUi();
      _drawNow();
    });
    controls.mouseEdit.addEventListener('change', ()=>{
      state.mouseEdit = !!controls.mouseEdit.checked;
      if(state.mouseEdit && controls.adjustDetails) controls.adjustDetails.open = true;
      _updateUi();
      _drawNow();
    });

    function bindNumber(input, key, minValue){
      input.addEventListener('input', ()=>{
        const v = _num(input.value, state[key]);
        state[key] = (typeof minValue === 'number') ? Math.max(minValue, v) : v;
        _drawNow();
      });
    }
    bindNumber(controls.x, 'x');
    bindNumber(controls.y, 'y');
    bindNumber(controls.w, 'width', 1);
    bindNumber(controls.h, 'height', 1);
    controls.rotation.addEventListener('input', ()=>{
      state.rotation = _normalizeAngle(controls.rotation.value);
      _updateUi();
      _drawNow();
    });
    controls.opacity.addEventListener('input', ()=>{
      state.opacity = _clamp(_num(controls.opacity.value, state.opacity), 0.05, 1);
      controls.opacityValue.textContent = Number(state.opacity).toFixed(2);
      _drawNow();
    });

    _updateUi();
  }

  function _getScale(){
    const ds = App.canvas && App.canvas.ds;
    const n = Number(ds && ds.scale);
    return isFinite(n) && n > 0 ? n : 1;
  }

  function _getGraphPos(canvas, e){
    try{
      if(canvas && typeof canvas.convertEventToCanvasOffset === 'function'){
        const p = canvas.convertEventToCanvasOffset(e);
        return [Number(p[0]) || 0, Number(p[1]) || 0];
      }
    }catch(_e){}
    const rect = canvas && canvas.canvas ? canvas.canvas.getBoundingClientRect() : null;
    const ds = canvas && canvas.ds;
    if(!rect || !ds) return [0, 0];
    const scale = _getScale();
    const x = ((Number(e.clientX) || 0) - rect.left) / scale - (Number(ds.offset && ds.offset[0]) || 0);
    const y = ((Number(e.clientY) || 0) - rect.top) / scale - (Number(ds.offset && ds.offset[1]) || 0);
    return [x, y];
  }

  function _hitTest(gx, gy){
    if(!state.src || !state.enabled) return '';
    const w = Math.max(1, Number(state.width) || 1);
    const h = Math.max(1, Number(state.height) || 1);
    const hs = 14 / _getScale();
    const rotateOffset = 24 / _getScale();
    const local = _worldToLocal(gx, gy, state.rotation);
    const lx = local.x;
    const ly = local.y;
    const rotateDx = lx;
    const rotateDy = ly + h * 0.5 + rotateOffset;
    if((rotateDx * rotateDx + rotateDy * rotateDy) <= Math.pow(hs * 0.85, 2)) return 'rotate';
    const inResize = lx >= (w * 0.5 - hs) && lx <= (w * 0.5 + hs) && ly >= (h * 0.5 - hs) && ly <= (h * 0.5 + hs);
    if(inResize) return 'resize';
    const inside = lx >= (-w * 0.5) && lx <= (w * 0.5) && ly >= (-h * 0.5) && ly <= (h * 0.5);
    return inside ? 'move' : '';
  }

  function _applyCursor(canvas, mode){
    if(!canvas || !canvas.canvas) return;
    if(mode === 'resize') canvas.canvas.style.cursor = 'nwse-resize';
    else if(mode === 'rotate') canvas.canvas.style.cursor = 'crosshair';
    else if(mode === 'move') canvas.canvas.style.cursor = 'move';
    else canvas.canvas.style.cursor = '';
  }

  function _installMouseEdit(canvas){
    if(!canvas || canvas.__layoutBgMouseHooked) return;
    const el = canvas.canvas;
    if(!el) return;

    mouseState = {
      active: false,
      mode: '',
      startX: 0,
      startY: 0,
      baseX: 0,
      baseY: 0,
      baseW: 0,
      baseH: 0,
      baseRotation: 0,
      anchorX: 0,
      anchorY: 0,
      centerX: 0,
      centerY: 0,
      startAngle: 0
    };

    el.addEventListener('mousedown', (e)=>{
      if(e.button !== 0) return;
      if(!state.mouseEdit || !state.src || !state.enabled) return;
      const p = _getGraphPos(canvas, e);
      const mode = _hitTest(p[0], p[1]);
      if(!mode) return;
      mouseState.active = true;
      mouseState.mode = mode;
      mouseState.startX = p[0];
      mouseState.startY = p[1];
      mouseState.baseX = Number(state.x) || 0;
      mouseState.baseY = Number(state.y) || 0;
      mouseState.baseW = Math.max(1, Number(state.width) || 1);
      mouseState.baseH = Math.max(1, Number(state.height) || 1);
      mouseState.baseRotation = _normalizeAngle(state.rotation);
      const center = _center();
      mouseState.centerX = center.x;
      mouseState.centerY = center.y;
      if(mode === 'resize'){
        const axes = _axes(state.rotation);
        mouseState.anchorX = center.x - axes.ux * mouseState.baseW * 0.5 - axes.vx * mouseState.baseH * 0.5;
        mouseState.anchorY = center.y - axes.uy * mouseState.baseW * 0.5 - axes.vy * mouseState.baseH * 0.5;
      }else if(mode === 'rotate'){
        mouseState.startAngle = Math.atan2(p[1] - center.y, p[0] - center.x);
      }
      _applyCursor(canvas, mode);
      e.preventDefault();
      e.stopPropagation();
    }, true);

    window.addEventListener('mousemove', (e)=>{
      if(!mouseState || !mouseState.active) return;
      if(!state.mouseEdit || !state.src || !state.enabled){
        mouseState.active = false;
        mouseState.mode = '';
        _applyCursor(canvas, '');
        return;
      }
      const p = _getGraphPos(canvas, e);
      const dx = p[0] - mouseState.startX;
      const dy = p[1] - mouseState.startY;
      if(mouseState.mode === 'move'){
        state.x = mouseState.baseX + dx;
        state.y = mouseState.baseY + dy;
      }else if(mouseState.mode === 'resize'){
        const axes = _axes(mouseState.baseRotation);
        const vx = p[0] - mouseState.anchorX;
        const vy = p[1] - mouseState.anchorY;
        const nextW = Math.max(16, vx * axes.ux + vy * axes.uy);
        const nextH = Math.max(16, vx * axes.vx + vy * axes.vy);
        const cx = mouseState.anchorX + axes.ux * nextW * 0.5 + axes.vx * nextH * 0.5;
        const cy = mouseState.anchorY + axes.uy * nextW * 0.5 + axes.vy * nextH * 0.5;
        state.width = nextW;
        state.height = nextH;
        state.x = cx - nextW * 0.5;
        state.y = cy - nextH * 0.5;
      }else if(mouseState.mode === 'rotate'){
        const nextAngle = Math.atan2(p[1] - mouseState.centerY, p[0] - mouseState.centerX);
        const delta = (nextAngle - mouseState.startAngle) * 180 / Math.PI;
        state.rotation = _normalizeAngle(mouseState.baseRotation + delta);
      }
      _updateUi();
      _drawNow();
      e.preventDefault();
      e.stopPropagation();
    }, true);

    el.addEventListener('mousemove', (e)=>{
      if(!state.mouseEdit || !state.src || !state.enabled){
        _applyCursor(canvas, '');
        return;
      }
      const p = _getGraphPos(canvas, e);
      if(mouseState && mouseState.active){
        return;
      }
      const mode = _hitTest(p[0], p[1]);
      _applyCursor(canvas, mode);
    }, true);

    window.addEventListener('mouseup', ()=>{
      if(!mouseState || !mouseState.active) return;
      mouseState.active = false;
      mouseState.mode = '';
      _applyCursor(canvas, '');
      _updateUi();
      _drawNow();
    }, true);

    canvas.__layoutBgMouseHooked = true;
  }

  function _drawMouseEditOverlay(ctx, canvas){
    if(!state.mouseEdit || !state.src || !state.enabled) return;
    const w = Math.max(1, Number(state.width) || 1);
    const h = Math.max(1, Number(state.height) || 1);
    const scale = _getScale();
    const hs = 14 / scale;
    const rotateOffset = 24 / scale;
    const center = _center();
    const rotateLabel = `${Math.round(_normalizeAngle(state.rotation))} deg`;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(_degToRad(state.rotation));
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeStyle = 'rgba(37,99,235,0.95)';
    ctx.setLineDash([6 / scale, 4 / scale]);
    ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(37,99,235,0.95)';
    ctx.fillRect(w * 0.5 - hs, h * 0.5 - hs, hs, hs);
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.lineTo(0, -h * 0.5 - rotateOffset);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -h * 0.5 - rotateOffset, hs * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(15,23,42,0.88)';
    ctx.font = `${Math.max(10, 11 / scale)}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(rotateLabel, 0, -h * 0.5 - rotateOffset - hs * 0.8);
    ctx.restore();
  }

  App.backgroundLayout = {
    attachCanvas(canvas){
      if(!canvas || canvas.__layoutBgPatched) return;
      canvas.always_render_background = !!(state.enabled && state.src);
      const prev = canvas.onDrawBackground;
      canvas.onDrawBackground = function(ctx, visibleArea){
        if(typeof prev === 'function'){
          try{ prev.call(this, ctx, visibleArea); }catch(_e){}
        }
        if(!state.enabled || !state.src || !image.src || !image.complete) return;
        const w = Math.max(1, _num(state.width, image.naturalWidth || 1));
        const h = Math.max(1, _num(state.height, image.naturalHeight || 1));
        const center = _center();
        ctx.save();
        ctx.globalAlpha = _clamp(state.opacity, 0.05, 1);
        ctx.translate(center.x, center.y);
        ctx.rotate(_degToRad(state.rotation));
        ctx.drawImage(image, -w * 0.5, -h * 0.5, w, h);
        ctx.restore();
      };
      const prevFg = canvas.onDrawForeground;
      canvas.onDrawForeground = function(ctx){
        if(typeof prevFg === 'function'){
          try{ prevFg.call(this, ctx); }catch(_e){}
        }
        _drawMouseEditOverlay(ctx, canvas);
      };
      canvas.__layoutBgPatched = true;
      _installMouseEdit(canvas);
      _drawNow();
    },

    serialize(){
      if(!state.src) return null;
      return {
        v: 2,
        enabled: !!state.enabled,
        mouseEdit: !!state.mouseEdit,
        src: state.src,
        x: _num(state.x, 0),
        y: _num(state.y, 0),
        width: Math.max(1, _num(state.width, 1)),
        height: Math.max(1, _num(state.height, 1)),
        rotation: _normalizeAngle(state.rotation),
        opacity: _clamp(state.opacity, 0.05, 1)
      };
    },

    getMeta(){
      return {
        hasImage: !!state.src,
        enabled: !!state.enabled,
        mouseEdit: !!state.mouseEdit,
        rotation: _normalizeAngle(state.rotation),
        opacity: _clamp(state.opacity, 0.05, 1)
      };
    },

    restore(data){
      if(!data || typeof data !== 'object' || !data.src){
        loadToken++;
        image.src = '';
        _applyState({
          enabled: true,
          src: '',
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          opacity: DEFAULT_OPACITY
        });
        return;
      }
      _applyState({
        enabled: data.enabled !== false,
        mouseEdit: !!data.mouseEdit,
        src: String(data.src || ''),
        x: _num(data.x, 0),
        y: _num(data.y, 0),
        width: Math.max(1, _num(data.width, 1)),
        height: Math.max(1, _num(data.height, 1)),
        rotation: _normalizeAngle(data.rotation),
        opacity: _clamp(_num(data.opacity, DEFAULT_OPACITY), 0.05, 1)
      });
      _loadImage(state.src, false);
    }
  };

  _bindControls();
})();
