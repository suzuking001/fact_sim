// Carrier Config node: metadata-only configuration for one carrier.
// No connection ports. Carrier movement is driven only by Carrier Route links.

const CARRIER_CONFIG_DEFAULTS = {
  carrierId: 'Carrier-1',
  capacity: window.NODES_CONFIG?.carrierConfig?.capacity ?? window.NODES_CONFIG?.carrierHome?.capacity ?? 2
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
      capacity: CARRIER_CONFIG_DEFAULTS.capacity
    };
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

  onConfigure(){
    this.properties.carrierId = this._normalizeCarrierId();
    this.properties.capacity = this._normalizeCapacity();
    if(Object.prototype.hasOwnProperty.call(this.properties, 'homeRoute')) delete this.properties.homeRoute;
    if(Object.prototype.hasOwnProperty.call(this.properties, 'sequence')) delete this.properties.sequence;
  }

  onPropertyChanged(name){
    if(name === 'carrierId') this.properties.carrierId = this._normalizeCarrierId();
    if(name === 'capacity') this.properties.capacity = this._normalizeCapacity();
  }

  onExecute(){
    // Metadata-only node. No runtime stepping required.
  }

  onDrawForeground(ctx){
    const lines = [
      `Carrier ID: ${this._normalizeCarrierId()}`,
      `Capacity: ${this._normalizeCapacity()}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

window.CarrierConfigNode = CarrierConfigNode;
// Backward compatibility for existing saved graphs.
window.CarrierHomeNode = CarrierConfigNode;
