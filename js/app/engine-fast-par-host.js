var App = window.App || (window.App = {});

(function(){
  const PAR_MODE = 'event-fast-par';
  const PAR_WORKER_URL = 'js/app/engine-fast-par-worker.js?v=20260824f';
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

  function createGraphFromData(graphData){
    const data = (typeof App.compactGraphData === 'function')
      ? App.compactGraphData(cloneJson(graphData))
      : cloneJson(graphData);
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
    try{ console.error(`[${mode || PAR_MODE}] live sync failed`, error); }catch(_e){}
    try{
      const now = Date.now();
      const prevAt = Number(App._lastLiveSyncToastAt) || 0;
      if((now - prevAt) > 3000 && typeof App.showToast === 'function'){
        App._lastLiveSyncToastAt = now;
        App.showToast(`Live sync failed (${mode || 'parallel'}).`);
      }
    }catch(_e){}
  }

  function reduceGlobalSimTime(current, rows){
    const values = [];
    for(const row of Array.isArray(rows) ? rows : []){
      const value = Number(row && row.simTimeMs);
      if(Number.isFinite(value)) values.push(value);
    }
    if(!values.length) return Number.isFinite(Number(current)) ? Number(current) : 0;
    const next = Math.min.apply(null, values);
    return Number.isFinite(Number(current)) ? Math.max(Number(current), next) : next;
  }

  function buildRuntimeLinkStates(snapshotLinks){
    const states = [];
    const byId = new Map();
    for(const snapshot of Array.isArray(snapshotLinks) ? snapshotLinks : []){
      const runtimeLinks = Array.isArray(snapshot && snapshot.runtimeLinks) ? snapshot.runtimeLinks : [];
      for(const row of runtimeLinks){
        const linkId = Number(row && row.linkId);
        if(!Number.isFinite(linkId)) continue;
        byId.set(linkId, {
          linkId,
          originId: Number(row.originId),
          originSlot: Number(row.originSlot),
          targetId: Number(row.targetId),
          targetSlot: Number(row.targetSlot),
          data: cloneJson(typeof row.data !== 'undefined' ? row.data : null),
          _data: cloneJson(typeof row._data !== 'undefined' ? row._data : null)
        });
      }
    }
    for(const row of byId.values()) states.push(row);
    states.sort((a, b)=> a.linkId - b.linkId);
    return states;
  }
  function buildRuntimeNodeStates(snapshotNodes){
    const states = [];
    const byId = new Map();
    for(const snapshot of Array.isArray(snapshotNodes) ? snapshotNodes : []){
      const runtimeNodes = Array.isArray(snapshot && snapshot.runtimeNodes) ? snapshot.runtimeNodes : [];
      for(const row of runtimeNodes){
        const nodeId = Number(row && row.nodeId);
        if(!Number.isFinite(nodeId)) continue;
        byId.set(nodeId, {
          nodeId,
          _state: cloneJson(typeof row._state !== 'undefined' ? row._state : null),
          _stateName: cloneJson(typeof row._stateName !== 'undefined' ? row._stateName : null),
          _until: Number.isFinite(Number(row && row._until)) ? Number(row._until) : null
        });
      }
    }
    for(const row of byId.values()) states.push(row);
    states.sort((a, b)=> a.nodeId - b.nodeId);
    return states;
  }

  function applyRuntimeNodeStates(graph, graphData){
    if(!graph || typeof graph.getNodeById !== 'function') return;
    const states = Array.isArray(graphData && graphData.__factSimRuntimeNodes) ? graphData.__factSimRuntimeNodes : [];
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
    const states = Array.isArray(graphData && graphData.__factSimRuntimeLinks) ? graphData.__factSimRuntimeLinks : [];
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
      reportLiveSyncError(PAR_MODE, _e);
      return false;
    }
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
    merged.__factSimRuntimeNodes = buildRuntimeNodeStates(snapshots);
    merged.__factSimRuntimeLinks = buildRuntimeLinkStates(snapshots);
    return merged;
  }

  class PartitionWorkerHost{
    constructor(graphData, partition, options){
      this.partition = cloneJson(partition);
      this.graphData = cloneJson((partition && partition.localGraphData) ? partition.localGraphData : graphData);
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
      this._precomputedPlan = this.options.__precomputedPlan || null;
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
        const plan = this._precomputedPlan
          || App.createEventFastParPlan(this.graphData, requestedPartitions > 0 ? { partitionCount: requestedPartitions } : {});
        this._plan = plan;
        if(!canUseParWorker() || !plan || !plan.canParallelize){
          const fallbackMode = (plan && plan.fallbackMode) || 'event-fast-worker';
          this._runner = App.createHeadlessSimRunner(fallbackMode, this.graphData, this.options);
          let initial = null;
          if(this._runner && typeof this._runner.resetAsync === 'function'){
            try{ initial = await this._runner.resetAsync(); }catch(_e){}
          }
          this.runtimeMode = String(
            (initial && initial.runtimeMode)
            || (this._runner && this._runner.runtimeMode)
            || `fallback-${fallbackMode}`
          );
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
          let initial = null;
          if(this._runner && typeof this._runner.resetAsync === 'function'){
            try{ initial = await this._runner.resetAsync(); }catch(_e){}
          }
          this.runtimeMode = String(
            (initial && initial.runtimeMode)
            || (this._runner && this._runner.runtimeMode)
            || 'fallback-event-fast-worker'
          );
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
      aggregate.simTimeMs = reduceGlobalSimTime(this._lastSimTimeMs, list);
      return aggregate;
    }

    async resetAsync(){
      await this._ensureRunner();
      this._lastSimTimeMs = 0;
      if(this._runner && typeof this._runner.resetAsync === 'function'){
        const payload = await this._runner.resetAsync();
        this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
        this.runtimeMode = String(
          (payload && payload.runtimeMode)
          || (payload && payload.stats && payload.stats.runtimeMode)
          || (this._runner && this._runner.runtimeMode)
          || this.runtimeMode
        );
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
        this._lastSimTimeMs = reduceGlobalSimTime(this._lastSimTimeMs, results);
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
          this._lastSimTimeMs = reduceGlobalSimTime(this._lastSimTimeMs, flushResults);
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
        this.runtimeMode = String(
          (payload && payload.runtimeMode)
          || (payload && payload.stats && payload.stats.runtimeMode)
          || (this._runner && this._runner.runtimeMode)
          || this.runtimeMode
        );
        return payload;
      }
      if(this._independentPartitions){
        const payloads = await Promise.all(this._workers.map((worker)=> worker.runBenchmarkCaseAsync(options)));
        this._lastSimTimeMs = reduceGlobalSimTime(0, payloads);
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
        this.runtimeMode = String(
          (payload && payload.runtimeMode)
          || (payload && payload.stats && payload.stats.runtimeMode)
          || (this._runner && this._runner.runtimeMode)
          || this.runtimeMode
        );
        return payload;
      }
      if(this._independentPartitions){
        const payloads = await Promise.all(this._workers.map((worker)=> worker.runUntilSimTimeAsync(options)));
        this._lastSimTimeMs = reduceGlobalSimTime(0, payloads);
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

    async stepAsync(options){
      await this._ensureRunner();
      const opts = Object.assign({}, options || {});
      const simDeltaMs = Math.max(0.5, Number(opts.simDeltaMs) || 4);
      if(this._runner && typeof this._runner.stepAsync === 'function'){
        const payload = await this._runner.stepAsync(opts);
        this._lastSimTimeMs = Math.max(this._lastSimTimeMs, Number(payload && payload.simTimeMs) || 0);
        this._lastStats = payload && payload.stats ? payload.stats : this._lastStats;
        this.runtimeMode = String(
          (payload && payload.runtimeMode)
          || (payload && payload.stats && payload.stats.runtimeMode)
          || (this._runner && this._runner.runtimeMode)
          || this.runtimeMode
        );
        return payload;
      }
      const stepped = await this._stepParallel(simDeltaMs);
      let graphData = null;
      if(opts.snapshot){
        const snapshots = await Promise.all(this._workers.map((worker)=> worker.getSnapshotAsync()));
        graphData = mergeOwnedNodeSnapshots(this.graphData, snapshots);
      }
      return {
        simTimeMs: this._lastSimTimeMs,
        graphData,
        stats: stepped && stepped.stats ? stepped.stats : this._lastStats
      };
    }

    async getDebugStatsAsync(){
      await this._ensureRunner();
      if(this._runner && typeof this._runner.getDebugStatsAsync === 'function'){
        this._lastStats = await this._runner.getDebugStatsAsync();
        this.runtimeMode = String(
          (this._lastStats && this._lastStats.runtimeMode)
          || (this._runner && this._runner.runtimeMode)
          || this.runtimeMode
        );
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

  class LiveEventFastParEngine{
    constructor(graph, options){
      this.mode = PAR_MODE;
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
      this._runner = null;

      const graphData = serializeGraphData(graph);
      const plan = (typeof App.createEventFastParPlan === 'function')
        ? App.createEventFastParPlan(graphData, { partitionCount: this.options.partitionCount })
        : null;
      const canRunParallel = canUseParWorker() && !!(plan && plan.canParallelize);

      if(canRunParallel){
        this.runtimeMode = 'parallel-live';
        this._runner = new EventFastParHost(graphData, Object.assign({}, this.options, {
          partitionSubsteps: 1
        }));
      }else{
        this._runner = null;
        this._liveFallbackEngine = App.createSimEngine('event-fast', graph);
        this.runtimeMode = (this._liveFallbackEngine && this._liveFallbackEngine.runtimeMode)
          ? this._liveFallbackEngine.runtimeMode
          : `fallback-live-${plan && plan.fallbackMode ? plan.fallbackMode : 'event-fast'}`;
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

  App.EventFastParHost = EventFastParHost;
  App.LiveEventFastParEngine = LiveEventFastParEngine;
  const legacyGetSupportedSimModes = (typeof App.getSupportedSimModes === 'function')
    ? App.getSupportedSimModes.bind(App)
    : (()=> ['dt', 'event', 'event-fast']);
  const legacyNormalizeSimMode = (typeof App.normalizeSimMode === 'function')
    ? App.normalizeSimMode.bind(App)
    : ((mode)=> String(mode || '').trim().toLowerCase() === 'event' ? 'event' : 'dt');
  const legacyGetSimModeLabel = (typeof App.getSimModeLabel === 'function')
    ? App.getSimModeLabel.bind(App)
    : ((mode)=> String(mode || ''));
  const legacyCreateSimEngine = (typeof App.createSimEngine === 'function')
    ? App.createSimEngine.bind(App)
    : (()=> null);
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

  App.getSupportedSimModes = function(){
    const list = Array.isArray(legacyGetSupportedSimModes()) ? legacyGetSupportedSimModes().slice() : ['dt', 'event', 'event-fast'];
    if(canUseParWorker() && list.indexOf(PAR_MODE) < 0) list.push(PAR_MODE);
    return list;
  };
  App.normalizeSimMode = function(mode){
    const normalized = normalizeParMode(mode);
    if(normalized) return normalized;
    return legacyNormalizeSimMode(mode);
  };
  App.getSimModeLabel = function(mode){
    const normalized = App.normalizeSimMode(mode);
    if(normalized === PAR_MODE) return 'event-fast-par (multi worker)';
    return legacyGetSimModeLabel(normalized);
  };
  App.createSimEngine = function(mode, graphOrData){
    const normalized = App.normalizeSimMode(mode);
    if(normalized === PAR_MODE){
      const graphInput = (graphOrData && typeof graphOrData.serialize === 'function')
        ? graphOrData
        : createGraphFromData(graphOrData);
      return new LiveEventFastParEngine(graphInput, {});
    }
    return legacyCreateSimEngine(normalized, graphOrData);
  };
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
      const graphData = serializeGraphData(graphOrData);
      const requestedPartitions = Math.max(2, Math.floor(Number(options && options.partitionCount) || 0) || 0);
      const plan = App.createEventFastParPlan(
        graphData,
        requestedPartitions > 0 ? { partitionCount: requestedPartitions } : {}
      );
      if(!canUseParWorker() || !plan || !plan.canParallelize){
        const fallbackMode = (plan && plan.fallbackMode) || 'event-fast-worker';
        if(legacyCreateHeadlessSimRunner){
          return legacyCreateHeadlessSimRunner(fallbackMode, graphData, options);
        }
        return new EventFastParHost(graphData, Object.assign({}, options, { __precomputedPlan: plan }));
      }
      return new EventFastParHost(graphData, Object.assign({}, options, { __precomputedPlan: plan }));
    }
    return legacyCreateHeadlessSimRunner ? legacyCreateHeadlessSimRunner(normalized, graphOrData, options) : null;
  };
})();
