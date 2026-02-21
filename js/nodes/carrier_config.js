// Carrier Home node: home-position config updater for each carrier.
// It keeps one carrier at a time and decides which carrierOut lane to dispatch from.

const CARRIER_HOME_DEFAULTS = {
  carrierId: 'Carrier-1',
  capacity: window.NODES_CONFIG?.carrierHome?.capacity ?? window.NODES_CONFIG?.carrierConfig?.capacity ?? 2,
  sequence: '',
  autoSpawn: (window.NODES_CONFIG?.carrierHome?.autoSpawn ?? window.NODES_CONFIG?.carrierConfig?.autoSpawn ?? true) !== false
};

class CarrierHomeNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Carrier Home';
    this.size = [280, 150];
    this.resizable = true;
    // Same baseline palette as Carrier Route (idle).
    this.color = '#f1c40f';
    this.bgcolor = '#fff9db';

    this.addInput('carrierIn', 'AGV');
    this.addOutput('carrierOut', 'AGV');

    this.properties = {
      carrierId: CARRIER_HOME_DEFAULTS.carrierId,
      capacity: CARRIER_HOME_DEFAULTS.capacity,
      sequence: CARRIER_HOME_DEFAULTS.sequence,
      autoSpawn: CARRIER_HOME_DEFAULTS.autoSpawn
    };

    this._parsedSequence = [];
    this._pendingAgv = null;
    this._offerAgv = null;
    this._offerOutSlot = -1;
    this._lastDispatchLane = 0;
    this._lastAgvInRefBySlot = Object.create(null);
    this._spawned = false;
    this._tick = 0;

    this._refreshSequence();
    this._ensureMinCarrierPorts(1);
    if(window.enableFlipIO) window.enableFlipIO(this);
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
    const ins = this._carrierInputSlots();
    const outs = this._carrierOutputSlots();
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
    this._lastDispatchLane = Math.max(0, Math.min(laneMax, Number(this._lastDispatchLane) || 0));
  }

  _carrierInputOrdinal(slotIndex){
    return this._carrierInputSlots().indexOf(slotIndex);
  }

  _carrierOutSlotForLane(lane){
    const outs = this._carrierOutputSlots();
    if(!outs.length) return -1;
    const n = Number(lane);
    if(!isFinite(n) || n < 0) return outs[0];
    const idx = Math.max(0, Math.min(outs.length - 1, Math.floor(n)));
    return outs[idx];
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
    const p = this.inputs && this.inputs[idx];
    if(p && p.link != null){
      try{ this.graph && this.graph.removeLink(p.link); }catch(_e){}
    }
    this.removeInput(idx);
    this._lastAgvInRefBySlot = Object.create(null);
    this._normalizeCarrierPortNames();
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
    const p = this.outputs && this.outputs[idx];
    if(p && p.links){
      [...p.links].forEach((id)=>{
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

  _clearCarrierOutputs(){
    for(const slot of this._carrierOutputSlots()){
      try{ this.setOutputData(slot, null); }catch(_e){}
    }
  }

  _normalizeCapacity(){
    const n = Math.round(Number(this.properties.capacity));
    if(!isFinite(n) || n < 1) return 1;
    return n;
  }

  _normalizeCarrierId(){
    const text = String(this.properties.carrierId ?? '').trim();
    return text || `Carrier-${this.id ?? 'X'}`;
  }

  _parseSequence(raw){
    if(Array.isArray(raw)) return raw.map((v)=>String(v ?? '').trim()).filter(Boolean);
    const text = String(raw ?? '');
    if(!text.trim()) return [];
    return text
      .replace(/\r/g, '\n')
      .split(/(?:,|\n|->)+/)
      .map((v)=>v.trim())
      .filter(Boolean);
  }

  _refreshSequence(){
    this._parsedSequence = this._parseSequence(this.properties.sequence);
  }

  _applyConfigToAgv(agv){
    let a = agv;
    if(!(a instanceof AGV)){
      a = new AGV(String(agv?.id ?? this._normalizeCarrierId()), this._normalizeCapacity());
      if(agv && typeof agv === 'object'){
        if(Array.isArray(agv.cargo)) a.cargo = agv.cargo;
        if(agv.meta && typeof agv.meta === 'object') a.meta = agv.meta;
      }
    }
    if(!Array.isArray(a.cargo)) a.cargo = [];
    if(!a.meta || typeof a.meta !== 'object') a.meta = {};

    a.id = this._normalizeCarrierId();
    a.capacity = this._normalizeCapacity();
    a.meta.capacity = a.capacity;
    a.meta.routeSequence = this._parsedSequence.slice();
    if(!isFinite(Number(a.meta.routeCursor)) || Number(a.meta.routeCursor) < 0){
      a.meta.routeCursor = 0;
    }
    if(!isFinite(Number(a.meta.carrierLane)) || Number(a.meta.carrierLane) < 0){
      a.meta.carrierLane = this._lastDispatchLane;
    }
    a.meta.ownerConfigId = this.id;
    return a;
  }

  _canAcceptNewCarrier(){
    // One carrier at a time per node (no simultaneous multi-port intake).
    return !this._pendingAgv && !this._offerAgv;
  }

  canAcceptAgv(slotIndex, agv){
    let slot = slotIndex;
    let incoming = agv;
    if(typeof slotIndex !== 'number'){
      slot = null;
      incoming = slotIndex;
    }
    if(slot != null && this._carrierInputOrdinal(slot) < 0) return false;
    if(!incoming) return this._canAcceptNewCarrier();
    if(this._pendingAgv === incoming || this._offerAgv === incoming) return false;
    return this._canAcceptNewCarrier();
  }

  _captureIncomingAgv(){
    const ins = this._carrierInputSlots();
    for(let i = 0; i < ins.length; i++){
      const slot = ins[i];
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
      if(!this.canAcceptAgv(slot, agv)) continue;

      const configured = this._applyConfigToAgv(agv);
      const lane = this._carrierInputOrdinal(slot);
      if(configured.meta) configured.meta.carrierLane = Math.max(0, lane);
      this._pendingAgv = configured;
      this._lastAgvInRefBySlot[slot] = agv;
      break;
    }
  }

  _maybeSpawnAgv(){
    if(!this.properties.autoSpawn) return;
    if(this._spawned) return;
    if(!this._canAcceptNewCarrier()) return;
    const agv = this._applyConfigToAgv(new AGV(this._normalizeCarrierId(), this._normalizeCapacity()));
    this._pendingAgv = agv;
    this._spawned = true;
  }

  _applyConfigToHeld(){
    if(this._pendingAgv) this._applyConfigToAgv(this._pendingAgv);
    if(this._offerAgv) this._applyConfigToAgv(this._offerAgv);
  }

  _downstreamReadyOnSlot(slot, agv){
    const out = this.outputs && this.outputs[slot];
    if(!out || !out.links || !out.links.length) return false;
    for(const id of out.links){
      const link = this.graph?.links ? this.graph.links[id] : null;
      if(!link) continue;
      const target = this.graph?.getNodeById ? this.graph.getNodeById(link.target_id) : null;
      if(!target) continue;
      if(typeof target._state !== 'undefined' && target._state !== 'IDLE') return false;
      if(typeof target.canAcceptAgv === 'function' && !target.canAcceptAgv(link.target_slot, agv)) return false;
    }
    return true;
  }

  _chooseDispatchSlot(agv){
    const outs = this._carrierOutputSlots();
    if(!outs.length) return -1;
    const laneRaw = Number(agv?.meta?.carrierLane);
    if(isFinite(laneRaw) && laneRaw >= 0){
      const preferred = this._carrierOutSlotForLane(laneRaw);
      if(preferred >= 0 && this._downstreamReadyOnSlot(preferred, agv)) return preferred;
    }
    for(const slot of outs){
      if(this._downstreamReadyOnSlot(slot, agv)) return slot;
    }
    return -1;
  }

  _agvAcceptedOnSlot(agv, slot){
    if(!agv || slot < 0) return false;
    const out = this.outputs && this.outputs[slot];
    if(!out || !out.links) return false;
    for(const id of out.links){
      const link = this.graph?.links ? this.graph.links[id] : null;
      if(!link) continue;
      const target = this.graph?.getNodeById ? this.graph.getNodeById(link.target_id) : null;
      if(!target) continue;
      if(target._currentAgv === agv) return true;
      if(Array.isArray(target._queue) && target._queue.includes(agv)) return true;
      if(target._offerAgv === agv) return true;
    }
    return false;
  }

  onConfigure(){
    this._refreshSequence();
    this.properties.capacity = this._normalizeCapacity();
    this.properties.carrierId = this._normalizeCarrierId();
    this.properties.autoSpawn = !!this.properties.autoSpawn;
    this._ensureMinCarrierPorts(1);
    this._applyConfigToHeld();
    window.refreshFlipIO(this);
  }

  onPropertyChanged(name){
    if(name === 'capacity') this.properties.capacity = this._normalizeCapacity();
    if(name === 'carrierId') this.properties.carrierId = this._normalizeCarrierId();
    if(name === 'sequence') this._refreshSequence();
    if(name === 'autoSpawn') this.properties.autoSpawn = !!this.properties.autoSpawn;
    this._applyConfigToHeld();
  }

  onExecute(){
    this._tick++;
    this._captureIncomingAgv();
    this._maybeSpawnAgv();
    this._applyConfigToHeld();

    if(!this._offerAgv && this._pendingAgv){
      this._offerAgv = this._pendingAgv;
      this._pendingAgv = null;
      this._offerOutSlot = -1;
    }

    if(this._offerAgv){
      // Always check prior offer acceptance first.
      if(this._offerOutSlot >= 0 && this._agvAcceptedOnSlot(this._offerAgv, this._offerOutSlot)){
        this._offerAgv = null;
        this._offerOutSlot = -1;
        this._clearCarrierOutputs();
      }else{
        const slot = this._chooseDispatchSlot(this._offerAgv);
        if(slot >= 0){
          this._offerOutSlot = slot;
          const lane = this._carrierOutputSlots().indexOf(slot);
          if(this._offerAgv.meta && lane >= 0){
            this._offerAgv.meta.carrierLane = lane;
            this._lastDispatchLane = lane;
          }
          this._clearCarrierOutputs();
          this.setOutputData(slot, this._offerAgv);
        }else{
          this._clearCarrierOutputs();
        }
      }
    }else{
      this._offerOutSlot = -1;
      this._clearCarrierOutputs();
    }

    this.setDirtyCanvas(true, true);
  }

  onDrawForeground(ctx){
    const seqText = this._parsedSequence.length ? this._parsedSequence.join(' -> ') : '(not set)';
    const lane = this._offerOutSlot >= 0 ? (this._carrierOutputSlots().indexOf(this._offerOutSlot) + 1) : '-';
    const lines = [
      `Carrier: ${this._normalizeCarrierId()} cap=${this._normalizeCapacity()}`,
      `Sequence: ${seqText}`,
      `Pending: ${this._pendingAgv ? 'yes' : 'no'} / Dispatching: ${this._offerAgv ? 'yes' : 'no'}`,
      `Dispatch lane(out): ${lane}`,
      `Auto spawn: ${this.properties.autoSpawn ? 'ON' : 'OFF'} / spawned=${this._spawned}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }

  getExtraMenuOptions(){
    const laneCount = this._carrierLaneCount();
    return [
      { content: 'Add carrier IN/OUT', callback: ()=> this._addCarrierLane() },
      { content: 'Remove carrier IN/OUT', disabled: laneCount <= 1, callback: ()=> this._removeCarrierLane() }
    ];
  }
}

window.CarrierHomeNode = CarrierHomeNode;
// Backward compatibility for existing references.
window.CarrierConfigNode = CarrierHomeNode;
