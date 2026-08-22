// Source for one reusable, arbitrarily nested transport entity tree.
// Contents syntax (one path per line):
//   pallet:P-1[6]/work:W-1
//   pallet:P-1[6]/work:W-2

const ENTITY_SOURCE_DEFAULTS = {
  rootKind: 'container',
  rootId: 'Container-1',
  capacity: 20,
  accepts: 'pallet',
  initialContents: 'pallet:P-1[6]/work:W-1\npallet:P-1[6]/work:W-2'
};

class EntitySourceNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Entity Source';
    this.size = [280, 165];
    this.resizable = true;
    this._entityOutIndex = this.outputs.length;
    this.addOutput('entityOut', 0);
    this.properties = { ...ENTITY_SOURCE_DEFAULTS };
    this._rootEntity = null;
    this._consumed = false;
    this._offered = false;
    this._lastError = '';
    this._state = 'IDLE';
    this._stateName = 'ready';
    this._buildRoot();
    if(window.enableFlipIO) window.enableFlipIO(this);
  }

  _normalizeKind(value){
    const kind = String(value || 'entity').trim().toLowerCase();
    return kind === 'agv' ? 'carrier' : (kind || 'entity');
  }

  _normalizeCapacity(value, fallback = 0){
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 0 ? n : Math.max(0, Number(fallback) || 0);
  }

  _defaultAccepts(kind){
    switch(this._normalizeKind(kind)){
      case 'pallet': return ['work'];
      case 'carrier': return ['work', 'pallet', 'container'];
      case 'container': return ['pallet', 'container'];
      case 'ship': return ['container'];
      default: return [];
    }
  }

  _makeEntity(kind, id, capacity){
    const normalizedKind = this._normalizeKind(kind);
    const entity = {
      id: String(id || `${normalizedKind}-${Math.random().toString(36).slice(2, 7)}`),
      entityKind: normalizedKind,
      contents: []
    };
    const cap = this._normalizeCapacity(capacity, 0);
    if(cap > 0) entity.maxChildren = cap;
    const accepts = this._defaultAccepts(normalizedKind);
    if(accepts.length) entity.accepts = accepts;
    if(normalizedKind === 'work') delete entity.contents;
    return entity;
  }

  _parseSegment(text){
    const raw = String(text || '').trim();
    const match = raw.match(/^([^:\[\]]+)\s*:\s*([^\[\]]+?)(?:\[(\d+)\])?$/);
    if(!match) return null;
    return {
      kind: this._normalizeKind(match[1]),
      id: String(match[2] || '').trim(),
      capacity: match[3] == null ? 0 : this._normalizeCapacity(match[3], 0)
    };
  }

  _relationMode(parent, child){
    const parentKind = this._normalizeKind(parent?.entityKind);
    const childKind = this._normalizeKind(child?.entityKind);
    if(parentKind === 'carrier' && childKind === 'pallet') return 'towed';
    if(parentKind === 'carrier') return 'carried';
    if(parentKind === 'ship' && childKind === 'container') return 'loaded';
    return 'inside';
  }

  _buildRoot(){
    const rootKind = this._normalizeKind(this.properties.rootKind);
    const rootId = String(this.properties.rootId || '').trim() || `${rootKind}-1`;
    const root = this._makeEntity(rootKind, rootId, this.properties.capacity);
    const accepts = String(this.properties.accepts || '').split(/[\s,;|]+/).map((v)=>this._normalizeKind(v)).filter((v)=>v && v !== 'entity');
    if(accepts.length) root.accepts = accepts;

    const byPath = new Map();
    byPath.set('', root);
    const lines = String(this.properties.initialContents || '').replace(/\r/g, '').split('\n');
    for(let lineIndex = 0; lineIndex < lines.length; lineIndex++){
      const line = lines[lineIndex].trim();
      if(!line || line.startsWith('#')) continue;
      const segments = line.split('/').map((part)=>this._parseSegment(part)).filter(Boolean);
      if(!segments.length){
        this._lastError = `Invalid contents line ${lineIndex + 1}`;
        continue;
      }
      let parent = root;
      let path = '';
      for(const segment of segments){
        path += `/${segment.kind}:${segment.id}`;
        let entity = byPath.get(path);
        if(!entity){
          entity = this._makeEntity(segment.kind, segment.id, segment.capacity);
          entity.relationMode = this._relationMode(parent, entity);
          if(!Array.isArray(parent.contents)) parent.contents = [];
          parent.contents.push(entity);
          byPath.set(path, entity);
        }
        parent = entity;
      }
    }
    this._rootEntity = root;
    this._consumed = false;
    this._offered = false;
    this._state = 'IDLE';
    this._stateName = 'ready';
  }

  getInspectorSchema(){
    return {
      rootKind: { type: 'select', label: 'Root kind', options: ['pallet', 'carrier', 'container', 'ship'] }
    };
  }

  getEntityRoots(){
    return this._rootEntity ? [this._rootEntity] : [];
  }

  _store(){
    return window.App && typeof window.App.entityStoreForGraph === 'function'
      ? window.App.entityStoreForGraph(this.graph)
      : null;
  }

  _downstreamReady(entity){
    const output = this.outputs && this.outputs[this._entityOutIndex];
    if(!output || !Array.isArray(output.links) || !output.links.length) return false;
    for(const linkId of output.links){
      const link = this.graph?.links?.[linkId];
      const target = link && this.graph?.getNodeById ? this.graph.getNodeById(link.target_id) : null;
      if(!target) continue;
      if(typeof target.canAcceptEntityInput === 'function'){
        if(!target.canAcceptEntityInput(link.target_slot, entity)) return false;
      }else if(typeof target._state !== 'undefined' && String(target._state).toUpperCase() !== 'IDLE'){
        return false;
      }
    }
    return true;
  }

  _accepted(entity){
    const output = this.outputs && this.outputs[this._entityOutIndex];
    if(!output || !Array.isArray(output.links) || !output.links.length) return false;
    for(const linkId of output.links){
      const link = this.graph?.links?.[linkId];
      const target = link && this.graph?.getNodeById ? this.graph.getNodeById(link.target_id) : null;
      if(!target) continue;
      const acceptedBy = entity && entity.__factAcceptedBy && entity.__factAcceptedBy[String(target.id)];
      const accepted = acceptedBy || target._sourceHost === entity || target._targetHost === entity ||
        target._pendingItem === entity || target._payload === entity || target._currentAgv === entity;
      if(!accepted) return false;
    }
    return true;
  }

  onExecute(){
    if(this._consumed || !this._rootEntity){
      this.setOutputData(this._entityOutIndex, null);
      return;
    }
    const store = this._store();
    if(store) store.syncLegacyTree(this._rootEntity);
    if(!this._offered){
      if(!this._downstreamReady(this._rootEntity)){
        this.setOutputData(this._entityOutIndex, null);
        this._stateName = 'waiting_downstream';
        return;
      }
      this.setOutputData(this._entityOutIndex, this._rootEntity);
      this._offered = true;
      this._state = 'WAIT';
      this._stateName = 'offering';
      if(this.graph){
        if(!(this.graph.__dirtyNodeIds instanceof Set)) this.graph.__dirtyNodeIds = new Set();
        this.graph.__dirtyNodeIds.add(this.id);
      }
      return;
    }
    this.setOutputData(this._entityOutIndex, this._rootEntity);
    if(this._accepted(this._rootEntity)){
      this.setOutputData(this._entityOutIndex, null);
      this._consumed = true;
      this._state = 'IDLE';
      this._stateName = 'sent';
    }
  }

  onPropertyChanged(name){
    if(name === 'capacity') this.properties.capacity = this._normalizeCapacity(this.properties.capacity, ENTITY_SOURCE_DEFAULTS.capacity);
    this._buildRoot();
    if(typeof this.setDirtyCanvas === 'function') this.setDirtyCanvas(true, true);
  }

  onConfigure(){
    this.properties = { ...ENTITY_SOURCE_DEFAULTS, ...(this.properties || {}) };
    this.properties.capacity = this._normalizeCapacity(this.properties.capacity, ENTITY_SOURCE_DEFAULTS.capacity);
    this._buildRoot();
  }

  onDrawForeground(ctx){
    const store = this._store();
    if(store && this._rootEntity) store.syncLegacyTree(this._rootEntity);
    const count = store && this._rootEntity ? store.descendantsOf(this._rootEntity).length : 0;
    const lines = [
      `Root: ${this.properties.rootKind}:${this.properties.rootId}`,
      `Nested entities: ${count}`,
      `Capacity: ${this.properties.capacity}`,
      `Accepts: ${this.properties.accepts || '(any)'}`,
      `State: ${this._stateName}`,
      this._lastError ? `Error: ${this._lastError}` : 'Path format: kind:id[capacity]/...'
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

window.EntitySourceNode = EntitySourceNode;
