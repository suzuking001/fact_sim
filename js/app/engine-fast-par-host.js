var App = window.App || (window.App = {});

(function(){
  const PAR_MODE = 'event-fast-par';
  const PAR_WORKER_URL = 'js/app/engine-fast-par-worker.js?v=20260311b';
  const MAX_FLUSH_ROUNDS = 16;

  function cloneJson(value){
    try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return value; }
  }

  function normalizeParMode(mode){
    const raw = String(mode || '').trim().toLowerCase();
    if(raw === PAR_MODE || raw === 'event_fast_par' || raw === 'eventfastpar' || raw === 'fast-par' || raw === 'par'){
      return PAR_MODE;
    }
    return null;
  }

  function canUseParWorker(){
    return typeof Worker === 'function'
      && typeof window !== 'undefined'
      && String(window.location && window.location.protocol || '').toLowerCase() !== 'file:';
  }

  function serializeGraphData(graphOrData){
    if(graphOrData && typeof graphOrData.serialize === 'function'){
      if(typeof App.serializeGraphData === 'function') return cloneJson(App.serializeGraphData());
      const data = graphOrData.serialize();
      return (typeof App.compactGraphData === 'function') ? App.compactGraphData(data) : data;
    }
    return (typeof App.compactGraphData === 'function')
      ? App.compactGraphData(cloneJson(graphOrData))
      : cloneJson(graphOrData);
  }

  function bucketMessages(messages, partitionCount){
    const buckets = new Array(Math.max(0, partitionCount));
    for(let i = 0; i < buckets.length; i += 1) buckets[i] = [];
    for(const message of Array.isArray(messages) ? messages : []){
      if(!message) continue;
      const target = Number(message.toPartitionId);
      if(target < 0 || target >= buckets.length) continue;
      buckets[target].push(message);
    }
    return buckets;
  }

  function mergeOwnedNodeSnapshots(graphData, snapshots){
    const merged = cloneJson(graphData);
    const nodes = Array.isArray(merged && merged.nodes) ? merged.nodes : [];
    const indexById = new Map();
    for(let i = 0; i < nodes.length; i += 1){
      const nodeId = Number(nodes[i] && nodes[i].id);
      if(Number.isFinite(nodeId)) indexById.set(nodeId, i);
    }
    for(const snapshot of Array.isArray(snapshots) ? snapshots : []){
      const ownedNodes = Array.isArray(snapshot && snapshot.ownedNodes) ? snapshot.ownedNodes : [];
      for(const nodeData of ownedNodes){
        const nodeId = Number(nodeData && nodeData.id);
        const index = indexById.get(nodeId);
        if(typeof index === 'undefined') continue;
        nodes[index] = nodeData;
      }
    }
    merged.nodes = nodes;
    return merged;
  }

  class PartitionWorkerHost{
    constructor(graphData, partition, options){
      this.graphData = cloneJson(graphData);
      this.partition = cloneJson(partition);
      this.options = Object.assign({}, options || {});
      this._requestId = 1;
      this._pending = new Map();
      this._disposed = false;
      this._lastStats = null;
      this._worker = new Worker(PAR_WORKER_URL);
      this._worker.addEventListener('message', (event)=> this._handleMessage(event));
      this._worker.addEventListener('error', (event)=> this._handleError(event));
      this._ready = this._call((App.eventFastParProtocol || {}).INIT || 'init', {
        graphData: this.graphData,
        partition: this.partition,
        engineOptions: this.options.engineOptions || {},
        seed: this.options.seed
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
        pending.reject(new Error(String(data.error || 'partition worker request failed')));
        return;
      }
      pending.resolve(data.payload);
    }

    _handleError(event){
      const message = String(event && (event.message || (event.error && event.error.message)) || 'partition worker error');
      for(const pending of this._pending.values()){
        pending.reject(new Error(message));
      }
      this._pending.clear();
    }

    _call(type, payload){
      if(this._disposed) return Promise.reject(new Error('partition worker host disposed'));
      const id = this._requestId++;
      return new Promise((resolve, reject)=>{
        this._pending.set(id, { resolve, reject });
        this._worker.postMessage({ id, type, payload: payload || {} });
      });
    }

    async resetAsync(seed){
      await this._ready;
      const payload = await this._call((App.eventFastParProtocol || {}).RESET || 'reset', {
        graphData: this.graphData,
        partition: this.partition,
        engineOptions: this.options.engineOptions || {},
        seed
      });
      this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
      return payload;
    }

    async stepAsync(simDeltaMs){
      await this._ready;
      const payload = await this._call((App.eventFastParProtocol || {}).STEP || 'step', {
        simDeltaMs
      });
      this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
      return payload;
    }

    async runBenchmarkCaseAsync(options){
      await this._ready;
      const payload = await this._call((App.eventFastParProtocol || {}).RUN_BENCHMARK_CASE || 'runBenchmarkCase', Object.assign({
        graphData: this.graphData,
        partition: this.partition,
        engineOptions: this.options.engineOptions || {},
        seed: this.options.seed
      }, options || {}));
      this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
      return payload;
    }

    async runUntilSimTimeAsync(options){
      await this._ready;
      const payload = await this._call((App.eventFastParProtocol || {}).RUN_UNTIL_SIM_TIME || 'runUntilSimTime', Object.assign({
        graphData: this.graphData,
        partition: this.partition,
        engineOptions: this.options.engineOptions || {},
        seed: this.options.seed
      }, options || {}));
      this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
      return payload;
    }

    async applyRemoteMessagesAsync(messages){
      await this._ready;
      return this._call((App.eventFastParProtocol || {}).APPLY_REMOTE_MESSAGES || 'applyRemoteMessages', {
        messages: Array.isArray(messages) ? messages : []
      });
    }

    async applyAndFlushAsync(messages){
      await this._ready;
      const payload = await this._call((App.eventFastParProtocol || {}).APPLY_AND_FLUSH || 'applyAndFlush', {
        messages: Array.isArray(messages) ? messages : [],
        maxRounds: MAX_FLUSH_ROUNDS
      });
      this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
      return payload;
    }

    async flushAsync(){
      await this._ready;
      const payload = await this._call((App.eventFastParProtocol || {}).FLUSH || 'flush', {
        maxRounds: MAX_FLUSH_ROUNDS
      });
      this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
      return payload;
    }

    async getSnapshotAsync(){
      await this._ready;
      return this._call((App.eventFastParProtocol || {}).GET_SNAPSHOT || 'getSnapshot', {});
    }

    async getDebugStatsAsync(){
      await this._ready;
      const payload = await this._call((App.eventFastParProtocol || {}).GET_STATS || 'getStats', {});
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
        return await this._call((App.eventFastParProtocol || {}).STOP || 'stop', {});
      }catch(_e){
        return null;
      }
    }

    async disposeAsync(){
      if(this._disposed) return;
      this._disposed = true;
      try{ await this.stopAsync(); }catch(_e){}
      try{ this._worker.terminate(); }catch(_e){}
      for(const pending of this._pending.values()){
        pending.reject(new Error('partition worker host disposed'));
      }
      this._pending.clear();
    }
  }

  class EventFastParHost{
    constructor(graphOrData, options){
      this.mode = PAR_MODE;
      this.asyncOnly = true;
      this.options = Object.assign({ partitionSubsteps: 2 }, options || {});
      this.graphData = serializeGraphData(graphOrData);
      this._workers = [];
      this._runner = null;
      this._lastStats = null;
      this._lastSimTimeMs = 0;
      this.runtimeMode = 'parallel-pending';
      this._plan = null;
      this._initPromise = null;
      this._independentPartitions = false;
    }

    async _ensureRunner(){
      if(this._initPromise) return this._initPromise;
      this._initPromise = (async ()=>{
        const requestedPartitions = Math.max(2, Math.floor(Number(this.options.partitionCount) || 0) || 0);
        const plan = App.createEventFastParPlan(this.graphData, requestedPartitions > 0 ? { partitionCount: requestedPartitions } : {});
        this._plan = plan;
        if(!canUseParWorker() || !plan || !plan.canParallelize){
          const fallbackMode = (plan && plan.fallbackMode) || 'event-fast-worker';
          this._runner = App.createHeadlessSimRunner(fallbackMode, this.graphData, this.options);
          this.runtimeMode = `fallback-${fallbackMode}`;
          return { runtimeMode: this.runtimeMode, stats: null };
        }
        this._workers = plan.partitions.map((part)=>
          new PartitionWorkerHost(plan.graphData, part, this.options)
        );
        const ready = await Promise.all(this._workers.map((worker)=> worker._ready));
        const legacy = ready.find((row)=> row && row.runtimeMode === 'legacy-compat');
        if(legacy){
          await Promise.all(this._workers.map((worker)=> worker.disposeAsync()));
          this._workers = [];
          this._runner = App.createHeadlessSimRunner('event-fast-worker', this.graphData, this.options);
          this.runtimeMode = 'fallback-event-fast-worker';
          return { runtimeMode: this.runtimeMode, stats: null };
        }
        this._independentPartitions = Number(plan.cutEdgeCount) === 0;
        this.runtimeMode = this._independentPartitions ? 'parallel-independent' : 'parallel';
        this._lastStats = this._aggregateStats(ready.map((row)=> row && row.stats));
        return { runtimeMode: this.runtimeMode, stats: this._lastStats };
      })();
      return this._initPromise;
    }

    _aggregateStats(statsList){
      const list = Array.isArray(statsList) ? statsList.filter(Boolean) : [];
      const aggregate = {
        engine: PAR_MODE,
        runtimeMode: this.runtimeMode,
        partitionCount: Array.isArray(this._workers) ? this._workers.length : 0,
        simTimeMs: this._lastSimTimeMs,
        updateCalls: 0,
        nodeExec: 0,
        kernelExec: 0,
        compatExec: 0,
        heapPush: 0,
        heapPop: 0,
        heapReschedule: 0,
        sameTimeBatches: 0,
        sameTimeNodes: 0,
        sameTimeOverflows: 0,
        dirtyEnqueue: 0,
        boundaryHits: 0,
        fallbackNodeCount: 0,
        executableFallbackCount: 0,
        lastUpdateWallMs: 0,
        maxHeapSize: 0,
        perPartition: list.map((row)=> cloneJson(row))
      };
      for(const row of list){
        for(const key of Object.keys(aggregate)){
          if(key === 'engine' || key === 'runtimeMode' || key === 'partitionCount' || key === 'simTimeMs' || key === 'perPartition') continue;
          if(typeof aggregate[key] !== 'number') continue;
          if(key === 'lastUpdateWallMs' || key === 'maxHeapSize'){
            aggregate[key] = Math.max(aggregate[key], Number(row[key]) || 0);
          }else{
            aggregate[key] += Number(row[key]) || 0;
          }
        }
      }
      return aggregate;
    }

    async resetAsync(){
      await this._ensureRunner();
      this._lastSimTimeMs = 0;
      if(this._runner && typeof this._runner.resetAsync === 'function'){
        const payload = await this._runner.resetAsync();
        this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
        return payload;
      }
      const payloads = await Promise.all(this._workers.map((worker)=> worker.resetAsync(this.options.seed)));
      this._lastStats = this._aggregateStats(payloads.map((row)=> row && row.stats));
      return { runtimeMode: this.runtimeMode, stats: this._lastStats };
    }

    async _stepParallel(simDeltaMs){
      const partitionCount = this._workers.length;
      if(!partitionCount) return { simTimeMs: this._lastSimTimeMs, stats: this._lastStats };
      const substeps = Math.max(1, Math.min(16, Math.floor(Number(this.options.partitionSubsteps) || 4)));
      const subDelta = Math.max(0.25, Number(simDeltaMs) / substeps);
      let latestStats = null;
      for(let stepIndex = 0; stepIndex < substeps; stepIndex += 1){
        const results = await Promise.all(this._workers.map((worker)=> worker.stepAsync(subDelta)));
        this._lastSimTimeMs = Math.max(this._lastSimTimeMs, ...results.map((row)=> Number(row && row.simTimeMs) || 0));
        const statsByPartition = results.map((row)=> row && row.stats);
        let buckets = bucketMessages(
          results.flatMap((row)=> Array.isArray(row && row.emittedMessages) ? row.emittedMessages : []),
          partitionCount
        );
        for(let round = 0; round < MAX_FLUSH_ROUNDS; round += 1){
          const touched = [];
          for(let i = 0; i < buckets.length; i += 1){
            if(buckets[i] && buckets[i].length) touched.push(i);
          }
          const hasMessages = touched.length > 0;
          if(!hasMessages) break;
          const flushResults = await Promise.all(
            touched.map((index)=> this._workers[index].applyAndFlushAsync(buckets[index]))
          );
          this._lastSimTimeMs = Math.max(this._lastSimTimeMs, ...flushResults.map((row)=> Number(row && row.simTimeMs) || 0));
          for(let i = 0; i < touched.length; i += 1){
            const partitionIndex = touched[i];
            statsByPartition[partitionIndex] = flushResults[i] && flushResults[i].stats;
          }
          buckets = bucketMessages(
            flushResults.flatMap((row)=> Array.isArray(row && row.emittedMessages) ? row.emittedMessages : []),
            partitionCount
          );
        }
        latestStats = statsByPartition;
      }
      this._lastStats = this._aggregateStats(latestStats);
      return { simTimeMs: this._lastSimTimeMs, stats: this._lastStats };
    }

    async runBenchmarkCaseAsync(options){
      await this.resetAsync();
      if(this._runner && typeof this._runner.runBenchmarkCaseAsync === 'function'){
        const payload = await this._runner.runBenchmarkCaseAsync(options);
        this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
        return payload;
      }
      if(this._independentPartitions){
        const payloads = await Promise.all(this._workers.map((worker)=> worker.runBenchmarkCaseAsync(options)));
        this._lastSimTimeMs = Math.max(0, ...payloads.map((row)=> Number(row && row.simTimeMs) || 0));
        this._lastStats = this._aggregateStats(payloads.map((row)=> row && row.stats));
        return {
          simTimeMs: this._lastSimTimeMs,
          wallMs: Math.max(0, ...payloads.map((row)=> Number(row && row.wallMs) || 0)),
          loops: payloads.reduce((sum, row)=> sum + Math.max(0, Number(row && row.loops) || 0), 0),
          stats: this._lastStats
        };
      }
      const wallMs = Math.max(100, Number(options && options.wallMs) || 2000);
      const realStepMs = Math.max(1, Number(options && options.realStepMs) || 16);
      const started = performance.now();
      let now = started;
      let loops = 0;
      while((now - started) < wallMs){
        await this._stepParallel(realStepMs);
        loops += 1;
        now = performance.now();
      }
      return {
        simTimeMs: this._lastSimTimeMs,
        wallMs: Math.max(0, now - started),
        loops,
        stats: this._lastStats
      };
    }

    async runUntilSimTimeAsync(options){
      await this.resetAsync();
      if(this._runner && typeof this._runner.runUntilSimTimeAsync === 'function'){
        const payload = await this._runner.runUntilSimTimeAsync(options);
        this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
        return payload;
      }
      if(this._independentPartitions){
        const payloads = await Promise.all(this._workers.map((worker)=> worker.runUntilSimTimeAsync(options)));
        this._lastSimTimeMs = Math.max(0, ...payloads.map((row)=> Number(row && row.simTimeMs) || 0));
        this._lastStats = this._aggregateStats(payloads.map((row)=> row && row.stats));
        const snapshots = payloads.map((row)=> row && row.ownedSnapshot).filter(Boolean);
        const sinkMetrics = { sinkCount: 0, totalCompleted: 0, sinks: [] };
        for(const snapshot of snapshots){
          const row = snapshot && snapshot.sinkMetrics;
          if(!row) continue;
          sinkMetrics.sinkCount += Math.max(0, Number(row.sinkCount) || 0);
          sinkMetrics.totalCompleted += Math.max(0, Number(row.totalCompleted) || 0);
          if(Array.isArray(row.sinks)) sinkMetrics.sinks.push.apply(sinkMetrics.sinks, row.sinks);
        }
        return {
          simTimeMs: this._lastSimTimeMs,
          wallMs: Math.max(0, ...payloads.map((row)=> Number(row && row.wallMs) || 0)),
          loops: payloads.reduce((sum, row)=> sum + Math.max(0, Number(row && row.loops) || 0), 0),
          finalGraphData: mergeOwnedNodeSnapshots(this.graphData, snapshots),
          sinkMetrics,
          stats: this._lastStats
        };
      }
      const targetSimMs = Math.max(1000, Number(options && options.targetSimMs) || 30000);
      const maxWallMs = Math.max(250, Number(options && options.maxWallMs) || 2500);
      const realStepMs = Math.max(1, Number(options && options.realStepMs) || 16);
      const maxLoops = Math.max(100, Math.floor(Number(options && options.maxLoops) || 25000));
      const started = performance.now();
      let loops = 0;
      while(this._lastSimTimeMs < targetSimMs){
        const now = performance.now();
        if((now - started) > maxWallMs) break;
        if(loops >= maxLoops) break;
        await this._stepParallel(realStepMs);
        loops += 1;
      }
      const finished = performance.now();
      const snapshots = await Promise.all(this._workers.map((worker)=> worker.getSnapshotAsync()));
      const sinkMetrics = { sinkCount: 0, totalCompleted: 0, sinks: [] };
      for(const snapshot of snapshots){
        const row = snapshot && snapshot.sinkMetrics;
        if(!row) continue;
        sinkMetrics.sinkCount += Math.max(0, Number(row.sinkCount) || 0);
        sinkMetrics.totalCompleted += Math.max(0, Number(row.totalCompleted) || 0);
        if(Array.isArray(row.sinks)) sinkMetrics.sinks.push.apply(sinkMetrics.sinks, row.sinks);
      }
      return {
        simTimeMs: this._lastSimTimeMs,
        wallMs: Math.max(0, finished - started),
        loops,
        finalGraphData: mergeOwnedNodeSnapshots(this.graphData, snapshots),
        sinkMetrics,
        stats: this._lastStats
      };
    }

    async getDebugStatsAsync(){
      await this._ensureRunner();
      if(this._runner && typeof this._runner.getDebugStatsAsync === 'function'){
        this._lastStats = await this._runner.getDebugStatsAsync();
        return this._lastStats;
      }
      const rows = await Promise.all(this._workers.map((worker)=> worker.getDebugStatsAsync()));
      this._lastStats = this._aggregateStats(rows);
      return this._lastStats;
    }

    getDebugStats(){
      return this._lastStats ? cloneJson(this._lastStats) : null;
    }

    async stopAsync(){
      if(this._runner && typeof this._runner.stopAsync === 'function'){
        return this._runner.stopAsync();
      }
      return Promise.all(this._workers.map((worker)=> worker.stopAsync()));
    }

    async disposeAsync(){
      if(this._runner && typeof this._runner.disposeAsync === 'function'){
        await this._runner.disposeAsync();
        this._runner = null;
      }
      if(this._workers.length){
        await Promise.all(this._workers.map((worker)=> worker.disposeAsync()));
        this._workers = [];
      }
      this._initPromise = null;
    }
  }

  App.EventFastParHost = EventFastParHost;
  const legacyNormalizeHeadlessSimMode = (typeof App.normalizeHeadlessSimMode === 'function')
    ? App.normalizeHeadlessSimMode.bind(App)
    : ((typeof App.normalizeSimMode === 'function') ? App.normalizeSimMode.bind(App) : ((mode)=> String(mode || '')));
  const legacyGetHeadlessModeLabel = (typeof App.getHeadlessModeLabel === 'function')
    ? App.getHeadlessModeLabel.bind(App)
    : ((typeof App.getSimModeLabel === 'function') ? App.getSimModeLabel.bind(App) : ((mode)=> String(mode || '')));
  const legacyIsHeadlessOnlyBenchmarkMode = (typeof App.isHeadlessOnlyBenchmarkMode === 'function')
    ? App.isHeadlessOnlyBenchmarkMode.bind(App)
    : (()=> false);
  const legacyGetBenchmarkSimModes = (typeof App.getBenchmarkSimModes === 'function')
    ? App.getBenchmarkSimModes.bind(App)
    : (()=> []);
  const legacyGetEngineTestModes = (typeof App.getEngineTestModes === 'function')
    ? App.getEngineTestModes.bind(App)
    : (()=> []);
  const legacyCreateHeadlessSimRunner = (typeof App.createHeadlessSimRunner === 'function')
    ? App.createHeadlessSimRunner.bind(App)
    : null;

  App.normalizeHeadlessSimMode = function(mode){
    const normalized = normalizeParMode(mode);
    if(normalized) return normalized;
    return legacyNormalizeHeadlessSimMode(mode);
  };
  App.getHeadlessModeLabel = function(mode){
    const normalized = App.normalizeHeadlessSimMode(mode);
    if(normalized === PAR_MODE) return 'event-fast-par (multi worker)';
    return legacyGetHeadlessModeLabel(normalized);
  };
  App.isHeadlessOnlyBenchmarkMode = function(mode){
    const normalized = App.normalizeHeadlessSimMode(mode);
    if(normalized === PAR_MODE) return true;
    return legacyIsHeadlessOnlyBenchmarkMode(normalized);
  };
  App.getBenchmarkSimModes = function(){
    const list = Array.isArray(legacyGetBenchmarkSimModes()) ? legacyGetBenchmarkSimModes().slice() : [];
    if(canUseParWorker() && list.indexOf(PAR_MODE) < 0) list.push(PAR_MODE);
    return list;
  };
  App.getEngineTestModes = function(){
    const list = Array.isArray(legacyGetEngineTestModes()) ? legacyGetEngineTestModes().slice() : [];
    if(canUseParWorker() && list.indexOf(PAR_MODE) < 0) list.push(PAR_MODE);
    return list;
  };
  App.createHeadlessSimRunner = function(mode, graphOrData, options){
    const normalized = App.normalizeHeadlessSimMode(mode);
    if(normalized === PAR_MODE){
      return new EventFastParHost(graphOrData, options);
    }
    return legacyCreateHeadlessSimRunner ? legacyCreateHeadlessSimRunner(normalized, graphOrData, options) : null;
  };
})();
