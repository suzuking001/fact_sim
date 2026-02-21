// Carrier Route node: infrastructure-focused transport segment.
// Holds only transport timing and route-key matching (no carrier pool/settings).

const CARRIER_ROUTE_DEFAULTS = {
  processTime: 3,
  downTime: 0.5,
  routeKey: ''
};

class CarrierRouteNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Carrier Route';
    this.resizable = true;
    this.size = [280, 150];

    this._workInIndex = this.inputs.length;  this.addInput('workIn', 'work');
    this._agvInIndex  = this.inputs.length;  this.addInput('carrierIn', 'AGV');
    this._workOutIndex= this.outputs.length; this.addOutput('workOut', 'work');
    this._agvOutIndex = this.outputs.length; this.addOutput('carrierOut', 'AGV');

    this.properties = {
      processTime: window.NODES_CONFIG?.carrierRoute?.processTimeSec ?? CARRIER_ROUTE_DEFAULTS.processTime,
      downTime: window.NODES_CONFIG?.carrierRoute?.downTimeSec ?? CARRIER_ROUTE_DEFAULTS.downTime,
      routeKey: window.NODES_CONFIG?.carrierRoute?.routeKey ?? CARRIER_ROUTE_DEFAULTS.routeKey,
      sigExtra: 0,
      sigEnabled: true
    };
    if(window.enableFlipIO) window.enableFlipIO(this);

    this._lastSig = [];
    this._currentAgv = null;
    this._departingAgv = null;
    this._departingAccepted = false;
    this._pendingUnload = [];
    this._workOffer = null;
    this._workOfferArmed = false;
    this._workOfferAccepted = false;
    this._agvWaitIconLinks = null;
    this._currentWork = null;
    this._payload = null;
    this._loadIndex = 0;
    this._unloadIndex = 0;
    this._until = 0;
    this._stateName = 'agvIn_idle';
    this._state = 'IDLE';
    this._lastWorkInRef = null;
    this._lastAgvInRef = null;

    this._setState('agvIn_idle','IDLE');
    this._syncSignalOutputs();
  }

  _hasWorkInLink(){ const port = this.inputs[this._workInIndex]; return !!(port && port.link!=null); }
  _hasWorkOutLink(){ const port = this.outputs[this._workOutIndex]; return !!(port && port.links && port.links.length); }
  _hasAgvOutLink(){ const port = this.outputs[this._agvOutIndex]; return !!(port && port.links && port.links.length); }

  _tokenizeSequence(raw){
    if(Array.isArray(raw)) return raw.map(v=>String(v ?? '').trim()).filter(Boolean);
    if(typeof raw !== 'string') return [];
    return raw
      .replace(/\r/g, '\n')
      .split(/(?:,|\n|->)+/)
      .map(v=>v.trim())
      .filter(Boolean);
  }

  _routeTokens(agv){
    const m = agv?.meta;
    if(!m || typeof m !== 'object') return [];
    if(Array.isArray(m.routeSequence)) return this._tokenizeSequence(m.routeSequence);
    if(typeof m.routeSequence === 'string') return this._tokenizeSequence(m.routeSequence);
    return [];
  }

  _currentRouteKeyCandidates(){
    const seen = new Set();
    const push = (raw)=>{
      const text = String(raw ?? '').trim();
      if(!text) return;
      seen.add(text);
      // Also accept title-like labels such as "Route R1" by indexing simple tokens.
      const tokens = text.split(/[\s,:;>\/\\|._-]+/).map((t)=>t.trim()).filter(Boolean);
      for(const t of tokens) seen.add(t);
    };
    push(this.properties?.routeKey ?? '');
    if(this.id !== undefined && this.id !== null) push(String(this.id));
    push(this.title ?? '');
    return Array.from(seen);
  }

  _agvMatchesRoute(agv){
    if(!agv || typeof agv !== 'object') return true;
    const seq = this._routeTokens(agv);
    if(!seq.length) return true;
    const norm = (v)=> String(v ?? '').trim().toLowerCase();
    if(!agv.meta || typeof agv.meta !== 'object') agv.meta = {};
    let cursor = Number(agv.meta.routeCursor);
    if(!isFinite(cursor) || cursor < 0) cursor = 0;
    const expected = seq[cursor % seq.length];
    if(!expected) return true;
    const expectedNorm = norm(expected);
    if(!expectedNorm) return true;
    return this._currentRouteKeyCandidates().some((c)=> norm(c) === expectedNorm);
  }

  _advanceAgvSequence(agv){
    if(!agv || typeof agv !== 'object') return;
    const seq = this._routeTokens(agv);
    if(!seq.length) return;
    if(!agv.meta || typeof agv.meta !== 'object') agv.meta = {};
    let cursor = Number(agv.meta.routeCursor);
    if(!isFinite(cursor) || cursor < 0) cursor = 0;
    const norm = (v)=> String(v ?? '').trim().toLowerCase();
    const expected = seq[cursor % seq.length];
    const expectedNorm = norm(expected);
    if(!expectedNorm) return;
    const matched = this._currentRouteKeyCandidates().some((c)=> norm(c) === expectedNorm);
    if(!matched) return;
    agv.meta.routeCursor = (cursor + 1) % seq.length;
  }

  _agvForDispatchProbe(agv){
    if(!agv || typeof agv !== 'object') return agv;
    const seq = this._routeTokens(agv);
    if(!seq.length) return agv;
    const norm = (v)=> String(v ?? '').trim().toLowerCase();
    const keys = this._currentRouteKeyCandidates().map(norm);
    if(!keys.length) return agv;
    const current = Number(agv.meta?.routeCursor);
    const cursor = (!isFinite(current) || current < 0) ? 0 : current;
    const expected = norm(seq[cursor % seq.length]);
    if(!expected || !keys.includes(expected)) return agv;

    // Probe downstream acceptance with the next sequence step without mutating the real carrier.
    const probeMeta = Object.assign({}, agv.meta, { routeCursor: (cursor + 1) % seq.length });
    return Object.assign({}, agv, { meta: probeMeta });
  }

  _normalizeAgv(agv){
    let a = agv;
    if(!(a instanceof AGV)){
      const id = String(a?.id ?? a ?? `Carrier-${this.id}`);
      const cap = Math.max(1, Math.round(Number(a?.capacity ?? a?.meta?.capacity ?? 1) || 1));
      a = new AGV(id, cap);
      if(agv && typeof agv === 'object'){
        if(Array.isArray(agv.cargo)) a.cargo = agv.cargo;
        if(agv.meta && typeof agv.meta === 'object') a.meta = agv.meta;
      }
    }
    if(!Array.isArray(a.cargo)) a.cargo = [];
    if(!a.meta || typeof a.meta !== 'object') a.meta = {};
    const cap = Math.max(1, Math.round(Number(a.capacity || a.meta.capacity || 1) || 1));
    a.capacity = cap;
    a.meta.capacity = cap;
    let cursor = Number(a.meta.routeCursor);
    if(!isFinite(cursor) || cursor < 0) cursor = 0;
    a.meta.routeCursor = cursor;
    return a;
  }

  _adoptIncomingAgv(agv, withInputAnim){
    const a = this._normalizeAgv(agv);
    if(!this.canAcceptAgv(a)) return false;
    this._currentAgv = a;
    this._departingAgv = null;
    this._departingAccepted = false;
    this._loadIndex = Array.isArray(a.cargo) ? a.cargo.length : 0;
    this._unloadIndex = 0;
    this._pendingUnload = [];
    this._workOffer = null;
    this._setState('agv_process','PROCESS');
    const now = simNow();
    this._until = now + Math.max(0,(this.properties.processTime||0)*1000);
    if(withInputAnim) this._triggerAnim(this._agvInIndex, 'agv', this._until - now, { id:a.id, t:'AGV' });
    if(this._until === now) this._handleAgvProcess(now);
    return true;
  }

  canAcceptAgv(agv){
    if(this._currentAgv || this._departingAgv) return false;
    return this._agvMatchesRoute(agv);
  }

  canAcceptWorkInput(slotIndex){
    if(slotIndex !== this._workInIndex) return false;
    if(!this._currentAgv) return false;
    if(!this._stateName || !this._stateName.startsWith('workIn_idle')) return false;
    const cap = this._currentAgv.capacity || 0;
    const load = Array.isArray(this._currentAgv.cargo) ? this._currentAgv.cargo.length : 0;
    if(cap <= 0 || load >= cap) return false;
    return true;
  }

  _setState(name, kind){
    this._stateName = name;
    switch(kind){
      case 'PROCESS': this.color='#2ecc71'; this.bgcolor='#e8f8f2'; this._state='PROCESS'; break;
      case 'WAIT':    this.color='#f39c12'; this.bgcolor='#fff6e6'; this._state='WAIT'; break;
      case 'DOWN':    this.color='#3498db'; this.bgcolor='#e8f1fb'; this._state='DOWN'; break;
      case 'IDLE':    this.color='#f1c40f'; this.bgcolor='#fff9db'; this._state='IDLE'; break;
      default:        this.color='#bdc3c7'; this.bgcolor='#f7f7f7'; this._state='IDLE';
    }
    this.setDirtyCanvas(true,true);
  }

  _emit(i,state){
    const base = 2;
    const idx = base + i;
    if(!this.properties.sigEnabled) { if(this.outputs[idx]) this.setOutputData(idx, null); return; }
    if(!this.outputs || idx >= this.outputs.length) return;
    if(this._lastSig[i] !== state){ this.setOutputData(idx, state); this._lastSig[i] = state; }
    else this.setOutputData(idx, null);
  }

  _syncSignalOutputs(){
    const extra = Math.max(0, this.properties.sigExtra || 0);
    const needed = 2 + extra;
    this.outputs = this.outputs || [];
    while(this.outputs.length < needed){
      const idx = this.outputs.length - 2;
      this.addOutput(`sigOut${idx}`, 0);
    }
  }

  _captureAgvInput(){
    const port = this.inputs[this._agvInIndex];
    if(!port || port.link == null) return;
    const agv = this.getInputData(this._agvInIndex);
    if(!agv){ this._lastAgvInRef = null; return; }
    if(this._lastAgvInRef === agv) return;
    if(this._adoptIncomingAgv(agv, true)) this._lastAgvInRef = agv;
  }

  _triggerAnim(slot, type, duration, info){
    if(!duration || duration<=0 || !window.WorkLinkAnimator || !this.graph) return;
    const port = this.inputs && this.inputs[slot];
    if(!port || port.link==null) return;
    try{ window.WorkLinkAnimator.spawn(this.graph, port.link, type, duration, info); }catch(_e){}
  }

  _setAgvOutWaitIcon(active){
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      const out = this.outputs && this.outputs[this._agvOutIndex];
      if(!out || !out.links) return;
      if(active){
        if(this._agvWaitIconLinks) return;
        this._agvWaitIconLinks = out.links.slice();
        const info = this._currentAgv ? { id: this._currentAgv.id } : null;
        this._agvWaitIconLinks.forEach(id=> window.WorkLinkAnimator.showPortIcon(this.graph, id, 'agv', info));
      }else{
        if(!this._agvWaitIconLinks) return;
        this._agvWaitIconLinks.forEach(id=> window.WorkLinkAnimator.hidePortIcon(this.graph, id));
        this._agvWaitIconLinks = null;
      }
    }catch(_e){}
  }

  _refreshAgvWaitIcon(){
    const shouldShow =
      !!this._currentAgv &&
      !this._departingAgv &&
      (this._stateName.startsWith('workIn_idle') ||
       this._stateName.startsWith('workIn_process') ||
       this._stateName.startsWith('workOut_wait') ||
       this._stateName.startsWith('workOut_down') ||
       this._stateName === 'agvOut_wait');
    this._setAgvOutWaitIcon(shouldShow);
  }

  _enterWorkInIdle(){
    if(!this._currentAgv){
      this._enterAgvOutWait();
      return;
    }
    const cap = this._currentAgv.capacity || 1;
    if(!this._hasWorkInLink() || this._loadIndex >= cap){
      this._beginUnloadPhase();
      return;
    }
    const ord = this._loadIndex + 1;
    this._setState(`workIn_idle_${ord}`,'IDLE');
  }

  _startWorkInProcess(){
    const ord = this._loadIndex;
    this._setState(`workIn_process_${ord}`,'PROCESS');
    const now = simNow();
    const duration = Math.max(0,(this.properties.processTime||0)*1000);
    this._until = now + duration;
    const w = this._currentAgv && this._currentAgv.cargo[this._currentAgv.cargo.length-1];
    if(w) this._triggerAnim(this._workInIndex,'work',duration,{id:w.id, t:w.type});
    if(duration===0) this._handleWorkInProcess(now);
  }

  _handleWorkInProcess(now){
    if(now < this._until) return;
    const cap = this._currentAgv ? this._currentAgv.capacity : 0;
    this._currentWork = null;
    this._payload = null;
    if(this._hasWorkInLink() && this._currentAgv && this._loadIndex < cap){
      this._enterWorkInIdle();
    }else{
      this._beginUnloadPhase();
    }
  }

  _beginUnloadPhase(){
    if(!this._currentAgv){
      this._enterAgvOutWait();
      return;
    }
    this._pendingUnload = Array.isArray(this._currentAgv.cargo) ? this._currentAgv.cargo.slice() : [];
    this._unloadIndex = 0;
    this._workOffer = null;
    this._workOfferArmed = false;
    this._until = simNow();
    if(!this._pendingUnload.length || !this._hasWorkOutLink()){
      this._pendingUnload.length = 0;
      this._enterAgvOutWait();
      return;
    }
    this._setState('workOut_wait_1','WAIT');
  }

  _startWorkOutDown(){
    if(!this._pendingUnload.length){
      this._enterAgvOutWait();
      return;
    }
    const ord = this._unloadIndex + 1;
    this._setState(`workOut_down_${ord}`,'DOWN');
    this._workOffer = this._pendingUnload[0];
    this._workOfferArmed = true;
    this._workOfferAccepted = false;
    const now = simNow();
    this._until = now + Math.max(0,(this.properties.downTime||0)*1000);
    this._emitWorkOffer();
  }

  _emitWorkOffer(){
    try{ this.setOutputData(this._workOutIndex, this._workOffer); }catch(_e){}
  }

  _completeWorkOutOffer(){
    if(!this._workOffer) return;
    this._pendingUnload.shift();
    if(this._currentAgv && Array.isArray(this._currentAgv.cargo)) this._currentAgv.cargo.shift();
    this._workOffer = null;
    this._workOfferArmed = false;
    this._workOfferAccepted = false;
    this._unloadIndex++;
    try{ this.setOutputData(this._workOutIndex, null); }catch(_e){}
    if(this._pendingUnload.length){
      const nextOrd = this._unloadIndex + 1;
      this._setState(`workOut_wait_${nextOrd}`,'WAIT');
    }else{
      this._enterAgvOutWait();
    }
  }

  _enterAgvOutWait(){
    this._pendingUnload.length = 0;
    this._workOffer = null;
    this._workOfferArmed = false;
    try{ this.setOutputData(this._workOutIndex, null); }catch(_e){}
    this._setAgvOutWaitIcon(false);
    if(!this._currentAgv){
      this._setState('agvIn_idle','IDLE');
      return;
    }
    if(!this._hasAgvOutLink()){
      this._setState('agvOut_wait','WAIT');
      this._setAgvOutWaitIcon(false);
      return;
    }
    this._setState('agvOut_wait','WAIT');
    this._setAgvOutWaitIcon(true);
  }

  _startAgvOutDown(){
    if(!this._currentAgv){
      this._resetToIdle();
      return;
    }
    this._setAgvOutWaitIcon(false);
    this._setState('agvOut_down','DOWN');
    const now = simNow();
    this._until = now + Math.max(0,(this.properties.downTime||0)*1000);
    this._advanceAgvSequence(this._currentAgv);
    this._departingAgv = this._currentAgv;
    this._departingAccepted = false;
    this._currentAgv = null;
    this._offerDepartingAgv();
  }

  _downstreamWorkReady(){
    const out = this.outputs[this._workOutIndex];
    if(!out || !out.links) return false;
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t.canAcceptWorkInput === 'function'){
        if(!t.canAcceptWorkInput(link.target_slot, this._workOffer)) return false;
        continue;
      }
      if(typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
    }
    return true;
  }

  _workAccepted(){
    if(!this._workOffer) return false;
    const out = this.outputs[this._workOutIndex];
    if(!out || !out.links) return false;
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t._state === 'undefined') return true;
      if(t._currentWork === this._workOffer || t._payload === this._workOffer) return true;
      if(Array.isArray(t._workQueue) && t._workQueue.includes(this._workOffer)) return true;
    }
    return false;
  }

  _downstreamAgvReady(agv){
    const out = this.outputs[this._agvOutIndex];
    if(!out || !out.links) return false;
    const probeAgv = this._agvForDispatchProbe(agv);
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
      if(typeof t.canAcceptAgv === 'function' && !t.canAcceptAgv(probeAgv)) return false;
    }
    return true;
  }

  _offerDepartingAgv(){
    if(!this._departingAgv) return;
    const out = this.outputs[this._agvOutIndex];
    if(!out || !out.links) return;
    try{ this.setOutputData(this._agvOutIndex, this._departingAgv); }catch(_e){}
  }

  _agvAccepted(agv){
    const out = this.outputs[this._agvOutIndex];
    if(!out || !out.links) return false;
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(t._currentAgv === agv) return true;
      if(Array.isArray(t._queue) && t._queue.includes(agv)) return true;
      if(t._offerAgv === agv) return true;
    }
    return false;
  }

  _resetToIdle(){
    this._departingAgv = null;
    this._departingAccepted = false;
    this._currentAgv = null;
    this._pendingUnload.length = 0;
    this._workOffer = null;
    this._workOfferArmed = false;
    this._setAgvOutWaitIcon(false);
    this._currentWork = null;
    this._payload = null;
    this._loadIndex = 0;
    this._unloadIndex = 0;
    this._setState('agvIn_idle','IDLE');
  }

  _captureWorkInput(){
    if(!this._currentAgv) return;
    if(!this._stateName.startsWith('workIn_idle')){ this._lastWorkInRef = null; return; }
    if(!this._hasWorkInLink()){
      this._beginUnloadPhase();
      return;
    }
    const w = this.getInputData(this._workInIndex);
    if(!w){ this._lastWorkInRef = null; return; }
    if(this._lastWorkInRef === w) return;
    this._lastWorkInRef = w;
    if(this._currentAgv.cargo.length < this._currentAgv.capacity){
      this._currentWork = w;
      this._payload = w;
      this._currentAgv.cargo.push(w);
      this._loadIndex = this._currentAgv.cargo.length;
      this._startWorkInProcess();
    }
  }

  _handleAgvProcess(now){
    if(now < this._until) return;
    this._enterWorkInIdle();
  }

  _handleWorkOutWait(){
    if(this._pendingUnload.length && this._unloadIndex === 0 && !this._workOffer && this._stateName !== 'workOut_wait_1'){
      this._setState('workOut_wait_1','WAIT');
    }
    if(!this._pendingUnload.length){
      this._enterAgvOutWait();
      return;
    }
    if(this._downstreamWorkReady()) this._startWorkOutDown();
  }

  _handleWorkOutDown(now){
    if(!this._workOffer){
      if(this._pendingUnload.length) this._setState(`workOut_wait_${this._unloadIndex+1}`,'WAIT');
      else this._enterAgvOutWait();
      return;
    }
    if(!this._workOfferAccepted){
      if(this._workOfferArmed) this._emitWorkOffer();
      if(this._workAccepted()){
        this._workOfferAccepted = true;
        try{ this.setOutputData(this._workOutIndex, null); }catch(_e){}
      }
    }
    if(this._workOfferAccepted && now >= this._until) this._completeWorkOutOffer();
  }

  _handleAgvOutWait(){
    if(!this._currentAgv){
      this._setState('agvIn_idle','IDLE');
      return;
    }
    if(this._downstreamAgvReady(this._currentAgv)) this._startAgvOutDown();
  }

  _handleAgvOutDown(now){
    if(!this._departingAgv){
      if(this._stateName !== 'agvIn_idle') this._setState('agvIn_idle','IDLE');
      return;
    }
    if(!this._departingAccepted){
      if(this._downstreamAgvReady(this._departingAgv)) this._offerDepartingAgv();
      if(this._agvAccepted(this._departingAgv)){
        this._departingAccepted = true;
        try{ this.setOutputData(this._agvOutIndex, null); }catch(_e){}
      }
    }
    if(this._departingAccepted){
      if(now >= this._until){
        this._departingAgv = null;
        this._setState('agvIn_idle','IDLE');
      }
    }else if(now >= this._until){
      this._until = now + Math.max(0,(this.properties.downTime||0)*1000);
    }
  }

  onExecute(){
    const now = simNow();
    this._captureAgvInput();
    this._captureWorkInput();

    if(this._stateName === 'agv_process') this._handleAgvProcess(now);
    else if(this._stateName.startsWith('workIn_process')) this._handleWorkInProcess(now);
    else if(this._stateName.startsWith('workOut_wait')) this._handleWorkOutWait();
    else if(this._stateName.startsWith('workOut_down')) this._handleWorkOutDown(now);
    else if(this._stateName === 'agvOut_wait') this._handleAgvOutWait();
    else if(this._stateName === 'agvOut_down') this._handleAgvOutDown(now);

    let settle = 0;
    while(settle++ < 4){
      const prev = this._stateName;
      if(this._stateName.startsWith('workIn_idle')) this._captureWorkInput();
      if(this._stateName.startsWith('workOut_wait')) this._handleWorkOutWait();
      else if(this._stateName === 'agvOut_wait') this._handleAgvOutWait();
      if(this._stateName === prev) break;
      if(this._stateName.startsWith('workOut_down') || this._stateName === 'agvOut_down') break;
    }

    this._refreshAgvWaitIcon();

    const sigCount = this.properties.sigExtra || 0;
    for(let i=0;i<sigCount;i++) this._emit(i, this._state);

    if(this._state !== 'IDLE' || this._currentAgv) this.setDirtyCanvas(true,true);
  }

  onPropertyChanged(name){
    const clamp = v=> Math.max(0, Math.round(parseFloat(v||0)*10)/10);
    if(name === 'routeKey') this.properties.routeKey = String(this.properties.routeKey ?? '').trim();
    if(name === 'sigExtra') this._syncSignalOutputs();
    if(name === 'processTime') this.properties.processTime = clamp(this.properties.processTime);
    if(name === 'downTime') this.properties.downTime = clamp(this.properties.downTime);
  }
}

window.CarrierRouteNode = CarrierRouteNode;
