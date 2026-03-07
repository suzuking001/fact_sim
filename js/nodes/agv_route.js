// AGV Route node (generalised max_load = n)
// Follows work_node_memo spec: agv_process -> workIn_idle_k/process_k (repeat) -> workOut_wait_k/down_k (repeat) -> agvOut_wait/down -> agvIn_idle

const AGV_ROUTE_DEFAULTS = {
  processTime: 3,
  downTime: 0.5,
  agvCapacity: 2,
  agvIds: 'AGV-1,AGV-2'
};

class AGVRouteNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'AGV Route';
    this.resizable = true;
    this.size = [280, 150];
    // ports: workIn, agvIn -> workOut, agvOut
    this._workInIndex = this.inputs.length;  this.addInput('workIn', 'work');
    this._agvInIndex  = this.inputs.length;  this.addInput('agvIn', 'AGV');
    this._workOutIndex= this.outputs.length; this.addOutput('workOut', 'work');
    this._agvOutIndex = this.outputs.length; this.addOutput('agvOut', 'AGV');

    this.properties = {
      processTime: window.NODES_CONFIG?.agvRoute?.processTimeSec ?? AGV_ROUTE_DEFAULTS.processTime,
      downTime: window.NODES_CONFIG?.agvRoute?.downTimeSec ?? AGV_ROUTE_DEFAULTS.downTime,
      agvCapacity: window.NODES_CONFIG?.agvRoute?.agvCapacity ?? AGV_ROUTE_DEFAULTS.agvCapacity,
      agvIds: AGV_ROUTE_DEFAULTS.agvIds,
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
    this._agvSpawnQueue = [];
    this._rebuildAgvPool();
    this._setState('agvIn_idle','IDLE');
    this._syncSignalOutputs();
  }

  _rebuildAgvPool(){
    const ids = (this.properties.agvIds || '').split(/[,\n]+/).map(t=>t.trim()).filter(Boolean);
    this._agvSpawnQueue = ids.map(id=> new AGV(id, this.properties.agvCapacity || 1));
  }

  _hasWorkInLink(){ const port = this.inputs[this._workInIndex]; return !!(port && port.link!=null); }
  _hasWorkOutLink(){ const port = this.outputs[this._workOutIndex]; return !!(port && port.links && port.links.length); }
  _hasAgvOutLink(){ const port = this.outputs[this._agvOutIndex]; return !!(port && port.links && port.links.length); }

  canAcceptAgv(){ return !this._currentAgv && !this._departingAgv; }
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
    if(typeof window.applyNodeStateTheme === 'function') window.applyNodeStateTheme(this, this._state);
    this.setDirtyCanvas(true,true);
  }

  _emit(i,state){
    // signal outputs start after workOut/agvOut
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
    while(this.outputs.length > needed){
      const idx = this.outputs.length - 1;
      if(idx < 2) break;
      const out = this.outputs[idx];
      if(out && out.links){
        [...out.links].forEach((id)=>{
          try{ this.graph && this.graph.removeLink(id); }catch(_e){}
        });
      }
      this.removeOutput(idx);
    }
    while(this.outputs.length < needed){
      const idx = this.outputs.length - 2;
      this.addOutput(`sigOut${idx}`, 0);
    }
    for(let i = 0; i < extra; i++){
      const out = this.outputs[2 + i];
      if(out) out.name = `sigOut${i}`;
    }
    if(Array.isArray(this._lastSig)){
      if(this._lastSig.length > extra) this._lastSig.length = extra;
      while(this._lastSig.length < extra) this._lastSig.push(null);
    }else{
      this._lastSig = Array(extra).fill(null);
    }
  }

  _captureAgvInput(){
    const port = this.inputs[this._agvInIndex];
    if(!port || port.link == null) return;
    const agv = this.getInputData(this._agvInIndex);
    if(!agv){ this._lastAgvInRef = null; return; }
    if(this._lastAgvInRef === agv) return;
    if(this.canAcceptAgv(agv)){
      const a = agv instanceof AGV ? agv : new AGV(String(agv.id ?? agv), this.properties.agvCapacity);
      if(!Array.isArray(a.cargo)) a.cargo = [];
      a.capacity = Math.max(1, a.capacity || this.properties.agvCapacity || 1);
      this._currentAgv = a;
      this._departingAgv = null;
      this._departingAccepted = false;
      this._loadIndex = Array.isArray(a.cargo) ? a.cargo.length : 0;
      this._unloadIndex = 0;
      this._pendingUnload = [];
      this._workOffer = null;
      this._lastAgvInRef = agv;
      this._setState('agv_process','PROCESS');
      const now = simNow();
      this._until = now + Math.max(0,(this.properties.processTime||0)*1000);
      this._triggerAnim(this._agvInIndex, 'agv', this._until - now, { id:a.id, t:'AGV' });
      if(this._until === now) this._handleAgvProcess(now);
    }
  }

  _maybeSpawnAgv(){
    if(this._currentAgv || this._departingAgv) return;
    if(!this._agvSpawnQueue.length) return;
    const agv = this._agvSpawnQueue.shift();
    this._lastAgvInRef = null;
    this._captureAgvInputHelper(agv);
  }

  _captureAgvInputHelper(agv){
    if(!agv) return;
    if(!(agv instanceof AGV)) agv = new AGV(String(agv.id ?? agv), this.properties.agvCapacity);
    if(!Array.isArray(agv.cargo)) agv.cargo = [];
    agv.capacity = Math.max(1, agv.capacity || this.properties.agvCapacity || 1);
    this._currentAgv = agv;
    this._departingAgv = null;
    this._departingAccepted = false;
    this._loadIndex = Array.isArray(agv.cargo) ? agv.cargo.length : 0;
    this._unloadIndex = 0;
    this._pendingUnload = [];
    this._workOffer = null;
    this._setState('agv_process','PROCESS');
    const now = simNow();
    this._until = now + Math.max(0,(this.properties.processTime||0)*1000);
    this._triggerAnim(this._agvInIndex, 'agv', this._until-now, { id: agv.id, t:'AGV' });
    if(this._until === now) this._handleAgvProcess(now);
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
    if(this._currentAgv && Array.isArray(this._currentAgv.cargo)){
      this._currentAgv.cargo.shift();
    }
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
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
      if(typeof t.canAcceptAgv === 'function' && !t.canAcceptAgv(agv)) return false;
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
      if(t._pendingAgv === agv) return true;
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
    // Keep last input reference while busy so a held upstream output is not re-accepted.
    if(!this._stateName.startsWith('workIn_idle')) return;
    if(!this._hasWorkInLink()){
      this._beginUnloadPhase();
      return;
    }
    const w = this.getInputData(this._workInIndex);
    if(!w){ this._lastWorkInRef = null; return; }
    if(this._lastWorkInRef === w) return;
    if(this._currentAgv.cargo.length >= this._currentAgv.capacity) return;
    this._lastWorkInRef = w;
    this._currentWork = w;
    this._payload = w;
    this._currentAgv.cargo.push(w);
    this._loadIndex = this._currentAgv.cargo.length;
    this._startWorkInProcess();
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
    if(this._downstreamWorkReady()){
      this._startWorkOutDown();
    }
  }

  _handleWorkOutDown(now){
    if(!this._workOffer){
      if(this._pendingUnload.length){
        this._setState(`workOut_wait_${this._unloadIndex+1}`,'WAIT');
      }else{
        this._enterAgvOutWait();
      }
      return;
    }
    if(!this._workOfferAccepted){
      if(this._workOfferArmed) this._emitWorkOffer();
      if(this._workAccepted()){
        this._workOfferAccepted = true;
        try{ this.setOutputData(this._workOutIndex, null); }catch(_e){}
      }else if(now >= this._until){
        // Event engine safety: keep scheduling while waiting for downstream accept.
        this._until = now + Math.max(0, (this.properties.downTime || 0) * 1000);
      }
    }
    if(this._workOfferAccepted && now >= this._until){
      this._completeWorkOutOffer();
    }
  }

  _handleAgvOutWait(){
    if(!this._currentAgv){
      this._setState('agvIn_idle','IDLE');
      return;
    }
    if(this._downstreamAgvReady(this._currentAgv)){
      this._startAgvOutDown();
    }
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
    this._maybeSpawnAgv();

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

  onConfigure(){
    this._syncSignalOutputs();
  }

  onPropertyChanged(name){
    const clamp = v=> Math.max(0, Math.round(parseFloat(v||0)*10)/10);
    if(name === 'agvIds') this._rebuildAgvPool();
    if(name === 'agvCapacity'){
      const n = Math.max(1, Math.round(parseFloat(this.properties.agvCapacity)||1));
      this.properties.agvCapacity = n;
      if(this._currentAgv) this._currentAgv.capacity = n;
    }
    if(name === 'sigExtra') this._syncSignalOutputs();
    if(name === 'processTime') this.properties.processTime = clamp(this.properties.processTime);
    if(name === 'downTime') this.properties.downTime = clamp(this.properties.downTime);
  }
}

window.AGVRouteNode = AGVRouteNode;
