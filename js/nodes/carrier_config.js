// Carrier Config node: metadata-only configuration for one carrier.
// No connection ports. Carrier movement is driven only by Carrier Route links.

const CARRIER_CONFIG_DEFAULTS = {
  carrierId: 'Carrier-1',
  capacity: window.NODES_CONFIG?.carrierConfig?.capacity ?? window.NODES_CONFIG?.carrierHome?.capacity ?? 2,
  homeRoute: window.NODES_CONFIG?.carrierConfig?.homeRoute ?? '',
  sequence: window.NODES_CONFIG?.carrierConfig?.sequence ?? ''
};

class CarrierConfigNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Carrier Config';
    this.size = [300, 130];
    this.resizable = true;
    // Match Carrier Route idle palette for visual consistency.
    this.color = '#f1c40f';
    this.bgcolor = '#fff9db';

    this.properties = {
      carrierId: CARRIER_CONFIG_DEFAULTS.carrierId,
      capacity: CARRIER_CONFIG_DEFAULTS.capacity,
      homeRoute: CARRIER_CONFIG_DEFAULTS.homeRoute,
      sequence: CARRIER_CONFIG_DEFAULTS.sequence
    };

    this._parsedSequence = [];
    this._lastSequenceRaw = null;
    this._refreshSequence();
  }

  _normalizeCarrierId(){
    const text = String(this.properties.carrierId ?? '').trim();
    return text || `Carrier-${this.id ?? 'X'}`;
  }

  _normalizeCapacity(){
    const n = Math.round(Number(this.properties.capacity));
    if(!isFinite(n) || n < 1) return 1;
    return n;
  }

  _normalizeHomeRoute(){
    return String(this.properties.homeRoute ?? '').trim();
  }

  _parseSequence(raw){
    const tokens = String(raw ?? '')
      .replace(/\r/g, '\n')
      .split(/(?:,|\n|->)+/)
      .map((v)=> v.trim())
      .filter(Boolean);
    const seq = [];
    for(const token of tokens){
      const n = Number(token);
      if(!isFinite(n)) continue;
      const lane = Math.floor(n);
      if(lane >= 1) seq.push(lane);
    }
    return seq;
  }

  _refreshSequence(){
    const raw = String(this.properties.sequence ?? '');
    this._lastSequenceRaw = raw;
    this._parsedSequence = this._parseSequence(raw);
  }

  _ensureSequenceFresh(){
    const raw = String(this.properties.sequence ?? '');
    if(raw !== this._lastSequenceRaw) this._refreshSequence();
  }

  isForCarrierId(id){
    const mine = this._normalizeCarrierId();
    const other = String(id ?? '').trim();
    return !!other && mine === other;
  }

  applyToCarrier(agv){
    if(!agv || typeof agv !== 'object') return agv;
    if(!agv.meta || typeof agv.meta !== 'object') agv.meta = {};
    if(!Array.isArray(agv.cargo)) agv.cargo = [];
    const cap = this._normalizeCapacity();
    agv.capacity = cap;
    agv.meta.capacity = cap;
    agv.meta.carrierId = this._normalizeCarrierId();
    agv.meta.configNodeId = this.id;
    return agv;
  }

  _routeMatches(routeNode){
    if(!routeNode) return false;
    const raw = this._normalizeHomeRoute();
    if(!raw) return false;
    const target = raw.toLowerCase();
    const idText = String(routeNode.id ?? '').trim().toLowerCase();
    const titleText = String(routeNode.title ?? '').trim().toLowerCase();
    return target === idText || target === titleText;
  }

  isHomeRoute(routeNode){
    return this._routeMatches(routeNode);
  }

  _cursorKey(){
    return `carrierConfigCursor:${this.id ?? 'x'}`;
  }

  // Returns 0-based lane index.
  nextDispatchLane(agv, laneCount, fallbackLane = 0){
    const count = Math.max(1, Math.floor(Number(laneCount) || 1));
    const fallback = Math.max(0, Math.min(count - 1, Math.floor(Number(fallbackLane) || 0)));
    if(!agv || typeof agv !== 'object') return fallback;
    this.applyToCarrier(agv);
    this._ensureSequenceFresh();
    if(!this._parsedSequence.length) return fallback;
    if(!agv.meta || typeof agv.meta !== 'object') agv.meta = {};
    const key = this._cursorKey();
    let cursor = Number(agv.meta[key]);
    if(!isFinite(cursor) || cursor < 0) cursor = 0;
    const lane1 = this._parsedSequence[cursor % this._parsedSequence.length];
    agv.meta[key] = (cursor + 1) % this._parsedSequence.length;
    if(!isFinite(lane1)) return fallback;
    return Math.max(0, Math.min(count - 1, Math.floor(lane1) - 1));
  }

  onConfigure(){
    this.properties.carrierId = this._normalizeCarrierId();
    this.properties.capacity = this._normalizeCapacity();
    this.properties.homeRoute = this._normalizeHomeRoute();
    this._refreshSequence();
  }

  onPropertyChanged(name){
    if(name === 'carrierId') this.properties.carrierId = this._normalizeCarrierId();
    if(name === 'capacity') this.properties.capacity = this._normalizeCapacity();
    if(name === 'homeRoute') this.properties.homeRoute = this._normalizeHomeRoute();
    if(name === 'sequence') this._refreshSequence();
  }

  onExecute(){
    // Metadata-only node. No runtime stepping required.
  }

  onDrawForeground(ctx){
    this._ensureSequenceFresh();
    const home = this._normalizeHomeRoute() || '(not set)';
    const seq = this._parsedSequence.length ? this._parsedSequence.join(' -> ') : '(not set)';
    const lines = [
      `Carrier ID: ${this._normalizeCarrierId()}`,
      `Capacity: ${this._normalizeCapacity()}`,
      `Home Route: ${home}`,
      `Out sequence: ${seq}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

window.CarrierConfigNode = CarrierConfigNode;
// Backward compatibility for existing saved graphs.
window.CarrierHomeNode = CarrierConfigNode;
