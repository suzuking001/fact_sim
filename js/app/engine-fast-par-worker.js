(function(){
  const root = self;
  root.window = root;
  root.globalThis = root;
  root.App = root.App || {};

  const SIM_DT_SEC = 0.1;
  let simTimeMs = 0;
  let graph = null;
  let engine = null;
  let partition = null;
  let ownedNodeIdSet = new Set();
  let ownedSinkIdSet = new Set();
  let lastGraphData = null;
  let lastSentByLinkId = new Map();
  const originalMathRandom = Math.random.bind(Math);

  root.document = root.document || {
    body: null,
    documentElement: { style: { setProperty: function(){} } },
    getElementById: function(){ return null; },
    querySelector: function(){ return null; },
    querySelectorAll: function(){ return []; },
    createElement: function(){
      return {
        style: {},
        appendChild: function(){},
        removeChild: function(){},
        setAttribute: function(){},
        addEventListener: function(){},
        removeEventListener: function(){},
        getContext: function(){ return null; }
      };
    }
  };
  root.menuMixin = root.menuMixin || function(){};
  root.drawStateBelow = root.drawStateBelow || function(){};
  root.enableFlipIO = root.enableFlipIO || function(){};
  root.refreshFlipIO = root.refreshFlipIO || function(){};
  root.runNodeMutation = root.runNodeMutation || function(_node, fn){ return typeof fn === 'function' ? fn() : null; };
  root.applyNodeStateTheme = root.applyNodeStateTheme || function(){};
  root.defaultScript = root.defaultScript || function(){
    return `// work: Work object (work.id, work.type, etc.)
// signalArr: array of sigIn values

if(work.type === 'A'){
  this.properties.processTime = 5.0;
  this.properties.downTime = 3.0;
}else if(work.type === 'B'){
  this.properties.processTime = 4.0;
  this.properties.downTime = 2.0;
}else{
  // default
  this.properties.processTime = 10.0;
  this.properties.downTime = 2.0;
}

// Return true to accept this work item into PROCESS
return true;`;
  };
  root.WorkLinkAnimator = null;
  root.alert = root.alert || function(){};
  root.confirm = root.confirm || function(){ return false; };
  root.prompt = root.prompt || function(){ return null; };

  function simNow(){ return simTimeMs; }
  function advanceSimTime(ms){
    const delta = Number(ms);
    if(!Number.isFinite(delta) || delta <= 0) return;
    simTimeMs += delta;
  }
  function setSimTime(ms){
    const next = Number(ms);
    simTimeMs = (Number.isFinite(next) && next >= 0) ? next : 0;
  }
  function resetSimClock(){ setSimTime(0); }
  function getSimDtSec(){ return SIM_DT_SEC; }
  function updateSimTime(){}

  root.simNow = simNow;
  root.advanceSimTime = advanceSimTime;
  root.setSimTime = setSimTime;
  root.resetSimClock = resetSimClock;
  root.getSimDtSec = getSimDtSec;
  root.updateSimTime = updateSimTime;

  function configureGraphClock(g){
    if(!g) return;
    g.fixedtime_lapse = getSimDtSec();
    g.fixedtime = 0;
    g.globaltime = 0;
    g.elapsed_time = 0;
    g.iteration = 0;
    g.status = LGraph.STATUS_STOPPED;
  }

  function cloneJson(value){
    try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return value; }
  }

  function createSeededRandom(seed){
    let state = Math.floor(Math.abs(Number(seed) || 1)) % 2147483647;
    if(state === 0) state = 1;
    return function(){
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
  }

  function applySeed(seed){
    if(Number.isFinite(Number(seed))){
      Math.random = createSeededRandom(seed);
      return;
    }
    Math.random = originalMathRandom;
  }

  function stableSignature(value){
    if(value == null) return 'null';
    const t = typeof value;
    if(t === 'string' || t === 'number' || t === 'boolean'){
      return `${t}:${String(value)}`;
    }
    try{
      return `json:${JSON.stringify(value)}`;
    }catch(_e){
      return `obj:${Object.prototype.toString.call(value)}`;
    }
  }

  function importRequiredScripts(){
    try{
      importScripts('../vendor/litegraph.min.js');
    }catch(err){
      throw new Error(`Failed to load local LiteGraph in partition worker: ${err && err.message ? err.message : err}`);
    }
    importScripts(
      '../nodes-config.js',
      '../nodes/work.js',
      '../nodes/entity_model.js',
      '../nodes/entity_store.js',
      '../nodes/sigports.js',
      '../nodes/equipment.js',
      '../nodes/note.js',
      '../nodes/signal.js',
      '../nodes/source.js',
      '../nodes/entity_source.js',
      '../nodes/split.js',
      '../nodes/branch.js',
      '../nodes/merge2.js',
      '../nodes/join.js',
      '../nodes/agv_route.js',
      '../nodes/carrier_route.js',
      '../nodes/station.js',
      '../nodes/transfer_station.js',
      '../nodes/sink.js',
      '../nodes/basic_node.js',
      '../nodes/register.js',
      'graph-links.js',
      'stop-groups.js',
      'engine.js',
      'engine-fast-kernels.js',
      'engine-fast-compiler.js',
      'engine-fast-compat.js',
      'engine-fast-runtime.js',
      'engine-fast-par-protocol.js'
    );
  }

  importRequiredScripts();
  root.App.createLegacySimEngine = (typeof root.App.createSimEngine === 'function')
    ? root.App.createSimEngine.bind(root.App)
    : function(){ return null; };

  function buildGraph(data){
    const payload = cloneJson(data);
    const nextGraph = new LGraph();
    nextGraph.configure(payload);
    if(root.App.restoreEntityModel) root.App.restoreEntityModel(nextGraph, payload, true);
    if(root.App.repairGraphLinks && typeof root.App.repairGraphLinks === 'function'){
      root.App.repairGraphLinks(nextGraph);
    }
    if(root.App.stopGroups && typeof root.App.stopGroups.restoreSerializedData === 'function'){
      root.App.stopGroups.restoreSerializedData(nextGraph, payload, false);
    }
    configureGraphClock(nextGraph);
    if(!nextGraph.__dirtyNodeIds || typeof nextGraph.__dirtyNodeIds.add !== 'function'){
      nextGraph.__dirtyNodeIds = new Set();
    }
    return nextGraph;
  }

  function inertNode(node){
    if(!node || node.__eventFastParInertPatched) return;
    node.__eventFastParInertPatched = true;
    node.onExecute = function(){};
    node.getEventUntil = function(){ return NaN; };
    if(typeof node._until !== 'undefined') node._until = Infinity;
  }

  function preparePartitionGraph(targetGraph, part){
    partition = part || null;
    ownedNodeIdSet = new Set(Array.isArray(part && part.nodeIds) ? part.nodeIds.map(Number) : []);
    ownedSinkIdSet = new Set(Array.isArray(part && part.ownedSinkIds) ? part.ownedSinkIds.map(Number) : []);
    lastSentByLinkId = new Map();
    const nodes = Array.isArray(targetGraph && targetGraph._nodes) ? targetGraph._nodes : [];
    for(const node of nodes){
      if(!node || ownedNodeIdSet.has(Number(node.id))) continue;
      inertNode(node);
    }
  }

  function stopCurrentGraph(){
    if(engine && typeof engine.stop === 'function'){
      try{ engine.stop(); }catch(_e){}
    }
    if(graph && graph.status !== LGraph.STATUS_STOPPED){
      graph.status = LGraph.STATUS_STOPPED;
      try{ graph.sendEventToAllNodes('onStop'); }catch(_e){}
    }
  }

  function startGraph(){
    if(!graph) throw new Error('graph is not initialized');
    if(graph.status === LGraph.STATUS_RUNNING) return;
    graph.status = LGraph.STATUS_RUNNING;
    graph.starttime = LiteGraph.getTime();
    graph.last_update_time = graph.starttime;
    try{ graph.sendEventToAllNodes('onStart'); }catch(_e){}
  }

  function collectStats(){
    const stats = engine && typeof engine.getDebugStats === 'function'
      ? engine.getDebugStats()
      : null;
    if(stats){
      stats.partitionId = partition ? partition.partitionId : null;
      stats.ownedNodeCount = ownedNodeIdSet.size;
      stats.cutEdgeCount = Array.isArray(partition && partition.outgoingCutEdges) ? partition.outgoingCutEdges.length : 0;
    }
    return stats;
  }

  function collectOwnedSinkMetrics(targetGraph){
    const nodes = Array.isArray(targetGraph && targetGraph._nodes) ? targetGraph._nodes : [];
    const sinks = [];
    let totalCompleted = 0;
    for(const node of nodes){
      if(!node || !ownedSinkIdSet.has(Number(node.id))) continue;
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

  function collectOutgoingMessages(){
    const messages = [];
    const cutEdges = Array.isArray(partition && partition.outgoingCutEdges) ? partition.outgoingCutEdges : [];
    for(const edge of cutEdges){
      if(!edge) continue;
      const link = graph && graph.links ? graph.links[edge.linkId] : null;
      const source = graph && typeof graph.getNodeById === 'function'
        ? graph.getNodeById(edge.originId)
        : null;
      let value = null;
      if(source && Array.isArray(source.outputs) && source.outputs[edge.originSlot]){
        value = source.outputs[edge.originSlot]._data;
      }
      if((typeof value === 'undefined' || value === null) && link){
        if(typeof link.data !== 'undefined') value = link.data;
        else if(typeof link._data !== 'undefined') value = link._data;
      }
      const signature = stableSignature(value);
      const prev = lastSentByLinkId.get(edge.linkId);
      if(prev === signature) continue;
      lastSentByLinkId.set(edge.linkId, signature);
      messages.push({
        linkId: edge.linkId,
        originId: edge.originId,
        originSlot: edge.originSlot,
        targetId: edge.targetId,
        targetSlot: edge.targetSlot,
        fromPartitionId: edge.fromPartitionId,
        toPartitionId: edge.toPartitionId,
        value: cloneJson(value)
      });
    }
    return messages;
  }

  function initEngine(graphData, part, engineOptions, seed){
    stopCurrentGraph();
    applySeed(seed);
    lastGraphData = cloneJson(graphData);
    graph = buildGraph(lastGraphData);
    preparePartitionGraph(graph, part);
    setSimTime(0);
    engine = new root.App.EventFastEngine(graph, Object.assign({}, engineOptions || {}, {
      benchmark: true,
      render: false,
      allowExecutableFallback: true
    }));
    if(engine && typeof engine.reset === 'function') engine.reset();
    return {
      runtimeMode: engine && engine.runtimeMode ? engine.runtimeMode : 'compiled',
      stats: collectStats()
    };
  }

  function applyRemoteMessages(payload){
    if(!graph) throw new Error('partition graph is not initialized');
    const messages = Array.isArray(payload && payload.messages) ? payload.messages : [];
    let applied = 0;
    for(const message of messages){
      if(!message) continue;
      const link = graph.links ? graph.links[message.linkId] : null;
      const payloadValue = cloneJson(message.value);
      if(link){
        link.data = cloneJson(payloadValue);
        link._data = cloneJson(payloadValue);
      }
      const source = graph && typeof graph.getNodeById === 'function'
        ? graph.getNodeById(message.originId)
        : null;
      if(source && Array.isArray(source.outputs) && source.outputs[message.originSlot]){
        source.outputs[message.originSlot]._data = cloneJson(payloadValue);
      }
      const target = graph && typeof graph.getNodeById === 'function'
        ? graph.getNodeById(message.targetId)
        : null;
      if(target && Array.isArray(target.inputs) && target.inputs[message.targetSlot]){
        target.inputs[message.targetSlot].value = cloneJson(payloadValue);
      }
      if(graph.__dirtyNodeIds && typeof graph.__dirtyNodeIds.add === 'function'){
        graph.__dirtyNodeIds.add(Number(message.targetId));
      }
      applied += 1;
    }
    return { applied };
  }

  function applyAndFlush(payload){
    const applied = applyRemoteMessages(payload);
    const flushed = flushCurrent(payload);
    return {
      applied: applied.applied,
      simTimeMs: flushed.simTimeMs,
      rounds: flushed.rounds,
      emittedMessages: flushed.emittedMessages,
      stats: flushed.stats
    };
  }

  function flushCurrent(payload){
    if(!engine || !graph) throw new Error('worker engine is not initialized');
    const maxRounds = Math.max(1, Math.min(128, Math.floor(Number(payload && payload.maxRounds) || 24)));
    const nowMs = simNow();
    let rounds = 0;
    if(engine.runtimeMode !== 'legacy-compat'){
      while(rounds < maxRounds){
        const dirtyBefore = graph.__dirtyNodeIds ? graph.__dirtyNodeIds.size : 0;
        if(typeof engine._pullGraphDirtyIds === 'function') engine._pullGraphDirtyIds();
        if(typeof engine._runDirtyBatches === 'function') engine._runDirtyBatches(nowMs);
        let due = 0;
        if(typeof engine._drainDue === 'function') due = engine._drainDue(nowMs);
        if(due > 0 && typeof engine._runDirtyBatches === 'function'){
          engine._runDirtyBatches(nowMs);
        }
        rounds += 1;
        const dirtyAfter = graph.__dirtyNodeIds ? graph.__dirtyNodeIds.size : 0;
        if(dirtyBefore === 0 && dirtyAfter === 0 && due === 0) break;
      }
    }
    return {
      simTimeMs: simNow(),
      rounds,
      emittedMessages: collectOutgoingMessages(),
      stats: collectStats()
    };
  }

  function step(payload){
    if(!engine || !graph) throw new Error('worker engine is not initialized');
    const simDeltaMs = Math.max(0.5, Number(payload && payload.simDeltaMs) || 4);
    startGraph();
    engine.update(simDeltaMs);
    return {
      simTimeMs: simNow(),
      emittedMessages: collectOutgoingMessages(),
      stats: collectStats()
    };
  }

  function runBenchmarkCase(payload){
    if(!engine || !graph) throw new Error('worker engine is not initialized');
    const wallMs = Math.max(100, Number(payload && payload.wallMs) || 2000);
    const realStepMs = Math.max(1, Number(payload && payload.realStepMs) || 16);
    initEngine(payload.graphData || lastGraphData, payload.partition || partition, payload.engineOptions || {}, payload.seed);
    startGraph();
    const started = performance.now();
    let now = started;
    let loops = 0;
    while((now - started) < wallMs){
      engine.update(realStepMs);
      loops += 1;
      now = performance.now();
    }
    stopCurrentGraph();
    return {
      simTimeMs: simNow(),
      wallMs: Math.max(0, now - started),
      loops,
      stats: collectStats()
    };
  }

  function runUntilSimTime(payload){
    if(!engine || !graph) throw new Error('worker engine is not initialized');
    const targetSimMs = Math.max(1000, Number(payload && payload.targetSimMs) || 30000);
    const maxWallMs = Math.max(250, Number(payload && payload.maxWallMs) || 2500);
    const realStepMs = Math.max(1, Number(payload && payload.realStepMs) || 16);
    const maxLoops = Math.max(100, Math.floor(Number(payload && payload.maxLoops) || 25000));
    initEngine(payload.graphData || lastGraphData, payload.partition || partition, payload.engineOptions || {}, payload.seed);
    startGraph();
    const started = performance.now();
    let loops = 0;
    while(simNow() < targetSimMs){
      const now = performance.now();
      if((now - started) > maxWallMs) break;
      if(loops >= maxLoops) break;
      engine.update(realStepMs);
      loops += 1;
    }
    const finished = performance.now();
    return {
      simTimeMs: simNow(),
      wallMs: Math.max(0, finished - started),
      loops,
      ownedSnapshot: getSnapshot(),
      stats: collectStats()
    };
  }

  function getSnapshot(){
    if(!graph) throw new Error('partition graph is not initialized');
    const snapshot = graph.serialize();
    const ownedNodes = [];
    const nodes = Array.isArray(snapshot && snapshot.nodes) ? snapshot.nodes : [];
    for(const nodeData of nodes){
      if(ownedNodeIdSet.has(Number(nodeData && nodeData.id))){
        ownedNodes.push(nodeData);
      }
    }
    const runtimeLinks = [];
    const runtimeNodes = [];
    const graphNodes = Array.isArray(graph && graph._nodes) ? graph._nodes : [];
    for(const node of graphNodes){
      if(!node || !ownedNodeIdSet.has(Number(node.id))) continue;
      runtimeNodes.push({
        nodeId: Number(node.id),
        _state: typeof node._state !== 'undefined' ? cloneJson(node._state) : null,
        _stateName: typeof node._stateName !== 'undefined' ? cloneJson(node._stateName) : null,
        _until: Number.isFinite(Number(node._until)) ? Number(node._until) : null
      });
    }
    runtimeNodes.sort((a, b)=> a.nodeId - b.nodeId);
    const rawLinks = graph && graph.links && typeof graph.links === 'object'
      ? Object.values(graph.links)
      : [];
    for(const link of rawLinks){
      if(!link) continue;
      if(!ownedNodeIdSet.has(Number(link.origin_id))) continue;
      runtimeLinks.push({
        linkId: Number(link.id),
        originId: Number(link.origin_id),
        originSlot: Number(link.origin_slot),
        targetId: Number(link.target_id),
        targetSlot: Number(link.target_slot),
        data: cloneJson(typeof link.data !== 'undefined' ? link.data : null),
        _data: cloneJson(typeof link._data !== 'undefined' ? link._data : null)
      });
    }
    return {
      nodeIds: Array.from(ownedNodeIdSet),
      ownedNodes,
      runtimeNodes,
      runtimeLinks,
      sinkMetrics: collectOwnedSinkMetrics(graph),
      stats: collectStats()
    };
  }

  function response(id, ok, payload, error){
    root.postMessage({ id, ok, payload: payload || null, error: error ? String(error) : null });
  }

  root.onmessage = function(event){
    const data = event && event.data ? event.data : {};
    const id = data.id;
    const type = data.type;
    const payload = data.payload || {};
    Promise.resolve().then(()=>{
      const protocol = root.factSimEventFastParProtocol || {};
      switch(type){
        case protocol.INIT:
        case 'init':
          return initEngine(payload.graphData, payload.partition, payload.engineOptions, payload.seed);
        case protocol.RESET:
        case 'reset':
          return initEngine(payload.graphData || lastGraphData, payload.partition || partition, payload.engineOptions, payload.seed);
        case protocol.STEP:
        case 'step':
          return step(payload);
        case protocol.RUN_BENCHMARK_CASE:
        case 'runBenchmarkCase':
          return runBenchmarkCase(payload);
        case protocol.RUN_UNTIL_SIM_TIME:
        case 'runUntilSimTime':
          return runUntilSimTime(payload);
        case protocol.APPLY_REMOTE_MESSAGES:
        case 'applyRemoteMessages':
          return applyRemoteMessages(payload);
        case protocol.APPLY_AND_FLUSH:
        case 'applyAndFlush':
          return applyAndFlush(payload);
        case protocol.FLUSH:
        case 'flush':
          return flushCurrent(payload);
        case protocol.GET_SNAPSHOT:
        case 'getSnapshot':
          return getSnapshot();
        case protocol.GET_STATS:
        case 'getStats':
          return collectStats();
        case protocol.STOP:
        case 'stop':
          stopCurrentGraph();
          return { stats: collectStats() };
        case protocol.DISPOSE:
        case 'dispose':
          stopCurrentGraph();
          applySeed(null);
          graph = null;
          engine = null;
          partition = null;
          ownedNodeIdSet = new Set();
          ownedSinkIdSet = new Set();
          lastGraphData = null;
          lastSentByLinkId = new Map();
          return { disposed: true };
        default:
          throw new Error(`unknown par worker message: ${String(type || '')}`);
      }
    }).then((payloadOut)=>{
      response(id, true, payloadOut, null);
    }).catch((err)=>{
      response(id, false, null, err && err.stack ? err.stack : err);
    });
  };
})();
