// Pallet Carrier Config node: metadata-only configuration for pallet carriers.
// No connection ports. Carrier movement is driven by Carrier Route links.

const PALLET_CARRIER_CONFIG_DEFAULTS = {
  carrierId: 'Carrier-1',
  palletCapacity: window.NODES_CONFIG?.palletCarrierConfig?.palletCapacity ?? 2,
  palletWorkCapacity: window.NODES_CONFIG?.palletCarrierConfig?.palletWorkCapacity ?? 6,
  initialPalletIds: window.NODES_CONFIG?.palletCarrierConfig?.initialPalletIds ?? 'P-1'
};

class PalletCarrierConfigNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Pallet Carrier Config';
    this.size = [320, 150];
    this.resizable = true;
    this.color = '#ececf2';
    this.bgcolor = '#ffffff';
    this.boxcolor = '#7c3aed';
    this.properties = {
      carrierId: PALLET_CARRIER_CONFIG_DEFAULTS.carrierId,
      palletCapacity: PALLET_CARRIER_CONFIG_DEFAULTS.palletCapacity,
      palletWorkCapacity: PALLET_CARRIER_CONFIG_DEFAULTS.palletWorkCapacity,
      initialPalletIds: PALLET_CARRIER_CONFIG_DEFAULTS.initialPalletIds
    };
  }

  _normalizeCarrierId(){
    const text = String(this.properties.carrierId ?? '').trim();
    return text || `Carrier-${this.id ?? 'X'}`;
  }

  _normalizeCount(v, fallback = 1){
    const n = Math.round(Number(v));
    if(!isFinite(n) || n < 1) return Math.max(1, Math.round(Number(fallback) || 1));
    return n;
  }

  _parseInitialPalletIds(){
    const tokens = String(this.properties.initialPalletIds ?? '')
      .replace(/\r/g, '\n')
      .split(/(?:,|\n)+/)
      .map((s)=> String(s || '').trim())
      .filter(Boolean);
    const seen = new Set();
    const out = [];
    for(const id of tokens){
      if(seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  getCarrierMode(){
    return 'pallet';
  }

  isForCarrierId(id){
    const mine = this._normalizeCarrierId();
    const other = String(id ?? '').trim();
    return !!other && mine === other;
  }

  _normalizePalletObject(pallet, fallbackId, fallbackWorkCap){
    const src = (pallet && typeof pallet === 'object') ? pallet : {};
    const palletId = String(src.palletId ?? src.id ?? fallbackId ?? '').trim() || `P-${Math.random().toString(36).slice(2, 8)}`;
    const cap = this._normalizeCount(src.capacity, fallbackWorkCap);
    const works = Array.isArray(src.works) ? src.works.slice(0, cap) : [];
    return { palletId, capacity: cap, works };
  }

  applyToCarrier(agv){
    if(!agv || typeof agv !== 'object') return agv;
    if(!agv.meta || typeof agv.meta !== 'object') agv.meta = {};
    if(!Array.isArray(agv.cargo)) agv.cargo = [];

    const carrierId = this._normalizeCarrierId();
    const palletCapacity = this._normalizeCount(this.properties.palletCapacity, PALLET_CARRIER_CONFIG_DEFAULTS.palletCapacity);
    const palletWorkCapacity = this._normalizeCount(this.properties.palletWorkCapacity, PALLET_CARRIER_CONFIG_DEFAULTS.palletWorkCapacity);
    const initialIds = this._parseInitialPalletIds();

    agv.meta.carrierMode = 'pallet';
    agv.meta.carrierId = carrierId;
    agv.meta.configNodeId = this.id;
    agv.meta.palletCapacity = palletCapacity;
    agv.meta.palletWorkCapacity = palletWorkCapacity;
    agv.meta.capacity = 0;

    if(!Array.isArray(agv.pallets)) agv.pallets = [];

    const normalized = [];
    for(let i = 0; i < agv.pallets.length; i++){
      const src = agv.pallets[i];
      const fallbackId = initialIds[i] || `P-${i + 1}`;
      normalized.push(this._normalizePalletObject(src, fallbackId, palletWorkCapacity));
      if(normalized.length >= palletCapacity) break;
    }
    agv.pallets = normalized;

    if(!agv.meta.__palletSeeded){
      if(agv.pallets.length === 0 && initialIds.length){
        for(let i = 0; i < initialIds.length && agv.pallets.length < palletCapacity; i++){
          agv.pallets.push({
            palletId: initialIds[i],
            capacity: palletWorkCapacity,
            works: []
          });
        }
      }
      agv.meta.__palletSeeded = true;
    }

    if(agv.pallets.length > palletCapacity){
      agv.pallets.length = palletCapacity;
    }

    let workCapSum = 0;
    for(const pallet of agv.pallets){
      workCapSum += this._normalizeCount(pallet?.capacity, palletWorkCapacity);
    }
    agv.capacity = Math.max(1, workCapSum);
    agv.meta.capacity = agv.capacity;
    agv.cargo.length = 0;
    return agv;
  }

  onConfigure(){
    this.properties.carrierId = this._normalizeCarrierId();
    this.properties.palletCapacity = this._normalizeCount(this.properties.palletCapacity, PALLET_CARRIER_CONFIG_DEFAULTS.palletCapacity);
    this.properties.palletWorkCapacity = this._normalizeCount(this.properties.palletWorkCapacity, PALLET_CARRIER_CONFIG_DEFAULTS.palletWorkCapacity);
    this.properties.initialPalletIds = this._parseInitialPalletIds().join(',');
  }

  onPropertyChanged(name){
    if(name === 'carrierId') this.properties.carrierId = this._normalizeCarrierId();
    if(name === 'palletCapacity') this.properties.palletCapacity = this._normalizeCount(this.properties.palletCapacity, PALLET_CARRIER_CONFIG_DEFAULTS.palletCapacity);
    if(name === 'palletWorkCapacity') this.properties.palletWorkCapacity = this._normalizeCount(this.properties.palletWorkCapacity, PALLET_CARRIER_CONFIG_DEFAULTS.palletWorkCapacity);
    if(name === 'initialPalletIds') this.properties.initialPalletIds = this._parseInitialPalletIds().join(',');
  }

  onExecute(){
    // Metadata-only node. No runtime stepping required.
  }

  onDrawForeground(ctx){
    const ids = this._parseInitialPalletIds();
    const lines = [
      `Carrier ID: ${this._normalizeCarrierId()}`,
      `Pallet capacity: ${this._normalizeCount(this.properties.palletCapacity, PALLET_CARRIER_CONFIG_DEFAULTS.palletCapacity)}`,
      `Work / pallet: ${this._normalizeCount(this.properties.palletWorkCapacity, PALLET_CARRIER_CONFIG_DEFAULTS.palletWorkCapacity)}`,
      `Initial pallets: ${ids.length ? ids.join(', ') : '(none)'}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

window.PalletCarrierConfigNode = PalletCarrierConfigNode;
