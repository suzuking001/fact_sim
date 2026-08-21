// One persisted node type with data-driven presets. Legacy behavior is bridged
// only for migrated graphs; newly-created nodes use the shared entity/rule path.

(function(root){
  'use strict';

  const App = root.App || (root.App = {});

  const PRESETS = Object.freeze({
    basic:       { title: 'Basic Node', category: 'Advanced', entity: true, processTime: 0, contentCapacity: 1 },
    machine:     { title: 'Machine', category: 'Processing', entity: true, processTime: 2, contentCapacity: 1 },
    inspection:  { title: 'Inspection', category: 'Processing', entity: true, processTime: 2, contentCapacity: 1 },
    buffer:      { title: 'Buffer', category: 'Storage', entity: true, processTime: 0, contentCapacity: 10 },
    conveyor:    { title: 'Conveyor', category: 'Handling', entity: true, processTime: 1, contentCapacity: 1 },
    router:      { title: 'Router', category: 'Flow Control', entity: true, processTime: 0, contentCapacity: 1 },
    pack:        { title: 'Pack', category: 'Handling', entity: true, processTime: 1, contentCapacity: 2 },
    unpack:      { title: 'Unpack', category: 'Handling', entity: true, processTime: 1, contentCapacity: 1 },
    source:      { title: 'Source', category: 'System', entity: true, processTime: 0, contentCapacity: 1000000 },
    sink:        { title: 'Sink', category: 'System', entity: true, processTime: 0, contentCapacity: 1000000 },
    split:       { title: 'Split', category: 'Compatibility', entity: true, processTime: 0, contentCapacity: 1 },
    merge:       { title: 'Merge', category: 'Compatibility', entity: true, processTime: 0, contentCapacity: 2 },
    join:        { title: 'Join', category: 'Compatibility', entity: true, processTime: 0, contentCapacity: 2 },
    shuttle:     { title: 'Shuttle Stage', category: 'Handling', entity: true, processTime: 1, contentCapacity: 1 },
    carrier_route:{ title: 'Carrier Route', category: 'Compatibility', entity: true, processTime: 1, contentCapacity: 1 },
    station:     { title: 'Station', category: 'Compatibility', entity: true, processTime: 1, contentCapacity: 2 },
    transfer:    { title: 'Transfer', category: 'Compatibility', entity: true, processTime: 1, contentCapacity: 2 },
    signal:      { title: 'Signal', category: 'Utility', entity: false, processTime: 0, contentCapacity: 0 },
    note:        { title: 'Note', category: 'Utility', entity: false, processTime: 0, contentCapacity: 0 }
  });

  const LEGACY_TO_PRESET = Object.freeze({
    'factory/source': 'source',
    'factory/entitysource': 'source',
    'factory/equip': 'machine',
    'factory/branch': 'router',
    'factory/split': 'split',
    'factory/merge': 'merge',
    'factory/merge2': 'merge',
    'factory/join': 'join',
    'factory/shuttle_stage': 'shuttle',
    'factory/agvroute': 'carrier_route',
    'factory/carrierroute': 'carrier_route',
    'factory/station': 'station',
    'factory/transferstation': 'transfer',
    'factory/sink': 'sink',
    'factory/signal': 'signal',
    'factory/note': 'note'
  });

  const CONFIG_TYPES = new Set([
    'factory/carrierconfig', 'factory/carrierhome',
    'factory/palletcarrierconfig', 'factory/palletcarrier'
  ]);

  function isObject(value){ return !!value && typeof value === 'object' && !Array.isArray(value); }
  function clone(value, fallback){ try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return fallback; } }
  function text(value){ return String(value == null ? '' : value).trim(); }
  function nowMs(){ return typeof root.simNow === 'function' ? Number(root.simNow()) || 0 : 0; }

  function normalizeSerializedVector(value){
    if(Array.isArray(value)) return value;
    if(value && typeof value === 'object'){
      const x = Number(value[0]);
      const y = Number(value[1]);
      if(Number.isFinite(x) && Number.isFinite(y)) return [x, y];
    }
    return value;
  }

  function restoreSerializedGeometry(node, serializedNode){
    if(!node || !serializedNode) return;
    const pos = normalizeSerializedVector(serializedNode.pos);
    const size = normalizeSerializedVector(serializedNode.size);
    if(Array.isArray(pos)){
      if(node.pos && typeof node.pos.set === 'function') node.pos.set(pos.slice(0, 2));
      else node.pos = pos.slice(0, 2);
    }
    if(Array.isArray(size)){
      if(node.size && typeof node.size.set === 'function') node.size.set(size.slice(0, 2));
      else node.size = size.slice(0, 2);
    }
  }

  function ensurePortIds(node){
    const assign = (rows, prefix)=>{
      (Array.isArray(rows) ? rows : []).forEach((port, index)=>{
        if(!port) return;
        if(!port.portId) port.portId = `${prefix}-${index + 1}`;
      });
    };
    assign(node?.inputs, 'in');
    assign(node?.outputs, 'out');
  }

  function portIndexById(rows, portId){
    if(!Array.isArray(rows)) return -1;
    const wanted = text(portId);
    if(!wanted) return rows.length ? 0 : -1;
    return rows.findIndex((port)=>text(port?.portId) === wanted);
  }

  function legacyCtor(type){
    const info = root.LiteGraph?.registered_node_types?.[type];
    if(!info) return null;
    return typeof info === 'function' ? info : (typeof info.class === 'function' ? info.class : null);
  }

  function installLegacyMethods(target, ctor){
    let proto = ctor?.prototype;
    // Lifecycle methods stay behind BasicNode's dispatch layer. Every other
    // method must shadow the generic implementation: several legacy nodes use
    // helper names such as `_store` and `canAcceptWorkInput`, which otherwise
    // accidentally resolve to BasicNode helpers with different semantics.
    const blocked = new Set([
      'constructor', 'onExecute', 'onConfigure', 'onSerialize',
      'onPropertyChanged', 'onDrawForeground', 'getInspectorSchema',
      'getEntityRoots'
    ]);
    while(proto && proto !== root.LiteGraph?.LGraphNode?.prototype && proto !== Object.prototype){
      for(const name of Object.getOwnPropertyNames(proto)){
        if(blocked.has(name) || typeof proto[name] !== 'function') continue;
        const method = proto[name];
        Object.defineProperty(target, name, {
          configurable: true,
          writable: true,
          value: function(){ return method.apply(this, arguments); }
        });
      }
      proto = Object.getPrototypeOf(proto);
    }
  }

  class BasicNode extends root.LiteGraph.LGraphNode{
    constructor(){
      super();
      this.title = 'Basic Node';
      this.size = [260, 170];
      this.addInput('entityIn', 0);
      this.addOutput('entityOut', 0);
      ensurePortIds(this);
      this.properties = {
        basicNodeVersion: 1,
        presetId: 'basic',
        processTime: 0,
        contentCapacity: 1,
        initialContents: [],
        inputRules: [],
        outputRules: [],
        selection: 'first-available',
        stateMachine: { initialState: 'IDLE', states: ['IDLE', 'PROCESS', 'WAIT', 'DOWN'], transitions: [] }
      };
      this._state = 'IDLE';
      this._stateName = 'idle';
      this._until = 0;
      this._activeRoot = null;
      this._activeTarget = null;
      this._lastInputRefs = [];
      this._offer = null;
      this._processComplete = false;
      this._payload = null;
      this._currentWork = null;
      this._pendingTransfer = null;
      this._incomingPayload = null;
      this._transferHold = false;
      this._lastInRef = null;
      this._legacyPrototype = null;
      this._legacyConfigured = false;
      if(root.enableFlipIO) root.enableFlipIO(this);
    }

    _store(){ return typeof App.runtimeInstancesForGraph === 'function' ? App.runtimeInstancesForGraph(this.graph) : null; }
    _preset(){ return PRESETS[this.properties?.presetId] || PRESETS.basic; }
    hasEntityContents(){ return this._preset().entity !== false; }

    configure(serializedNode){
      const normalizedNode = serializedNode && typeof serializedNode === 'object'
        ? {
            ...serializedNode,
            pos: normalizeSerializedVector(serializedNode.pos),
            size: normalizeSerializedVector(serializedNode.size)
          }
        : serializedNode;
      this._isConfiguring = true;
      try{
        return super.configure(normalizedNode);
      }finally{
        this._isConfiguring = false;
      }
    }

    applyPreset(presetId, preserveTitle){
      const id = Object.prototype.hasOwnProperty.call(PRESETS, presetId) ? presetId : 'basic';
      const preset = PRESETS[id];
      this.properties = { ...(this.properties || {}), basicNodeVersion: 1, presetId: id };
      if(!Number.isFinite(Number(this.properties.processTime))) this.properties.processTime = preset.processTime;
      if(!Number.isFinite(Number(this.properties.contentCapacity))) this.properties.contentCapacity = preset.contentCapacity;
      if(!Array.isArray(this.properties.initialContents)) this.properties.initialContents = [];
      if(!Array.isArray(this.properties.inputRules)) this.properties.inputRules = [];
      if(!Array.isArray(this.properties.outputRules)) this.properties.outputRules = [];
      if(id === 'shuttle' && !text(this.properties.shuttleGroupId)){
        this.properties.shuttleGroupId = 'shuttle-1';
      }
      if(!preserveTitle) this.title = preset.title;
      this._ensurePresetPorts();
      if(id === 'shuttle') this._applyShuttleStateColor();
      return this;
    }

    _ensurePresetPorts(){
      if(this.properties?.legacySourceType){ ensurePortIds(this); return; }
      const id = this.properties?.presetId;
      const desiredInputs = id === 'source' || id === 'note' ? 0 : (id === 'pack' ? 2 : 1);
      const desiredOutputs = id === 'sink' || id === 'note' ? 0 : (id === 'unpack' || id === 'router' ? 2 : 1);
      while(this.inputs.length < desiredInputs) this.addInput(`entityIn${this.inputs.length + 1}`, 0);
      while(this.outputs.length < desiredOutputs) this.addOutput(`entityOut${this.outputs.length + 1}`, 0);
      while(this.inputs.length > desiredInputs) this.removeInput(this.inputs.length - 1);
      while(this.outputs.length > desiredOutputs) this.removeOutput(this.outputs.length - 1);
      ensurePortIds(this);
    }

    _configureLegacy(serializedNode){
      const type = text(this.properties?.legacySourceType);
      if(!type || type === 'factory/basic') return false;
      const ctor = legacyCtor(type);
      if(!ctor) return false;
      let temp = null;
      try{ temp = new ctor(); }catch(_e){ temp = null; }
      if(temp){
        if(isObject(temp.properties)){
          this.properties = {
            ...clone(temp.properties, {}),
            ...(this.properties || {})
          };
        }
        for(const key of Object.keys(temp)){
          if(['id', 'pos', 'size', 'inputs', 'outputs', 'properties', 'graph', 'title', 'type'].includes(key)) continue;
          if(typeof temp[key] === 'function') continue;
          this[key] = temp[key];
        }
      }
      installLegacyMethods(this, ctor);
      this._legacyPrototype = ctor.prototype;
      if(typeof ctor.prototype.onConfigure === 'function'){
        try{ ctor.prototype.onConfigure.call(this, serializedNode); }catch(err){ console.error(err); }
      }
      this._legacyConfigured = true;
      ensurePortIds(this);
      return true;
    }

    onConfigure(serializedNode){
      this.properties = { ...(this.properties || {}), basicNodeVersion: 1 };
      if(!this.properties.presetId) this.properties.presetId = 'basic';
      if(this._configureLegacy(serializedNode)){
        restoreSerializedGeometry(this, serializedNode);
        return;
      }
      this.applyPreset(this.properties.presetId, true);
      this._state = this.properties?.stateMachine?.initialState || 'IDLE';
      this._stateName = String(this._state).toLowerCase();
      restoreSerializedGeometry(this, serializedNode);
    }

    onSerialize(serialized){
      serialized.type = 'factory/basic';
      ensurePortIds(this);
      serialized.inputs = clone(this.inputs, serialized.inputs || []);
      serialized.outputs = clone(this.outputs, serialized.outputs || []);
      serialized.properties = clone(this.properties, {});
    }

    onPropertyChanged(name){
      if(this._isConfiguring) return;
      if(this._legacyPrototype && typeof this._legacyPrototype.onPropertyChanged === 'function'){
        return this._legacyPrototype.onPropertyChanged.call(this, name);
      }
      if(name === 'presetId') this.applyPreset(this.properties.presetId, false);
      if(name === 'processTime') this.properties.processTime = Math.max(0, Number(this.properties.processTime) || 0);
      if(name === 'contentCapacity') this.properties.contentCapacity = Math.max(0, Math.round(Number(this.properties.contentCapacity) || 0));
      if(name === 'shuttleGroupId'){
        this.properties.shuttleGroupId = text(this.properties.shuttleGroupId) || 'shuttle-1';
        this._markShuttleGroupDirty();
      }
    }

    getInspectorSchema(){
      if(this._legacyPrototype && typeof this._legacyPrototype.getInspectorSchema === 'function'){
        return this._legacyPrototype.getInspectorSchema.call(this);
      }
      const schema = {
        presetId: { type: 'select', label: 'Preset', options: Object.entries(PRESETS).map(([value, row])=>[value, row.title]) },
        processTime: { type: 'number', label: 'Process time (s)' },
        contentCapacity: { type: 'number', label: 'Node capacity' }
      };
      if(this.properties?.presetId === 'shuttle'){
        schema.shuttleGroupId = { type: 'text', label: 'Shuttle Group ID' };
      }
      return schema;
    }

    getEntityRoots(){
      if(this._legacyPrototype && typeof this._legacyPrototype.getEntityRoots === 'function'){
        return this._legacyPrototype.getEntityRoots.call(this);
      }
      return this._store()?.rootsAt(this.id) || [];
    }

    getCurrentContents(options){
      const store = this._store();
      if(!store) return { summary: [], instances: [] };
      const includeInstances = options?.includeInstances !== false;
      return { summary: store.summaryAt(this.id), instances: includeInstances ? store.treesAt(this.id) : [] };
    }

    _acceptIncoming(slotIndex){
      const input = this.inputs?.[slotIndex];
      if(!input || input.link == null) return null;
      const value = this.getInputData(slotIndex);
      if(!value || this._lastInputRefs[slotIndex] === value) return null;
      const store = this._store();
      const instance = store?.get(value);
      if(!store || !instance) return null;
      const inputRules = Array.isArray(this.properties.inputRules) && this.properties.inputRules.length
        ? this.properties.inputRules
        : [{ ruleId: 'default-input', target: { mode: 'category', category: store.typeOf(instance)?.category || 'work' }, acceptWhen: { kind: 'space-available' } }];
      const selected = App.selectEntityRule(store, this, inputRules, { incomingRoot: instance, nowMs: nowMs() }, 'input');
      if(!selected) return null;
      this._lastInputRefs[slotIndex] = value;
      store.moveRoot(instance, this.id);
      instance.attributes.__arrivedAtMs = nowMs();
      this._activeRoot = instance;
      this._activeTarget = selected.instance;
      return instance;
    }

    canAcceptEntityInput(slotIndex, value){
      if(this._legacyPrototype && typeof this._legacyPrototype.canAcceptEntityInput === 'function'){
        return this._legacyPrototype.canAcceptEntityInput.call(this, slotIndex, value);
      }
      if(this.properties?.presetId === 'source' || this.properties?.presetId === 'note') return false;
      const capacity = Math.max(0, Number(this.properties?.contentCapacity) || 0);
      const store = this._store();
      const roots = store?.rootsAt(this.id) || [];
      if(roots.length >= capacity) return false;
      const instance = store?.get(value);
      if(!instance) return false;
      const rules = Array.isArray(this.properties.inputRules) && this.properties.inputRules.length
        ? this.properties.inputRules
        : [{ ruleId: 'default-input', target: { mode: 'category', category: store.typeOf(instance)?.category || 'work' }, acceptWhen: { kind: 'space-available' } }];
      return !!App.selectEntityRule(store, this, rules, { incomingRoot: instance, nowMs: nowMs() }, 'input');
    }

    _canAcceptLegacyPayload(slotIndex, payload){
      if(!this._legacyPrototype) return null;
      if(typeof this._state !== 'undefined' && this._state !== 'IDLE') return false;
      if(this._payload || this._activeRoot || this._offer) return false;
      const currentInput = typeof this.getInputData === 'function' ? this.getInputData(slotIndex) : null;
      return !currentInput || currentInput === payload;
    }

    canAcceptWorkInput(slotIndex, work){
      if(this.properties?.presetId === 'shuttle'){
        if(!this.inputs || slotIndex < 0 || slotIndex >= this.inputs.length) return false;
        return this._state === 'IDLE'
          && !this._payload
          && !this._pendingTransfer
          && !this._incomingPayload;
      }
      const legacy = this._canAcceptLegacyPayload(slotIndex, work);
      return legacy === null ? this.canAcceptEntityInput(slotIndex, work) : legacy;
    }

    _shuttleGroupId(){
      return text(this.properties?.shuttleGroupId);
    }

    _shuttleGroupNodes(){
      const graph = this.graph;
      if(!graph || !Array.isArray(graph._nodes)) return [this];
      const groupId = this._shuttleGroupId();
      if(!groupId) return [this];
      const peers = graph._nodes.filter((node)=> node instanceof BasicNode
        && text(node.properties?.presetId).toLowerCase() === 'shuttle'
        && text(node.properties?.shuttleGroupId) === groupId);
      return peers.length ? peers : [this];
    }

    _markShuttleGroupDirty(){
      if(!this.graph) return;
      if(!this.graph.__dirtyNodeIds) this.graph.__dirtyNodeIds = new Set();
      for(const node of this._shuttleGroupNodes()){
        if(node && typeof node.id !== 'undefined') this.graph.__dirtyNodeIds.add(node.id);
      }
      this.graph.__outputDirty = true;
    }

    _shuttleGroupCycleMs(){
      let cycleMs = 0;
      for(const node of this._shuttleGroupNodes()){
        cycleMs = Math.max(cycleMs, Math.max(0, Number(node?.properties?.processTime) || 0) * 1000);
      }
      return cycleMs;
    }

    _shuttleGroupTiming(now){
      const graph = this.graph;
      if(!graph) return { nextTransferAt: NaN, lastObservedAt: Number(now) || 0 };
      if(!(graph.__factSimShuttleGroupTiming instanceof Map)){
        graph.__factSimShuttleGroupTiming = new Map();
      }
      const groupId = this._shuttleGroupId() || `node-${this.id}`;
      let timing = graph.__factSimShuttleGroupTiming.get(groupId);
      const current = Number(now) || 0;
      if(!timing || (Number.isFinite(timing.lastObservedAt) && current + 0.001 < timing.lastObservedAt)){
        timing = { nextTransferAt: NaN, lastTransferAt: NaN, lastObservedAt: current };
        graph.__factSimShuttleGroupTiming.set(groupId, timing);
      }
      timing.lastObservedAt = current;
      return timing;
    }

    _shuttleGroupIsEmpty(){
      return this._shuttleGroupNodes().every((node)=> node
        && !node._payload
        && !node._pendingTransfer
        && !node._incomingPayload);
    }

    _openShuttleGroupCycle(now){
      const timing = this._shuttleGroupTiming(now);
      if(!Number.isFinite(timing.nextTransferAt) || this._shuttleGroupIsEmpty()){
        timing.nextTransferAt = (Number(now) || 0) + this._shuttleGroupCycleMs();
      }
      return timing;
    }

    _closeShuttleGroupCycleIfEmpty(now){
      if(!this._shuttleGroupIsEmpty()) return;
      const timing = this._shuttleGroupTiming(now);
      timing.nextTransferAt = NaN;
      timing.lastTransferAt = NaN;
    }

    _applyShuttleStateColor(){
      switch(this._state){
        case 'PROCESS': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
        case 'WAIT': this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
        case 'TRANSFER': this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
        default: this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
      }
      if(typeof root.applyNodeStateTheme === 'function'){
        root.applyNodeStateTheme(this, this._state === 'TRANSFER' ? 'DOWN' : this._state);
      }
    }

    _setShuttleWaitIcon(active){
      try{
        if(!root.WorkLinkAnimator || !this.graph) return;
        const output = this.outputs?.[0];
        if(!output || !Array.isArray(output.links) || !output.links.length){
          if(!active) this._waitIconLinks = null;
          return;
        }
        const payload = this._payload || this._currentWork || this._pendingTransfer || null;
        const info = payload ? { id: payload.id, t: payload.type } : null;
        if(active){
          if(this._waitIconLinks) return;
          this._waitIconLinks = output.links.slice();
          this._waitIconLinks.forEach((linkId)=> root.WorkLinkAnimator.showPortIcon(this.graph, linkId, 'work', info));
        }else if(this._waitIconLinks){
          this._waitIconLinks.forEach((linkId)=> root.WorkLinkAnimator.hidePortIcon(this.graph, linkId));
          this._waitIconLinks = null;
        }
      }catch(_e){}
    }

    _setShuttleState(next){
      if(this._state === next) return;
      const previous = this._state;
      this._state = next;
      this._stateName = next === 'TRANSFER' ? 'down' : String(next).toLowerCase();
      if(previous !== 'WAIT' && next === 'WAIT') this._setShuttleWaitIcon(true);
      if(previous === 'WAIT' && next !== 'WAIT') this._setShuttleWaitIcon(false);
      this._applyShuttleStateColor();
      this._markShuttleGroupDirty();
    }

    _hasShuttleDownstreamLinks(){
      const output = this.outputs?.[0];
      return !!(output && Array.isArray(output.links) && output.links.length);
    }

    _isSameShuttleGroup(node){
      return !!node
        && node instanceof BasicNode
        && text(node.properties?.presetId).toLowerCase() === 'shuttle'
        && text(node.properties?.shuttleGroupId) === this._shuttleGroupId();
    }

    _shuttleDownstreamReady(vacatingNodeIds){
      if(!this._payload) return false;
      const output = this.outputs?.[0];
      if(!output || !Array.isArray(output.links) || !output.links.length) return false;
      let found = false;
      for(const linkId of output.links){
        const link = this.graph?.links?.[linkId];
        const target = link && this.graph?.getNodeById?.(link.target_id);
        if(!target) continue;
        found = true;
        if(this._isSameShuttleGroup(target) && vacatingNodeIds?.has(target.id)) continue;
        if(typeof target.canAcceptWorkInput === 'function'){
          if(!target.canAcceptWorkInput(link.target_slot, this._payload)) return false;
        }else if(typeof target._state !== 'undefined' && target._state !== 'IDLE'){
          return false;
        }
      }
      return found;
    }

    _spawnShuttleProcessAnimation(durationMs, work){
      if(!(durationMs > 0)) return;
      try{
        const input = this.inputs?.[0];
        if(!root.WorkLinkAnimator || !this.graph || !input || input.link == null) return;
        const info = work && typeof work === 'object' ? { id: work.id, t: work.type } : null;
        root.WorkLinkAnimator.spawn(this.graph, input.link, 'work', durationMs, info);
      }catch(_e){}
    }

    _spawnShuttleSinkAnimation(work){
      try{
        const output = this.outputs?.[0];
        if(!root.WorkLinkAnimator || !this.graph || !output || !Array.isArray(output.links)) return;
        const info = work && typeof work === 'object' ? { id: work.id, t: work.type } : null;
        const durationMs = Math.max(120, Number(this.properties?.processTime || 0) * 1000);
        for(const linkId of output.links){
          const link = this.graph.links?.[linkId];
          const target = link && this.graph.getNodeById?.(link.target_id);
          const isSink = text(target?.properties?.presetId).toLowerCase() === 'sink'
            || text(target?.properties?.legacySourceType).toLowerCase() === 'factory/sink'
            || (root.SinkNode && target instanceof root.SinkNode);
          if(isSink) root.WorkLinkAnimator.spawn(this.graph, linkId, 'work', durationMs, info);
        }
      }catch(_e){}
    }

    _beginShuttleTransfer(){
      if(!this._payload || !this._hasShuttleDownstreamLinks()) return false;
      this._spawnShuttleSinkAnimation(this._payload);
      this._pendingTransfer = this._payload;
      this._payload = null;
      this._currentWork = null;
      this._transferHold = true;
      this.setOutputData(0, this._pendingTransfer);
      this._setShuttleState('TRANSFER');
      return true;
    }

    _tryCommitShuttleGroupTransfer(){
      const peers = this._shuttleGroupNodes();
      for(const node of peers){
        if(node?._payload && node._state === 'PROCESS') return false;
      }
      const transferNodes = peers.filter((node)=> node?._payload
        && node._state === 'WAIT'
        && node._hasShuttleDownstreamLinks());
      if(!transferNodes.length) return false;
      const now = nowMs();
      const timing = this._shuttleGroupTiming(now);
      if(!Number.isFinite(timing.nextTransferAt)){
        timing.nextTransferAt = now + this._shuttleGroupCycleMs();
      }
      if(now + 0.001 < timing.nextTransferAt) return false;
      const vacatingNodeIds = new Set(transferNodes.map((node)=>node.id));
      for(const node of transferNodes){
        if(!node._shuttleDownstreamReady(vacatingNodeIds)) return false;
      }
      let moved = false;
      for(const node of transferNodes){
        if(node._beginShuttleTransfer()) moved = true;
      }
      if(moved){
        timing.lastTransferAt = now;
        timing.nextTransferAt = now + this._shuttleGroupCycleMs();
        this._markShuttleGroupDirty();
      }
      return moved;
    }

    _startShuttleProcess(work, now){
      if(!work || typeof work !== 'object') return false;
      this._openShuttleGroupCycle(now);
      this._payload = work;
      this._currentWork = work;
      const processMs = Math.max(0, Number(this.properties?.processTime || 0) * 1000);
      this._until = now + processMs;
      this._setShuttleState('PROCESS');
      this._spawnShuttleProcessAnimation(processMs, work);
      return true;
    }

    _shuttleGroupIsTransferring(){
      return this._shuttleGroupNodes().some((node)=>node && node._state === 'TRANSFER');
    }

    _acceptShuttleInput(now){
      if(this._incomingPayload){
        if(this._shuttleGroupIsTransferring()) return false;
        const buffered = this._incomingPayload;
        this._incomingPayload = null;
        return this._startShuttleProcess(buffered, now);
      }
      const input = this.inputs?.[0];
      if(!input || input.link == null){
        this._lastInRef = null;
        return false;
      }
      const work = this.getInputData(0);
      if(!work){
        this._lastInRef = null;
        return false;
      }
      if(typeof work !== 'object' || this._lastInRef === work) return false;
      this._lastInRef = work;
      if(this._shuttleGroupIsTransferring()){
        this._incomingPayload = work;
        this._markShuttleGroupDirty();
        return true;
      }
      return this._startShuttleProcess(work, now);
    }

    _captureShuttleInputDuringTransfer(){
      if(this._incomingPayload) return;
      const input = this.inputs?.[0];
      if(!input || input.link == null) return;
      const work = this.getInputData(0);
      if(!work || typeof work !== 'object' || this._lastInRef === work) return;
      this._lastInRef = work;
      this._incomingPayload = work;
    }

    _executeShuttle(){
      const now = nowMs();
      this.setOutputData(0, null);
      switch(this._state){
        case 'PROCESS':
          if(now >= this._until) this._setShuttleState('WAIT');
          break;
        case 'WAIT':
          this._tryCommitShuttleGroupTransfer();
          break;
        case 'TRANSFER':
          this.setOutputData(0, this._pendingTransfer);
          this._captureShuttleInputDuringTransfer();
          if(this._transferHold){
            this._transferHold = false;
          }else{
            this.setOutputData(0, null);
            this._pendingTransfer = null;
            this._setShuttleState('IDLE');
            this._closeShuttleGroupCycleIfEmpty(now);
          }
          break;
        case 'IDLE':
        default:
          this._currentWork = null;
          this._acceptShuttleInput(now);
          break;
      }
      if(this._state !== 'IDLE' || this._payload || this._pendingTransfer || this._incomingPayload){
        this.setDirtyCanvas(true, true);
      }
    }

    canAcceptPalletInput(slotIndex, pallet){
      const legacy = this._canAcceptLegacyPayload(slotIndex, pallet);
      return legacy === null ? this.canAcceptEntityInput(slotIndex, pallet) : legacy;
    }

    canAcceptAgv(slotIndex, carrier){
      const legacy = this._canAcceptLegacyPayload(slotIndex, carrier);
      return legacy === null ? this.canAcceptEntityInput(slotIndex, carrier) : legacy;
    }

    _downstreamReady(slot, instance){
      const output = this.outputs?.[slot];
      if(!output || !Array.isArray(output.links) || !output.links.length) return false;
      for(const linkId of output.links){
        const link = this.graph?.links?.[linkId];
        const target = link && this.graph?.getNodeById?.(link.target_id);
        if(!target) continue;
        if(typeof target.canAcceptEntityInput === 'function' && !target.canAcceptEntityInput(link.target_slot, instance)) return false;
      }
      return true;
    }

    _offerEntity(instance, slot){
      if(!instance || slot < 0) return false;
      if(!this._downstreamReady(slot, instance)) return false;
      this.setOutputData(slot, instance);
      this._offer = { instance, slot, at: nowMs() };
      return true;
    }

    _finishOffer(){
      if(!this._offer) return;
      const { instance, slot } = this._offer;
      const store = this._store();
      const current = store?.get(instance) || null;
      if(current && current.locationNodeId === this.id){
        this.setOutputData(slot, instance);
        return false;
      }
      this.setOutputData(slot, null);
      this._offer = null;
      this._activeRoot = null;
      this._activeTarget = null;
      this._processComplete = false;
      this._state = 'IDLE';
      this._stateName = 'idle';
      return true;
    }

    _selectOutput(){
      const store = this._store();
      if(!store) return null;
      const rules = Array.isArray(this.properties.outputRules) && this.properties.outputRules.length
        ? this.properties.outputRules
        : [{ ruleId: 'default-output', target: { mode: 'otherwise' }, releaseWhen: { kind: 'available' }, toPortId: this.outputs?.[0]?.portId }];
      const selected = App.selectEntityRule(store, this, rules, {
        nowMs: nowMs(),
        processComplete: this._processComplete,
        downstreamReady: true
      }, 'output');
      if(!selected) return null;
      const slot = portIndexById(this.outputs, selected.rule.toPortId);
      return { ...selected, slot: slot >= 0 ? slot : 0 };
    }

    _executeSink(){
      for(let index = 0; index < this.inputs.length; index++){
        const incoming = this._acceptIncoming(index);
        if(!incoming) continue;
        this._store()?.destroy(incoming, { completed: true, sinkNodeId: this.id, completedAt: nowMs() });
        this._receivedCount = (this._receivedCount || 0) + 1;
      }
    }

    _executeSource(){
      const store = this._store();
      const rootInstance = store?.rootsAt(this.id)?.[0] || null;
      if(!rootInstance) return;
      this._offerEntity(rootInstance, 0);
    }

    _executePack(){
      const store = this._store();
      if(!store) return;
      for(let index = 0; index < this.inputs.length; index++) this._acceptIncoming(index);
      const roots = store.rootsAt(this.id);
      const container = roots.find((entry)=>{
        const category = store.typeOf(entry)?.category;
        return category === 'container' || category === 'carrier';
      });
      const item = roots.find((entry)=>entry !== container);
      if(container && item){
        const result = store.attach(item, container);
        if(result.ok) this._processComplete = true;
      }
      const output = this._selectOutput();
      if(output?.instance){
        if(output.instance.parentId) store.detach(output.instance);
        this._offerEntity(output.instance, output.slot);
      }
    }

    _executeUnpack(){
      const store = this._store();
      if(!store) return;
      for(let index = 0; index < this.inputs.length; index++) this._acceptIncoming(index);
      const output = this._selectOutput();
      if(output?.instance){
        if(output.instance.parentId) store.detach(output.instance);
        this._offerEntity(output.instance, output.slot);
      }
    }

    _executeGeneric(){
      const preset = this.properties?.presetId;
      if(preset === 'note' || preset === 'signal') return;
      if(this._offer){ this._finishOffer(); return; }
      if(preset === 'source'){ this._executeSource(); return; }
      if(preset === 'sink'){ this._executeSink(); return; }
      if(preset === 'pack'){ this._executePack(); return; }
      if(preset === 'unpack'){ this._executeUnpack(); return; }
      for(let index = 0; index < this.inputs.length; index++) this._acceptIncoming(index);
      const store = this._store();
      if(!this._activeRoot) this._activeRoot = store?.rootsAt(this.id)?.[0] || null;
      if(!this._activeRoot) return;
      const now = nowMs();
      if(this._state === 'IDLE'){
        this._state = 'PROCESS';
        this._stateName = 'process';
        this._until = now + Math.max(0, Number(this.properties.processTime) || 0) * 1000;
      }
      if(this._state === 'PROCESS' && now >= this._until){
        this._processComplete = true;
        this._state = 'WAIT';
        this._stateName = 'wait';
      }
      if(this._state === 'WAIT'){
        const selected = this._selectOutput();
        if(selected?.instance){
          if(selected.instance.parentId) store.detach(selected.instance);
          this._offerEntity(selected.instance, selected.slot);
        }
      }
    }

    onExecute(){
      if(this.properties?.presetId === 'shuttle'){
        return this._executeShuttle();
      }
      if(this._legacyPrototype && typeof this._legacyPrototype.onExecute === 'function'){
        return this._legacyPrototype.onExecute.call(this);
      }
      return this._executeGeneric();
    }

    onDrawForeground(ctx){
      if(this.properties?.presetId === 'shuttle'){
        const remaining = Math.max(0, this._until - nowMs());
        if(typeof root.drawStateBelow === 'function'){
          root.drawStateBelow(ctx, this, [
            `State: ${this._state}`,
            `Shuttle group: ${this._shuttleGroupId() || '-'}`,
            this._currentWork ? `Work: ID=${this._currentWork.id} Type=${this._currentWork.type}` : 'Work: (none)',
            `Remain(s): ${(remaining / 1000).toFixed(1)}`,
            `Process(s): ${this.properties.processTime}`
          ], 8, 6);
        }
        return;
      }
      if(this._legacyPrototype && typeof this._legacyPrototype.onDrawForeground === 'function'){
        return this._legacyPrototype.onDrawForeground.call(this, ctx);
      }
      const store = this._store();
      const count = store?.summaryAt(this.id).reduce((sum, row)=>sum + row.quantity, 0) || 0;
      if(typeof root.drawStateBelow === 'function'){
        root.drawStateBelow(ctx, this, [
          `Preset: ${this._preset().title}`,
          `State: ${this._stateName}`,
          `Contents: ${count}`,
          `Input rules: ${this.properties.inputRules?.length || 0}`,
          `Output rules: ${this.properties.outputRules?.length || 0}`
        ], 8, 6);
      }
    }

    getEventUntil(now){
      if(this.properties?.presetId === 'shuttle'){
        if(this._state === 'TRANSFER') return Number(now) || 0;
        if(this._state === 'WAIT'){
          const nextTransferAt = Number(this._shuttleGroupTiming(now).nextTransferAt);
          if(Number.isFinite(nextTransferAt)) return nextTransferAt;
        }
      }
      return NaN;
    }
  }

  function inferLegacyTypes(data){
    const model = isObject(data?.__factSimEntityModel)
      ? clone(data.__factSimEntityModel, { schemaVersion: 1, types: [] })
      : { schemaVersion: 1, types: [] };
    if(!Array.isArray(model.types)) model.types = [];
    const byKey = new Map(model.types.map((row)=>[`${row.category}:${String(row.name).toLowerCase()}`, row]));
    let sequence = model.types.length;
    const ensure = (name, category, capacity, subtype)=>{
      const key = `${category}:${String(name).toLowerCase()}`;
      if(byKey.has(key)) return byKey.get(key);
      const row = {
        typeId: `type-${String(name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || (++sequence)}`,
        name, category, subtype: subtype || '', tags: ['migrated'],
        capacity: category === 'work' ? 0 : Math.max(0, Math.round(Number(capacity) || 0)),
        allowedContentTypeIds: [], defaultAttributes: {}
      };
      while(model.types.some((item)=>item.typeId === row.typeId)) row.typeId += `-${++sequence}`;
      model.types.push(row); byKey.set(key, row); return row;
    };
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    for(const node of nodes){
      const props = isObject(node?.properties) ? node.properties : {};
      if(node.type === 'factory/source'){
        String(props.sequence || 'A').split(/[,\n]+/).map(text).filter(Boolean).forEach((name)=>ensure(name, 'work', 0, ''));
      }
      if(node.type === 'factory/carrierconfig' || node.type === 'factory/carrierhome'){
        ensure(text(props.carrierId) || `Carrier ${props.capacity || 1}`, 'carrier', props.capacity || 1, 'Carrier');
      }
      if(node.type === 'factory/palletcarrierconfig' || node.type === 'factory/palletcarrier'){
        const pallet = ensure(`Pallet ${props.palletWorkCapacity || 1}`, 'container', props.palletWorkCapacity || 1, 'Pallet');
        const carrier = ensure(text(props.carrierId) || `Pallet Carrier ${props.palletCapacity || 1}`, 'carrier', props.palletCapacity || 1, 'Carrier');
        if(!carrier.allowedContentTypeIds.includes(pallet.typeId)) carrier.allowedContentTypeIds.push(pallet.typeId);
      }
      if(node.type === 'factory/entitysource'){
        const category = String(props.rootKind).toLowerCase() === 'carrier' ? 'carrier' : (String(props.rootKind).toLowerCase() === 'work' ? 'work' : 'container');
        ensure(text(props.rootId) || text(props.rootKind) || 'Entity', category, props.capacity || 0, props.rootKind || '');
      }
    }
    const works = model.types.filter((row)=>row.category === 'work').map((row)=>row.typeId);
    for(const row of model.types){
      if(row.category === 'container' && String(row.subtype).toLowerCase() === 'pallet'){
        for(const typeId of works) if(!row.allowedContentTypeIds.includes(typeId)) row.allowedContentTypeIds.push(typeId);
      }else if(row.category === 'carrier' && !row.allowedContentTypeIds.length){
        for(const typeId of works) row.allowedContentTypeIds.push(typeId);
      }
    }
    return model;
  }

  function categoryForPort(port){
    const signature = `${text(port?.type)} ${text(port?.name)}`.toLowerCase();
    if(/agv|carrier/.test(signature)) return 'carrier';
    if(/pallet|container|box|tray/.test(signature)) return 'container';
    return 'work';
  }

  function typeIdForLegacyName(model, name){
    const wanted = text(name).toLowerCase();
    if(!wanted) return '';
    const row = (Array.isArray(model?.types) ? model.types : []).find((entry)=>text(entry?.name).toLowerCase() === wanted);
    return text(row?.typeId);
  }

  function migratedInputRules(node, originalType){
    if(originalType === 'factory/source' || originalType === 'factory/entitysource') return [];
    return (Array.isArray(node?.inputs) ? node.inputs : []).map((port, index)=>({
      ruleId: `migrated-input-${index + 1}`,
      target: { mode: 'category', category: categoryForPort(port) },
      acceptWhen: { kind: originalType === 'factory/sink' ? 'always' : 'space-available' },
      fromPortId: port.portId || `in-${index + 1}`
    }));
  }

  function migratedOutputRules(node, originalType, model){
    if(originalType === 'factory/sink') return [];
    const releaseKind = (originalType === 'factory/source' || originalType === 'factory/entitysource')
      ? 'available'
      : 'process-complete';
    return (Array.isArray(node?.outputs) ? node.outputs : []).map((port, index)=>{
      const routeTypeId = originalType === 'factory/branch'
        ? typeIdForLegacyName(model, port?.routeType)
        : '';
      return {
        ruleId: `migrated-output-${index + 1}`,
        target: routeTypeId
          ? { mode: 'type', typeId: routeTypeId }
          : { mode: 'category', category: categoryForPort(port) },
        releaseWhen: { kind: releaseKind },
        toPortId: port.portId || `out-${index + 1}`
      };
    });
  }

  function migrateGraphDataToBasic(source, options){
    const data = clone(source, null);
    if(!data) throw new Error('Graph data is not serializable');
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const warnings = [];
    const removedNodeIds = [];
    let convertedNodeCount = 0;
    data.__factSimEntityModel = inferLegacyTypes(data);
    const carrierConfigs = nodes.filter((node)=>CONFIG_TYPES.has(node?.type)).map((node)=>({
      nodeId: node.id,
      sourceType: node.type,
      properties: clone(node.properties, {})
    }));
    const kept = [];
    for(const node of nodes){
      if(!node || !node.type) continue;
      node.pos = normalizeSerializedVector(node.pos);
      node.size = normalizeSerializedVector(node.size);
      if(CONFIG_TYPES.has(node.type)){
        removedNodeIds.push(node.id);
        continue;
      }
      if(node.type !== 'factory/basic'){
        const presetId = LEGACY_TO_PRESET[node.type];
        if(!presetId){
          warnings.push({ code: 'UNKNOWN_NODE_TYPE', nodeId: node.id, type: node.type });
          kept.push(node);
          continue;
        }
        const originalType = node.type;
        node.type = 'factory/basic';
        node.properties = isObject(node.properties) ? node.properties : {};
        node.properties.basicNodeVersion = 1;
        node.properties.presetId = presetId;
        if(originalType === 'factory/shuttle_stage'){
          node.properties.shuttleGroupId = text(node.properties.shuttleGroupId || node.properties.groupId) || 'shuttle-1';
          delete node.properties.groupId;
          delete node.properties.legacySourceType;
        }else{
          node.properties.legacySourceType = originalType;
        }
        if((originalType === 'factory/carrierroute' || originalType === 'factory/agvroute') && carrierConfigs.length){
          node.properties.migratedCarrierConfigs = clone(carrierConfigs, []);
        }
        if(!Array.isArray(node.properties.initialContents)) node.properties.initialContents = [];
        ensurePortIds(node);
        if(!Array.isArray(node.properties.inputRules) || !node.properties.inputRules.length){
          node.properties.inputRules = migratedInputRules(node, originalType);
        }
        if(!Array.isArray(node.properties.outputRules) || !node.properties.outputRules.length){
          node.properties.outputRules = migratedOutputRules(node, originalType, data.__factSimEntityModel);
        }
        convertedNodeCount += 1;
      }
      ensurePortIds(node);
      kept.push(node);
    }
    data.nodes = kept;
    if(removedNodeIds.length && Array.isArray(data.links)){
      data.links = data.links.filter((link)=>{
        if(!Array.isArray(link)) return true;
        return !removedNodeIds.includes(link[1]) && !removedNodeIds.includes(link[3]);
      });
    }
    const preview = {
      convertedNodeCount,
      removedConfigNodeCount: removedNodeIds.length,
      removedNodeIds,
      generatedTypeCount: data.__factSimEntityModel.types.length,
      warnings,
      blocked: warnings.some((row)=>row.code === 'UNKNOWN_NODE_TYPE')
    };
    if(options?.previewOnly) return preview;
    if(preview.blocked) return { data: source, preview };
    return { data, preview };
  }

  App.BASIC_NODE_PRESETS = PRESETS;
  App.BASIC_NODE_LEGACY_MAP = LEGACY_TO_PRESET;
  App.inferLegacyEntityModel = inferLegacyTypes;
  App.ensureBasicNodePortIds = ensurePortIds;
  App.migrateGraphDataToBasic = migrateGraphDataToBasic;
  App.previewBasicNodeMigration = (data)=>migrateGraphDataToBasic(data, { previewOnly: true });
  App.prepareSerializedGraphForSave = function(data){
    const result = migrateGraphDataToBasic(data || {}, {});
    App._lastBasicMigrationPreview = result.preview;
    return result;
  };
  BasicNode.title = 'Basic Node';
  root.BasicNode = BasicNode;
})(typeof self !== 'undefined' ? self : window);
