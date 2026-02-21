// Carrier Config node: per-carrier settings (capacity + route sequence)

const CARRIER_CONFIG_DEFAULTS = {
  carrierId: 'Carrier-1',
  capacity: window.NODES_CONFIG?.carrierConfig?.capacity ?? 2,
  sequence: '',
  autoSpawn: (window.NODES_CONFIG?.carrierConfig?.autoSpawn ?? true) !== false
};

class CarrierConfigNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Carrier Config';
    this.size = [280, 135];
    this.resizable = true;

    this._agvInIndex = this.inputs.length;
    this.addInput('carrierIn', 'AGV');
    this._agvOutIndex = this.outputs.length;
    this.addOutput('carrierOut', 'AGV');

    this.properties = {
      carrierId: CARRIER_CONFIG_DEFAULTS.carrierId,
      capacity: CARRIER_CONFIG_DEFAULTS.capacity,
      sequence: CARRIER_CONFIG_DEFAULTS.sequence,
      autoSpawn: CARRIER_CONFIG_DEFAULTS.autoSpawn
    };

    this._parsedSequence = [];
    this._queue = [];
    this._offerAgv = null;
    this._lastAgvInRef = null;
    this._spawned = false;
    this._tick = 0;

    this._refreshSequence();
    if(window.enableFlipIO) window.enableFlipIO(this);
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
    a.meta.ownerConfigId = this.id;
    return a;
  }

  _hasAgvOutLink(){
    const out = this.outputs[this._agvOutIndex];
    return !!(out && out.links && out.links.length);
  }

  _downstreamReady(agv){
    const out = this.outputs[this._agvOutIndex];
    if(!out || !out.links) return false;
    for(const id of out.links){
      const link = this.graph.links[id];
      if(!link) continue;
      const target = this.graph.getNodeById(link.target_id);
      if(!target) continue;
      if(typeof target._state !== 'undefined' && target._state !== 'IDLE') return false;
      if(typeof target.canAcceptAgv === 'function' && !target.canAcceptAgv(agv)) return false;
    }
    return true;
  }

  _agvAccepted(agv){
    if(!agv) return false;
    const out = this.outputs[this._agvOutIndex];
    if(!out || !out.links) return false;
    for(const id of out.links){
      const link = this.graph.links[id];
      if(!link) continue;
      const target = this.graph.getNodeById(link.target_id);
      if(!target) continue;
      if(target._currentAgv === agv) return true;
      if(Array.isArray(target._queue) && target._queue.includes(agv)) return true;
      if(target._offerAgv === agv) return true;
    }
    return false;
  }

  canAcceptAgv(slotIndex, agv){
    let slot = slotIndex;
    let incoming = agv;
    if(typeof slotIndex !== 'number'){
      slot = this._agvInIndex;
      incoming = slotIndex;
    }
    if(slot !== this._agvInIndex) return false;
    if(!incoming) return true;
    if(this._offerAgv === incoming) return false;
    return !this._queue.includes(incoming);
  }

  _captureIncomingAgv(){
    const port = this.inputs[this._agvInIndex];
    if(!port || port.link == null){
      this._lastAgvInRef = null;
      return;
    }
    const agv = this.getInputData(this._agvInIndex);
    if(!agv){
      this._lastAgvInRef = null;
      return;
    }
    if(this._lastAgvInRef === agv) return;
    if(!this.canAcceptAgv(this._agvInIndex, agv)) return;

    const configured = this._applyConfigToAgv(agv);
    if(configured !== this._offerAgv && !this._queue.includes(configured)){
      this._queue.push(configured);
    }
    this._lastAgvInRef = agv;
  }

  _maybeSpawnAgv(){
    if(!this.properties.autoSpawn) return;
    if(this._spawned) return;
    const agv = this._applyConfigToAgv(new AGV(this._normalizeCarrierId(), this._normalizeCapacity()));
    this._queue.push(agv);
    this._spawned = true;
  }

  _applyConfigToQueued(){
    if(this._offerAgv) this._applyConfigToAgv(this._offerAgv);
    for(const agv of this._queue){
      this._applyConfigToAgv(agv);
    }
  }

  onConfigure(){
    this._refreshSequence();
    this.properties.capacity = this._normalizeCapacity();
    this.properties.carrierId = this._normalizeCarrierId();
    this._applyConfigToQueued();
  }

  onPropertyChanged(name){
    if(name === 'capacity') this.properties.capacity = this._normalizeCapacity();
    if(name === 'carrierId') this.properties.carrierId = this._normalizeCarrierId();
    if(name === 'sequence') this._refreshSequence();
    if(name === 'autoSpawn') this.properties.autoSpawn = !!this.properties.autoSpawn;
    this._applyConfigToQueued();
  }

  onExecute(){
    this._tick++;
    this._captureIncomingAgv();
    this._maybeSpawnAgv();

    if(this._offerAgv && this._agvAccepted(this._offerAgv)){
      if(this._queue.length && this._queue[0] === this._offerAgv) this._queue.shift();
      this._offerAgv = null;
      this.setOutputData(this._agvOutIndex, null);
    }

    if(!this._offerAgv && this._queue.length) this._offerAgv = this._queue[0];

    if(this._offerAgv && this._hasAgvOutLink() && this._downstreamReady(this._offerAgv)){
      this.setOutputData(this._agvOutIndex, this._offerAgv);
    }else{
      this.setOutputData(this._agvOutIndex, null);
    }

    this.setDirtyCanvas(true, true);
  }

  onDrawForeground(ctx){
    const seqText = this._parsedSequence.length ? this._parsedSequence.join(' -> ') : '(not set)';
    const lines = [
      `Carrier: ${this._normalizeCarrierId()} cap=${this._normalizeCapacity()}`,
      `Sequence: ${seqText}`,
      `Queue: ${this._queue.length}${this._offerAgv ? ' (dispatching)' : ''}`,
      `Auto spawn: ${this.properties.autoSpawn ? 'ON' : 'OFF'} / spawned=${this._spawned}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

window.CarrierConfigNode = CarrierConfigNode;
