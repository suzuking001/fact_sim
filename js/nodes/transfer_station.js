// Generic load / unload / holder-to-holder transfer station.

const TRANSFER_STATION_DEFAULTS = {
  preset: 'work_to_pallet',
  operation: 'load',
  sourceKind: 'any',
  targetKind: 'pallet',
  itemKind: 'work',
  batchMode: 'until-full',
  quantity: 1,
  relationMode: 'inside',
  searchDepth: 'direct',
  processTime: 1,
  downTime: 0.2,
  autoRelease: true
};

const TRANSFER_STATION_PRESETS = {
  work_to_pallet: {
    operation: 'load', targetKind: 'pallet', itemKind: 'work',
    batchMode: 'until-full', relationMode: 'inside'
  },
  work_to_carrier: {
    operation: 'load', targetKind: 'carrier', itemKind: 'work',
    batchMode: 'until-full', relationMode: 'carried'
  },
  pallet_to_agv: {
    operation: 'load', targetKind: 'carrier', itemKind: 'pallet',
    batchMode: 'until-full', relationMode: 'towed'
  },
  pallet_to_container: {
    operation: 'load', targetKind: 'container', itemKind: 'pallet',
    batchMode: 'until-full', relationMode: 'inside'
  },
  container_to_ship: {
    operation: 'load', targetKind: 'ship', itemKind: 'container',
    batchMode: 'until-full', relationMode: 'loaded'
  },
  unload_one: {
    operation: 'unload', sourceKind: 'any', itemKind: 'any',
    batchMode: 'one', relationMode: 'inside'
  },
  unload_all: {
    operation: 'unload', sourceKind: 'any', itemKind: 'any',
    batchMode: 'all', relationMode: 'inside'
  },
  transfer_one: {
    operation: 'transfer', sourceKind: 'any', targetKind: 'any', itemKind: 'any',
    batchMode: 'one', relationMode: 'inside'
  },
  custom: {}
};

class TransferStationNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Transfer Station';
    this.size = [300, 190];
    this.resizable = true;

    this._sourceInIndex = this.inputs.length; this.addInput('sourceIn', 0);
    this._targetInIndex = this.inputs.length; this.addInput('targetIn', 0);
    this._itemInIndex = this.inputs.length; this.addInput('itemIn', 0);
    this._sourceOutIndex = this.outputs.length; this.addOutput('sourceOut', 0);
    this._targetOutIndex = this.outputs.length; this.addOutput('targetOut', 0);
    this._itemOutIndex = this.outputs.length; this.addOutput('itemOut', 0);

    this.properties = { ...TRANSFER_STATION_DEFAULTS };
    this._sourceHost = null;
    this._targetHost = null;
    this._pendingItem = null;
    this._activeItem = null;
    this._processed = 0;
    this._lastInputRefs = [null, null, null];
    this._releaseQueue = [];
    this._offer = null;
    this._phase = 'collect';
    this._until = 0;
    this._lastError = '';
    this._state = 'IDLE';
    this._stateName = 'collect';
    this._payload = null;
    this._pendingAgv = null;
    this._lastWorkInRef = null;
    this._lastPalletInRef = null;
    this._applyPreset(this.properties.preset, false);
    if(window.enableFlipIO) window.enableFlipIO(this);
  }

  _store(){
    return window.App && typeof window.App.entityStoreForGraph === 'function'
      ? window.App.entityStoreForGraph(this.graph)
      : null;
  }

  _kind(entity){
    return window.App && typeof window.App.inferEntityKind === 'function'
      ? window.App.inferEntityKind(entity)
      : String(entity?.entityKind || entity?.kind || 'entity').toLowerCase();
  }

  _kindMatches(entity, expected){
    const rule = String(expected || 'any').trim().toLowerCase();
    return rule === 'any' || rule === 'entity' || this._kind(entity) === rule;
  }

  _normalizeTime(value, fallback){
    const n = Math.round(Number(value) * 10) / 10;
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  _normalizeQuantity(value){
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  _applyPreset(name, dirty = true){
    const key = Object.prototype.hasOwnProperty.call(TRANSFER_STATION_PRESETS, name) ? name : 'custom';
    this.properties.preset = key;
    const values = TRANSFER_STATION_PRESETS[key] || {};
    for(const [prop, value] of Object.entries(values)) this.properties[prop] = value;
    this._syncPortLabels();
    if(dirty && typeof this.setDirtyCanvas === 'function') this.setDirtyCanvas(true, true);
  }

  _syncPortLabels(){
    if(!this.inputs || !this.outputs) return;
    const op = String(this.properties.operation || 'load').toLowerCase();
    const disabled = '#888';
    const enabled = '#475569';
    const activeInputs = op === 'load' ? [1, 2] : (op === 'unload' ? [0] : [0, 1]);
    const activeOutputs = op === 'load' ? [1] : (op === 'unload' ? [0, 2] : [0, 1]);
    this.inputs.forEach((port, index)=>{ if(port) port.color_on = port.color_off = activeInputs.includes(index) ? enabled : disabled; });
    this.outputs.forEach((port, index)=>{ if(port) port.color_on = port.color_off = activeOutputs.includes(index) ? enabled : disabled; });
  }

  getInspectorSchema(){
    return {
      preset: { type: 'select', label: 'Preset', options: [
        ['work_to_pallet', 'Work → Pallet'], ['work_to_carrier', 'Work → Carrier'],
        ['pallet_to_agv', 'Pallet → AGV'], ['pallet_to_container', 'Pallet → Container'],
        ['container_to_ship', 'Container → Ship'], ['unload_one', 'Unload one'],
        ['unload_all', 'Unload all'], ['transfer_one', 'Transfer one'], ['custom', 'Custom']
      ]},
      operation: { type: 'select', label: 'Operation', options: [['load', 'Load'], ['unload', 'Unload'], ['transfer', 'Transfer']] },
      sourceKind: { type: 'select', label: 'Source holder', options: ['any', 'pallet', 'carrier', 'container', 'ship'] },
      targetKind: { type: 'select', label: 'Target holder', options: ['any', 'pallet', 'carrier', 'container', 'ship'] },
      itemKind: { type: 'select', label: 'Moving entity', options: ['any', 'work', 'pallet', 'carrier', 'container'] },
      batchMode: { type: 'select', label: 'Amount', options: [['one', 'One'], ['count', 'Specified count'], ['until-full', 'Until full'], ['all', 'All']] },
      relationMode: { type: 'select', label: 'Relationship', options: [['inside', 'Inside'], ['on', 'On'], ['towed', 'Towed'], ['attached', 'Attached'], ['carried', 'Carried'], ['loaded', 'Loaded']] },
      searchDepth: { type: 'select', label: 'Search', options: [['direct', 'Direct children'], ['descendants', 'All descendants']] }
    };
  }

  getEntityRoots(){
    return [this._sourceHost, this._targetHost, this._pendingItem, this._activeItem]
      .filter((value, index, rows)=> value && rows.indexOf(value) === index);
  }

  _setState(kind, detail){
    this._state = String(kind || 'IDLE').toUpperCase();
    this._stateName = String(detail || kind || 'idle').toLowerCase();
    switch(this._state){
      case 'PROCESS': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
      case 'WAIT': this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
      case 'DOWN': this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
      default: this.color = '#8b5cf6'; this.bgcolor = '#f5f3ff'; break;
    }
    if(typeof window.applyNodeStateTheme === 'function') window.applyNodeStateTheme(this, this._state);
  }

  _markSelfDirty(){
    if(!this.graph) return;
    if(!(this.graph.__dirtyNodeIds instanceof Set)) this.graph.__dirtyNodeIds = new Set();
    this.graph.__dirtyNodeIds.add(this.id);
  }

  _operation(){
    const value = String(this.properties.operation || 'load').toLowerCase();
    return value === 'unload' || value === 'transfer' ? value : 'load';
  }

  _requiredHostSlot(slot){
    const op = this._operation();
    if(op === 'load') return slot === this._targetInIndex;
    if(op === 'unload') return slot === this._sourceInIndex;
    return slot === this._sourceInIndex || slot === this._targetInIndex;
  }

  _hostForSlot(slot){
    if(slot === this._sourceInIndex) return this._sourceHost;
    if(slot === this._targetInIndex) return this._targetHost;
    return null;
  }

  _expectedKindForSlot(slot){
    if(slot === this._sourceInIndex) return this.properties.sourceKind;
    if(slot === this._targetInIndex) return this.properties.targetKind;
    return this.properties.itemKind;
  }

  canAcceptEntityInput(slotIndex, entity){
    const slot = Number(slotIndex);
    if(!Number.isFinite(slot)) return false;
    if(this._phase !== 'collect' && this._phase !== 'ready') return false;
    if(this._offer || this._releaseQueue.length) return false;
    if(slot === this._itemInIndex){
      if(this._operation() !== 'load' || this._pendingItem) return false;
      if(!this._targetHost || !this._kindMatches(entity || { entityKind: this.properties.itemKind }, this.properties.itemKind)) return false;
      const store = this._store();
      if(!entity || !store) return true;
      store.register(entity);
      store.register(this._targetHost);
      return !!store.canAttach(entity, this._targetHost, { mode: this.properties.relationMode }).ok;
    }
    if(!this._requiredHostSlot(slot) || this._hostForSlot(slot)) return false;
    return !entity || this._kindMatches(entity, this._expectedKindForSlot(slot));
  }

  canAcceptWorkInput(slotIndex, work){
    return this.canAcceptEntityInput(slotIndex, work || { entityKind: 'work' });
  }

  canAcceptPalletInput(slotIndex, pallet){
    return this.canAcceptEntityInput(slotIndex, pallet || { entityKind: 'pallet' });
  }

  canAcceptAgv(slotIndex, agv){
    let slot = slotIndex;
    let entity = agv;
    if(typeof slotIndex !== 'number'){
      entity = slotIndex;
      slot = this._operation() === 'load' ? this._targetInIndex : this._sourceInIndex;
    }
    return this.canAcceptEntityInput(slot, entity || { entityKind: 'carrier' });
  }

  _captureInput(slot){
    const port = this.inputs && this.inputs[slot];
    if(!port || port.link == null){
      this._lastInputRefs[slot] = null;
      return null;
    }
    const entity = this.getInputData(slot);
    if(!entity){
      this._lastInputRefs[slot] = null;
      return null;
    }
    if(this._lastInputRefs[slot] === entity) return null;
    if(!this.canAcceptEntityInput(slot, entity)) return null;
    this._lastInputRefs[slot] = entity;
    if(!entity.__factAcceptedBy || typeof entity.__factAcceptedBy !== 'object') entity.__factAcceptedBy = {};
    entity.__factAcceptedBy[String(this.id)] = true;
    if(this.graph){
      if(!(this.graph.__dirtyNodeIds instanceof Set)) this.graph.__dirtyNodeIds = new Set();
      const linkId = this.inputs?.[slot]?.link;
      const originId = linkId == null ? null : this.graph.links?.[linkId]?.origin_id;
      if(originId != null) this.graph.__dirtyNodeIds.add(originId);
    }
    const store = this._store();
    if(store) store.register(entity);
    if(slot === this._sourceInIndex) this._sourceHost = entity;
    else if(slot === this._targetInIndex) this._targetHost = entity;
    else this._pendingItem = entity;
    this._payload = entity;
    this._pendingAgv = this._kind(entity) === 'carrier' ? entity : null;
    if(this._kind(entity) === 'work') this._lastWorkInRef = entity;
    if(this._kind(entity) === 'pallet') this._lastPalletInRef = entity;
    return entity;
  }

  _captureRequiredInputs(){
    const op = this._operation();
    if(op !== 'load') this._captureInput(this._sourceInIndex);
    if(op !== 'unload') this._captureInput(this._targetInIndex);
    if(op === 'load' && this._targetHost) this._captureInput(this._itemInIndex);
  }

  _hostsReady(){
    const op = this._operation();
    if(op === 'load') return !!this._targetHost;
    if(op === 'unload') return !!this._sourceHost;
    return !!this._sourceHost && !!this._targetHost;
  }

  _matchingItems(){
    const store = this._store();
    if(!store || !this._sourceHost) return [];
    const options = this.properties.searchDepth === 'descendants' ? { kind: this.properties.itemKind } : { kind: this.properties.itemKind };
    if(this.properties.searchDepth === 'descendants') return store.descendantsOf(this._sourceHost, options);
    return store.childrenOf(this._sourceHost, options);
  }

  _batchDone(){
    const mode = String(this.properties.batchMode || 'one').toLowerCase();
    if(mode === 'one') return this._processed >= 1;
    if(mode === 'count') return this._processed >= this._normalizeQuantity(this.properties.quantity);
    return false;
  }

  _targetCanTake(item){
    const store = this._store();
    if(!store || !this._targetHost || !item) return false;
    return !!store.canAttach(item, this._targetHost, { mode: this.properties.relationMode }).ok;
  }

  _startProcess(item){
    this._activeItem = item;
    this._phase = 'process';
    this._lastError = '';
    this._setState('PROCESS', `${this._operation()}_${this._kind(item)}`);
    const now = simNow();
    this._until = now + this._normalizeTime(this.properties.processTime, 1) * 1000;
  }

  _completeProcess(){
    const store = this._store();
    const op = this._operation();
    const item = this._activeItem;
    let result = { ok: false, reason: 'missing-store' };
    if(store && item){
      if(op === 'load') result = store.attach(item, this._targetHost, { mode: this.properties.relationMode });
      else if(op === 'transfer') result = store.transfer(item, this._sourceHost, this._targetHost, { mode: this.properties.relationMode });
      else result = store.detach(item);
    }
    if(!result.ok){
      this._lastError = String(result.reason || 'transfer-failed');
      this._activeItem = null;
      this._pendingItem = null;
      this._beginRelease();
      return;
    }
    if(op === 'unload'){
      this._beginOffer(this._itemOutIndex, item, ()=>{
        this._processed += 1;
        this._activeItem = null;
        this._afterItemComplete();
      });
      return;
    }
    this._processed += 1;
    this._activeItem = null;
    if(op === 'load') this._pendingItem = null;
    this._afterItemComplete();
  }

  _afterItemComplete(){
    if(this._batchDone()){
      this._beginRelease();
      return;
    }
    const op = this._operation();
    if(op === 'transfer'){
      const next = this._matchingItems()[0] || null;
      if(!next || !this._targetCanTake(next)){
        this._beginRelease();
        return;
      }
    }
    if(op === 'unload' && !this._matchingItems().length){
      this._beginRelease();
      return;
    }
    this._phase = 'ready';
    this._setState('IDLE', 'ready');
    this._markSelfDirty();
  }

  _outputHasLinks(slot){
    const output = this.outputs && this.outputs[slot];
    return !!(output && Array.isArray(output.links) && output.links.length);
  }

  _downstreamReady(slot, entity){
    const output = this.outputs && this.outputs[slot];
    if(!output || !Array.isArray(output.links) || !output.links.length) return true;
    for(const linkId of output.links){
      const link = this.graph?.links?.[linkId];
      const target = link && this.graph?.getNodeById ? this.graph.getNodeById(link.target_id) : null;
      if(!target) continue;
      if(typeof target.canAcceptEntityInput === 'function'){
        if(!target.canAcceptEntityInput(link.target_slot, entity)) return false;
        continue;
      }
      const kind = this._kind(entity);
      if(kind === 'carrier' && typeof target.canAcceptAgv === 'function'){
        if(!target.canAcceptAgv(link.target_slot, entity)) return false;
      }else if(kind === 'pallet' && typeof target.canAcceptPalletInput === 'function'){
        if(!target.canAcceptPalletInput(link.target_slot, entity)) return false;
      }else if(kind === 'work' && typeof target.canAcceptWorkInput === 'function'){
        if(!target.canAcceptWorkInput(link.target_slot, entity)) return false;
      }else if(typeof target._state !== 'undefined' && String(target._state).toUpperCase() !== 'IDLE'){
        return false;
      }
    }
    return true;
  }

  _targetHasReference(target, entity){
    if(!target) return true;
    const keys = ['_currentAgv', '_pendingAgv', '_currentWork', '_payload', '_pallet', '_pendingItem', '_activeItem', '_sourceHost', '_targetHost'];
    for(const key of keys) if(target[key] === entity) return true;
    const arrays = ['_queue', '_workQueue', '_palletQueue', '_pendingUnload', '_releaseQueue'];
    for(const key of arrays) if(Array.isArray(target[key]) && target[key].includes(entity)) return true;
    return false;
  }

  _offerAccepted(slot, entity){
    const output = this.outputs && this.outputs[slot];
    if(!output || !Array.isArray(output.links) || !output.links.length) return true;
    for(const linkId of output.links){
      const link = this.graph?.links?.[linkId];
      const target = link && this.graph?.getNodeById ? this.graph.getNodeById(link.target_id) : null;
      const acceptedBy = target && entity?.__factAcceptedBy && entity.__factAcceptedBy[String(target.id)];
      if(target && !acceptedBy && !this._targetHasReference(target, entity)) return false;
    }
    return true;
  }

  _beginOffer(slot, entity, onDone){
    if(!entity){ if(typeof onDone === 'function') onDone(); return; }
    if(!this._outputHasLinks(slot)){
      try{ this.setOutputData(slot, null); }catch(_e){}
      if(typeof onDone === 'function') onDone();
      return;
    }
    this._offer = { slot, entity, onDone, armed: false, armedAt: 0, until: 0 };
    this._phase = 'offer';
    this._setState('WAIT', 'handoff_wait');
    this._markSelfDirty();
  }

  _tickOffer(now){
    const offer = this._offer;
    if(!offer) return;
    if(!offer.armed){
      if(!this._downstreamReady(offer.slot, offer.entity)) return;
      try{ this.setOutputData(offer.slot, offer.entity); }catch(_e){}
      offer.armed = true;
      offer.armedAt = now;
      offer.until = now + Math.max(1, this._normalizeTime(this.properties.downTime, 0.2) * 1000);
      this._until = offer.until;
      this._setState('DOWN', 'handoff');
      return;
    }
    if(now < offer.until) return;
    try{ this.setOutputData(offer.slot, null); }catch(_e){}
    this._offer = null;
    const done = offer.onDone;
    if(typeof done === 'function') done();
  }

  _beginRelease(){
    if(this.properties.autoRelease === false){
      this._phase = 'ready';
      this._setState('WAIT', 'manual_release');
      return;
    }
    this._releaseQueue = [];
    const op = this._operation();
    if(op !== 'load' && this._sourceHost) this._releaseQueue.push({ slot: this._sourceOutIndex, entity: this._sourceHost, field: '_sourceHost' });
    if(op !== 'unload' && this._targetHost) this._releaseQueue.push({ slot: this._targetOutIndex, entity: this._targetHost, field: '_targetHost' });
    this._phase = 'release';
    this._markSelfDirty();
    this._advanceRelease();
  }

  _advanceRelease(){
    if(this._offer) return;
    const next = this._releaseQueue.shift();
    if(!next){
      this._resetCycle();
      return;
    }
    this._beginOffer(next.slot, next.entity, ()=>{
      this[next.field] = null;
      if(this._pendingAgv === next.entity) this._pendingAgv = null;
      this._phase = 'release';
      this._advanceRelease();
    });
  }

  _resetCycle(){
    this._sourceHost = null;
    this._targetHost = null;
    this._pendingItem = null;
    this._activeItem = null;
    this._payload = null;
    this._pendingAgv = null;
    this._processed = 0;
    this._releaseQueue = [];
    this._offer = null;
    this._phase = 'collect';
    this._setState('IDLE', 'collect');
  }

  _tickReady(){
    if(!this._hostsReady()) return;
    const op = this._operation();
    if(op === 'load'){
      if(this._pendingItem){
        if(this._targetCanTake(this._pendingItem)) this._startProcess(this._pendingItem);
        else this._beginRelease();
        return;
      }
      if(String(this.properties.batchMode).toLowerCase() === 'until-full'){
        const probe = { entityKind: this.properties.itemKind, id: '__capacity_probe__' };
        const store = this._store();
        if(store){
          store.register(probe, { scanLegacy: false });
          const canTake = store.canAttach(probe, this._targetHost, { mode: this.properties.relationMode }).ok;
          store.entities.delete(store.idOf(probe));
          if(!canTake) this._beginRelease();
        }
      }
      return;
    }

    const item = this._matchingItems()[0] || null;
    if(!item){
      this._beginRelease();
      return;
    }
    if(op === 'transfer' && !this._targetCanTake(item)){
      this._beginRelease();
      return;
    }
    this._startProcess(item);
  }

  onExecute(){
    const now = simNow();
    if(this._offer){
      this._tickOffer(now);
      return;
    }
    if(this._phase === 'release'){
      this._advanceRelease();
      return;
    }
    if(this._phase === 'process'){
      if(now >= this._until) this._completeProcess();
      return;
    }
    this._captureRequiredInputs();
    this._tickReady();
    if(this._state !== 'IDLE' || this._hostsReady()) this.setDirtyCanvas(true, true);
  }

  onPropertyChanged(name){
    if(name === 'preset') this._applyPreset(String(this.properties.preset || 'custom'));
    else if(['operation', 'sourceKind', 'targetKind', 'itemKind', 'batchMode', 'relationMode', 'searchDepth'].includes(name)){
      this.properties.preset = 'custom';
      this._syncPortLabels();
    }
    if(name === 'processTime') this.properties.processTime = this._normalizeTime(this.properties.processTime, 1);
    if(name === 'downTime') this.properties.downTime = this._normalizeTime(this.properties.downTime, 0.2);
    if(name === 'quantity') this.properties.quantity = this._normalizeQuantity(this.properties.quantity);
  }

  onConfigure(serializedNode){
    const serializedPreset = String(
      serializedNode?.properties?.preset ?? this.properties?.preset ?? 'custom'
    );
    this.properties = { ...TRANSFER_STATION_DEFAULTS, ...(this.properties || {}) };
    this.properties.processTime = this._normalizeTime(this.properties.processTime, 1);
    this.properties.downTime = this._normalizeTime(this.properties.downTime, 0.2);
    this.properties.quantity = this._normalizeQuantity(this.properties.quantity);
    if(serializedPreset !== 'custom' && Object.prototype.hasOwnProperty.call(TRANSFER_STATION_PRESETS, serializedPreset)){
      this._applyPreset(serializedPreset, false);
    }else{
      this.properties.preset = 'custom';
      this._syncPortLabels();
    }
  }

  onDrawForeground(ctx){
    const store = this._store();
    const label = (entity)=> entity ? (store?.labelOf(entity) || String(entity.id || entity.palletId || '?')) : '-';
    const lines = [
      `Mode: ${this._operation()} / ${this.properties.batchMode}`,
      `Source: ${label(this._sourceHost)}`,
      `Target: ${label(this._targetHost)}`,
      `Moving: ${this.properties.itemKind} (${this._processed})`,
      `Relation: ${this.properties.relationMode}`,
      this._lastError ? `Error: ${this._lastError}` : `State: ${this._stateName}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

window.TransferStationNode = TransferStationNode;
window.TRANSFER_STATION_PRESETS = TRANSFER_STATION_PRESETS;
