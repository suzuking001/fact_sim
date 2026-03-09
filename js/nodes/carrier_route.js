// Carrier Route node: infrastructure-focused transport segment.
// Holds only transport timing and route-key matching (no carrier pool/settings).

const CARRIER_ROUTE_DEFAULTS = {
  processTime: 3,
  downTime: 0.5,
  initialCarrier: '',
  outSequence: window.NODES_CONFIG?.carrierRoute?.outSequence ?? ''
};
const CARRIER_ROUTE_PALLET_PICKUP_HOLD_MS = 1;

class CarrierRouteNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Carrier Route';
    this.resizable = true;
    this.size = [280, 150];

    this._agvInIndex  = this.inputs.length;  this.addInput('carrierIn', 'AGV');
    this._agvOutIndex = this.outputs.length; this.addOutput('carrierOut', 'AGV');
    this._palletInIndex = this.inputs.length; this.addInput('palletIn', 'PALLET');
    this._palletOutIndex = this.outputs.length; this.addOutput('palletOut', 'PALLET');

    this.properties = {
      processTime: window.NODES_CONFIG?.carrierRoute?.processTimeSec ?? CARRIER_ROUTE_DEFAULTS.processTime,
      downTime: window.NODES_CONFIG?.carrierRoute?.downTimeSec ?? CARRIER_ROUTE_DEFAULTS.downTime,
      initialCarrier: window.NODES_CONFIG?.carrierRoute?.initialCarrierId ?? CARRIER_ROUTE_DEFAULTS.initialCarrier,
      outSequence: CARRIER_ROUTE_DEFAULTS.outSequence,
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
    this._pendingPalletUnload = [];
    this._palletOffer = null;
    this._palletOfferArmed = false;
    this._palletOfferAccepted = false;
    this._palletUnloadIndex = 0;
    this._agvWaitIconLinks = null;
    this._agvWaitIconInfoKey = '';
    this._agvWaitIconSlot = -1;
    this._currentWork = null;
    this._payload = null;
    this._loadIndex = 0;
    this._unloadIndex = 0;
    this._until = 0;
    this._stateName = 'agvIn_idle';
    this._state = 'IDLE';
    this._lastWorkInRefBySlot = Object.create(null);
    this._lastAgvInRefBySlot = Object.create(null);
    this._lastPalletInRefBySlot = Object.create(null);
    this._currentCarrierLane = 0;
    this._departingCarrierLane = 0;
    this._plannedDepartureLane = 0;
    this._agvOutWaitSince = 0;
    this._initialCarrierSpawned = false;
    this._parsedOutSequence = [];
    this._outSequenceRaw = null;
    this._outSequenceCursor = 0;

    this._setState('agvIn_idle','IDLE');
    this._refreshOutSequence();
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
  _isPalletInputPort(p){
    const n = String(p?.name || '');
    return n === 'palletIn' || /^palletIn\d+$/.test(n);
  }
  _isPalletOutputPort(p){
    const n = String(p?.name || '');
    return n === 'palletOut' || /^palletOut\d+$/.test(n);
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
  _palletInputSlots(){
    const slots = [];
    if(!this.inputs) return slots;
    for(let i = 0; i < this.inputs.length; i++){
      if(this._isPalletInputPort(this.inputs[i])) slots.push(i);
    }
    return slots;
  }
  _palletOutputSlots(){
    const slots = [];
    if(!this.outputs) return slots;
    for(let i = 0; i < this.outputs.length; i++){
      if(this._isPalletOutputPort(this.outputs[i])) slots.push(i);
    }
    return slots;
  }
  _normalizeCarrierPortNames(){
    const wIns = this._workInputSlots();
    const wOuts = this._workOutputSlots();
    const ins = this._carrierInputSlots();
    const outs = this._carrierOutputSlots();
    const pIns = this._palletInputSlots();
    const pOuts = this._palletOutputSlots();
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
      if(p) p.name = `carrierIn${i + 1}`;
    }
    for(let i = 0; i < outs.length; i++){
      const p = this.outputs[outs[i]];
      if(p) p.name = `carrierOut${i + 1}`;
    }
    for(let i = 0; i < pIns.length; i++){
      const p = this.inputs[pIns[i]];
      if(p) p.name = `palletIn${i + 1}`;
    }
    for(let i = 0; i < pOuts.length; i++){
      const p = this.outputs[pOuts[i]];
      if(p) p.name = `palletOut${i + 1}`;
    }
    this._reorderLanePorts();
  }
  _remapSlotCacheByMap(cache, slotMap){
    const src = cache && typeof cache === 'object' ? cache : null;
    if(!src) return Object.create(null);
    const dst = Object.create(null);
    for(const key in src){
      if(!Object.prototype.hasOwnProperty.call(src, key)) continue;
      const oldSlot = Number(key);
      if(!isFinite(oldSlot)) continue;
      if(!Object.prototype.hasOwnProperty.call(slotMap, oldSlot)) continue;
      const newSlot = slotMap[oldSlot];
      dst[newSlot] = src[key];
    }
    return dst;
  }
  _remapLinksAfterPortReorder(inMap, outMap){
    const links = this.graph && this.graph.links;
    if(!links) return;
    for(const id in links){
      if(!Object.prototype.hasOwnProperty.call(links, id)) continue;
      const link = links[id];
      if(!link) continue;
      if(link.origin_id === this.id && Object.prototype.hasOwnProperty.call(outMap, link.origin_slot)){
        link.origin_slot = outMap[link.origin_slot];
      }
      if(link.target_id === this.id && Object.prototype.hasOwnProperty.call(inMap, link.target_slot)){
        link.target_slot = inMap[link.target_slot];
      }
    }
  }
  _reorderLanePorts(){
    const oldInputs = Array.isArray(this.inputs) ? this.inputs.slice() : [];
    const oldOutputs = Array.isArray(this.outputs) ? this.outputs.slice() : [];
    if(!oldInputs.length && !oldOutputs.length) return;

    const workIns = [];
    const carrierIns = [];
    const palletIns = [];
    const otherIns = [];
    for(let i = 0; i < oldInputs.length; i++){
      const port = oldInputs[i];
      if(this._isWorkInputPort(port)) workIns.push({ oldIdx: i, port });
      else if(this._isCarrierInputPort(port)) carrierIns.push({ oldIdx: i, port });
      else if(this._isPalletInputPort(port)) palletIns.push({ oldIdx: i, port });
      else otherIns.push({ oldIdx: i, port });
    }

    const workOuts = [];
    const carrierOuts = [];
    const palletOuts = [];
    const otherOuts = [];
    for(let i = 0; i < oldOutputs.length; i++){
      const port = oldOutputs[i];
      if(this._isWorkOutputPort(port)) workOuts.push({ oldIdx: i, port });
      else if(this._isCarrierOutputPort(port)) carrierOuts.push({ oldIdx: i, port });
      else if(this._isPalletOutputPort(port)) palletOuts.push({ oldIdx: i, port });
      else otherOuts.push({ oldIdx: i, port });
    }

    const newInputsMeta = [];
    const inputLaneCount = Math.max(workIns.length, carrierIns.length, palletIns.length);
    for(let i = 0; i < inputLaneCount; i++){
      if(workIns[i]) newInputsMeta.push(workIns[i]);      // workInN first
      if(carrierIns[i]) newInputsMeta.push(carrierIns[i]); // carrierInN next
      if(palletIns[i]) newInputsMeta.push(palletIns[i]);   // palletInN next
    }
    for(const item of otherIns) newInputsMeta.push(item);

    const newOutputsMeta = [];
    const outputLaneCount = Math.max(workOuts.length, carrierOuts.length, palletOuts.length);
    for(let i = 0; i < outputLaneCount; i++){
      if(workOuts[i]) newOutputsMeta.push(workOuts[i]);      // workOutN first
      if(carrierOuts[i]) newOutputsMeta.push(carrierOuts[i]); // carrierOutN next
      if(palletOuts[i]) newOutputsMeta.push(palletOuts[i]);   // palletOutN next
    }
    for(const item of otherOuts) newOutputsMeta.push(item);

    const sameInputs =
      oldInputs.length === newInputsMeta.length &&
      oldInputs.every((port, idx)=> port === newInputsMeta[idx]?.port);
    const sameOutputs =
      oldOutputs.length === newOutputsMeta.length &&
      oldOutputs.every((port, idx)=> port === newOutputsMeta[idx]?.port);
    if(sameInputs && sameOutputs) return;

    const inMap = {};
    for(let i = 0; i < newInputsMeta.length; i++){
      inMap[newInputsMeta[i].oldIdx] = i;
    }
    const outMap = {};
    for(let i = 0; i < newOutputsMeta.length; i++){
      outMap[newOutputsMeta[i].oldIdx] = i;
    }

    this.inputs = newInputsMeta.map((item)=> item.port);
    this.outputs = newOutputsMeta.map((item)=> item.port);
    this._remapLinksAfterPortReorder(inMap, outMap);

    this._lastWorkInRefBySlot = this._remapSlotCacheByMap(this._lastWorkInRefBySlot, inMap);
    this._lastAgvInRefBySlot = this._remapSlotCacheByMap(this._lastAgvInRefBySlot, inMap);
    this._lastPalletInRefBySlot = this._remapSlotCacheByMap(this._lastPalletInRefBySlot, inMap);
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
    this._plannedDepartureLane = Math.max(0, Math.min(laneMax, Number(this._plannedDepartureLane) || 0));
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
    let lane = this._currentCarrierLane;
    if(this._departingAgv){
      lane = this._departingCarrierLane;
    }else if(this._stateName === 'agvOut_wait'){
      lane = this._plannedDepartureLane;
    }
    return this._carrierOutSlotForLane(lane);
  }
  _hasAgvOutLinkForLane(lane){
    const slot = this._carrierOutSlotForLane(lane);
    if(slot < 0) return false;
    const port = this.outputs[slot];
    return !!(port && port.links && port.links.length);
  }
  _normalizeCarrierLaneIndex(lane, laneCount){
    const count = Math.max(1, Math.floor(Number(laneCount) || 1));
    const n = Number(lane);
    if(!isFinite(n) || n < 0) return 0;
    return Math.max(0, Math.min(count - 1, Math.floor(n)));
  }
  _firstLinkedCarrierLane(){
    const outs = this._carrierOutputSlots();
    const count = Math.max(1, outs.length);
    for(let lane = 0; lane < count; lane++){
      if(this._hasAgvOutLinkForLane(lane)) return lane;
    }
    return -1;
  }
  _resolveLinkedDepartureLane(preferredLane, fallbackLane){
    const outs = this._carrierOutputSlots();
    const count = Math.max(1, outs.length);
    const preferred = this._normalizeCarrierLaneIndex(preferredLane, count);
    if(this._hasAgvOutLinkForLane(preferred)) return preferred;
    const fallback = this._normalizeCarrierLaneIndex(fallbackLane, count);
    if(this._hasAgvOutLinkForLane(fallback)) return fallback;
    const firstLinked = this._firstLinkedCarrierLane();
    if(firstLinked >= 0) return firstLinked;
    return preferred;
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
  _sharedWorkInputSlot(){
    const slots = this._workInputSlots();
    if(!slots.length) return -1;
    if(slots.length === 1) return slots[0];
    const linked = this._linkedWorkInputSlots();
    if(linked.length === 1) return linked[0];
    return -1;
  }
  _workOutSlotForLane(lane){
    const slots = this._workOutputSlots();
    if(!slots.length) return -1;
    const n = Number(lane);
    if(isFinite(n) && n >= 0 && n < slots.length){
      return slots[Math.floor(n)];
    }
    return this._sharedWorkOutputSlot();
  }
  _sharedWorkOutputSlot(){
    const slots = this._workOutputSlots();
    if(!slots.length) return -1;
    if(slots.length === 1) return slots[0];
    const linked = slots.filter((slot)=>{
      const p = this.outputs && this.outputs[slot];
      return !!(p && p.links && p.links.length);
    });
    if(linked.length === 1) return linked[0];
    return -1;
  }
  _palletInSlotForLane(lane){
    const slots = this._palletInputSlots();
    if(!slots.length) return -1;
    const n = Number(lane);
    if(!isFinite(n) || n < 0 || n >= slots.length) return -1;
    return slots[Math.floor(n)];
  }
  _palletOutSlotForLane(lane){
    const slots = this._palletOutputSlots();
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
  _linkedWorkInputSlots(){
    const slots = this._workInputSlots();
    const linked = [];
    for(const slot of slots){
      const p = this.inputs && this.inputs[slot];
      if(p && p.link != null) linked.push(slot);
    }
    return linked;
  }
  _resolveActiveWorkInSlot(){
    const laneSlot = this._workInSlotForLane(this._currentCarrierLane);
    if(laneSlot >= 0){
      const p = this.inputs && this.inputs[laneSlot];
      if(p && p.link != null) return laneSlot;
      const sharedSlot = this._sharedWorkInputSlot();
      if(sharedSlot >= 0 && sharedSlot !== laneSlot) return sharedSlot;
      // Lane exists but is unconnected: treat as "no input" for this lane.
      // Caller can decide to pass-through/unload instead of waiting.
      return laneSlot;
    }
    const sharedSlot = this._sharedWorkInputSlot();
    if(sharedSlot >= 0) return sharedSlot;
    // Compatibility fallback is only safe for single-lane carrier routes.
    // In multi-lane routes this would break lane-to-work pairing and can deadlock.
    if(this._carrierLaneCount() <= 1){
      const linked = this._linkedWorkInputSlots();
      if(linked.length === 1) return linked[0];
    }
    return -1;
  }
  _hasWorkOutLinkForLane(lane){
    let slot = this._workOutSlotForLane(lane);
    let p = slot >= 0 ? this.outputs[slot] : null;
    if(!(p && p.links && p.links.length)){
      const sharedSlot = this._sharedWorkOutputSlot();
      if(sharedSlot >= 0){
        slot = sharedSlot;
        p = this.outputs[slot];
      }
    }
    if(slot < 0) return false;
    return !!(p && p.links && p.links.length);
  }
  _hasPalletInLinkForLane(lane){
    const slot = this._palletInSlotForLane(lane);
    if(slot < 0) return false;
    const p = this.inputs[slot];
    return !!(p && p.link != null);
  }
  _hasPalletOutLinkForLane(lane){
    const slot = this._palletOutSlotForLane(lane);
    if(slot < 0) return false;
    const p = this.outputs[slot];
    return !!(p && p.links && p.links.length);
  }
  _clearWorkOutputs(){
    for(const slot of this._workOutputSlots()){
      try{ this.setOutputData(slot, null); }catch(_e){}
    }
  }
  _clearPalletOutputs(){
    for(const slot of this._palletOutputSlots()){
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
  _ensurePalletLanePairs(minCount = 1){
    let ins = this._palletInputSlots();
    while(ins.length < minCount){
      this.addInput('palletIn', 'PALLET');
      ins = this._palletInputSlots();
    }
    let outs = this._palletOutputSlots();
    while(outs.length < minCount){
      this.addOutput('palletOut', 'PALLET');
      outs = this._palletOutputSlots();
    }
    while(ins.length < outs.length){
      this.addInput('palletIn', 'PALLET');
      ins = this._palletInputSlots();
    }
    while(outs.length < ins.length){
      this.addOutput('palletOut', 'PALLET');
      outs = this._palletOutputSlots();
    }
    this._normalizeCarrierPortNames();
  }
  _workLaneCount(){
    return Math.min(this._workInputSlots().length, this._workOutputSlots().length);
  }
  _palletLaneCount(){
    return Math.min(this._palletInputSlots().length, this._palletOutputSlots().length);
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
  _addPalletLane(){
    this.addInput('palletIn', 'PALLET');
    this.addOutput('palletOut', 'PALLET');
    this._ensurePalletLanePairs(1);
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true, true);
  }
  _removePalletLane(){
    const count = this._palletLaneCount();
    if(count <= 1) return;
    const inSlots = this._palletInputSlots();
    const outSlots = this._palletOutputSlots();
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
    this._lastPalletInRefBySlot = Object.create(null);
    this._ensurePalletLanePairs(1);
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

  _normalizeInitialCarrierId(){
    return String(this.properties?.initialCarrier ?? '').trim();
  }
  _normalizeOutSequenceRaw(){
    return String(this.properties?.outSequence ?? '').trim();
  }
  _parseOutSequence(raw){
    const tokens = String(raw ?? '')
      .replace(/\r/g, '\n')
      .split(/(?:,|\n|->)+/)
      .map((t)=> t.trim())
      .filter(Boolean);
    const seq = [];
    for(const token of tokens){
      const n = Number(token);
      if(!isFinite(n)) continue;
      const lane1 = Math.floor(n);
      if(lane1 >= 1) seq.push(lane1);
    }
    return seq;
  }
  _refreshOutSequence(){
    const raw = this._normalizeOutSequenceRaw();
    const changed = raw !== this._outSequenceRaw;
    this.properties.outSequence = raw;
    this._outSequenceRaw = raw;
    this._parsedOutSequence = this._parseOutSequence(raw);
    if(changed){
      this._outSequenceCursor = 0;
    }else if(!isFinite(Number(this._outSequenceCursor)) || this._outSequenceCursor < 0){
      this._outSequenceCursor = 0;
    }
    if(!this._parsedOutSequence.length) this._outSequenceCursor = 0;
  }
  _ensureOutSequenceFresh(){
    const raw = this._normalizeOutSequenceRaw();
    if(raw !== this._outSequenceRaw) this._refreshOutSequence();
  }
  _resolveOutSequenceLane(laneCount, fallbackLane, consume){
    const count = Math.max(1, Math.floor(Number(laneCount) || 1));
    const fallback = Math.max(0, Math.min(count - 1, Math.floor(Number(fallbackLane) || 0)));
    this._ensureOutSequenceFresh();
    if(!this._parsedOutSequence.length) return fallback;
    let cursor = Math.floor(Number(this._outSequenceCursor) || 0);
    if(cursor < 0) cursor = 0;
    const lane1 = this._parsedOutSequence[cursor % this._parsedOutSequence.length];
    if(consume){
      this._outSequenceCursor = (cursor + 1) % this._parsedOutSequence.length;
    }
    if(!isFinite(lane1)) return fallback;
    return Math.max(0, Math.min(count - 1, Math.floor(lane1) - 1));
  }
  _previewDepartureLane(agv, fallbackLane){
    const outs = this._carrierOutputSlots();
    const laneCount = Math.max(1, outs.length);
    return this._resolveOutSequenceLane(laneCount, fallbackLane, false);
  }
  _consumeDepartureLane(agv, fallbackLane){
    const outs = this._carrierOutputSlots();
    const laneCount = Math.max(1, outs.length);
    return this._resolveOutSequenceLane(laneCount, fallbackLane, true);
  }

  _carrierConfigNodes(){
    const nodes = this.graph && Array.isArray(this.graph._nodes) ? this.graph._nodes : [];
    return nodes.filter((node)=>
      node &&
      (typeof node.isForCarrierId === 'function' ||
       node.type === 'factory/carrierconfig' ||
       node.type === 'factory/carrierhome' ||
       node.type === 'factory/palletcarrierconfig' ||
       node.type === 'factory/palletcarrier'));
  }

  _carrierConfigByNodeId(nodeId){
    if(!isFinite(Number(nodeId))) return null;
    const id = Number(nodeId);
    const list = this._carrierConfigNodes();
    for(const node of list){
      if(Number(node.id) === id) return node;
    }
    return null;
  }

  _findCarrierConfigById(carrierId, mode){
    const idText = String(carrierId ?? '').trim();
    if(!idText) return null;
    const modeText = String(mode || '').trim().toLowerCase();
    const list = this._carrierConfigNodes();
    // Prefer the latest config when duplicated IDs exist.
    // This makes "newly added/edited config overrides old one" behavior explicit.
    for(let i = list.length - 1; i >= 0; i--){
      const node = list[i];
      if(modeText && typeof node.getCarrierMode === 'function'){
        const nodeMode = String(node.getCarrierMode() || '').trim().toLowerCase();
        if(nodeMode && nodeMode !== modeText) continue;
      }
      if(typeof node.isForCarrierId === 'function'){
        if(node.isForCarrierId(idText)) return node;
        continue;
      }
      const cfgId = String(node.properties?.carrierId ?? '').trim();
      if(cfgId && cfgId === idText) return node;
    }
    return null;
  }

  _findCarrierConfigForAgv(agv){
    if(!agv || typeof agv !== 'object') return null;
    const carrierId = String(agv.id ?? agv.meta?.carrierId ?? '').trim();
    const mode = this._isPalletCarrier(agv) ? 'pallet' : 'carrier';
    if(carrierId){
      const list = this._carrierConfigNodes();
      for(let i = list.length - 1; i >= 0; i--){
        const node = list[i];
        if(!node || typeof node.isForCarrierId !== 'function') continue;
        if(!node.isForCarrierId(carrierId)) continue;
        const nodeMode = (typeof node.getCarrierMode === 'function') ? String(node.getCarrierMode() || '').toLowerCase() : '';
        if(nodeMode && nodeMode !== mode) continue;
        return node;
      }
      const byId = this._findCarrierConfigById(carrierId, mode);
      if(byId) return byId;
      if(mode !== 'pallet'){
        const relaxed = this._findCarrierConfigById(carrierId);
        if(relaxed) return relaxed;
      }
    }
    // Fallback only when ID-based lookup is unavailable.
    const owner = Number(agv.meta?.configNodeId);
    const ownerCfg = this._carrierConfigByNodeId(owner);
    if(ownerCfg) return ownerCfg;
    return null;
  }

  _applyCarrierConfig(agv){
    const cfg = this._findCarrierConfigForAgv(agv);
    if(cfg && typeof cfg.applyToCarrier === 'function') cfg.applyToCarrier(agv);
    return cfg;
  }

  _isPalletCarrier(agv){
    if(!agv || typeof agv !== 'object') return false;
    if(Array.isArray(agv.pallets)) return true;
    return String(agv.meta?.carrierMode || '').toLowerCase() === 'pallet';
  }

  _normalizePallet(pallet){
    const src = (pallet && typeof pallet === 'object') ? pallet : {};
    const idText = String(src.palletId ?? src.id ?? '').trim();
    const capRaw = Number(src.capacity);
    const cap = isFinite(capRaw) && capRaw > 0 ? Math.max(1, Math.floor(capRaw)) : 10;
    const works = Array.isArray(src.works) ? src.works.slice() : [];
    return {
      palletId: idText || `P-${Math.random().toString(36).slice(2, 8)}`,
      capacity: cap,
      works
    };
  }

  _ensurePalletCarrier(agv){
    if(!agv || typeof agv !== 'object') return;
    if(!agv.meta || typeof agv.meta !== 'object') agv.meta = {};
    if(!this._isPalletCarrier(agv)) return;
    agv.meta.carrierMode = 'pallet';
    const capRaw = Number(agv.meta.palletCapacity);
    const palletCapacity = isFinite(capRaw) && capRaw > 0 ? Math.max(1, Math.floor(capRaw)) : 1;
    agv.meta.palletCapacity = palletCapacity;
    if(!Array.isArray(agv.pallets)) agv.pallets = [];
    agv.pallets = agv.pallets.map((p)=> this._normalizePallet(p)).slice(0, palletCapacity);
  }

  _carrierWorkCount(agv){
    if(!agv || typeof agv !== 'object') return 0;
    if(!this._isPalletCarrier(agv)){
      return Array.isArray(agv.cargo) ? agv.cargo.length : 0;
    }
    this._ensurePalletCarrier(agv);
    let total = 0;
    for(const pallet of agv.pallets){
      total += Array.isArray(pallet?.works) ? pallet.works.length : 0;
    }
    return total;
  }

  _carrierHasWorkCapacity(agv){
    if(!agv || typeof agv !== 'object') return false;
    if(!this._isPalletCarrier(agv)){
      const cap = Number(agv.capacity) || 0;
      const load = Array.isArray(agv.cargo) ? agv.cargo.length : 0;
      return cap > 0 && load < cap;
    }
    this._ensurePalletCarrier(agv);
    for(const pallet of agv.pallets){
      const works = Array.isArray(pallet?.works) ? pallet.works : null;
      const cap = Number(pallet?.capacity) || 0;
      if(works && cap > 0 && works.length < cap) return true;
    }
    return false;
  }

  _carrierPushWork(agv, work){
    if(!agv || typeof agv !== 'object') return false;
    if(!this._isPalletCarrier(agv)){
      if(!Array.isArray(agv.cargo)) agv.cargo = [];
      if(!this._carrierHasWorkCapacity(agv)) return false;
      agv.cargo.push(work);
      return true;
    }
    this._ensurePalletCarrier(agv);
    for(const pallet of agv.pallets){
      if(!Array.isArray(pallet?.works)) continue;
      const cap = Number(pallet?.capacity) || 0;
      if(cap <= 0 || pallet.works.length >= cap) continue;
      pallet.works.push(work);
      return true;
    }
    return false;
  }

  _carrierBuildWorkUnloadQueue(agv){
    if(!agv || typeof agv !== 'object') return [];
    if(!this._isPalletCarrier(agv)){
      return Array.isArray(agv.cargo) ? agv.cargo.slice() : [];
    }
    this._ensurePalletCarrier(agv);
    const out = [];
    for(const pallet of agv.pallets){
      if(!Array.isArray(pallet?.works)) continue;
      for(const w of pallet.works) out.push(w);
    }
    return out;
  }

  _carrierRemoveWork(agv, work){
    if(!agv || typeof agv !== 'object') return false;
    if(!this._isPalletCarrier(agv)){
      if(!Array.isArray(agv.cargo)) return false;
      const idx = agv.cargo.indexOf(work);
      if(idx < 0) return false;
      agv.cargo.splice(idx, 1);
      return true;
    }
    this._ensurePalletCarrier(agv);
    for(const pallet of agv.pallets){
      if(!Array.isArray(pallet?.works)) continue;
      const idx = pallet.works.indexOf(work);
      if(idx < 0) continue;
      pallet.works.splice(idx, 1);
      return true;
    }
    return false;
  }

  _carrierHasPalletCapacity(agv){
    if(!this._isPalletCarrier(agv)) return false;
    this._ensurePalletCarrier(agv);
    const cap = Number(agv.meta?.palletCapacity) || 0;
    return cap > 0 && agv.pallets.length < cap;
  }

  _carrierPushPallet(agv, pallet){
    if(!this._carrierHasPalletCapacity(agv)) return false;
    this._ensurePalletCarrier(agv);
    agv.pallets.push(this._normalizePallet(pallet));
    return true;
  }

  _carrierBuildPalletUnloadQueue(agv){
    if(!this._isPalletCarrier(agv)) return [];
    this._ensurePalletCarrier(agv);
    return agv.pallets.slice();
  }

  _carrierRemovePallet(agv, pallet){
    if(!this._isPalletCarrier(agv)) return false;
    this._ensurePalletCarrier(agv);
    const idx = agv.pallets.indexOf(pallet);
    if(idx >= 0){
      agv.pallets.splice(idx, 1);
      return true;
    }
    const targetId = String(pallet?.palletId ?? pallet?.id ?? '').trim();
    if(!targetId) return false;
    const byId = agv.pallets.findIndex((p)=> String(p?.palletId ?? p?.id ?? '').trim() === targetId);
    if(byId < 0) return false;
    agv.pallets.splice(byId, 1);
    return true;
  }

  _shouldHoldDepartureForPalletPickup(){
    if(!this._currentAgv) return false;
    if(this._departingAgv) return false;
    if(!this._isPalletCarrier(this._currentAgv)) return false;
    if(!this._carrierHasPalletCapacity(this._currentAgv)) return false;
    const inSlot = this._palletInSlotForLane(this._currentCarrierLane);
    if(inSlot < 0) return false;
    const port = this.inputs && this.inputs[inSlot];
    return !!(port && port.link != null);
  }

  _selectDepartureLane(agv, fallbackLane, consume = false){
    const preferred = consume
      ? this._consumeDepartureLane(agv, fallbackLane)
      : this._previewDepartureLane(agv, fallbackLane);
    // Prevent invisible/stuck carriers when selected lane has no outbound connection.
    return this._resolveLinkedDepartureLane(preferred, fallbackLane);
  }

  _trySpawnInitialCarrier(){
    if(this._initialCarrierSpawned) return;
    if(this._currentAgv || this._departingAgv) return;
    const id = this._normalizeInitialCarrierId();
    if(!id) return;
    const agv = new AGV(id, 1);
    const cfg = this._findCarrierConfigById(id);
    if(cfg && typeof cfg.applyToCarrier === 'function') cfg.applyToCarrier(agv);
    const inSlot = this._carrierInputSlots()[0] ?? 0;
    if(this._adoptIncomingAgv(agv, false, 0, inSlot)){
      this._initialCarrierSpawned = true;
    }
  }

  _normalizeAgv(agv){
    let a = agv;
    if(!(a instanceof AGV)){
      const id = String(a?.id ?? a ?? `Carrier-${this.id}`);
      const cap = Math.max(1, Math.round(Number(a?.capacity ?? a?.meta?.capacity ?? 1) || 1));
      a = new AGV(id, cap);
      if(agv && typeof agv === 'object'){
        if(Array.isArray(agv.cargo)) a.cargo = agv.cargo;
        if(Array.isArray(agv.pallets)) a.pallets = agv.pallets;
        if(agv.meta && typeof agv.meta === 'object') a.meta = agv.meta;
      }
    }
    if(!Array.isArray(a.cargo)) a.cargo = [];
    if(!a.meta || typeof a.meta !== 'object') a.meta = {};
    const cap = Math.max(1, Math.round(Number(a.capacity || a.meta.capacity || 1) || 1));
    a.capacity = cap;
    a.meta.capacity = cap;
    this._ensurePalletCarrier(a);
    let lane = Number(a.meta.carrierLane);
    if(!isFinite(lane) || lane < 0) lane = 0;
    a.meta.carrierLane = lane;
    return a;
  }

  _adoptIncomingAgv(agv, withInputAnim, lane = 0, inputSlot = this._carrierInputSlots()[0] ?? 0){
    const a = this._normalizeAgv(agv);
    if(!this.canAcceptAgv(inputSlot, a)) return false;
    this._applyCarrierConfig(a);
    this._currentAgv = a;
    this._departingAgv = null;
    this._departingAccepted = false;
    this._currentCarrierLane = Math.max(0, Number(lane) || 0);
    this._plannedDepartureLane = this._currentCarrierLane;
    if(!a.meta || typeof a.meta !== 'object') a.meta = {};
    a.meta.carrierLane = this._currentCarrierLane;
    const initialId = this._normalizeInitialCarrierId();
    if(initialId && String(a.id ?? '').trim() === initialId) this._initialCarrierSpawned = true;
    this._loadIndex = Array.isArray(a.cargo) ? a.cargo.length : 0;
    this._unloadIndex = 0;
    this._pendingUnload = [];
    this._workOffer = null;
    this._setState('agv_process','PROCESS');
    const now = simNow();
    this._until = now + Math.max(0,(this.properties.processTime||0)*1000);
    if(withInputAnim) this._triggerAnim(inputSlot, 'agv', this._until - now, this._carrierAnimInfo(a));
    if(this._until === now) this._handleAgvProcess(now);
    return true;
  }

  canAcceptAgv(slotIndex, agv){
    let slot = slotIndex;
    if(typeof slotIndex !== 'number'){
      slot = null;
    }
    if(slot != null && this._carrierInputOrdinal(slot) < 0) return false;
    if(this._currentAgv || this._departingAgv) return false;
    return true;
  }

  _canAcceptWorkInState(){
    if(!this._stateName) return false;
    return this._stateName.startsWith('workIn_idle') || this._stateName === 'agvOut_wait';
  }

  canAcceptWorkInput(slotIndex){
    const activeIn = this._resolveActiveWorkInSlot();
    const slotNum = Number(slotIndex);
    const targetSlot = isFinite(slotNum) ? slotNum : slotIndex;
    if(activeIn < 0 || targetSlot !== activeIn) return false;
    if(!this._currentAgv || this._departingAgv) return false;
    if(!this._canAcceptWorkInState()) return false;
    return this._carrierHasWorkCapacity(this._currentAgv);
  }

  canAcceptPalletInput(slotIndex){
    const activeIn = this._palletInSlotForLane(this._currentCarrierLane);
    const slotNum = Number(slotIndex);
    const targetSlot = isFinite(slotNum) ? slotNum : slotIndex;
    if(activeIn < 0 || targetSlot !== activeIn) return false;
    if(!this._currentAgv || this._departingAgv) return false;
    if(!this._canAcceptWorkInState()) return false;
    return this._carrierHasPalletCapacity(this._currentAgv);
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

  _carrierAnimInfo(agv){
    const carrier = agv || this._currentAgv || this._departingAgv || null;
    if(!carrier){
      return { kind: 'carrier', id: '', workCount: 0, capacity: 0, palletCount: 0, palletCapacity: 0 };
    }
    const isPallet = this._isPalletCarrier(carrier);
    const workCount = this._carrierWorkCount(carrier);
    let capacity = Math.max(0, Math.round(Number(carrier.capacity || carrier.meta?.capacity || 0) || 0));
    let palletCount = 0;
    let palletCapacity = 0;
    if(isPallet){
      this._ensurePalletCarrier(carrier);
      palletCount = Array.isArray(carrier.pallets) ? carrier.pallets.length : 0;
      palletCapacity = Math.max(0, Math.round(Number(carrier.meta?.palletCapacity || 0) || 0));
      capacity = 0;
      if(Array.isArray(carrier.pallets)){
        for(const pallet of carrier.pallets){
          capacity += Math.max(0, Math.round(Number(pallet?.capacity || 0) || 0));
        }
      }
    }
    return {
      kind: 'carrier',
      id: String(carrier.id ?? ''),
      workCount,
      capacity,
      palletCount,
      palletCapacity
    };
  }

  _carrierAnimInfoKey(info){
    if(!info || typeof info !== 'object') return '';
    return `${String(info.id || '')}|${Number(info.workCount) || 0}|${Number(info.capacity) || 0}|${Number(info.palletCount) || 0}|${Number(info.palletCapacity) || 0}`;
  }

  _setAgvOutWaitIcon(active){
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      if(active){
        const outSlot = this._activeCarrierOutSlot();
        const out = this.outputs && this.outputs[outSlot];
        if(!out || !out.links || !out.links.length){
          if(this._agvWaitIconLinks){
            this._agvWaitIconLinks.forEach((id)=> window.WorkLinkAnimator.hidePortIcon(this.graph, id));
            this._agvWaitIconLinks = null;
            this._agvWaitIconInfoKey = '';
            this._agvWaitIconSlot = -1;
          }
          return;
        }
        const info = this._carrierAnimInfo(this._currentAgv);
        const infoKey = this._carrierAnimInfoKey(info);
        if(this._agvWaitIconLinks){
          const sameSlot = outSlot === this._agvWaitIconSlot;
          if(sameSlot && infoKey === this._agvWaitIconInfoKey) return;
          const prevLinks = this._agvWaitIconLinks.slice();
          prevLinks.forEach((id)=> window.WorkLinkAnimator.hidePortIcon(this.graph, id));
        }
        this._agvWaitIconLinks = out.links.slice();
        this._agvWaitIconLinks.forEach((id)=> window.WorkLinkAnimator.showPortIcon(this.graph, id, 'agv', info));
        this._agvWaitIconSlot = outSlot;
        this._agvWaitIconInfoKey = infoKey;
      }else{
        if(!this._agvWaitIconLinks) return;
        this._agvWaitIconLinks.forEach(id=> window.WorkLinkAnimator.hidePortIcon(this.graph, id));
        this._agvWaitIconLinks = null;
        this._agvWaitIconInfoKey = '';
        this._agvWaitIconSlot = -1;
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
       this._stateName.startsWith('palletOut_wait') ||
       this._stateName.startsWith('palletOut_down') ||
       this._stateName === 'agvOut_wait');
    this._setAgvOutWaitIcon(shouldShow);
  }

  _enterWorkInIdle(){
    if(!this._currentAgv){
      this._enterAgvOutWait();
      return;
    }
    const cap = this._isPalletCarrier(this._currentAgv)
      ? Number.MAX_SAFE_INTEGER
      : (this._currentAgv.capacity || 1);
    const currentLoad = this._carrierWorkCount(this._currentAgv);
    this._loadIndex = currentLoad;
    const activeIn = this._resolveActiveWorkInSlot();
    const hasActiveWorkIn = activeIn >= 0 && this.inputs && this.inputs[activeIn] && this.inputs[activeIn].link != null;
    if(!hasActiveWorkIn || currentLoad >= cap){
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
    const w = this._currentWork;
    const inSlot = this._resolveActiveWorkInSlot();
    if(w && inSlot >= 0) this._triggerAnim(inSlot,'work',duration,{id:w.id, t:w.type});
    if(duration===0) this._handleWorkInProcess(now);
  }

  _handleWorkInProcess(now){
    if(now < this._until) return;
    const cap = this._currentAgv
      ? (this._isPalletCarrier(this._currentAgv) ? Number.MAX_SAFE_INTEGER : (this._currentAgv.capacity || 0))
      : 0;
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
    this._pendingUnload = this._carrierBuildWorkUnloadQueue(this._currentAgv);
    this._unloadIndex = 0;
    this._workOffer = null;
    this._workOfferArmed = false;
    this._until = simNow();
    const hasWorkOffer = this._pendingUnload.length > 0 && this._hasWorkOutLinkForLane(this._currentCarrierLane);
    if(hasWorkOffer){
      this._setState('workOut_wait_1','WAIT');
      return;
    }
    if(this._isPalletCarrier(this._currentAgv)){
      this._pendingPalletUnload = this._carrierBuildPalletUnloadQueue(this._currentAgv);
      if(this._pendingPalletUnload.length > 0 && this._hasPalletOutLinkForLane(this._currentCarrierLane)){
        this._palletUnloadIndex = 0;
        this._palletOffer = null;
        this._palletOfferArmed = false;
        this._palletOfferAccepted = false;
        this._setState('palletOut_wait_1','WAIT');
        return;
      }
    }
    if(!hasWorkOffer){
      this._pendingUnload.length = 0;
      this._enterAgvOutWait();
      return;
    }
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
    let outSlot = this._workOutSlotForLane(this._currentCarrierLane);
    let out = outSlot >= 0 ? this.outputs[outSlot] : null;
    if(!(out && out.links && out.links.length)){
      const sharedSlot = this._sharedWorkOutputSlot();
      if(sharedSlot >= 0){
        outSlot = sharedSlot;
        out = this.outputs[outSlot];
      }
    }
    if(outSlot < 0) return;
    this._clearWorkOutputs();
    try{ this.setOutputData(outSlot, this._workOffer); }catch(_e){}
  }

  _completeWorkOutOffer(){
    if(!this._workOffer) return;
    this._pendingUnload.shift();
    if(this._currentAgv) this._carrierRemoveWork(this._currentAgv, this._workOffer);
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

  _beginPalletUnloadPhase(){
    if(!this._currentAgv || !this._isPalletCarrier(this._currentAgv)){
      this._enterAgvOutWait();
      return;
    }
    this._pendingPalletUnload = this._carrierBuildPalletUnloadQueue(this._currentAgv);
    this._palletUnloadIndex = 0;
    this._palletOffer = null;
    this._palletOfferArmed = false;
    this._palletOfferAccepted = false;
    if(!this._pendingPalletUnload.length || !this._hasPalletOutLinkForLane(this._currentCarrierLane)){
      this._pendingPalletUnload.length = 0;
      this._enterAgvOutWait();
      return;
    }
    this._setState('palletOut_wait_1','WAIT');
  }

  _startPalletOutDown(){
    if(!this._pendingPalletUnload.length){
      this._enterAgvOutWait();
      return;
    }
    const ord = this._palletUnloadIndex + 1;
    this._setState(`palletOut_down_${ord}`,'DOWN');
    this._palletOffer = this._pendingPalletUnload[0];
    this._palletOfferArmed = true;
    this._palletOfferAccepted = false;
    const now = simNow();
    this._until = now + Math.max(0,(this.properties.downTime||0)*1000);
    this._emitPalletOffer();
  }

  _emitPalletOffer(){
    const outSlot = this._palletOutSlotForLane(this._currentCarrierLane);
    if(outSlot < 0) return;
    this._clearPalletOutputs();
    try{ this.setOutputData(outSlot, this._palletOffer); }catch(_e){}
  }

  _completePalletOutOffer(){
    if(!this._palletOffer) return;
    this._pendingPalletUnload.shift();
    if(this._currentAgv) this._carrierRemovePallet(this._currentAgv, this._palletOffer);
    this._palletOffer = null;
    this._palletOfferArmed = false;
    this._palletOfferAccepted = false;
    this._palletUnloadIndex++;
    this._clearPalletOutputs();
    if(this._pendingPalletUnload.length){
      const nextOrd = this._palletUnloadIndex + 1;
      this._setState(`palletOut_wait_${nextOrd}`,'WAIT');
    }else{
      this._enterAgvOutWait();
    }
  }

  _enterAgvOutWait(){
    this._pendingUnload.length = 0;
    this._workOffer = null;
    this._workOfferArmed = false;
    this._pendingPalletUnload.length = 0;
    this._palletOffer = null;
    this._palletOfferArmed = false;
    this._palletOfferAccepted = false;
    this._clearWorkOutputs();
    this._clearPalletOutputs();
    this._clearCarrierOutputs();
    this._setAgvOutWaitIcon(false);
    if(!this._currentAgv){
      this._setState('agvIn_idle','IDLE');
      return;
    }
    this._plannedDepartureLane = this._selectDepartureLane(this._currentAgv, this._currentCarrierLane, false);
    if(!this._hasAgvOutLinkForLane(this._plannedDepartureLane)){
      this._setState('agvOut_wait','WAIT');
      this._agvOutWaitSince = simNow();
      this._setAgvOutWaitIcon(false);
      return;
    }
    this._setState('agvOut_wait','WAIT');
    this._agvOutWaitSince = simNow();
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
    this._applyCarrierConfig(this._currentAgv);
    this._departingCarrierLane = this._selectDepartureLane(this._currentAgv, this._currentCarrierLane, true);
    this._plannedDepartureLane = this._departingCarrierLane;
    if(this._currentAgv && this._currentAgv.meta && typeof this._currentAgv.meta === 'object'){
      this._currentAgv.meta.carrierLane = this._departingCarrierLane;
    }
    this._departingAgv = this._currentAgv;
    this._departingAccepted = false;
    this._currentAgv = null;
    this._offerDepartingAgv();
  }

  _downstreamWorkReady(){
    let outSlot = this._workOutSlotForLane(this._currentCarrierLane);
    let out = this.outputs[outSlot];
    if(!(out && out.links && out.links.length)){
      const sharedSlot = this._sharedWorkOutputSlot();
      if(sharedSlot >= 0){
        outSlot = sharedSlot;
        out = this.outputs[outSlot];
      }
    }
    if(!out || !out.links || out.links.length === 0) return false;
    const pendingWork = this._workOffer || (Array.isArray(this._pendingUnload) ? this._pendingUnload[0] : null) || null;
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t.canAcceptWorkInput === 'function'){
        if(!t.canAcceptWorkInput(link.target_slot, pendingWork)) return false;
        continue;
      }
      if(typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
    }
    return true;
  }

  _downstreamPalletReady(){
    const outSlot = this._palletOutSlotForLane(this._currentCarrierLane);
    const out = this.outputs[outSlot];
    if(!out || !out.links || out.links.length === 0) return false;
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t.canAcceptPalletInput === 'function'){
        if(!t.canAcceptPalletInput(link.target_slot, this._palletOffer)) return false;
        continue;
      }
      if(typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
    }
    return true;
  }

  _workAccepted(){
    if(!this._workOffer) return false;
    let outSlot = this._workOutSlotForLane(this._currentCarrierLane);
    let out = this.outputs[outSlot];
    if(!(out && out.links && out.links.length)){
      const sharedSlot = this._sharedWorkOutputSlot();
      if(sharedSlot >= 0){
        outSlot = sharedSlot;
        out = this.outputs[outSlot];
      }
    }
    if(!out || !out.links) return false;
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t._state === 'undefined') return true;
      if(t._currentWork === this._workOffer || t._payload === this._workOffer) return true;
      if(t._lastWorkInRef === this._workOffer) return true;
      if(Array.isArray(t._workQueue) && t._workQueue.includes(this._workOffer)) return true;
    }
    return false;
  }

  _palletAccepted(){
    if(!this._palletOffer) return false;
    const outSlot = this._palletOutSlotForLane(this._currentCarrierLane);
    const out = this.outputs[outSlot];
    if(!out || !out.links) return false;
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t._state === 'undefined') return true;
      if(t._pallet === this._palletOffer || t._payload === this._palletOffer) return true;
      if(t._lastPalletInRef === this._palletOffer) return true;
      if(Array.isArray(t._palletQueue) && t._palletQueue.includes(this._palletOffer)) return true;
    }
    return false;
  }

  _downstreamAgvReady(agv, lane){
    const outSlot = this._carrierOutSlotForLane(lane);
    const out = this.outputs[outSlot];
    if(!out || !out.links || out.links.length === 0) return false;
    for(const id of out.links){
      const link = this.graph.links[id]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
      if(typeof t.canAcceptAgv === 'function' && !t.canAcceptAgv(link.target_slot, agv)) return false;
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
    this._plannedDepartureLane = 0;
    this._pendingUnload.length = 0;
    this._workOffer = null;
    this._workOfferArmed = false;
    this._pendingPalletUnload.length = 0;
    this._palletOffer = null;
    this._palletOfferArmed = false;
    this._palletOfferAccepted = false;
    this._clearCarrierOutputs();
    this._clearPalletOutputs();
    this._setAgvOutWaitIcon(false);
    this._currentWork = null;
    this._payload = null;
    this._loadIndex = 0;
    this._unloadIndex = 0;
    this._setState('agvIn_idle','IDLE');
  }

  _captureWorkInput(){
    if(!this._currentAgv) return;
    if(this._departingAgv) return;
    // Keep last input reference while busy so a held upstream output is not re-accepted.
    const inWorkIdle = this._stateName.startsWith('workIn_idle');
    const inAgvOutWait = this._stateName === 'agvOut_wait';
    if(!inWorkIdle && !inAgvOutWait) return;
    const inSlot = this._resolveActiveWorkInSlot();
    const hasActiveWorkIn = inSlot >= 0 && this.inputs && this.inputs[inSlot] && this.inputs[inSlot].link != null;
    if(inSlot < 0 || !hasActiveWorkIn){
      if(inWorkIdle) this._beginUnloadPhase();
      return;
    }
    const w = this.getInputData(inSlot);
    if(!w){
      this._lastWorkInRefBySlot[inSlot] = null;
      // Do not wait forever for "full load". If partially loaded and no input is
      // currently available, proceed with unload/depart to avoid route deadlocks.
      if(inWorkIdle && this._currentAgv){
        const load = this._carrierWorkCount(this._currentAgv);
        const cap = this._isPalletCarrier(this._currentAgv)
          ? Number.MAX_SAFE_INTEGER
          : Math.max(0, Number(this._currentAgv.capacity) || 0);
        if(load > 0 && load < cap){
          this._beginUnloadPhase();
        }
      }
      return;
    }
    if(this._lastWorkInRefBySlot[inSlot] === w) return;
    if(!this._carrierHasWorkCapacity(this._currentAgv)){
      if(inWorkIdle) this._beginUnloadPhase();
      return;
    }
    this._lastWorkInRefBySlot[inSlot] = w;
    if(inAgvOutWait){
      this._setAgvOutWaitIcon(false);
    }
    this._currentWork = w;
    this._payload = w;
    if(!this._carrierPushWork(this._currentAgv, w)) return;
    this._loadIndex = this._carrierWorkCount(this._currentAgv);
    this._startWorkInProcess();
  }

  _capturePalletInput(){
    if(!this._currentAgv) return;
    if(this._departingAgv) return;
    if(!this._isPalletCarrier(this._currentAgv)) return;
    const inWorkIdle = this._stateName.startsWith('workIn_idle');
    const inAgvOutWait = this._stateName === 'agvOut_wait';
    if(!inWorkIdle && !inAgvOutWait) return;
    const inSlot = this._palletInSlotForLane(this._currentCarrierLane);
    const hasActivePalletIn = inSlot >= 0 && this.inputs && this.inputs[inSlot] && this.inputs[inSlot].link != null;
    if(inSlot < 0 || !hasActivePalletIn){
      if(inSlot >= 0) this._lastPalletInRefBySlot[inSlot] = null;
      return;
    }
    const pallet = this.getInputData(inSlot);
    if(!pallet){
      this._lastPalletInRefBySlot[inSlot] = null;
      return;
    }
    if(this._lastPalletInRefBySlot[inSlot] === pallet) return;
    if(!this._carrierPushPallet(this._currentAgv, pallet)) return;
    this._lastPalletInRefBySlot[inSlot] = pallet;
    if(inAgvOutWait){
      this._setAgvOutWaitIcon(false);
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
      this._beginPalletUnloadPhase();
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
      }else if(now >= this._until){
        // Event engine safety: keep scheduling while waiting for downstream accept.
        this._until = now + Math.max(0,(this.properties.downTime||0)*1000);
      }
    }
    if(this._workOfferAccepted && now >= this._until) this._completeWorkOutOffer();
  }

  _handlePalletOutWait(){
    if(this._pendingPalletUnload.length && this._palletUnloadIndex === 0 && !this._palletOffer && this._stateName !== 'palletOut_wait_1'){
      this._setState('palletOut_wait_1','WAIT');
    }
    if(!this._pendingPalletUnload.length){
      this._enterAgvOutWait();
      return;
    }
    if(this._downstreamPalletReady()) this._startPalletOutDown();
  }

  _handlePalletOutDown(now){
    if(!this._palletOffer){
      if(this._pendingPalletUnload.length) this._setState(`palletOut_wait_${this._palletUnloadIndex+1}`,'WAIT');
      else this._enterAgvOutWait();
      return;
    }
    if(!this._palletOfferAccepted){
      if(this._palletOfferArmed) this._emitPalletOffer();
      if(this._palletAccepted()){
        this._palletOfferAccepted = true;
        this._clearPalletOutputs();
      }else if(now >= this._until){
        this._until = now + Math.max(0,(this.properties.downTime||0)*1000);
      }
    }
    if(this._palletOfferAccepted && now >= this._until) this._completePalletOutOffer();
  }

  _handleAgvOutWait(now){
    if(!this._currentAgv){
      this._setState('agvIn_idle','IDLE');
      return;
    }
    if(this._shouldHoldDepartureForPalletPickup()){
      const holdSince = Number(this._agvOutWaitSince);
      const base = isFinite(holdSince) ? holdSince : now;
      if(now < base + CARRIER_ROUTE_PALLET_PICKUP_HOLD_MS) return;
    }
    this._plannedDepartureLane = this._selectDepartureLane(this._currentAgv, this._currentCarrierLane, false);
    if(this._downstreamAgvReady(this._currentAgv, this._plannedDepartureLane)) this._startAgvOutDown();
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
    this._trySpawnInitialCarrier();
    this._captureAgvInput();
    if(this._currentAgv) this._applyCarrierConfig(this._currentAgv);
    if(this._departingAgv) this._applyCarrierConfig(this._departingAgv);
    this._capturePalletInput();
    this._captureWorkInput();

    if(this._stateName === 'agv_process') this._handleAgvProcess(now);
    else if(this._stateName.startsWith('workIn_process')) this._handleWorkInProcess(now);
    else if(this._stateName.startsWith('workOut_wait')) this._handleWorkOutWait();
    else if(this._stateName.startsWith('workOut_down')) this._handleWorkOutDown(now);
    else if(this._stateName.startsWith('palletOut_wait')) this._handlePalletOutWait();
    else if(this._stateName.startsWith('palletOut_down')) this._handlePalletOutDown(now);
    else if(this._stateName === 'agvOut_wait') this._handleAgvOutWait(now);
    else if(this._stateName === 'agvOut_down') this._handleAgvOutDown(now);

    let settle = 0;
    while(settle++ < 4){
      const prev = this._stateName;
      if(this._stateName.startsWith('workIn_idle')) this._captureWorkInput();
      if(this._stateName.startsWith('workOut_wait')) this._handleWorkOutWait();
      else if(this._stateName.startsWith('palletOut_wait')) this._handlePalletOutWait();
      else if(this._stateName === 'agvOut_wait') this._handleAgvOutWait(now);
      if(this._stateName === prev) break;
      if(this._stateName.startsWith('workOut_down') || this._stateName.startsWith('palletOut_down') || this._stateName === 'agvOut_down') break;
    }

    this._refreshAgvWaitIcon();

    const sigCount = this.properties.sigExtra || 0;
    for(let i=0;i<sigCount;i++) this._emit(i, this._state);

    if(this._state !== 'IDLE' || this._currentAgv) this.setDirtyCanvas(true,true);
  }

  onPropertyChanged(name){
    const clamp = v=> Math.max(0, Math.round(parseFloat(v||0)*10)/10);
    if(name === 'initialCarrier'){
      this.properties.initialCarrier = this._normalizeInitialCarrierId();
      this._initialCarrierSpawned = false;
    }
    if(name === 'outSequence'){
      this._refreshOutSequence();
    }
    if(name === 'sigExtra') this._syncSignalOutputs();
    if(name === 'processTime') this.properties.processTime = clamp(this.properties.processTime);
    if(name === 'downTime') this.properties.downTime = clamp(this.properties.downTime);
  }

  onConfigure(){
    this.properties.initialCarrier = this._normalizeInitialCarrierId();
    this._refreshOutSequence();
    this._initialCarrierSpawned = !!(this._currentAgv || this._departingAgv);
    this._ensureMinCarrierPorts(1);
    this._ensureWorkLanePairs(0);
    this._ensurePalletLanePairs(1);
    this._syncSignalOutputs();
    window.refreshFlipIO(this);
  }
}

window.CarrierRouteNode = CarrierRouteNode;
