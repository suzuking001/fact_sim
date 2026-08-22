var App = window.App || (window.App = {});

(function(){
  const WORKER_MODE = 'event-fast-worker';
  const WORKER_URL = 'js/app/engine-fast-worker.js?v=20260803b';
  const UNSAFE_WORKER_TYPES = new Set([
    'factory/carrierroute',
    'factory/shuttle_stage'
  ]);

  function cloneJson(value){
    try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return value; }
  }

  function normalizeWorkerMode(mode){
    const raw = String(mode || '').trim().toLowerCase();
    if(raw === WORKER_MODE || raw === 'event_fast_worker' || raw === 'eventfastworker' || raw === 'fast-worker'){
      return WORKER_MODE;
    }
    return null;
  }

  function normalizeHeadlessMode(mode){
    const worker = normalizeWorkerMode(mode);
    if(worker) return worker;
    if(typeof App.normalizeSimMode === 'function') return App.normalizeSimMode(mode);
    return String(mode || '').trim().toLowerCase() === 'event' ? 'event' : 'dt';
  }

  function getHeadlessModeLabel(mode){
    const normalized = normalizeHeadlessMode(mode);
    if(normalized === WORKER_MODE) return 'event-fast-worker';
    if(typeof App.getSimModeLabel === 'function') return App.getSimModeLabel(normalized);
    return normalized;
  }

  function canUseWorkerMode(){
    return typeof Worker === 'function'
      && typeof window !== 'undefined'
      && String(window.location && window.location.protocol || '').toLowerCase() !== 'file:';
  }

  function uniqueModes(list){
    const out = [];
    const seen = new Set();
    for(const raw of Array.isArray(list) ? list : []){
      const normalized = normalizeHeadlessMode(raw);
      if(!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  function serializeGraphForWorker(graphOrData){
    if(graphOrData && typeof graphOrData.serialize === 'function'){
      if(typeof App.serializeGraphData === 'function'){
        return cloneJson(App.serializeGraphData());
      }
      const data = graphOrData.serialize();
      if(App.stopGroups && typeof App.stopGroups.injectSerializedData === 'function'){
        try{ App.stopGroups.injectSerializedData(data, graphOrData); }catch(_e){}
      }
      return cloneJson((typeof App.compactGraphData === 'function') ? App.compactGraphData(data) : data);
    }
    return cloneJson((typeof App.compactGraphData === 'function') ? App.compactGraphData(graphOrData) : graphOrData);
  }

  function createGraphFromData(graphData){
    const data = (typeof App.compactGraphData === 'function') ? App.compactGraphData(cloneJson(graphData)) : cloneJson(graphData);
    const graph = new LGraph();
    graph.configure(data);
    if(typeof App.restoreEntityModel === 'function') App.restoreEntityModel(graph, data, true);
    if(App.repairGraphLinks && typeof App.repairGraphLinks === 'function'){
      try{ App.repairGraphLinks(graph); }catch(_e){}
    }
    if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
      try{ App.stopGroups.restoreSerializedData(graph, data, false); }catch(_e){}
    }
    if(typeof configureGraphClock === 'function'){
      try{ configureGraphClock(graph); }catch(_e){}
    }
    return graph;
  }

  function collectNodeIdSetFromGraph(graph){
    const out = new Set();
    const nodes = Array.isArray(graph && graph._nodes) ? graph._nodes : [];
    for(const node of nodes){
      const id = Number(node && node.id);
      if(Number.isFinite(id)) out.add(id);
    }
    return out;
  }

  function collectNodeIdSetFromData(graphData){
    const out = new Set();
    const nodes = Array.isArray(graphData && graphData.nodes) ? graphData.nodes : [];
    for(const node of nodes){
      const id = Number(node && node.id);
      if(Number.isFinite(id)) out.add(id);
    }
    return out;
  }

  function collectLinkIdSetFromGraph(graph){
    const out = new Set();
    const links = graph && graph.links && typeof graph.links === 'object' ? Object.values(graph.links) : [];
    for(const link of links){
      const id = Number(link && link.id);
      if(Number.isFinite(id)) out.add(id);
    }
    return out;
  }

  function collectLinkIdSetFromData(graphData){
    const out = new Set();
    const links = Array.isArray(graphData && graphData.links) ? graphData.links : [];
    for(const row of links){
      const id = Array.isArray(row) ? Number(row[0]) : Number(row && row.id);
      if(Number.isFinite(id)) out.add(id);
    }
    return out;
  }

  function sameIdSet(a, b){
    if(a.size !== b.size) return false;
    for(const value of a){
      if(!b.has(value)) return false;
    }
    return true;
  }

  function graphStructureMatchesSnapshot(graph, graphData){
    if(!graph || !graphData) return false;
    return sameIdSet(collectNodeIdSetFromGraph(graph), collectNodeIdSetFromData(graphData))
      && sameIdSet(collectLinkIdSetFromGraph(graph), collectLinkIdSetFromData(graphData));
  }

  function reportLiveSyncError(mode, error){
    const message = String(error && error.message ? error.message : error || 'unknown live sync error');
    try{
      App._lastLiveSyncError = { mode: String(mode || ''), message, at: Date.now() };
    }catch(_e){}
    try{ console.error(`[${mode || WORKER_MODE}] live sync failed`, error); }catch(_e){}
    try{
      const now = Date.now();
      const prevAt = Number(App._lastLiveSyncToastAt) || 0;
      if((now - prevAt) > 3000 && typeof App.showToast === 'function'){
        App._lastLiveSyncToastAt = now;
        App.showToast(`Live sync failed (${mode || 'worker'}).`);
      }
    }catch(_e){}
  }

  function extractRuntimeLinkStates(graphData){
    if(Array.isArray(graphData && graphData.__factSimRuntimeLinks)) return graphData.__factSimRuntimeLinks;
    return [];
  }
  function extractRuntimeNodeStates(graphData){
    if(Array.isArray(graphData && graphData.__factSimRuntimeNodes)) return graphData.__factSimRuntimeNodes;
    return [];
  }
  function collectRuntimeLinkStates(graph){
    const rows = [];
    const rawLinks = graph && graph.links && typeof graph.links === 'object' ? Object.values(graph.links) : [];
    for(const link of rawLinks){
      if(!link) continue;
      rows.push({
        linkId: Number(link.id),
        originId: Number(link.origin_id),
        originSlot: Number(link.origin_slot),
        targetId: Number(link.target_id),
        targetSlot: Number(link.target_slot),
        data: cloneJson(typeof link.data !== 'undefined' ? link.data : null),
        _data: cloneJson(typeof link._data !== 'undefined' ? link._data : null)
      });
    }
    rows.sort((a, b)=> a.linkId - b.linkId);
    return rows;
  }
  function collectRuntimeNodeStates(graph){
    const rows = [];
    const nodes = Array.isArray(graph && graph._nodes) ? graph._nodes : [];
    for(const node of nodes){
      if(!node) continue;
      rows.push({
        nodeId: Number(node.id),
        _state: typeof node._state !== 'undefined' ? cloneJson(node._state) : null,
        _stateName: typeof node._stateName !== 'undefined' ? cloneJson(node._stateName) : null,
        _until: Number.isFinite(Number(node._until)) ? Number(node._until) : null
      });
    }
    rows.sort((a, b)=> a.nodeId - b.nodeId);
    return rows;
  }
  function snapshotGraphData(graph){
    if(!graph) return null;
    const data = graph.serialize();
    data.__factSimRuntimeNodes = collectRuntimeNodeStates(graph);
    data.__factSimRuntimeLinks = collectRuntimeLinkStates(graph);
    return data;
  }
  function applyRuntimeNodeStates(graph, graphData){
    if(!graph || typeof graph.getNodeById !== 'function') return;
    const states = extractRuntimeNodeStates(graphData);
    for(const row of states){
      const node = graph.getNodeById(Number(row && row.nodeId));
      if(!node) continue;
      if(Object.prototype.hasOwnProperty.call(row || {}, '_state')) node._state = cloneJson(row._state);
      if(Object.prototype.hasOwnProperty.call(row || {}, '_stateName')) node._stateName = cloneJson(row._stateName);
      if(Object.prototype.hasOwnProperty.call(row || {}, '_until') && Number.isFinite(Number(row._until))) node._until = Number(row._until);
    }
  }

  function applyRuntimeLinkStates(graph, graphData){
    if(!graph || !graph.links || typeof graph.links !== 'object') return;
    const states = extractRuntimeLinkStates(graphData);
    const byId = new Map(states.map((row)=> [Number(row && row.linkId), row]));
    for(const raw of Object.values(graph.links)){
      if(!raw) continue;
      const linkId = Number(raw.id);
      const state = byId.get(linkId) || null;
      const nextValue = cloneJson(state ? (typeof state.data !== 'undefined' ? state.data : state._data) : null);
      raw.data = nextValue;
      raw._data = cloneJson(nextValue);
      if(typeof graph.getNodeById === 'function'){
        const source = graph.getNodeById(Number(raw.origin_id));
        if(source && Array.isArray(source.outputs) && source.outputs[raw.origin_slot]){
          source.outputs[raw.origin_slot]._data = cloneJson(nextValue);
        }
        const target = graph.getNodeById(Number(raw.target_id));
        if(target && Array.isArray(target.inputs) && target.inputs[raw.target_slot]){
          target.inputs[raw.target_slot].value = cloneJson(nextValue);
        }
      }
    }
  }

  function collectSinkMetrics(graph){
    const nodes = Array.isArray(graph && graph._nodes) ? graph._nodes : [];
    const sinks = [];
    let totalCompleted = 0;
    for(const node of nodes){
      if(!node) continue;
      const type = String(node.type || '').toLowerCase();
      const title = String(node.title || '').toLowerCase();
      if(type.indexOf('sink') < 0 && title !== 'sink' && !Array.isArray(node._recv)) continue;
      const completed = Array.isArray(node._recv) ? node._recv.length : 0;
      totalCompleted += Math.max(0, completed);
      sinks.push({
        id: node.id,
        title: node.title || `Sink #${node.id}`,
        completedCount: Math.max(0, completed)
      });
    }
    return { sinkCount: sinks.length, totalCompleted, sinks };
  }

  function hasUnsafeWorkerTypes(graphData){
    const nodes = Array.isArray(graphData && graphData.nodes) ? graphData.nodes : [];
    for(const node of nodes){
      const type = String(node && node.type || '').toLowerCase();
      if(UNSAFE_WORKER_TYPES.has(type)) return true;
    }
    return false;
  }

  function inspectFastWorkerSupport(graphOrData){
    const graphData = serializeGraphForWorker(graphOrData);
    const support = {
      graphData,
      canUseWorker: false,
      reason: 'unknown',
      fallbackMode: 'event-fast',
      runtimeMode: null,
      executableFallbackCount: 0,
      unsafeTypes: hasUnsafeWorkerTypes(graphData)
    };
    if(!canUseWorkerMode()){
      support.reason = 'worker-unavailable';
      return support;
    }
    if(support.unsafeTypes){
      support.reason = 'unsafe-node-types';
      return support;
    }
    if(typeof App.EventFastEngine !== 'function'){
      support.reason = 'no-event-fast-engine';
      return support;
    }
    let graph = null;
    let engine = null;
    try{
      graph = createGraphFromData(graphData);
      engine = new App.EventFastEngine(graph);
      const stats = engine && typeof engine.getDebugStats === 'function'
        ? engine.getDebugStats()
        : null;
      support.runtimeMode = stats && stats.runtimeMode ? String(stats.runtimeMode) : null;
      support.executableFallbackCount = Math.max(0, Number(stats && stats.executableFallbackCount) || 0);
      support.canUseWorker = support.runtimeMode !== 'legacy-compat' && support.executableFallbackCount <= 0;
      support.reason = support.canUseWorker
        ? 'ok'
        : (support.runtimeMode === 'legacy-compat' ? 'legacy-compat' : 'executable-fallback');
      return support;
    }catch(_e){
      support.reason = 'event-fast-inspection-failed';
      return support;
    }finally{
      if(engine && typeof engine.stop === 'function'){
        try{ engine.stop(); }catch(_e){}
      }
    }
  }

  function syncLiveGraph(graph, graphData){
    if(!graph || !graphData) return false;
    const data = (typeof App.compactGraphData === 'function')
      ? App.compactGraphData(cloneJson(graphData))
      : cloneJson(graphData);
    const canvas = App.canvas || null;
    const inspector = App.selectionInspector || null;
    const preservedNodeIds = [];
    const inspectorNodeId = Number(inspector && inspector.target && inspector.target.kind === 'node' ? inspector.target.nodeId : NaN);
    const hadGroupSelection = !!(canvas && canvas.selected_group);
    if(canvas && canvas.selected_nodes && typeof canvas.selected_nodes === 'object'){
      for(const key of Object.keys(canvas.selected_nodes)){
        const node = canvas.selected_nodes[key];
        const nodeId = Number(node && node.id);
        if(Number.isFinite(nodeId) && preservedNodeIds.indexOf(nodeId) < 0) preservedNodeIds.push(nodeId);
      }
    }
    try{
      if(!graphStructureMatchesSnapshot(graph, data)){
        graph.configure(data);
        if(App.repairGraphLinks && typeof App.repairGraphLinks === 'function'){
          try{ App.repairGraphLinks(graph); }catch(_e){}
        }
        if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
          try{ App.stopGroups.restoreSerializedData(graph, data, false); }catch(_e){}
        }
        if(canvas){
          try{
            if(typeof canvas.deselectAllNodes === 'function') canvas.deselectAllNodes();
            else if(canvas.selected_nodes && typeof canvas.selected_nodes === 'object') canvas.selected_nodes = {};
            canvas.selected_group = null;
            if(preservedNodeIds.length && typeof graph.getNodeById === 'function' && typeof canvas.selectNodes === 'function'){
              const nodes = preservedNodeIds.map((id)=> graph.getNodeById(id)).filter(Boolean);
              if(nodes.length) canvas.selectNodes(nodes, false);
            }
          }catch(_e){}
        }
        if(inspector){
          try{
            if(Number.isFinite(inspectorNodeId) && typeof graph.getNodeById === 'function'){
              const node = graph.getNodeById(inspectorNodeId);
              if(node && typeof inspector.setNode === 'function') inspector.setNode(node);
              else if(hadGroupSelection && typeof inspector.clear === 'function') inspector.clear(true);
            }else if(hadGroupSelection && typeof inspector.clear === 'function'){
              inspector.clear(true);
            }
          }catch(_e){}
        }
      }
      applyRuntimeNodeStates(graph, graphData);
      applyRuntimeLinkStates(graph, graphData);
      graph.status = LGraph.STATUS_RUNNING;
      graph.last_update_time = LiteGraph.getTime();
      if(App.timelineChart){
        try{
          if(typeof App.timelineChart.attachGraph === 'function'){
            if(App.timelineChart.graph !== graph) App.timelineChart.attachGraph(graph);
          }
          else App.timelineChart.graph = graph;
        }catch(_e){}
      }
      try{
        if(App.canvas && typeof App.canvas.setDirty === 'function') App.canvas.setDirty(true, true);
        else if(App.canvas && typeof App.canvas.draw === 'function') App.canvas.draw(true, true);
      }catch(_e){}
      return true;
    }catch(_e){
      reportLiveSyncError(WORKER_MODE, _e);
      return false;
    }
  }

  class EventFastWorkerFallbackHost{
    constructor(graphOrData, options){
      this.mode = WORKER_MODE;
      this.asyncOnly = true;
      this.options = Object.assign({}, options || {});
      this.fallbackMode = String(this.options.fallbackMode || 'dt').trim() || 'dt';
      this.graphData = serializeGraphForWorker(graphOrData);
      this._lastStats = null;
      this._lastRuntimeMode = `fallback-${this.fallbackMode}`;
      this.runtimeMode = this._lastRuntimeMode;
      this._seed = Number.isFinite(Number(this.options.seed)) ? Number(this.options.seed) : null;
      this._seededRandom = null;
    }

    _runSeeded(fn){
      if(!Number.isFinite(this._seed)) return fn();
      const original = Math.random;
      if(typeof this._seededRandom !== 'function'){
        let state = Math.floor(Math.abs(Number(this._seed) || 1)) % 2147483647;
        if(state === 0) state = 1;
        this._seededRandom = function(){
          state = (state * 16807) % 2147483647;
          return (state - 1) / 2147483646;
        };
      }
      Math.random = this._seededRandom;
      try{
        return fn();
      }finally{
        Math.random = original;
      }
    }

    _createEngine(){
      const graph = createGraphFromData(this.graphData);
      const engine = this._runSeeded(()=> App.createSimEngine(this.fallbackMode, graph));
      this._lastRuntimeMode = String(
        (engine && engine.runtimeMode)
        || (engine && typeof engine.getDebugStats === 'function' && engine.getDebugStats() && engine.getDebugStats().runtimeMode)
        || `fallback-${this.fallbackMode}`
      );
      this.runtimeMode = this._lastRuntimeMode;
      if(engine && typeof engine.reset === 'function') this._runSeeded(()=> engine.reset());
      return { graph, engine };
    }

    _startGraph(graph){
      graph.status = LGraph.STATUS_RUNNING;
      graph.starttime = LiteGraph.getTime();
      graph.last_update_time = graph.starttime;
      try{ this._runSeeded(()=> graph.sendEventToAllNodes('onStart')); }catch(_e){}
      if(typeof window.setSimTime === 'function'){
        try{ window.setSimTime(0); }catch(_e){}
      }
      if(typeof window.updateSimTime === 'function'){
        try{ window.updateSimTime(); }catch(_e){}
      }
    }

    _stopGraph(graph, engine){
      if(graph) try{ this._runSeeded(()=> graph.sendEventToAllNodes('onStop')); }catch(_e){}
      if(engine && typeof engine.stop === 'function') try{ this._runSeeded(()=> engine.stop()); }catch(_e){}
    }

    async resetAsync(){
      this.runtimeMode = this._lastRuntimeMode;
      return { runtimeMode: this._lastRuntimeMode, stats: this._lastStats };
    }

    async runBenchmarkCaseAsync(options){
      const opts = Object.assign({ wallMs: 2000, realStepMs: 16 }, options || {});
      this._seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : this._seed;
      this._seededRandom = null;
      const { graph, engine } = this._createEngine();
      this._startGraph(graph);
      const started = performance.now();
      let now = started;
      let loops = 0;
      try{
        while((now - started) < opts.wallMs){
          if(engine && typeof engine.update === 'function') this._runSeeded(()=> engine.update(opts.realStepMs));
          loops += 1;
          now = performance.now();
        }
        const simMs = (typeof window.simNow === 'function') ? Number(window.simNow()) : 0;
        const spentMs = Math.max(0, now - started);
        this._lastStats = (engine && typeof engine.getDebugStats === 'function') ? engine.getDebugStats() : null;
        this.runtimeMode = this._lastRuntimeMode;
        return {
          simTimeMs: simMs,
          wallMs: spentMs,
          loops,
          stats: this._lastStats
        };
      }finally{
        this._stopGraph(graph, engine);
      }
    }

    async runUntilSimTimeAsync(options){
      const opts = Object.assign({ targetSimMs: 30000, maxWallMs: 2500, maxLoops: 25000, realStepMs: 16 }, options || {});
      this._seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : this._seed;
      this._seededRandom = null;
      const { graph, engine } = this._createEngine();
      this._startGraph(graph);
      const started = performance.now();
      let loops = 0;
      try{
        while(((typeof window.simNow === 'function') ? window.simNow() : 0) < opts.targetSimMs){
          const now = performance.now();
          if((now - started) > opts.maxWallMs) break;
          if(loops >= opts.maxLoops) break;
          if(engine && typeof engine.update === 'function') this._runSeeded(()=> engine.update(opts.realStepMs));
          loops += 1;
        }
        const simMs = (typeof window.simNow === 'function') ? Number(window.simNow()) : 0;
        const finished = performance.now();
        const finalGraphData = snapshotGraphData(graph);
        const sinkMetrics = collectSinkMetrics(graph);
        this._lastStats = (engine && typeof engine.getDebugStats === 'function') ? engine.getDebugStats() : null;
        this.runtimeMode = this._lastRuntimeMode;
        return {
          simTimeMs: simMs,
          wallMs: Math.max(0, finished - started),
          loops,
          finalGraphData,
          sinkMetrics,
          stats: this._lastStats
        };
      }finally{
        this._stopGraph(graph, engine);
      }
    }

    async getDebugStatsAsync(){
      return this._lastStats ? cloneJson(this._lastStats) : null;
    }

    getDebugStats(){
      return this._lastStats ? cloneJson(this._lastStats) : null;
    }

    async stopAsync(){ return null; }
    async disposeAsync(){ return null; }
  }

  class EventFastWorkerHost{
    constructor(graphOrData, options){
      if(!canUseWorkerMode()) throw new Error('event-fast-worker is unavailable in this environment');
      this.mode = WORKER_MODE;
      this.asyncOnly = true;
      this.options = Object.assign({}, options || {});
      this.graphData = serializeGraphForWorker(graphOrData);
      this._requestId = 1;
      this._pending = new Map();
      this._disposed = false;
      this._lastStats = null;
      this._worker = new Worker(WORKER_URL);
      this._worker.addEventListener('message', (event)=> this._handleMessage(event));
      this._worker.addEventListener('error', (event)=> this._handleError(event));
      this._ready = this._call((App.eventFastWorkerProtocol || {}).INIT || 'init', {
        graphData: this.graphData,
        engineOptions: this.options.engineOptions || {}
      }).then((payload)=>{
        this._lastStats = payload && payload.stats ? payload.stats : null;
        return payload;
      });
    }

    _handleMessage(event){
      const data = event && event.data ? event.data : null;
      if(!data || typeof data.id === 'undefined') return;
      const pending = this._pending.get(data.id);
      if(!pending) return;
      this._pending.delete(data.id);
      if(data.ok === false){
        pending.reject(new Error(String(data.error || 'worker request failed')));
        return;
      }
      pending.resolve(data.payload);
    }

    _handleError(event){
      const message = String(event && (event.message || event.error && event.error.message) || 'worker error');
      for(const pending of this._pending.values()){
        pending.reject(new Error(message));
      }
      this._pending.clear();
    }

    _call(type, payload){
      if(this._disposed) return Promise.reject(new Error('worker host is disposed'));
      const id = this._requestId++;
      return new Promise((resolve, reject)=>{
        this._pending.set(id, { resolve, reject });
        this._worker.postMessage({ id, type, payload: payload || {} });
      });
    }

    async resetAsync(){
      await this._ready;
      const payload = await this._call((App.eventFastWorkerProtocol || {}).RESET || 'reset', {
        graphData: this.graphData,
        seed: this.options.seed
      });
      this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
      return payload;
    }

    async runBenchmarkCaseAsync(options){
      await this._ready;
      const payload = await this._call(
        (App.eventFastWorkerProtocol || {}).RUN_BENCHMARK_CASE || 'runBenchmarkCase',
        Object.assign({ seed: this.options.seed }, options || {})
      );
      this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
      return payload;
    }

    async runUntilSimTimeAsync(options){
      await this._ready;
      const payload = await this._call(
        (App.eventFastWorkerProtocol || {}).RUN_UNTIL_SIM_TIME || 'runUntilSimTime',
        Object.assign({ seed: this.options.seed }, options || {})
      );
      this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
      return payload;
    }

    async stepAsync(options){
      await this._ready;
      const payload = await this._call(
        (App.eventFastWorkerProtocol || {}).STEP || 'step',
        Object.assign({}, options || {})
      );
      this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
      return payload;
    }

    async getDebugStatsAsync(){
      await this._ready;
      const payload = await this._call((App.eventFastWorkerProtocol || {}).GET_STATS || 'getStats', {});
      this._lastStats = payload || this._lastStats;
      return payload;
    }

    getDebugStats(){
      return this._lastStats ? cloneJson(this._lastStats) : null;
    }

    async stopAsync(){
      if(this._disposed) return null;
      try{
        await this._ready;
      }catch(_e){
        return null;
      }
      try{
        return await this._call((App.eventFastWorkerProtocol || {}).STOP || 'stop', {});
      }catch(_e){
        return null;
      }
    }

    async disposeAsync(){
      if(this._disposed) return;
      this._disposed = true;
      try{
        await this.stopAsync();
      }catch(_e){}
      try{
        this._worker.terminate();
      }catch(_e){}
      for(const pending of this._pending.values()){
        pending.reject(new Error('worker host disposed'));
      }
      this._pending.clear();
    }
  }

  class LiveEventFastWorkerEngine{
    constructor(graph, options){
      this.mode = WORKER_MODE;
      this.graph = graph;
      this.options = Object.assign({}, options || {});
      this._lastStats = null;
      this._stopped = false;
      this._disposed = false;
      this._queuedDeltaMs = 0;
      this._accumMs = 0;
      this._inFlight = null;
      this._epoch = 0;
      this._lastSnapshotAt = 0;
      this._snapshotIntervalMs = 0;
      this._liveQuantumMs = Math.max(1, (((typeof window.getSimDtSec === 'function') ? window.getSimDtSec() : 0.1) * 1000));
      this._liveFallbackEngine = null;

      const support = inspectFastWorkerSupport(graph);
      const graphData = support.graphData;
      if(support.canUseWorker){
        this.runtimeMode = 'worker-live';
        this._runner = new EventFastWorkerHost(graphData, this.options);
      }else{
        this._runner = null;
        this._liveFallbackEngine = App.createSimEngine(support.fallbackMode, graph);
        this.runtimeMode = String(
          (this._liveFallbackEngine && this._liveFallbackEngine.runtimeMode)
          || `fallback-live-${support.fallbackMode}`
        );
      }
    }

    reset(){
      this._epoch += 1;
      this._stopped = false;
      this._queuedDeltaMs = 0;
      this._accumMs = 0;
      this._inFlight = null;
      this._lastSnapshotAt = 0;
      if(this._liveFallbackEngine && typeof this._liveFallbackEngine.reset === 'function'){
        this._liveFallbackEngine.reset();
        this._lastStats = (typeof this._liveFallbackEngine.getDebugStats === 'function')
          ? this._liveFallbackEngine.getDebugStats()
          : this._lastStats;
        return;
      }
      if(this._runner){
        this._readyPromise = this._runner.resetAsync().then((payload)=>{
          this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
          return payload;
        }).catch((err)=>{
          console.error(err);
          return null;
        });
      }
    }

    _scheduleDrain(){
      if(this._stopped || this._disposed || this._liveFallbackEngine || !this._runner) return;
      if(this._inFlight || this._queuedDeltaMs <= 0) return;
      if(this._queuedDeltaMs + 0.001 < this._liveQuantumMs) return;
      const epoch = this._epoch;
      const deltaMs = this._liveQuantumMs;
      this._queuedDeltaMs = Math.max(0, this._queuedDeltaMs - deltaMs);
      const requestSnapshot = true;
      const ready = this._readyPromise || Promise.resolve();
      this._inFlight = ready
        .then(()=> this._runner.stepAsync({ simDeltaMs: deltaMs, snapshot: requestSnapshot }))
        .then((payload)=>{
          if(epoch !== this._epoch) return;
          if(this._stopped || this._disposed || !payload) return;
          if(Number.isFinite(Number(payload.simTimeMs)) && typeof window.setSimTime === 'function'){
            try{ window.setSimTime(Number(payload.simTimeMs)); }catch(_e){}
          }
          if(payload.graphData && syncLiveGraph(this.graph, payload.graphData)){
            this._lastSnapshotAt = performance.now();
          }
          this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
          try{
            if(App.timelineChart && typeof App.timelineChart.onStep === 'function'){
              App.timelineChart.onStep(false);
            }
            if(typeof window.updateSimTime === 'function') window.updateSimTime();
            if(App.timelineChart && typeof App.timelineChart.draw === 'function') App.timelineChart.draw();
          }catch(_e){}
        })
        .catch((err)=>{
          console.error(err);
        })
        .finally(()=>{
          if(epoch !== this._epoch){
            this._inFlight = null;
            return;
          }
          this._inFlight = null;
          if(this._queuedDeltaMs > 0 && !this._stopped && !this._disposed){
            this._scheduleDrain();
          }
        });
    }

    update(simDeltaMs){
      if(this._disposed || this._stopped) return;
      if(this._liveFallbackEngine && typeof this._liveFallbackEngine.update === 'function'){
        this._liveFallbackEngine.update(simDeltaMs);
        this._lastStats = (typeof this._liveFallbackEngine.getDebugStats === 'function')
          ? this._liveFallbackEngine.getDebugStats()
          : this._lastStats;
        return;
      }
      const delta = Number(simDeltaMs);
      if(Number.isFinite(delta) && delta > 0){
        this._accumMs += delta;
        while(this._accumMs + 0.001 >= this._liveQuantumMs){
          this._queuedDeltaMs += this._liveQuantumMs;
          this._accumMs -= this._liveQuantumMs;
        }
      }
      this._scheduleDrain();
    }

    stop(){
      const queuedDeltaMs = Math.max(0, this._queuedDeltaMs) + Math.max(0, this._accumMs);
      this._stopped = true;
      this._queuedDeltaMs = 0;
      this._accumMs = 0;
      if(this._liveFallbackEngine && typeof this._liveFallbackEngine.stop === 'function'){
        if(queuedDeltaMs >= 0.5 && typeof this._liveFallbackEngine.update === 'function'){
          try{ this._liveFallbackEngine.update(queuedDeltaMs); }catch(_e){}
        }
        try{ this._liveFallbackEngine.stop(); }catch(_e){}
        return;
      }
      if(this._runner && queuedDeltaMs >= 0.5 && typeof this._runner.stepAsync === 'function'){
        const ready = Promise.resolve(this._inFlight).catch(()=> null).then(()=> this._readyPromise || null);
        this._inFlight = ready
          .then(()=> this._runner.stepAsync({ simDeltaMs: queuedDeltaMs, snapshot: true }))
          .then((payload)=>{
            if(!payload) return;
            if(Number.isFinite(Number(payload.simTimeMs)) && typeof window.setSimTime === 'function'){
              try{ window.setSimTime(Number(payload.simTimeMs)); }catch(_e){}
            }
            if(payload.graphData) syncLiveGraph(this.graph, payload.graphData);
            this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
            try{ if(typeof window.updateSimTime === 'function') window.updateSimTime(); }catch(_e){}
          })
          .catch((err)=>{ console.error(err); })
          .finally(()=>{
            if(this._runner && typeof this._runner.stopAsync === 'function'){
              this._runner.stopAsync().catch(()=> null);
            }
            this._inFlight = null;
          });
        return;
      }
      if(this._runner && typeof this._runner.stopAsync === 'function'){
        this._runner.stopAsync().catch(()=> null);
      }
    }

    getDebugStats(){
      if(this._liveFallbackEngine && typeof this._liveFallbackEngine.getDebugStats === 'function'){
        return this._liveFallbackEngine.getDebugStats();
      }
      return this._lastStats ? cloneJson(this._lastStats) : null;
    }

    async stopAsync(){
      this.stop();
      if(this._inFlight){
        try{ await this._inFlight; }catch(_e){}
      }
      return null;
    }

    async disposeAsync(){
      if(this._disposed) return;
      this._disposed = true;
      this._epoch += 1;
      await this.stopAsync();
      if(this._runner && typeof this._runner.disposeAsync === 'function'){
        try{ await this._runner.disposeAsync(); }catch(_e){}
      }
    }
  }

  App.EventFastWorkerHost = EventFastWorkerHost;
  App.LiveEventFastWorkerEngine = LiveEventFastWorkerEngine;
  const legacyGetSupportedSimModes = (typeof App.getSupportedSimModes === 'function')
    ? App.getSupportedSimModes.bind(App)
    : function(){ return ['dt', 'event', 'event-fast']; };
  const legacyNormalizeSimMode = (typeof App.normalizeSimMode === 'function')
    ? App.normalizeSimMode.bind(App)
    : function(mode){ return String(mode || '').trim().toLowerCase() === 'event' ? 'event' : 'dt'; };
  const legacyGetSimModeLabel = (typeof App.getSimModeLabel === 'function')
    ? App.getSimModeLabel.bind(App)
    : function(mode){ return String(mode || ''); };
  const legacyCreateSimEngine = (typeof App.createSimEngine === 'function')
    ? App.createSimEngine.bind(App)
    : function(){ return null; };
  App.getSupportedSimModes = function(){
    const base = Array.isArray(legacyGetSupportedSimModes()) ? legacyGetSupportedSimModes().slice() : ['dt', 'event', 'event-fast'];
    if(canUseWorkerMode() && base.indexOf(WORKER_MODE) < 0){
      base.push(WORKER_MODE);
    }
    return uniqueModes(base);
  };
  App.normalizeSimMode = function(mode){
    const worker = normalizeWorkerMode(mode);
    if(worker) return worker;
    return legacyNormalizeSimMode(mode);
  };
  App.getSimModeLabel = function(mode){
    const normalized = App.normalizeSimMode(mode);
    if(normalized === WORKER_MODE) return 'event-fast-worker (web worker)';
    return legacyGetSimModeLabel(normalized);
  };
  App.createSimEngine = function(mode, graphOrData){
    const normalized = App.normalizeSimMode(mode);
    if(normalized === WORKER_MODE){
      const graphInput = (graphOrData && typeof graphOrData.serialize === 'function')
        ? graphOrData
        : createGraphFromData(graphOrData);
      return new LiveEventFastWorkerEngine(graphInput, {});
    }
    return legacyCreateSimEngine(normalized, graphOrData);
  };
  App.normalizeHeadlessSimMode = normalizeHeadlessMode;
  App.getHeadlessModeLabel = getHeadlessModeLabel;
  App.isHeadlessOnlyBenchmarkMode = function(mode){
    return normalizeHeadlessMode(mode) === WORKER_MODE;
  };
  App.getBenchmarkSimModes = function(){
    const base = (typeof App.getSupportedSimModes === 'function') ? App.getSupportedSimModes() : ['dt', 'event', 'event-fast'];
    const list = uniqueModes(base);
    if(canUseWorkerMode()) list.push(WORKER_MODE);
    return uniqueModes(list);
  };
  App.getEngineTestModes = function(){
    return App.getBenchmarkSimModes();
  };
  App.createHeadlessSimRunner = function(mode, graphOrData, options){
    const normalized = normalizeHeadlessMode(mode);
    if(normalized === WORKER_MODE){
      const support = inspectFastWorkerSupport(graphOrData);
      const graphData = support.graphData;
      if(support.canUseWorker){
        return new EventFastWorkerHost(graphData, options);
      }
      return new EventFastWorkerFallbackHost(graphData, Object.assign({}, options, { fallbackMode: support.fallbackMode }));
    }
    if(typeof App.createSimEngine === 'function'){
      const graphInput = (normalized === 'event-fast' && graphOrData && typeof graphOrData.serialize !== 'function')
        ? createGraphFromData(graphOrData)
        : graphOrData;
      return App.createSimEngine(normalized, graphInput);
    }
    return null;
  };
})();
