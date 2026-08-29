(function(){
  const root = self;
  root.window = root;
  root.globalThis = root;
  root.App = root.App || {};

  const SIM_DT_SEC = 0.1;
  let simTimeMs = 0;
  let graph = null;
  let engine = null;
  let lastGraphData = null;
  let seededRandom = null;
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
      seededRandom = createSeededRandom(seed);
      Math.random = seededRandom;
      return;
    }
    seededRandom = null;
    Math.random = originalMathRandom;
  }

  function importRequiredScripts(){
    try{
      importScripts('../vendor/litegraph.min.js');
    }catch(err){
      throw new Error(`Failed to load local LiteGraph in worker: ${err && err.message ? err.message : err}`);
    }
    importScripts(
      '../nodes-config.js',
      '../nodes/work.js?v=20260828a',
      '../nodes/entity_model.js?v=20260829a',
      '../nodes/entity_store.js',
      '../nodes/sigports.js',
      '../nodes/equipment.js?v=20260824f',
      '../nodes/note.js',
      '../nodes/signal.js',
      '../nodes/source.js?v=20260829a',
      '../nodes/entity_source.js?v=20260824f',
      '../nodes/split.js?v=20260829a',
      '../nodes/branch.js?v=20260824f',
      '../nodes/merge2.js?v=20260824f',
      '../nodes/join.js?v=20260824f',
      '../nodes/agv_route.js?v=20260824f',
      '../nodes/carrier_route.js?v=20260829a',
      '../nodes/station.js?v=20260824f',
      '../nodes/transfer_station.js?v=20260824f',
      '../nodes/sink.js?v=20260824f',
      '../nodes/basic_node.js?v=20260829d',
      '../nodes/register.js',
      'graph-links.js',
      'stop-groups.js',
      'engine.js',
      'engine-fast-kernels.js?v=20260828a',
      'engine-fast-compiler.js',
      'engine-fast-compat.js',
      'engine-fast-runtime.js',
      'engine-fast-worker-protocol.js'
    );
    root.App.createLegacySimEngine = (typeof root.App.createSimEngine === 'function')
      ? root.App.createSimEngine.bind(root.App)
      : function(){ return null; };
  }

  importRequiredScripts();

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
    return nextGraph;
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

  function collectSinkMetrics(targetGraph){
    const nodes = Array.isArray(targetGraph && targetGraph._nodes) ? targetGraph._nodes : [];
    const sinks = [];
    let totalCompleted = 0;
    for(const node of nodes){
      if(!node) continue;
      if(!Array.isArray(node._recv)) continue;
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

  function initEngine(graphData, engineOptions, seed){
    stopCurrentGraph();
    applySeed(seed);
    lastGraphData = cloneJson(graphData);
    graph = buildGraph(lastGraphData);
    setSimTime(0);
    engine = new root.App.EventFastEngine(graph, Object.assign({}, engineOptions || {}));
    if(engine && typeof engine.reset === 'function') engine.reset();
    return {
      runtimeMode: engine && engine.runtimeMode ? engine.runtimeMode : 'compiled',
      stats: engine && typeof engine.getDebugStats === 'function' ? engine.getDebugStats() : null
    };
  }

  function startGraph(){
    if(!graph) throw new Error('graph is not initialized');
    graph.status = LGraph.STATUS_RUNNING;
    graph.starttime = LiteGraph.getTime();
    graph.last_update_time = graph.starttime;
    try{ graph.sendEventToAllNodes('onStart'); }catch(_e){}
  }

  function collectStats(){
    return engine && typeof engine.getDebugStats === 'function' ? engine.getDebugStats() : null;
  }

  function collectRuntimeLinkStates(targetGraph){
    const rows = [];
    const rawLinks = targetGraph && targetGraph.links && typeof targetGraph.links === 'object'
      ? Object.values(targetGraph.links)
      : [];
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
  function collectRuntimeNodeStates(targetGraph){
    const rows = [];
    const nodes = Array.isArray(targetGraph && targetGraph._nodes) ? targetGraph._nodes : [];
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

  function snapshotGraphData(targetGraph){
    if(!targetGraph) return null;
    const data = targetGraph.serialize();
    data.__factSimRuntimeNodes = collectRuntimeNodeStates(targetGraph);
    data.__factSimRuntimeLinks = collectRuntimeLinkStates(targetGraph);
    return data;
  }

  function runBenchmarkCase(payload){
    if(!engine || !graph) throw new Error('worker engine is not initialized');
    const wallMs = Math.max(100, Number(payload && payload.wallMs) || 2000);
    const realStepMs = Math.max(1, Number(payload && payload.realStepMs) || 16);
    if(String(payload && payload.renderCase || 'headless') === 'render'){
      throw new Error('event-fast-worker only supports headless benchmark runs');
    }
    if(lastGraphData) initEngine(lastGraphData, {}, payload && payload.seed);
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

  function step(payload){
    if(!engine || !graph) throw new Error('worker engine is not initialized');
    const simDeltaMs = Math.max(1, Number(payload && payload.simDeltaMs) || 16);
    if(graph.status !== LGraph.STATUS_RUNNING){
      startGraph();
    }
    engine.update(simDeltaMs);
    return {
      simTimeMs: simNow(),
      graphData: payload && payload.snapshot ? snapshotGraphData(graph) : null,
      stats: collectStats()
    };
  }

  function runUntilSimTime(payload){
    if(!engine || !graph) throw new Error('worker engine is not initialized');
    const targetSimMs = Math.max(1000, Number(payload && payload.targetSimMs) || 30000);
    const maxWallMs = Math.max(250, Number(payload && payload.maxWallMs) || 2500);
    const realStepMs = Math.max(1, Number(payload && payload.realStepMs) || 16);
    const maxLoops = Math.max(100, Math.floor(Number(payload && payload.maxLoops) || 25000));
    if(lastGraphData) initEngine(lastGraphData, {}, payload && payload.seed);
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
    const finalGraphData = snapshotGraphData(graph);
    const sinkMetrics = collectSinkMetrics(graph);
    stopCurrentGraph();
    return {
      simTimeMs: simNow(),
      wallMs: Math.max(0, finished - started),
      loops,
      finalGraphData,
      sinkMetrics,
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
      const protocol = root.factSimEventFastWorkerProtocol || {};
      switch(type){
        case protocol.INIT:
        case 'init':
          return initEngine(payload.graphData, payload.engineOptions, payload.seed);
        case protocol.RESET:
        case 'reset':
          return initEngine(payload.graphData || lastGraphData, payload.engineOptions, payload.seed);
        case protocol.STEP:
        case 'step':
          return step(payload);
        case protocol.RUN_BENCHMARK_CASE:
        case 'runBenchmarkCase':
          return runBenchmarkCase(payload);
        case protocol.RUN_UNTIL_SIM_TIME:
        case 'runUntilSimTime':
          return runUntilSimTime(payload);
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
          lastGraphData = null;
          return { disposed: true };
        default:
          throw new Error(`unknown worker message: ${String(type || '')}`);
      }
    }).then((payloadOut)=>{
      response(id, true, payloadOut, null);
    }).catch((err)=>{
      response(id, false, null, err && err.stack ? err.stack : err);
    });
  };
})();
