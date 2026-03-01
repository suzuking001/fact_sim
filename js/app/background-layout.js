// Layout background image (import / show / move / resize / opacity)

var App = window.App || (window.App = {});

(function(){
  const DEFAULT_OPACITY = 0.35;
  const state = {
    enabled: true,
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
      if(typeof c.setDirty === 'function') c.setDirty(true, true);
      c.draw(true, true);
    }catch(_e){}
  }

  function _updateUi(){
    if(!controls) return;
    controls.enabled.checked = !!state.enabled;
    controls.x.value = String(Math.round(state.x));
    controls.y.value = String(Math.round(state.y));
    controls.w.value = String(Math.max(0, Math.round(state.width)));
    controls.h.value = String(Math.max(0, Math.round(state.height)));
    controls.opacity.value = String(state.opacity);
    controls.opacityValue.textContent = Number(state.opacity).toFixed(2);
    const hasImage = !!state.src;
    controls.clearBtn.disabled = !hasImage;
    controls.enabled.disabled = !hasImage;
    controls.x.disabled = !hasImage;
    controls.y.disabled = !hasImage;
    controls.w.disabled = !hasImage;
    controls.h.disabled = !hasImage;
    controls.opacity.disabled = !hasImage;
  }

  function _applyState(next){
    state.enabled = (typeof next.enabled === 'boolean') ? next.enabled : !!state.enabled;
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

  App.backgroundLayout = {
    attachCanvas(canvas){
      if(!canvas || canvas.__layoutBgPatched) return;
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
      canvas.__layoutBgPatched = true;
      _drawNow();
    },

    serialize(){
      if(!state.src) return null;
      return {
        v: 1,
        enabled: !!state.enabled,
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

