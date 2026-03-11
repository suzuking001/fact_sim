var App = window.App || (window.App = {});

(function(){
  const WORKER_MODE = 'event-fast-worker';
  const WORKER_URL = 'js/app/engine-fast-worker.js?v=20260310b';
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

  function syncLiveGraph(graph, graphData){
    if(!graph || !graphData) return false;
    const data = (typeof App.compactGraphData === 'function')
      ? App.compactGraphData(cloneJson(graphData))
      : cloneJson(graphData);
    try{
      graph.configure(data);
      if(App.repairGraphLinks && typeof App.repairGraphLinks === 'function'){
        try{ App.repairGraphLinks(graph); }catch(_e){}
      }
      if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
        try{ App.stopGroups.restoreSerializedData(graph, data, false); }catch(_e){}
      }
      graph.status = LGraph.STATUS_RUNNING;
      graph.last_update_time = LiteGraph.getTime();
      if(App.timelineChart){
        try{
          if(typeof App.timelineChart.attachGraph === 'function') App.timelineChart.attachGraph(graph);
          else App.timelineChart.graph = graph;
        }catch(_e){}
      }
      try{
        if(App.canvas && typeof App.canvas.setDirty === 'function') App.canvas.setDirty(true, true);
        else if(App.canvas && typeof App.canvas.draw === 'function') App.canvas.draw(true, true);
      }catch(_e){}
      return true;
    }catch(_e){
      return false;
    }
  }

  class EventFastWorkerFallbackHost{
    constructor(graphOrData, options){
      this.mode = WORKER_MODE;
      this.asyncOnly = true;
      this.options = Object.assign({}, options || {});
      this.graphData = serializeGraphForWorker(graphOrData);
      this._lastStats = null;
      this._lastRuntimeMode = 'fallback-event-fast';
    }

    _withSeed(seed, fn){
      if(!Number.isFinite(Number(seed))) return fn();
      const original = Math.random;
      let state = Math.floor(Math.abs(Number(seed) || 1)) % 2147483647;
      if(state === 0) state = 1;
      Math.random = function(){
        state = (state * 16807) % 2147483647;
        return (state - 1) / 2147483646;
      };
      try{
        return fn();
      }finally{
        Math.random = original;
      }
    }

    _createEngine(){
      const graph = createGraphFromData(this.graphData);
      const engine = App.createSimEngine('event-fast', graph);
      if(engine && typeof engine.reset === 'function') engine.reset();
      return { graph, engine };
    }

    _startGraph(graph){
      graph.status = LGraph.STATUS_RUNNING;
      graph.starttime = LiteGraph.getTime();
      graph.last_update_time = graph.starttime;
      try{ graph.sendEventToAllNodes('onStart'); }catch(_e){}
      if(typeof window.setSimTime === 'function'){
        try{ window.setSimTime(0); }catch(_e){}
      }
      if(typeof window.updateSimTime === 'function'){
        try{ window.updateSimTime(); }catch(_e){}
      }
    }

    _stopGraph(graph, engine){
      if(graph) try{ graph.sendEventToAllNodes('onStop'); }catch(_e){}
      if(engine && typeof engine.stop === 'function') try{ engine.stop(); }catch(_e){}
    }

    async resetAsync(){
      return { runtimeMode: this._lastRuntimeMode, stats: this._lastStats };
    }

    async runBenchmarkCaseAsync(options){
      const opts = Object.assign({ wallMs: 2000, realStepMs: 16 }, options || {});
      return this._withSeed(
        Number.isFinite(Number(opts.seed)) ? opts.seed : this.options.seed,
        ()=>{
          const { graph, engine } = this._createEngine();
          this._startGraph(graph);
          const started = performance.now();
          let now = started;
          let loops = 0;
          try{
            while((now - started) < opts.wallMs){
              if(engine && typeof engine.update === 'function') engine.update(opts.realStepMs);
              loops += 1;
              now = performance.now();
            }
            const simMs = (typeof window.simNow === 'function') ? Number(window.simNow()) : 0;
            const spentMs = Math.max(0, now - started);
            this._lastStats = (engine && typeof engine.getDebugStats === 'function') ? engine.getDebugStats() : null;
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
      );
    }

    async runUntilSimTimeAsync(options){
      const opts = Object.assign({ targetSimMs: 30000, maxWallMs: 2500, maxLoops: 25000, realStepMs: 16 }, options || {});
      return this._withSeed(
        Number.isFinite(Number(opts.seed)) ? opts.seed : this.options.seed,
        ()=>{
          const { graph, engine } = this._createEngine();
          this._startGraph(graph);
          const started = performance.now();
          let loops = 0;
          try{
            while(((typeof window.simNow === 'function') ? window.simNow() : 0) < opts.targetSimMs){
              const now = performance.now();
              if((now - started) > opts.maxWallMs) break;
              if(loops >= opts.maxLoops) break;
              if(engine && typeof engine.update === 'function') engine.update(opts.realStepMs);
              loops += 1;
            }
            const simMs = (typeof window.simNow === 'function') ? Number(window.simNow()) : 0;
            const finished = performance.now();
            const finalGraphData = graph ? graph.serialize() : null;
            const sinkMetrics = collectSinkMetrics(graph);
            this._lastStats = (engine && typeof engine.getDebugStats === 'function') ? engine.getDebugStats() : null;
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
      );
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
      this._inFlight = null;
      this._lastSnapshotAt = 0;
      this._snapshotIntervalMs = Math.max(33, Number(this.options.snapshotIntervalMs) || 120);
      this._liveFallbackEngine = null;

      const graphData = serializeGraphForWorker(graph);
      const safeForWorker = canUseWorkerMode() && !hasUnsafeWorkerTypes(graphData);
      if(safeForWorker){
        this.runtimeMode = 'worker-live';
        this._runner = new EventFastWorkerHost(graphData, this.options);
      }else{
        this.runtimeMode = 'fallback-live-event-fast';
        this._runner = null;
        this._liveFallbackEngine = App.createSimEngine('event-fast', graph);
      }
    }

    reset(){
      this._stopped = false;
      this._queuedDeltaMs = 0;
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
      const deltaMs = Math.max(1, this._queuedDeltaMs);
      this._queuedDeltaMs = 0;
      const requestSnapshot = !this._lastSnapshotAt || (performance.now() - this._lastSnapshotAt) >= this._snapshotIntervalMs;
      const ready = this._readyPromise || Promise.resolve();
      this._inFlight = ready
        .then(()=> this._runner.stepAsync({ simDeltaMs: deltaMs, snapshot: requestSnapshot }))
        .then((payload)=>{
          if(this._stopped || this._disposed || !payload) return;
          if(Number.isFinite(Number(payload.simTimeMs)) && typeof window.setSimTime === 'function'){
            try{ window.setSimTime(Number(payload.simTimeMs)); }catch(_e){}
          }
          if(payload.graphData && syncLiveGraph(this.graph, payload.graphData)){
            this._lastSnapshotAt = performance.now();
          }
          this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
          try{
            if(typeof window.updateSimTime === 'function') window.updateSimTime();
            if(App.timelineChart && typeof App.timelineChart.draw === 'function') App.timelineChart.draw();
          }catch(_e){}
        })
        .catch((err)=>{
          console.error(err);
        })
        .finally(()=>{
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
        this._queuedDeltaMs += delta;
      }
      this._scheduleDrain();
    }

    stop(){
      this._stopped = true;
      if(this._liveFallbackEngine && typeof this._liveFallbackEngine.stop === 'function'){
        try{ this._liveFallbackEngine.stop(); }catch(_e){}
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
      return null;
    }

    async disposeAsync(){
      if(this._disposed) return;
      this._disposed = true;
      this.stop();
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
      return new LiveEventFastWorkerEngine(graphOrData, {});
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
      const graphData = serializeGraphForWorker(graphOrData);
      if(canUseWorkerMode() && !hasUnsafeWorkerTypes(graphData)){
        return new EventFastWorkerHost(graphData, options);
      }
      return new EventFastWorkerFallbackHost(graphData, options);
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
