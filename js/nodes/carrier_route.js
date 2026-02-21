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

    this._agvInIndex  = this.inputs.length;  this.addInput('carrierIn', 'AGV');
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
    this._lastWorkInRefBySlot = Object.create(null);
    this._lastAgvInRefBySlot = Object.create(null);
    this._currentCarrierLane = 0;
    this._departingCarrierLane = 0;

    this._setState('agvIn_idle','IDLE');
    this._ensureMinCarrierPorts(1);
    this._syncSignalOutputs();
  }

  _isWorkInputPort(p){
    const n = String(p?.name || '');
    return n === 'workIn' || /^workIn\d+$/.test(n);
  }
  _isWorkOutputPort(p){
    const n = String(p?.name || '');
    return n === 'workOut' || /^workOut\d+$/.test(n);
  }
  _workInputSlots(){
    const slots = [];
    if(!this.inputs) return slots;
    for(let i = 0; i < this.inputs.length; i++){
      if(this._isWorkInputPort(this.inputs[i])) slots.push(i);
    }
    return slots;
  }
  _workOutputSlots(){
    const slots = [];
    if(!this.outputs) return slots;
    for(let i = 0; i < this.outputs.length; i++){
      if(this._isWorkOutputPort(this.outputs[i])) slots.push(i);
    }
    return slots;
  }
  _isCarrierInputPort(p){
    const n = String(p?.name || '');
    return n === 'carrierIn' || /^carrierIn\d+$/.test(n);
  }
  _isCarrierOutputPort(p){
    const n = String(p?.name || '');
    return n === 'carrierOut' || /^carrierOut\d+$/.test(n);
  }
  _carrierInputSlots(){
    const slots = [];
    if(!this.inputs) return slots;
    for(let i = 0; i < this.inputs.length; i++){
      if(this._isCarrierInputPort(this.inputs[i])) slots.push(i);
    }
    return slots;
  }
  _carrierOutputSlots(){
    const slots = [];
    if(!this.outputs) return slots;
    for(let i = 0; i < this.outputs.length; i++){
      if(this._isCarrierOutputPort(this.outputs[i])) slots.push(i);
    }
    return slots;
  }
  _normalizeCarrierPortNames(){
    const wIns = this._workInputSlots();
    const wOuts = this._workOutputSlots();
    const ins = this._carrierInputSlots();
    const outs = this._carrierOutputSlots();
    for(let i = 0; i < wIns.length; i++){
      const p = this.inputs[wIns[i]];
      if(p) p.name = `workIn${i + 1}`;
    }
    for(let i = 0; i < wOuts.length; i++){
      const p = this.outputs[wOuts[i]];
      if(p) p.name = `workOut${i + 1}`;
    }
    for(let i = 0; i < ins.length; i++){
      const p = this.inputs[ins[i]];
      if(p) p.name = ins.length === 1 ? 'carrierIn' : `carrierIn${i + 1}`;
    }
    for(let i = 0; i < outs.length; i++){
      const p = this.outputs[outs[i]];
      if(p) p.name = outs.length === 1 ? 'carrierOut' : `carrierOut${i + 1}`;
    }
  }
  _ensureMinCarrierPorts(minCount = 1){
    let ins = this._carrierInputSlots();
    while(ins.length < minCount){
      this.addInput('carrierIn', 'AGV');
      ins = this._carrierInputSlots();
    }
    let outs = this._carrierOutputSlots();
    while(outs.length < minCount){
      this.addOutput('carrierOut', 'AGV');
      outs = this._carrierOutputSlots();
    }
    // Keep IN/OUT as one-to-one lane pairs.
    while(ins.length < outs.length){
      this.addInput('carrierIn', 'AGV');
      ins = this._carrierInputSlots();
    }
    while(outs.length < ins.length){
      this.addOutput('carrierOut', 'AGV');
      outs = this._carrierOutputSlots();
    }
    this._normalizeCarrierPortNames();
    const laneMax = Math.max(0, this._carrierOutputSlots().length - 1);
    this._currentCarrierLane = Math.max(0, Math.min(laneMax, Number(this._currentCarrierLane) || 0));
    this._departingCarrierLane = Math.max(0, Math.min(laneMax, Number(this._departingCarrierLane) || 0));
  }
  _carrierInputOrdinal(slotIndex){
    const slots = this._carrierInputSlots();
    return slots.indexOf(slotIndex);
  }
  _carrierOutSlotForLane(lane){
    const outs = this._carrierOutputSlots();
    if(!outs.length) return -1;
    const n = Number(lane);
    if(!isFinite(n) || n < 0) return outs[0];
    const idx = Math.max(0, Math.min(outs.length - 1, Math.floor(n)));
    return outs[idx];
  }
  _activeCarrierOutSlot(){
    const lane = this._departingAgv ? this._departingCarrierLane : this._currentCarrierLane;
    return this._carrierOutSlotForLane(lane);
  }
  _hasAgvOutLinkForLane(lane){
    const slot = this._carrierOutSlotForLane(lane);
    if(slot < 0) return false;
    const port = this.outputs[slot];
    return !!(port && port.links && port.links.length);
  }
  _clearCarrierOutputs(){
    const outs = this._carrierOutputSlots();
    for(const slot of outs){
      try{ this.setOutputData(slot, null); }catch(_e){}
    }
  }
  _workInSlotForLane(lane){
    const slots = this._workInputSlots();
    if(!slots.length) return -1;
    const n = Number(lane);
    if(!isFinite(n) || n < 0 || n >= slots.length) return -1;
    return slots[Math.floor(n)];
  }
  _workOutSlotForLane(lane){
    const slots = this._workOutputSlots();
    if(!slots.length) return -1;
    const n = Number(lane);
    if(!isFinite(n) || n < 0 || n >= slots.length) return -1;
    return slots[Math.floor(n)];
  }
  _hasWorkInLinkForLane(lane){
    const slot = this._workInSlotForLane(lane);
    if(slot < 0) return false;
    const p = this.inputs[slot];
    return !!(p && p.link != null);
  }
  _hasWorkOutLinkForLane(lane){
    const slot = this._workOutSlotForLane(lane);
    if(slot < 0) return false;
    const p = this.outputs[slot];
    return !!(p && p.links && p.links.length);
  }
  _clearWorkOutputs(){
    for(const slot of this._workOutputSlots()){
      try{ this.setOutputData(slot, null); }catch(_e){}
    }
  }
  _ensureWorkLanePairs(minCount = 0){
    let ins = this._workInputSlots();
    while(ins.length < minCount){
      this.addInput('workIn', 'work');
      ins = this._workInputSlots();
    }
    let outs = this._workOutputSlots();
    while(outs.length < minCount){
      this.addOutput('workOut', 'work');
      outs = this._workOutputSlots();
    }
    while(ins.length < outs.length){
      this.addInput('workIn', 'work');
      ins = this._workInputSlots();
    }
    while(outs.length < ins.length){
      this.addOutput('workOut', 'work');
      outs = this._workOutputSlots();
    }
    this._normalizeCarrierPortNames();
  }
  _workLaneCount(){
    return Math.min(this._workInputSlots().length, this._workOutputSlots().length);
  }
  _addWorkLane(){
    this.addInput('workIn', 'work');
    this.addOutput('workOut', 'work');
    this._ensureWorkLanePairs(0);
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true, true);
  }
  _removeWorkLane(){
    const count = this._workLaneCount();
    if(count <= 0) return;
    const inSlots = this._workInputSlots();
    const outSlots = this._workOutputSlots();
    const inIdx = inSlots[inSlots.length - 1];
    const outIdx = outSlots[outSlots.length - 1];
    if(inIdx >= 0){
      const p = this.inputs && this.inputs[inIdx];
      if(p && p.link != null){
        try{ this.graph && this.graph.removeLink(p.link); }catch(_e){}
      }
      this.removeInput(inIdx);
    }
    if(outIdx >= 0){
      const p = this.outputs && this.outputs[outIdx];
      if(p && p.links){
        [...p.links].forEach((id)=>{
          try{ this.graph && this.graph.removeLink(id); }catch(_e){}
        });
      }
      this.removeOutput(outIdx);
    }
    this._lastWorkInRefBySlot = Object.create(null);
    this._ensureWorkLanePairs(0);
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true, true);
  }
  _addCarrierIn(){
    this.addInput('carrierIn', 'AGV');
    this._normalizeCarrierPortNames();
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true, true);
  }
  _removeCarrierIn(){
    const ins = this._carrierInputSlots();
    if(ins.length <= 1) return;
    const idx = ins[ins.length - 1];
    const port = this.inputs && this.inputs[idx];
    if(port && port.link != null){
      try{ this.graph && this.graph.removeLink(port.link); }catch(_e){}
    }
    this.removeInput(idx);
    this._normalizeCarrierPortNames();
    this._lastAgvInRefBySlot = Object.create(null);
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true, true);
  }
  _addCarrierOut(){
    this.addOutput('carrierOut', 'AGV');
    this._normalizeCarrierPortNames();
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true, true);
  }
  _removeCarrierOut(){
    const outs = this._carrierOutputSlots();
    if(outs.length <= 1) return;
    const idx = outs[outs.length - 1];
    const port = this.outputs && this.outputs[idx];
    if(port && port.links){
      [...port.links].forEach((id)=>{
        try{ this.graph && this.graph.removeLink(id); }catch(_e){}
      });
    }
    this.removeOutput(idx);
    this._normalizeCarrierPortNames();
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true, true);
  }
  _carrierLaneCount(){
    return Math.min(this._carrierInputSlots().length, this._carrierOutputSlots().length);
  }
  _addCarrierLane(){
    this._addCarrierIn();
    this._addCarrierOut();
    this._ensureMinCarrierPorts(1);
    this.setDirtyCanvas(true, true);
  }
  _removeCarrierLane(){
    if(this._carrierLaneCount() <= 1) return;
    this._removeCarrierIn();
    this._removeCarrierOut();
    this._ensureMinCarrierPorts(1);
    this.setDirtyCanvas(true, true);
  }

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

  _adoptIncomingAgv(agv, withInputAnim, lane = 0, inputSlot = this._carrierOutSlotForLane(0)){
    const a = this._normalizeAgv(agv);
    if(!this.canAcceptAgv(inputSlot, a)) return false;
    this._currentAgv = a;
    this._departingAgv = null;
    this._departingAccepted = false;
    this._currentCarrierLane = Math.max(0, Number(lane) || 0);
    if(!a.meta || typeof a.meta !== 'object') a.meta = {};
    a.meta.carrierLane = this._currentCarrierLane;
    this._loadIndex = Array.isArray(a.cargo) ? a.cargo.length : 0;
    this._unloadIndex = 0;
    this._pendingUnload = [];
    this._workOffer = null;
    this._setState('agv_process','PROCESS');
    const now = simNow();
    this._until = now + Math.max(0,(this.properties.processTime||0)*1000);
    if(withInputAnim) this._triggerAnim(inputSlot, 'agv', this._until - now, { id:a.id, t:'AGV' });
    if(this._until === now) this._handleAgvProcess(now);
    return true;
  }

  canAcceptAgv(slotIndex, agv){
    let slot = slotIndex;
    let incoming = agv;
    if(typeof slotIndex !== 'number'){
      slot = null;
      incoming = slotIndex;
    }
    if(slot != null && this._carrierInputOrdinal(slot) < 0) return false;
    if(this._currentAgv || this._departingAgv) return false;
    return this._agvMatchesRoute(incoming);
  }

  canAcceptWorkInput(slotIndex){
    const activeIn = this._workInSlotForLane(this._currentCarrierLane);
    if(activeIn < 0 || slotIndex !== activeIn) return false;
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

  _sigOutputSlots(){
    const slots = [];
    if(!this.outputs) return slots;
    for(let i = 0; i < this.outputs.length; i++){
      const n = String(this.outputs[i]?.name || '');
      if(/^sigOut\d+$/.test(n)) slots.push(i);
    }
    return slots;
  }

  _emit(i,state){
    const slot = this.outputs?.findIndex((p)=> p && p.name === `sigOut${i}`) ?? -1;
    if(slot < 0) return;
    if(!this.properties.sigEnabled){
      this.setOutputData(slot, null);
      return;
    }
    if(this._lastSig[i] !== state){ this.setOutputData(slot, state); this._lastSig[i] = state; }
    else this.setOutputData(slot, null);
  }

  _syncSignalOutputs(){
    const extra = Math.max(0, this.properties.sigExtra || 0);
    this.outputs = this.outputs || [];
    const current = this._sigOutputSlots();
    while(current.length > extra){
      const idx = current.pop();
      const out = this.outputs[idx];
      if(out && out.links){
        [...out.links].forEach((id)=>{
          try{ this.graph && this.graph.removeLink(id); }catch(_e){}
        });
      }
      this.removeOutput(idx);
    }
    for(let i = this._sigOutputSlots().length; i < extra; i++){
      this.addOutput(`sigOut${i}`, 0);
    }
    const ordered = this._sigOutputSlots();
    for(let i = 0; i < ordered.length; i++){
      const out = this.outputs[ordered[i]];
      if(out) out.name = `sigOut${i}`;
    }
  }

  _captureAgvInput(){
    const slots = this._carrierInputSlots();
    for(let i = 0; i < slots.length; i++){
      const slot = slots[i];
      const port = this.inputs[slot];
      if(!port || port.link == null){
        this._lastAgvInRefBySlot[slot] = null;
        continue;
      }
      const agv = this.getInputData(slot);
      if(!agv){
        this._lastAgvInRefBySlot[slot] = null;
        continue;
      }
      if(this._lastAgvInRefBySlot[slot] === agv) continue;
      if(this._adoptIncomingAgv(agv, true, i, slot)){
        this._lastAgvInRefBySlot[slot] = agv;
        break;
      }
    }
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
      const outSlot = this._activeCarrierOutSlot();
      const out = this.outputs && this.outputs[outSlot];
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
    if(!this._hasWorkInLinkForLane(this._currentCarrierLane) || this._loadIndex >= cap){
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
    const inSlot = this._workInSlotForLane(this._currentCarrierLane);
    if(w && inSlot >= 0) this._triggerAnim(inSlot,'work',duration,{id:w.id, t:w.type});
    if(duration===0) this._handleWorkInProcess(now);
  }

  _handleWorkInProcess(now){
    if(now < this._until) return;
    const cap = this._currentAgv ? this._currentAgv.capacity : 0;
    this._currentWork = null;
    this._payload = null;
    if(this._hasWorkInLinkForLane(this._currentCarrierLane) && this._currentAgv && this._loadIndex < cap){
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
    if(!this._pendingUnload.length || !this._hasWorkOutLinkForLane(this._currentCarrierLane)){
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
    const outSlot = this._workOutSlotForLane(this._currentCarrierLane);
    if(outSlot < 0) return;
    this._clearWorkOutputs();
    try{ this.setOutputData(outSlot, this._workOffer); }catch(_e){}
  }

  _completeWorkOutOffer(){
    if(!this._workOffer) return;
    this._pendingUnload.shift();
    if(this._currentAgv && Array.isArray(this._currentAgv.cargo)) this._currentAgv.cargo.shift();
    this._workOffer = null;
    this._workOfferArmed = false;
    this._workOfferAccepted = false;
    this._unloadIndex++;
    this._clearWorkOutputs();
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
    this._clearWorkOutputs();
    this._clearCarrierOutputs();
    this._setAgvOutWaitIcon(false);
    if(!this._currentAgv){
      this._setState('agvIn_idle','IDLE');
      return;
    }
    if(!this._hasAgvOutLinkForLane(this._currentCarrierLane)){
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
    this._departingCarrierLane = this._currentCarrierLane;
    if(this._currentAgv && this._currentAgv.meta && typeof this._currentAgv.meta === 'object'){
      this._currentAgv.meta.carrierLane = this._departingCarrierLane;
    }
    this._departingAgv = this._currentAgv;
    this._departingAccepted = false;
    this._currentAgv = null;
    this._offerDepartingAgv();
  }

  _downstreamWorkReady(){
    const outSlot = this._workOutSlotForLane(this._currentCarrierLane);
    const out = this.outputs[outSlot];
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
    const outSlot = this._workOutSlotForLane(this._currentCarrierLane);
    const out = this.outputs[outSlot];
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

  _downstreamAgvReady(agv, lane){
    const outSlot = this._carrierOutSlotForLane(lane);
    const out = this.outputs[outSlot];
    if(!out || !out.links) return false;
    const probeAgv = this._agvForDispatchProbe(agv);
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
      if(typeof t.canAcceptAgv === 'function' && !t.canAcceptAgv(link.target_slot, probeAgv)) return false;
    }
    return true;
  }

  _offerDepartingAgv(){
    if(!this._departingAgv) return;
    const outSlot = this._carrierOutSlotForLane(this._departingCarrierLane);
    const out = this.outputs[outSlot];
    if(!out || !out.links) return;
    this._clearCarrierOutputs();
    try{ this.setOutputData(outSlot, this._departingAgv); }catch(_e){}
  }

  _agvAccepted(agv, lane){
    const outSlot = this._carrierOutSlotForLane(lane);
    const out = this.outputs[outSlot];
    if(!out || !out.links) return false;
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(t._currentAgv === agv) return true;
      if(t._pendingAgv === agv) return true;
      if(Array.isArray(t._queue) && t._queue.includes(agv)) return true;
      if(t._offerAgv === agv) return true;
    }
    return false;
  }

  _resetToIdle(){
    this._departingAgv = null;
    this._departingAccepted = false;
    this._currentAgv = null;
    this._currentCarrierLane = 0;
    this._departingCarrierLane = 0;
    this._pendingUnload.length = 0;
    this._workOffer = null;
    this._workOfferArmed = false;
    this._clearCarrierOutputs();
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
    const inSlot = this._workInSlotForLane(this._currentCarrierLane);
    if(inSlot < 0 || !this._hasWorkInLinkForLane(this._currentCarrierLane)){
      this._beginUnloadPhase();
      return;
    }
    const w = this.getInputData(inSlot);
    if(!w){ this._lastWorkInRefBySlot[inSlot] = null; return; }
    if(this._lastWorkInRefBySlot[inSlot] === w) return;
    this._lastWorkInRefBySlot[inSlot] = w;
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
        this._clearWorkOutputs();
      }
    }
    if(this._workOfferAccepted && now >= this._until) this._completeWorkOutOffer();
  }

  _handleAgvOutWait(){
    if(!this._currentAgv){
      this._setState('agvIn_idle','IDLE');
      return;
    }
    if(this._downstreamAgvReady(this._currentAgv, this._currentCarrierLane)) this._startAgvOutDown();
  }

  _handleAgvOutDown(now){
    if(!this._departingAgv){
      if(this._stateName !== 'agvIn_idle') this._setState('agvIn_idle','IDLE');
      return;
    }
    if(!this._departingAccepted){
      if(this._downstreamAgvReady(this._departingAgv, this._departingCarrierLane)) this._offerDepartingAgv();
      if(this._agvAccepted(this._departingAgv, this._departingCarrierLane)){
        this._departingAccepted = true;
        this._clearCarrierOutputs();
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

  onConfigure(){
    this._ensureMinCarrierPorts(1);
    this._syncSignalOutputs();
    window.refreshFlipIO(this);
  }
}

window.CarrierRouteNode = CarrierRouteNode;
