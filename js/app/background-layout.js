// Layout background image (import / show / move / resize / opacity)

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
    controls.opacity.value = String(state.opacity);
    controls.opacityValue.textContent = Number(state.opacity).toFixed(2);
    const hasImage = !!state.src;
    controls.clearBtn.disabled = !hasImage;
    controls.enabled.disabled = !hasImage;
    controls.mouseEdit.disabled = !hasImage || !state.enabled;
    controls.x.disabled = !hasImage;
    controls.y.disabled = !hasImage;
    controls.w.disabled = !hasImage;
    controls.h.disabled = !hasImage;
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
        opacity: state.opacity
      });
      _loadImage(src, true);
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
      enabled: document.getElementById('bgLayoutEnabled'),
      mouseEdit: document.getElementById('bgLayoutMouseEdit'),
      x: document.getElementById('bgLayoutX'),
      y: document.getElementById('bgLayoutY'),
      w: document.getElementById('bgLayoutW'),
      h: document.getElementById('bgLayoutH'),
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
    const x = Number(state.x) || 0;
    const y = Number(state.y) || 0;
    const w = Math.max(1, Number(state.width) || 1);
    const h = Math.max(1, Number(state.height) || 1);
    const inside = gx >= x && gx <= (x + w) && gy >= y && gy <= (y + h);
    if(!inside) return '';
    const hs = 14 / _getScale();
    const inResize = gx >= (x + w - hs) && gy >= (y + h - hs);
    return inResize ? 'resize' : 'move';
  }

  function _applyCursor(canvas, mode){
    if(!canvas || !canvas.canvas) return;
    if(mode === 'resize') canvas.canvas.style.cursor = 'nwse-resize';
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
      baseH: 0
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
        state.width = Math.max(16, mouseState.baseW + dx);
        state.height = Math.max(16, mouseState.baseH + dy);
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
    const x = Number(state.x) || 0;
    const y = Number(state.y) || 0;
    const w = Math.max(1, Number(state.width) || 1);
    const h = Math.max(1, Number(state.height) || 1);
    const scale = _getScale();
    const hs = 14 / scale;

    ctx.save();
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeStyle = 'rgba(37,99,235,0.95)';
    ctx.setLineDash([6 / scale, 4 / scale]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(37,99,235,0.95)';
    ctx.fillRect(x + w - hs, y + h - hs, hs, hs);
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
        ctx.save();
        ctx.globalAlpha = _clamp(state.opacity, 0.05, 1);
        ctx.drawImage(image, _num(state.x, 0), _num(state.y, 0), w, h);
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
        v: 1,
        enabled: !!state.enabled,
        mouseEdit: !!state.mouseEdit,
        src: state.src,
        x: _num(state.x, 0),
        y: _num(state.y, 0),
        width: Math.max(1, _num(state.width, 1)),
        height: Math.max(1, _num(state.height, 1)),
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
        opacity: _clamp(_num(data.opacity, DEFAULT_OPACITY), 0.05, 1)
      });
      _loadImage(state.src, false);
    }
  };

  _bindControls();
})();
