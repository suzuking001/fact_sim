// Station node: holds one pallet and performs work/pallet in-out operations.

const STATION_DEFAULTS = {
  processTime: window.NODES_CONFIG?.station?.processTimeSec ?? 2,
  downTime: window.NODES_CONFIG?.station?.downTimeSec ?? 3,
  palletWorkCapacity: window.NODES_CONFIG?.station?.palletWorkCapacity ?? 6
};

class StationNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Station';
    this.size = [190, 66];
    this.resizable = true;
    this.addInput('workIn', 0);
    this.addInput('palletIn', 'PALLET');
    this.addOutput('workOut', 0);
    this.addOutput('palletOut', 'PALLET');
    this.properties = {
      processTime: STATION_DEFAULTS.processTime,
      downTime: STATION_DEFAULTS.downTime,
      palletWorkCapacity: STATION_DEFAULTS.palletWorkCapacity,
      flipIO: false
    };

    this._state = 'IDLE';
    this._stateName = 'idle';
    this._until = 0;
    this._action = '';
    this._payload = null;
    this._pallet = null;
    this._lastWorkInRef = null;
    this._lastPalletInRef = null;
    this._palletWaitIconLinks = null;
    this._palletWaitIconKey = '';
    this._setState('IDLE', 'idle');

    if(window.enableFlipIO) window.enableFlipIO(this);
  }

  _setState(kind, detail){
    this._state = String(kind || 'IDLE').toUpperCase();
    this._stateName = String(detail || kind || 'idle').toLowerCase();
    switch(this._state){
      case 'PROCESS': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
      case 'WAIT':    this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
      case 'DOWN':    this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
      case 'IDLE':
      default:        this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
    }
    if(typeof window.applyNodeStateTheme === 'function') window.applyNodeStateTheme(this, this._state);
  }

  _normalizeTime(v, fallback){
    const n = Math.round(Number(v) * 10) / 10;
    if(!isFinite(n) || n < 0) return Math.max(0, Math.round(Number(fallback) * 10) / 10);
    return n;
  }

  _normalizePalletCapacity(v){
    const n = Math.round(Number(v));
    if(!isFinite(n) || n < 1) return Math.max(1, Math.round(Number(STATION_DEFAULTS.palletWorkCapacity) || 1));
    return n;
  }

  _normalizePallet(pallet){
    const src = (pallet && typeof pallet === 'object') ? pallet : {};
    const fallbackCap = this._normalizePalletCapacity(this.properties.palletWorkCapacity);
    const cap = this._normalizePalletCapacity(src.capacity || fallbackCap);
    const works = Array.isArray(src.works) ? src.works.slice(0, cap) : [];
    const palletId = String(src.palletId ?? src.id ?? '').trim() || `P-${Math.random().toString(36).slice(2, 8)}`;
    return { palletId, capacity: cap, works };
  }

  _clearOutputs(){
    try{ this.setOutputData(0, null); }catch(_e){}
    try{ this.setOutputData(1, null); }catch(_e){}
  }

  _carrierWaitInfo(){
    const out = this.outputs && this.outputs[1];
    const links = (out && Array.isArray(out.links)) ? out.links : [];
    for(const lid of links){
      const link = this.graph && this.graph.links ? this.graph.links[lid] : null;
      if(!link) continue;
      const target = this.graph && typeof this.graph.getNodeById === 'function'
        ? this.graph.getNodeById(link.target_id)
        : null;
      if(!target) continue;
      const carrier = target._currentAgv || target._departingAgv || null;
      if(!carrier) continue;
      const id = String(carrier.id ?? '').trim() || 'carrier';
      let workCount = 0;
      if(Array.isArray(carrier.pallets)){
        for(const pallet of carrier.pallets){
          workCount += Array.isArray(pallet?.works) ? pallet.works.length : 0;
        }
      }else if(Array.isArray(carrier.cargo)){
        workCount = carrier.cargo.length;
      }
      const capacity = Math.max(0, Number(carrier.capacity) || 0);
      return { id, workCount, capacity };
    }
    return { id: 'pallet', workCount: 0, capacity: 0 };
  }

  _carrierWaitInfoKey(info){
    if(!info || typeof info !== 'object') return '';
    return `${String(info.id || '')}|${Number(info.workCount) || 0}|${Number(info.capacity) || 0}`;
  }

  _setPalletOutWaitIcon(active){
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      const out = this.outputs && this.outputs[1];
      const hasLinks = !!(out && out.links && out.links.length);
      if(!active || !hasLinks){
        if(this._palletWaitIconLinks){
          for(const lid of this._palletWaitIconLinks){
            window.WorkLinkAnimator.hidePortIcon(this.graph, lid);
          }
          this._palletWaitIconLinks = null;
          this._palletWaitIconKey = '';
        }
        return;
      }

      const nextLinks = out.links.slice();
      const info = this._carrierWaitInfo();
      const nextKey = `${nextLinks.join(',')}|${this._carrierWaitInfoKey(info)}`;
      if(this._palletWaitIconLinks && this._palletWaitIconKey === nextKey) return;

      if(this._palletWaitIconLinks){
        for(const lid of this._palletWaitIconLinks){
          window.WorkLinkAnimator.hidePortIcon(this.graph, lid);
        }
      }
      this._palletWaitIconLinks = nextLinks;
      this._palletWaitIconKey = nextKey;
      for(const lid of this._palletWaitIconLinks){
        window.WorkLinkAnimator.showPortIcon(this.graph, lid, 'pallet', info);
      }
    }catch(_e){}
  }

  _hasOutputLinks(slot){
    const out = this.outputs && this.outputs[slot];
    return !!(out && out.links && out.links.length);
  }

  _isFull(){
    if(!this._pallet || !Array.isArray(this._pallet.works)) return false;
    const cap = this._normalizePalletCapacity(this._pallet.capacity || this.properties.palletWorkCapacity);
    return this._pallet.works.length >= cap;
  }

  _firstWork(){
    if(!this._pallet || !Array.isArray(this._pallet.works) || !this._pallet.works.length) return null;
    return this._pallet.works[0];
  }

  _removeWork(work){
    if(!this._pallet || !Array.isArray(this._pallet.works)) return false;
    const idx = this._pallet.works.indexOf(work);
    if(idx < 0) return false;
    this._pallet.works.splice(idx, 1);
    return true;
  }

  canAcceptWorkInput(slotIndex){
    const slot = Number(slotIndex);
    if(isFinite(slot) && slot !== 0) return false;
    if(this._state !== 'IDLE') return false;
    if(!this._pallet) return false;
    return !this._isFull();
  }

  canAcceptPalletInput(slotIndex){
    const slot = Number(slotIndex);
    if(isFinite(slot) && slot !== 1) return false;
    if(this._state !== 'IDLE') return false;
    return !this._pallet;
  }

  _downstreamWorkReady(work){
    const out = this.outputs && this.outputs[0];
    if(!out || !out.links || out.links.length === 0) return false;
    let hasValid = false;
    for(const id of out.links){
      const link = this.graph && this.graph.links ? this.graph.links[id] : null;
      if(!link) continue;
      hasValid = true;
      const target = this.graph && typeof this.graph.getNodeById === 'function'
        ? this.graph.getNodeById(link.target_id)
        : null;
      if(!target) continue;
      if(typeof target.canAcceptWorkInput === 'function'){
        if(!target.canAcceptWorkInput(link.target_slot, work)) return false;
        continue;
      }
      if(typeof target._state !== 'undefined' && String(target._state).toUpperCase() !== 'IDLE') return false;
    }
    return hasValid;
  }

  _downstreamPalletReady(pallet){
    const out = this.outputs && this.outputs[1];
    if(!out || !out.links || out.links.length === 0) return false;
    let hasValid = false;
    for(const id of out.links){
      const link = this.graph && this.graph.links ? this.graph.links[id] : null;
      if(!link) continue;
      hasValid = true;
      const target = this.graph && typeof this.graph.getNodeById === 'function'
        ? this.graph.getNodeById(link.target_id)
        : null;
      if(!target) continue;
      if(typeof target.canAcceptPalletInput === 'function'){
        if(!target.canAcceptPalletInput(link.target_slot, pallet)) return false;
        continue;
      }
      if(typeof target._state !== 'undefined' && String(target._state).toUpperCase() !== 'IDLE') return false;
    }
    return hasValid;
  }

  _peekNewWorkInput(){
    const port = this.inputs && this.inputs[0];
    if(!port || port.link == null){
      this._lastWorkInRef = null;
      return null;
    }
    const work = this.getInputData(0);
    if(!work){
      this._lastWorkInRef = null;
      return null;
    }
    if(this._lastWorkInRef === work) return null;
    if(typeof work !== 'object') return null;
    return work;
  }

  _peekNewPalletInput(){
    const port = this.inputs && this.inputs[1];
    if(!port || port.link == null){
      this._lastPalletInRef = null;
      return null;
    }
    const pallet = this.getInputData(1);
    if(!pallet){
      this._lastPalletInRef = null;
      return null;
    }
    if(this._lastPalletInRef === pallet) return null;
    if(typeof pallet !== 'object') return null;
    return pallet;
  }

  _triggerInputAnim(slot, type, duration, info){
    if(!duration || duration <= 0 || !window.WorkLinkAnimator || !this.graph) return;
    const port = this.inputs && this.inputs[slot];
    if(!port || port.link == null) return;
    try{
      window.WorkLinkAnimator.spawn(this.graph, port.link, type, duration, info || null);
    }catch(_e){}
  }

  _triggerOutputAnim(slot, type, duration, info){
    if(!duration || duration <= 0 || !window.WorkLinkAnimator || !this.graph) return;
    const out = this.outputs && this.outputs[slot];
    if(!out || !out.links) return;
    for(const linkId of out.links){
      try{
        window.WorkLinkAnimator.spawn(this.graph, linkId, type, duration, info || null);
      }catch(_e){}
    }
  }

  _startProcess(action, payload){
    this._action = action;
    this._payload = payload;
    this._setState('PROCESS', action);
    const now = simNow();
    const duration = Math.max(0, this._normalizeTime(this.properties.processTime, STATION_DEFAULTS.processTime) * 1000);
    this._until = now + duration;
    if(action === 'work_in'){
      const info = (payload && typeof payload === 'object') ? { id: payload.id, t: payload.type } : null;
      this._triggerInputAnim(0, 'work', duration, info);
    }else if(action === 'pallet_in'){
      const info = payload && typeof payload === 'object'
        ? { id: String(payload.palletId ?? payload.id ?? 'pallet'), workCount: Array.isArray(payload.works) ? payload.works.length : 0, capacity: Number(payload.capacity) || 0 }
        : null;
      this._triggerInputAnim(1, 'pallet', duration, info);
    }
  }

  _startWait(action, payload){
    this._action = action;
    this._payload = payload;
    this._setState('WAIT', action);
    this._until = 0;
    this._setPalletOutWaitIcon(action === 'pallet_out');
  }

  _startDown(action, payload){
    this._action = action;
    this._payload = payload;
    this._setState('DOWN', action);
    this._setPalletOutWaitIcon(false);
    const now = simNow();
    const downMs = Math.max(0, this._normalizeTime(this.properties.downTime, STATION_DEFAULTS.downTime) * 1000);
    this._until = now + downMs;
    if(action === 'work_out'){
      const info = (payload && typeof payload === 'object') ? { id: payload.id, t: payload.type } : null;
      this.setOutputData(0, payload);
      this._triggerOutputAnim(0, 'work', downMs, info);
    }else if(action === 'pallet_out'){
      const info = payload && typeof payload === 'object'
        ? { id: String(payload.palletId ?? payload.id ?? 'pallet'), workCount: Array.isArray(payload.works) ? payload.works.length : 0, capacity: Number(payload.capacity) || 0 }
        : null;
      this.setOutputData(1, payload);
      this._triggerOutputAnim(1, 'pallet', downMs, info);
    }
  }

  _setIdle(){
    this._action = '';
    this._payload = null;
    this._until = 0;
    this._setState('IDLE', 'idle');
    this._setPalletOutWaitIcon(false);
    this._clearOutputs();
  }

  _chooseNextAction(){
    if(this._state !== 'IDLE') return false;

    if(!this._pallet){
      const pallet = this._peekNewPalletInput();
      if(!pallet) return false;
      this._lastPalletInRef = pallet;
      this._startProcess('pallet_in', pallet);
      return true;
    }

    if(this._isFull()){
      if(!this._hasOutputLinks(1)){
        this._startWait('pallet_out', this._pallet);
      }else{
        this._startProcess('pallet_out', this._pallet);
      }
      return true;
    }

    const workIn = this._peekNewWorkInput();
    if(workIn){
      this._lastWorkInRef = workIn;
      this._startProcess('work_in', workIn);
      return true;
    }

    const workOut = this._firstWork();
    if(workOut && this._hasOutputLinks(0)){
      this._startProcess('work_out', workOut);
      return true;
    }
    return false;
  }

  _handleProcess(now){
    if(now < this._until) return;
    if(this._action === 'work_in'){
      if(this._pallet && Array.isArray(this._pallet.works) && !this._isFull()){
        this._pallet.works.push(this._payload);
      }
      this._startDown('work_in', this._payload);
      return;
    }
    if(this._action === 'pallet_in'){
      this._pallet = this._normalizePallet(this._payload);
      this._startDown('pallet_in', this._payload);
      return;
    }
    if(this._action === 'work_out' || this._action === 'pallet_out'){
      this._startWait(this._action, this._payload);
      return;
    }
    this._setIdle();
  }

  _handleWait(){
    if(this._action === 'work_out'){
      if(this._isFull()){
        this._action = 'pallet_out';
        this._payload = this._pallet;
        this._setState('WAIT', 'pallet_out');
      }else if(this._downstreamWorkReady(this._payload)){
        this._removeWork(this._payload);
        this._startDown('work_out', this._payload);
      }
      return;
    }

    if(this._action === 'pallet_out'){
      if(!this._pallet){
        this._setIdle();
        return;
      }
      if(this._downstreamPalletReady(this._payload)){
        if(this._pallet === this._payload || this._pallet.palletId === this._payload?.palletId){
          this._pallet = null;
        }
        this._startDown('pallet_out', this._payload);
      }
      return;
    }

    this._setIdle();
  }

  _handleDown(now){
    if(this._action === 'work_out'){
      this.setOutputData(0, this._payload);
    }else if(this._action === 'pallet_out'){
      this.setOutputData(1, this._payload);
    }

    if(now < this._until) return;
    this._setIdle();
  }

  onExecute(){
    const now = simNow();
    let guard = 0;
    let again = true;
    while(again && guard++ < 6){
      again = false;
      if(this._state === 'IDLE'){
        if(this._chooseNextAction()) again = true;
      }else if(this._state === 'PROCESS'){
        const prev = this._state;
        this._handleProcess(now);
        if(this._state !== prev && this._state !== 'DOWN') again = true;
      }else if(this._state === 'WAIT'){
        const prev = this._state;
        this._handleWait();
        if(this._state !== prev && this._state !== 'DOWN') again = true;
      }else if(this._state === 'DOWN'){
        this._handleDown(now);
      }else{
        this._setIdle();
      }
      if(this._state === 'DOWN') break;
    }

    if(this._state === 'WAIT' && this._action === 'pallet_out'){
      this._setPalletOutWaitIcon(true);
    }else{
      this._setPalletOutWaitIcon(false);
    }

    if(this._state !== 'IDLE' || this._pallet) this.setDirtyCanvas(true, true);
  }

  onPropertyChanged(name){
    if(name === 'processTime') this.properties.processTime = this._normalizeTime(this.properties.processTime, STATION_DEFAULTS.processTime);
    if(name === 'downTime') this.properties.downTime = this._normalizeTime(this.properties.downTime, STATION_DEFAULTS.downTime);
    if(name === 'palletWorkCapacity') this.properties.palletWorkCapacity = this._normalizePalletCapacity(this.properties.palletWorkCapacity);
  }

  onConfigure(){
    this.properties.processTime = this._normalizeTime(this.properties.processTime, STATION_DEFAULTS.processTime);
    this.properties.downTime = this._normalizeTime(this.properties.downTime, STATION_DEFAULTS.downTime);
    this.properties.palletWorkCapacity = this._normalizePalletCapacity(this.properties.palletWorkCapacity);
    if(this._pallet) this._pallet = this._normalizePallet(this._pallet);
  }

  onDrawForeground(ctx){
    const now = simNow();
    const rem = Math.max(0, (this._until || 0) - now);
    const palletId = this._pallet ? String(this._pallet.palletId || '(none)') : '(none)';
    const workCount = this._pallet && Array.isArray(this._pallet.works) ? this._pallet.works.length : 0;
    const cap = this._pallet ? this._normalizePalletCapacity(this._pallet.capacity) : this._normalizePalletCapacity(this.properties.palletWorkCapacity);
    const lines = [
      `State: ${this._state} (${this._stateName})`,
      `Pallet: ${palletId}`,
      `Work in pallet: ${workCount}/${cap}`,
      `Full: ${this._isFull() ? 'YES' : 'NO'}`,
      `Remain(s): ${(rem / 1000).toFixed(1)}`,
      `Proc(s): ${this.properties.processTime}  Down(s): ${this.properties.downTime}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

window.StationNode = StationNode;
