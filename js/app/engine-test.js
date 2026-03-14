var App = window.App || (window.App = {});

(function(){
  const DEFAULT_EXAMPLES = [];
  const EXAMPLE_ALIASES = { agv_config: 'carrier', carrier_config: 'carrier' };
  const EXAMPLE_FILES = {
    simple: 'sample/simple.json',
    branch: 'sample/branch.json',
    parallel_benchmark: 'sample/parallel_benchmark.json',
    shuttle_line5: 'sample/shuttle_line5.json',
    carrier: 'sample/graph (3).json',
    pallet_station_demo: 'sample/pallet_station_demo.json',
    sample_line1: 'sample/sample_line1.json',
    sample_line2: 'sample/sample_line2.json'
  };
  const DEFAULTS = {
    suite: 'standard',
    includeCurrentGraph: true,
    includeExamples: true,
    examples: DEFAULT_EXAMPLES,
    targetSimMs: 30000,
    maxWallMs: 2500,
    realStepMs: 16,
    maxLoops: 25000,
    liveProbeTargetSimMs: 5000,
    liveProbeMaxWallMs: 1200,
    liveProbeMaxLoops: 320,
    liveStateSampleStepMs: 250,
    strictFinalParity: false,
    seed: 1,
    seeds: null,
    reruns: 0,
    stopOnFirstFailure: false,
    saveArtifacts: false,
    artifactLabel: ''
  };
  const SUITE_PRESETS = {
    quick: {
      targetSimMs: 10000,
      maxWallMs: 1800,
      liveProbeTargetSimMs: 3000,
      liveProbeMaxWallMs: 900,
      liveProbeMaxLoops: 220,
      liveStateSampleStepMs: 250,
      strictFinalParity: false,
      seeds: [1]
    },
    standard: {
      targetSimMs: 30000,
      maxWallMs: 2500,
      liveProbeTargetSimMs: 5000,
      liveProbeMaxWallMs: 1200,
      liveProbeMaxLoops: 320,
      liveStateSampleStepMs: 250,
      strictFinalParity: false,
      seeds: [1]
    },
    soak: {
      targetSimMs: 120000,
      maxWallMs: 6000,
      liveProbeTargetSimMs: 10000,
      liveProbeMaxWallMs: 2500,
      liveProbeMaxLoops: 900,
      liveStateSampleStepMs: 200,
      strictFinalParity: true,
      seeds: [1, 7]
    }
  };
  const FINAL_SNAPSHOT_SETTLE_EPS_MS = 0.001;
  const STRICT_FINAL_SNAPSHOT_SETTLE_MS = 100;
  const SCAN_SKIP = new Set(['app', 'canvas', 'constructor', 'flags', 'graph', 'inputs', 'outputs', 'parent', 'widgets', 'widgets_values']);
  const LIVE_PROBE_ENGINES = new Set(['dt', 'event-fast-worker', 'event-fast-par']);

  function nowSimMs(){ return (typeof window.simNow === 'function') ? Number(window.simNow()) : 0; }
  function getLinkCount(graph){ return (graph && graph.links && typeof graph.links === 'object') ? Object.keys(graph.links).length : 0; }
  function cloneJson(value){ try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return value; } }
  function uniq(values){
    const out = [];
    const seen = new Set();
    for(const raw of (Array.isArray(values) ? values : [])){
      const value = String(raw == null ? '' : raw).trim();
      if(!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }
  function toFinitePositiveInt(value){
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(1, Math.floor(Math.abs(n))) : null;
  }
  function normalizeSeedList(values){
    const out = [];
    const seen = new Set();
    const push = (value)=>{
      const normalized = toFinitePositiveInt(value);
      if(!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      out.push(normalized);
    };
    if(Array.isArray(values)){
      for(const value of values) push(value);
    }else if(typeof values === 'string'){
      for(const token of values.split(/[,\s]+/)) push(token);
    }else if(typeof values !== 'undefined' && values !== null){
      push(values);
    }
    return out;
  }
  function engineStatus(errors, warnings){ return errors > 0 ? 'FAIL' : warnings > 0 ? 'WARN' : 'PASS'; }
  function issue(severity, code, message, extra){
    return Object.assign({ severity, code, message: String(message || code) }, extra || {});
  }
  function pushIssue(list, seen, item, limit){
    if(!list || !seen || !item || list.length >= limit) return;
    const key = [item.severity || '', item.code || '', item.engine || '', item.scenario || '', item.path || '', item.message || ''].join('|');
    if(seen.has(key)) return;
    seen.add(key);
    list.push(item);
  }
  function resolveExampleKey(name){
    const key = String(name == null ? '' : name).trim();
    return key ? (EXAMPLE_ALIASES[key] || key) : '';
  }
  async function loadExampleData(name){
    const key = resolveExampleKey(name);
    if(!key) throw new Error('example name is required');
    const embedded = window.EXAMPLES && window.EXAMPLES[key];
    if(embedded) return cloneJson(embedded);
    const file = EXAMPLE_FILES[key] || `sample/${key}.json`;
    const response = await fetch(encodeURI(file));
    if(!response.ok) throw new Error(`failed to load ${file}: ${response.status}`);
    return response.json();
  }
  function supportedEngines(){
    if(window.App && typeof App.getEngineTestModes === 'function') return uniq(App.getEngineTestModes());
    if(window.App && typeof App.getSupportedSimModes === 'function') return uniq(App.getSupportedSimModes());
    return ['dt', 'event'];
  }
  function defaultEngineTestEngines(){
    const all = supportedEngines().map(normalizeEngineMode);
    const ordered = [];
    const seen = new Set();
    const push = (value)=>{
      const normalized = normalizeEngineMode(value);
      if(!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      ordered.push(normalized);
    };
    push('dt');
    for(const engine of all) push(engine);
    return ordered;
  }
  function defaultExampleIds(){
    const ordered = [];
    const seen = new Set();
    const push = (value)=>{
      const normalized = resolveExampleKey(value);
      if(!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      ordered.push(normalized);
    };
    try{
      const select = document.getElementById('exampleSelect');
      if(select && select.options){
        for(const option of Array.from(select.options)){
          const value = String(option && option.value == null ? '' : option.value).trim();
          if(!value) continue;
          push(value);
        }
      }
    }catch(_e){}
    Object.keys(EXAMPLE_FILES).forEach(push);
    try{
      if(window.EXAMPLES && typeof window.EXAMPLES === 'object'){
        Object.keys(window.EXAMPLES).forEach(push);
      }
    }catch(_e){}
    return ordered;
  }
  function normalizeEngineMode(mode){
    if(window.App && typeof App.normalizeHeadlessSimMode === 'function') return App.normalizeHeadlessSimMode(mode);
    if(window.App && typeof App.normalizeSimMode === 'function') return App.normalizeSimMode(mode);
    return String(mode || '').trim().toLowerCase() === 'event' ? 'event' : 'dt';
  }
  function isHeadlessOnlyMode(mode){
    return !!(window.App
      && typeof App.isHeadlessOnlyBenchmarkMode === 'function'
      && App.isHeadlessOnlyBenchmarkMode(mode));
  }
  function normalizeOptions(options){
    const source = (options && typeof options === 'object') ? options : {};
    const raw = Object.assign({}, DEFAULTS, source);
    const requestedSuite = String(raw.suite || DEFAULTS.suite || 'standard').trim().toLowerCase();
    const suite = Object.prototype.hasOwnProperty.call(SUITE_PRESETS, requestedSuite) ? requestedSuite : DEFAULTS.suite;
    const preset = SUITE_PRESETS[suite] || SUITE_PRESETS.standard;
    const engines = uniq(raw.engines && raw.engines.length ? raw.engines : defaultEngineTestEngines()).map(normalizeEngineMode);
    if(engines.some((engine)=> LIVE_PROBE_ENGINES.has(engine) && engine !== 'dt') && engines.indexOf('dt') < 0){
      engines.unshift('dt');
    }
    const targetSimMs = Math.max(1000, Number(Object.prototype.hasOwnProperty.call(source, 'targetSimMs') ? raw.targetSimMs : preset.targetSimMs) || DEFAULTS.targetSimMs);
    const realStepMs = Math.max(1, Number(raw.realStepMs) || DEFAULTS.realStepMs);
    const derivedLoopFloor = Math.ceil(targetSimMs / realStepMs) + 1024;
    const hasExplicitMaxLoops = Object.prototype.hasOwnProperty.call(source, 'maxLoops') && Number.isFinite(Number(raw.maxLoops));
    const normalizedSeeds = normalizeSeedList(
      Object.prototype.hasOwnProperty.call(source, 'seeds')
        ? raw.seeds
        : (Object.prototype.hasOwnProperty.call(source, 'seed') ? [raw.seed] : preset.seeds)
    );
    return {
      suite,
      engines,
      includeCurrentGraph: raw.includeCurrentGraph !== false,
      includeExamples: raw.includeExamples !== false,
      examples: uniq(raw.examples && raw.examples.length ? raw.examples : defaultExampleIds()),
      targetSimMs,
      maxWallMs: Math.max(250, Number(Object.prototype.hasOwnProperty.call(source, 'maxWallMs') ? raw.maxWallMs : preset.maxWallMs) || DEFAULTS.maxWallMs),
      realStepMs,
      maxLoops: hasExplicitMaxLoops
        ? Math.max(100, Math.floor(Number(raw.maxLoops)))
        : Math.max(DEFAULTS.maxLoops, derivedLoopFloor),
      liveProbeTargetSimMs: Math.max(1000, Number(Object.prototype.hasOwnProperty.call(source, 'liveProbeTargetSimMs') ? raw.liveProbeTargetSimMs : preset.liveProbeTargetSimMs) || DEFAULTS.liveProbeTargetSimMs),
      liveProbeMaxWallMs: Math.max(250, Number(Object.prototype.hasOwnProperty.call(source, 'liveProbeMaxWallMs') ? raw.liveProbeMaxWallMs : preset.liveProbeMaxWallMs) || DEFAULTS.liveProbeMaxWallMs),
      liveProbeMaxLoops: Math.max(32, Math.floor(Number(Object.prototype.hasOwnProperty.call(source, 'liveProbeMaxLoops') ? raw.liveProbeMaxLoops : preset.liveProbeMaxLoops) || DEFAULTS.liveProbeMaxLoops)),
      liveStateSampleStepMs: Math.max(50, Math.floor(Number(Object.prototype.hasOwnProperty.call(source, 'liveStateSampleStepMs') ? raw.liveStateSampleStepMs : preset.liveStateSampleStepMs) || DEFAULTS.liveStateSampleStepMs)),
      strictFinalParity: Object.prototype.hasOwnProperty.call(source, 'strictFinalParity') ? !!raw.strictFinalParity : !!preset.strictFinalParity,
      seed: normalizedSeeds.length ? normalizedSeeds[0] : (Number.isFinite(Number(raw.seed)) ? Math.floor(Math.abs(Number(raw.seed))) : null),
      seeds: normalizedSeeds.length ? normalizedSeeds : [1],
      reruns: Math.max(0, Math.floor(Number(raw.reruns) || 0)),
      stopOnFirstFailure: !!raw.stopOnFirstFailure,
      saveArtifacts: !!raw.saveArtifacts,
      artifactLabel: String(raw.artifactLabel || '').trim()
    };
  }
  function finalSnapshotSettleMs(options){
    if(!(options && options.strictFinalParity)) return FINAL_SNAPSHOT_SETTLE_EPS_MS;
    const realStepMs = Math.max(1, Number(options.realStepMs) || DEFAULTS.realStepMs);
    return Math.max(FINAL_SNAPSHOT_SETTLE_EPS_MS, STRICT_FINAL_SNAPSHOT_SETTLE_MS, realStepMs);
  }
  function createSeededRandom(seed){
    let state = Math.floor(Math.abs(Number(seed) || 1)) % 2147483647;
    if(state === 0) state = 1;
    return function(){ state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  }
  async function withSeed(seed, runner){
    if(!Number.isFinite(seed)) return runner();
    const original = Math.random;
    Math.random = createSeededRandom(seed);
    try{ return await runner(); } finally { Math.random = original; }
  }
  function nextTick(){
    return new Promise((resolve)=> setTimeout(resolve, 0));
  }
  function createRunContext(){
    if(!App.graph || typeof App.graph.serialize !== 'function') throw new Error('App.graph is not ready');
    const snapshot = (typeof App.serializeGraphData === 'function')
      ? App.serializeGraphData()
      : App.graph.serialize();
    if(!(typeof App.serializeGraphData === 'function')
      && App.stopGroups && typeof App.stopGroups.injectSerializedData === 'function'){
      App.stopGroups.injectSerializedData(snapshot, App.graph);
    }
    return {
      snapshot,
      originalTime: nowSimMs(),
      originalMode: (typeof App.getSimMode === 'function') ? App.getSimMode() : (App.simMode || null),
      prevSuspendTimeline: !!App._suspendTimeline
    };
  }
  function restoreRunContext(ctx){
    if(!ctx) return;
    App._suspendTimeline = !!ctx.prevSuspendTimeline;
    if(typeof App.setSimMode === 'function' && ctx.originalMode) try{ App.setSimMode(ctx.originalMode); }catch(_e){}
    if(typeof window.setSimTime === 'function') try{ window.setSimTime(ctx.originalTime); }catch(_e){}
    if(typeof window.updateSimTime === 'function') try{ window.updateSimTime(); }catch(_e){}
  }
  function createGraphFromData(data){
    const payload = (typeof App.compactGraphData === 'function') ? App.compactGraphData(cloneJson(data)) : cloneJson(data);
    const graph = new LGraph();
    graph.configure(payload);
    if(App.repairGraphLinks && typeof App.repairGraphLinks === 'function') App.repairGraphLinks(graph);
    if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function') App.stopGroups.restoreSerializedData(graph, payload, false);
    applySerializedRuntimeNodeStates(graph, payload);
    applySerializedRuntimeLinkStates(graph, payload);
    if(typeof configureGraphClock === 'function') configureGraphClock(graph);
    return graph;
  }
  function applySerializedRuntimeNodeStates(graph, graphData){
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
  function applySerializedRuntimeLinkStates(graph, graphData){
    if(!graph || !graph.links || typeof graph.links !== 'object') return;
    const states = Array.isArray(graphData && graphData.__factSimRuntimeLinks) ? graphData.__factSimRuntimeLinks : [];
    const byId = new Map(states.map((row)=> [Number(row && row.linkId), row]));
    for(const raw of Object.values(graph.links)){
      if(!raw) continue;
      const state = byId.get(Number(raw.id)) || null;
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
  function shouldRunLiveProbe(engine){
    return LIVE_PROBE_ENGINES.has(String(engine || '').trim());
  }
  function resolveEffectiveLiveEngine(engine){
    const seen = new Set();
    let current = engine || null;
    while(current && current._liveFallbackEngine && !seen.has(current)){
      seen.add(current);
      current = current._liveFallbackEngine;
    }
    return current || engine || null;
  }
  function inspectTimelineEntries(timeline){
    const entries = timeline && timeline.entries;
    if(!entries || typeof entries.forEach !== 'function') return { entryCount: 0, segmentCount: 0, maxEndSec: 0 };
    let entryCount = 0;
    let segmentCount = 0;
    let maxEndSec = 0;
    entries.forEach((entry)=>{
      entryCount += 1;
      const segments = Array.isArray(entry && entry.segments) ? entry.segments : [];
      segmentCount += segments.length;
      for(const seg of segments){
        const end = Number(seg && seg.end);
        if(Number.isFinite(end) && end > maxEndSec) maxEndSec = end;
      }
    });
    return { entryCount, segmentCount, maxEndSec };
  }
  function isWorkPortName(name){
    return /work/i.test(String(name == null ? '' : name));
  }
  function extractWorkRefs(value, out, depth, seen){
    if(value == null || depth > 4) return;
    if(Array.isArray(value)){
      for(const item of value) extractWorkRefs(item, out, depth + 1, seen);
      return;
    }
    if(typeof value !== 'object') return;
    if(seen && seen.has(value)) return;
    if(seen) seen.add(value);
    if(Object.prototype.hasOwnProperty.call(value, 'id')){
      const type = Object.prototype.hasOwnProperty.call(value, 'type') ? String(value.type == null ? '' : value.type) : '';
      out.push(`${String(value.id)}:${type}`);
      return;
    }
    const candidateKeys = ['work', 'payload', 'item', 'items', 'cargo', 'works', 'queue', 'currentWork'];
    for(const key of candidateKeys){
      if(Object.prototype.hasOwnProperty.call(value, key)){
        extractWorkRefs(value[key], out, depth + 1, seen);
      }
    }
  }
  function inspectWorkLinkEntries(graph){
    const rawLinks = graph && graph.links && typeof graph.links === 'object'
      ? Object.values(graph.links)
      : [];
    const observedLinkKeys = new Set();
    const observedWorkRefs = new Set();
    let activeLinkCount = 0;
    let payloadCount = 0;
    for(const link of rawLinks){
      if(!link) continue;
      const source = graph && typeof graph.getNodeById === 'function' ? graph.getNodeById(Number(link.origin_id)) : null;
      const target = graph && typeof graph.getNodeById === 'function' ? graph.getNodeById(Number(link.target_id)) : null;
      const sourcePort = source && Array.isArray(source.outputs) ? source.outputs[link.origin_slot] : null;
      const targetPort = target && Array.isArray(target.inputs) ? target.inputs[link.target_slot] : null;
      const sourceName = sourcePort && typeof sourcePort.name !== 'undefined' ? sourcePort.name : '';
      const targetName = targetPort && typeof targetPort.name !== 'undefined' ? targetPort.name : '';
      if(!isWorkPortName(sourceName) && !isWorkPortName(targetName)) continue;
      let payload = typeof link.data !== 'undefined' ? link.data : undefined;
      if((typeof payload === 'undefined' || payload === null) && typeof link._data !== 'undefined') payload = link._data;
      if((typeof payload === 'undefined' || payload === null) && sourcePort && typeof sourcePort._data !== 'undefined') payload = sourcePort._data;
      if((typeof payload === 'undefined' || payload === null) && targetPort && typeof targetPort.value !== 'undefined') payload = targetPort.value;
      const refs = [];
      extractWorkRefs(payload, refs, 0, new WeakSet());
      if(!refs.length) continue;
      activeLinkCount += 1;
      payloadCount += refs.length;
      const deduped = Array.from(new Set(refs)).sort();
      const pathKey = `${Number(source && source.id)}:${String(sourceName)}->${Number(target && target.id)}:${String(targetName)}`;
      for(const ref of deduped){
        observedWorkRefs.add(ref);
        observedLinkKeys.add(`${pathKey}:${ref}`);
      }
    }
    return {
      activeLinkCount,
      payloadCount,
      observedLinkKeys: Array.from(observedLinkKeys).sort(),
      observedWorkRefs: Array.from(observedWorkRefs).sort()
    };
  }
  function getNodeStateToken(node){
    if(!node || (typeof node._state === 'undefined' && typeof node._stateName === 'undefined')) return '';
    const state = String(node && typeof node._state !== 'undefined' && node._state !== null ? node._state : '').trim().toUpperCase();
    const stateName = String(node && typeof node._stateName !== 'undefined' && node._stateName !== null ? node._stateName : '').trim();
    if(stateName) return `${stateName}|${state || 'UNKNOWN'}`;
    return state || '';
  }
  function collectStateSnapshot(graph){
    const rows = [];
    const nodes = Array.isArray(graph && graph._nodes) ? graph._nodes.slice() : [];
    nodes.sort((a, b)=> (Number(a && a.id) || 0) - (Number(b && b.id) || 0));
    for(const node of nodes){
      const token = getNodeStateToken(node);
      if(!token) continue;
      const nodeId = Number(node && node.id);
      rows.push({
        key: `${nodeId}:${String(node && (node.title || node.type || `Node #${nodeId}`))}`,
        nodeId,
        label: String(node && (node.title || node.type || `Node #${nodeId}`)),
        state: token
      });
    }
    return { nodeCount: rows.length, rows };
  }
  function collectEntityLedger(graph){
    const locationsByRef = new Map();
    const duplicateRefs = [];
    const uniqueRefs = new Set();
    const candidateKeys = ['_recv', '_queue', 'queue', '_buf', 'buffer', 'cargo', '_cargo', 'works', '_works', 'currentWork', '_currentWork', 'payload', '_payload', 'item', 'items', 'work', 'workOffer', 'pendingUnload', 'pendingWork'];
    const recordRefs = (location, refs)=>{
      const deduped = Array.from(new Set(Array.isArray(refs) ? refs : [])).sort();
      for(const ref of deduped){
        uniqueRefs.add(ref);
        const list = locationsByRef.get(ref) || [];
        list.push(location);
        locationsByRef.set(ref, list);
      }
    };
    const nodes = Array.isArray(graph && graph._nodes) ? graph._nodes : [];
    for(const node of nodes){
      if(!node) continue;
      const refs = [];
      for(const key of candidateKeys){
        if(!Object.prototype.hasOwnProperty.call(node, key)) continue;
        extractWorkRefs(node[key], refs, 0, new WeakSet());
      }
      if(refs.length){
        recordRefs(`node:${Number(node.id)}`, refs);
      }
    }
    for(const [ref, locations] of locationsByRef.entries()){
      if((locations || []).length > 1){
        duplicateRefs.push({ ref, locations: locations.slice(0, 8) });
      }
    }
    duplicateRefs.sort((a, b)=> String(a.ref).localeCompare(String(b.ref)));
    return {
      uniqueCount: uniqueRefs.size,
      refs: Array.from(uniqueRefs).sort(),
      duplicateRefs
    };
  }
  function normalizeSinkSnapshot(sinks){
    const rows = [];
    for(const sink of Array.isArray(sinks) ? sinks : []){
      const id = Number(sink && sink.id);
      const title = String(sink && (sink.title || `Sink #${id}`));
      rows.push({
        key: `${id}:${title}`,
        id,
        title,
        completedCount: Math.max(0, Number(sink && sink.completedCount) || 0)
      });
    }
    rows.sort((a, b)=> a.id - b.id || String(a.title).localeCompare(String(b.title)));
    return rows;
  }
  function isStatefulNode(node){
    return !!getNodeStateToken(node);
  }
  function captureStateSample(graph, probe, sampleMs){
    if(!graph || !probe) return;
    const nodes = Array.isArray(graph._nodes) ? graph._nodes.slice() : [];
    nodes.sort((a, b)=> (Number(a && a.id) || 0) - (Number(b && b.id) || 0));
    const sampleSec = Number(sampleMs) / 1000;
    probe.sampleTimesSec.push(Number(sampleSec.toFixed(3)));
    for(const node of nodes){
      if(!isStatefulNode(node)) continue;
      const nodeId = Number(node && node.id);
      if(!Number.isFinite(nodeId)) continue;
      const key = `${nodeId}:${String(node && (node.title || node.type || 'node'))}`;
      let row = probe.nodeStates.get(key);
      if(!row){
        row = {
          nodeId,
          label: String(node && (node.title || node.type || `Node #${nodeId}`)),
          sequence: []
        };
        probe.nodeStates.set(key, row);
      }
      row.sequence.push(getNodeStateToken(node));
    }
  }
  function finalizeStateProbe(probe){
    if(!probe) return null;
    const nodeStates = Array.from(probe.nodeStates.entries())
      .sort((a, b)=> a[1].nodeId - b[1].nodeId)
      .map(([key, row])=> ({
        key,
        nodeId: row.nodeId,
        label: row.label,
        sequence: row.sequence.slice()
      }));
    let changingNodeCount = 0;
    for(const row of nodeStates){
      if(new Set(row.sequence).size > 1) changingNodeCount += 1;
    }
    return {
      sampleStepMs: probe.sampleStepMs,
      sampleTimesSec: probe.sampleTimesSec.slice(),
      sampleCount: probe.sampleTimesSec.length,
      nodeCount: nodeStates.length,
      changingNodeCount,
      nodeStates
    };
  }
  function isMeaningfulStateSequence(sequence){
    const seq = Array.isArray(sequence) ? sequence : [];
    if(!seq.length) return false;
    const unique = new Set(seq);
    if(unique.size > 1) return true;
    const token = String(seq[0] || '').toUpperCase();
    return token.indexOf('IDLE') < 0;
  }
  function compactStateSequence(sequence){
    const seq = Array.isArray(sequence) ? sequence : [];
    const out = [];
    for(const token of seq){
      const value = String(token || '');
      if(!out.length || out[out.length - 1] !== value) out.push(value);
    }
    return out;
  }
  function stateSequencesEquivalent(baseSeq, rowSeq){
    const a = compactStateSequence(baseSeq);
    const b = compactStateSequence(rowSeq);
    if(JSON.stringify(a) === JSON.stringify(b)) return true;
    if(Math.abs(a.length - b.length) > 1) return false;
    const shortSeq = a.length <= b.length ? a : b;
    const longSeq = a.length <= b.length ? b : a;
    if(JSON.stringify(shortSeq) === JSON.stringify(longSeq.slice(0, shortSeq.length))) return true;
    return false;
  }
  function parseStateToken(token){
    const raw = String(token || '');
    const idx = raw.lastIndexOf('|');
    if(idx < 0) return { detail: raw, phase: '' };
    return {
      detail: raw.slice(0, idx),
      phase: raw.slice(idx + 1).toUpperCase()
    };
  }
  function finalStateTokensEquivalent(baseToken, rowToken){
    if(String(baseToken || '') === String(rowToken || '')) return true;
    const a = parseStateToken(baseToken);
    const b = parseStateToken(rowToken);
    if(String(a.detail || '') !== String(b.detail || '')) return false;
    const activePhases = new Set(['PROCESS', 'DOWN', 'WAIT']);
    return activePhases.has(a.phase) && activePhases.has(b.phase);
  }
  function buildTimelineSignature(timeline, quantMs){
    const entries = timeline && timeline.entries;
    const quantSec = Math.max(0.05, Number(quantMs) / 1000);
    if(!entries || typeof entries.forEach !== 'function'){
      return { quantMs, rowCount: 0, activeRowCount: 0, rows: [] };
    }
    const rows = [];
    entries.forEach((entry, key)=>{
      const label = String(entry && entry.label || key || '');
      const rawSegments = Array.isArray(entry && entry.segments) ? entry.segments : [];
      const compacted = [];
      for(const seg of rawSegments){
        if(!seg) continue;
        const state = String(seg.state || 'other').toLowerCase();
        const start = Number(seg.start);
        const end = Number(seg.end);
        const durationSec = (Number.isFinite(start) && Number.isFinite(end)) ? Math.max(0, end - start) : 0;
        const durationBins = Math.max(0, Math.round(durationSec / quantSec));
        if(!durationBins) continue;
        const last = compacted[compacted.length - 1];
        if(last && last.state === state){
          last.durationBins += durationBins;
        }else{
          compacted.push({ state, durationBins });
        }
      }
      while(compacted.length && (compacted[0].state === 'idle' || compacted[0].state === 'other')){
        compacted.shift();
      }
      while(compacted.length && (compacted[compacted.length - 1].state === 'idle' || compacted[compacted.length - 1].state === 'other')){
        compacted.pop();
      }
      const meaningful = compacted.some((seg)=> seg.state !== 'idle' && seg.state !== 'other');
      rows.push({
        key: String(key),
        label,
        meaningful,
        signature: compacted
      });
    });
    rows.sort((a, b)=>{
      const aid = Number(String(a.key).split(':')[0]);
      const bid = Number(String(b.key).split(':')[0]);
      if(Number.isFinite(aid) && Number.isFinite(bid) && aid !== bid) return aid - bid;
      return String(a.label).localeCompare(String(b.label));
    });
    return {
      quantMs,
      rowCount: rows.length,
      activeRowCount: rows.filter((row)=> row.meaningful).length,
      rows
    };
  }
  function timelineSignaturesEquivalent(baseSig, rowSig){
    const a = Array.isArray(baseSig) ? baseSig : [];
    const b = Array.isArray(rowSig) ? rowSig : [];
    if(a.length === 0 && b.length === 0) return true;
    if(Math.abs(a.length - b.length) > 1) return false;
    const limit = Math.min(a.length, b.length);
    for(let i = 0; i < limit; i += 1){
      if(String(a[i].state) !== String(b[i].state)) return false;
      const tolerance = (i === limit - 1) ? 2 : 1;
      if(Math.abs(Number(a[i].durationBins) - Number(b[i].durationBins)) > tolerance) return false;
    }
    if(a.length === b.length) return true;
    const tail = (a.length > b.length ? a[a.length - 1] : b[b.length - 1]) || null;
    return !!(tail && Number(tail.durationBins) <= 1);
  }
  async function runLiveTimelineProbe(source, engine, options){
    if(typeof TimelineChart === 'undefined' || typeof document === 'undefined' || !document.body) return { skipped: true, reason: 'timeline-unavailable' };
    const payload = (typeof App.compactGraphData === 'function') ? App.compactGraphData(cloneJson(source.data)) : cloneJson(source.data);
    const graph = createGraphFromData(payload);
    const prevTime = nowSimMs();
    const prevTimeline = App.timelineChart;
    const prevWindowTimeline = window.timelineChart;
    const prevCanvas = App.canvas;
    const prevWindowCanvas = window.canvas;
    const prevSuspendTimeline = !!App._suspendTimeline;
    const prevLiveSyncError = App._lastLiveSyncError ? cloneJson(App._lastLiveSyncError) : null;
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-20000px';
    host.style.top = '-20000px';
    host.style.width = '1280px';
    host.style.height = '360px';
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 360;
    canvas.style.width = '1280px';
    canvas.style.height = '360px';
    host.appendChild(canvas);
    document.body.appendChild(host);
    const timeline = new TimelineChart(canvas);
    const stubCanvas = { setDirty(){}, draw(){} };
    let simEngine = null;
    let effectiveEngine = null;
    let simMs = 0;
    let loops = 0;
    let wallMs = 0;
    const flowProbe = {
      nonEmptySteps: 0,
      maxActiveLinks: 0,
      maxPayloadCount: 0,
      observedLinkKeys: new Set(),
      observedWorkRefs: new Set()
    };
    const stateProbe = {
      sampleStepMs: options.liveStateSampleStepMs,
      nextSampleAtMs: 0,
      sampleTimesSec: [],
      nodeStates: new Map()
    };
    try{
      App.timelineChart = timeline;
      window.timelineChart = timeline;
      App.canvas = stubCanvas;
      window.canvas = stubCanvas;
      App._suspendTimeline = false;
      App._lastLiveSyncError = null;
      timeline.attachGraph(graph);
      if(typeof window.setSimTime === 'function') window.setSimTime(0);
      simEngine = App.createSimEngine(engine, graph);
      effectiveEngine = resolveEffectiveLiveEngine(simEngine);
      const liveRuntimeMode = String((simEngine && simEngine.runtimeMode) || (effectiveEngine && effectiveEngine.runtimeMode) || '').trim();
      if(simEngine !== effectiveEngine || /^fallback-live-/i.test(liveRuntimeMode)){
        return { skipped: true, runtimeMode: liveRuntimeMode || null, reason: 'fallback-live-runtime' };
      }
      if(!effectiveEngine || typeof effectiveEngine.update !== 'function'){
        return { ok: false, code: 'LIVE_ENGINE_CREATE_FAILED', message: `Engine "${engine}" did not return a live update() runner` };
      }
      if(typeof simEngine._snapshotIntervalMs === 'number') simEngine._snapshotIntervalMs = 0;
      if(effectiveEngine !== simEngine && typeof effectiveEngine._snapshotIntervalMs === 'number') effectiveEngine._snapshotIntervalMs = 0;
      if(typeof effectiveEngine.reset === 'function') effectiveEngine.reset();
      graph.status = LGraph.STATUS_RUNNING;
      graph.starttime = LiteGraph.getTime();
      graph.last_update_time = graph.starttime;
      try{ graph.sendEventToAllNodes('onStart'); }catch(_e){}
      const started = performance.now();
      captureStateSample(graph, stateProbe, 0);
      stateProbe.nextSampleAtMs = Math.max(0, Number(options.liveStateSampleStepMs) || 250);
      while(simMs < options.liveProbeTargetSimMs){
        const now = performance.now();
        if((now - started) > options.liveProbeMaxWallMs) break;
        if(loops >= options.liveProbeMaxLoops) break;
        effectiveEngine.update(options.realStepMs);
        if(effectiveEngine && effectiveEngine._inFlight && typeof effectiveEngine._inFlight.then === 'function'){
          try{ await effectiveEngine._inFlight; }catch(_e){}
        }else if(simEngine && simEngine !== effectiveEngine && simEngine._inFlight && typeof simEngine._inFlight.then === 'function'){
          try{ await simEngine._inFlight; }catch(_e){}
        }else{
          await nextTick();
        }
        simMs = nowSimMs();
        loops += 1;
        while(stateProbe.nextSampleAtMs <= simMs + 0.001){
          captureStateSample(graph, stateProbe, stateProbe.nextSampleAtMs);
          stateProbe.nextSampleAtMs += stateProbe.sampleStepMs;
        }
        const flow = inspectWorkLinkEntries(graph);
        if(flow.activeLinkCount > 0) flowProbe.nonEmptySteps += 1;
        if(flow.activeLinkCount > flowProbe.maxActiveLinks) flowProbe.maxActiveLinks = flow.activeLinkCount;
        if(flow.payloadCount > flowProbe.maxPayloadCount) flowProbe.maxPayloadCount = flow.payloadCount;
        for(const key of flow.observedLinkKeys){
          if(flowProbe.observedLinkKeys.size < 512) flowProbe.observedLinkKeys.add(key);
        }
        for(const key of flow.observedWorkRefs){
          if(flowProbe.observedWorkRefs.size < 512) flowProbe.observedWorkRefs.add(key);
        }
      }
      wallMs = Math.max(0, performance.now() - started);
      const liveSyncError = App._lastLiveSyncError ? cloneJson(App._lastLiveSyncError) : null;
      if(liveSyncError){
        return {
          ok: false,
          code: 'LIVE_SYNC_FAILED',
          message: `Live graph sync failed for "${engine}" on ${source.name}: ${liveSyncError.message || 'unknown error'}`,
          simMs,
          loops,
          wallMs,
          runtimeMode: String((simEngine && simEngine.runtimeMode) || (effectiveEngine && effectiveEngine.runtimeMode) || '').trim() || null
        };
      }
      const scan = inspectTimelineEntries(timeline);
      if(simMs <= 0.001){
        return { ok: false, code: 'LIVE_NO_SIM_PROGRESS', message: `Live engine "${engine}" made no simulation progress`, simMs, loops, wallMs, timeline: scan, state: finalizeStateProbe(stateProbe) };
      }
      if(scan.entryCount <= 0 || scan.segmentCount <= 0 || scan.maxEndSec <= 0){
        return { ok: false, code: 'LIVE_TIMELINE_EMPTY', message: `Live engine "${engine}" did not populate timeline entries`, simMs, loops, wallMs, timeline: scan, flow: {
          nonEmptySteps: flowProbe.nonEmptySteps,
          maxActiveLinks: flowProbe.maxActiveLinks,
          maxPayloadCount: flowProbe.maxPayloadCount,
          observedLinkKeys: Array.from(flowProbe.observedLinkKeys).sort(),
          observedWorkRefs: Array.from(flowProbe.observedWorkRefs).sort()
        }, state: finalizeStateProbe(stateProbe), timelineSignature: buildTimelineSignature(timeline, options.liveStateSampleStepMs) };
      }
      return { ok: true, simMs, loops, wallMs, timeline: scan, flow: {
        nonEmptySteps: flowProbe.nonEmptySteps,
        maxActiveLinks: flowProbe.maxActiveLinks,
        maxPayloadCount: flowProbe.maxPayloadCount,
        observedLinkKeys: Array.from(flowProbe.observedLinkKeys).sort(),
        observedWorkRefs: Array.from(flowProbe.observedWorkRefs).sort()
      }, state: finalizeStateProbe(stateProbe), timelineSignature: buildTimelineSignature(timeline, options.liveStateSampleStepMs) };
    } finally {
      if(graph) try{ graph.sendEventToAllNodes('onStop'); }catch(_e){}
      if(simEngine && typeof simEngine.stopAsync === 'function') try{ await simEngine.stopAsync(); }catch(_e){}
      if(simEngine && typeof simEngine.disposeAsync === 'function') try{ await simEngine.disposeAsync(); }catch(_e){}
      if(simEngine && typeof simEngine.stop === 'function') try{ simEngine.stop(); }catch(_e){}
      if(effectiveEngine && effectiveEngine !== simEngine && typeof effectiveEngine.stopAsync === 'function') try{ await effectiveEngine.stopAsync(); }catch(_e){}
      if(effectiveEngine && effectiveEngine !== simEngine && typeof effectiveEngine.disposeAsync === 'function') try{ await effectiveEngine.disposeAsync(); }catch(_e){}
      if(effectiveEngine && effectiveEngine !== simEngine && typeof effectiveEngine.stop === 'function') try{ effectiveEngine.stop(); }catch(_e){}
      App.timelineChart = prevTimeline;
      window.timelineChart = prevWindowTimeline;
      App.canvas = prevCanvas;
      window.canvas = prevWindowCanvas;
      App._suspendTimeline = prevSuspendTimeline;
      App._lastLiveSyncError = prevLiveSyncError;
      if(typeof window.setSimTime === 'function') try{ window.setSimTime(prevTime); }catch(_e){}
      try{ if(host.parentNode) host.parentNode.removeChild(host); }catch(_e){}
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
      const throughput = (typeof node.getThroughputPerHour === 'function') ? Number(node.getThroughputPerHour()) : NaN;
      totalCompleted += Math.max(0, completed);
      sinks.push({ id: node.id, title: node.title || `Sink #${node.id}`, completedCount: Math.max(0, completed), throughputPerHour: Number.isFinite(throughput) ? Number(throughput.toFixed(3)) : 0 });
    }
    return { sinkCount: sinks.length, totalCompleted, sinks };
  }
  function scanNonFinite(value, path, depth, seen, issues, limit){
    if(issues.length >= limit) return;
    if(typeof value === 'number'){ if(!Number.isFinite(value)) issues.push({ path }); return; }
    if(!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if(Array.isArray(value)){
      if(depth >= 2) return;
      for(let i = 0; i < value.length && i < 12 && issues.length < limit; i += 1) scanNonFinite(value[i], `${path}[${i}]`, depth + 1, seen, issues, limit);
      return;
    }
    if(depth >= 2) return;
    for(const key of Object.keys(value).slice(0, 24)){
      if(SCAN_SKIP.has(key) || typeof value[key] === 'function') continue;
      scanNonFinite(value[key], `${path}.${key}`, depth + 1, seen, issues, limit);
      if(issues.length >= limit) break;
    }
  }
  function collectInvariantIssues(graph, expected){
    const failures = [];
    const warnings = [];
    const nodes = Array.isArray(graph && graph._nodes) ? graph._nodes : [];
    if(nodes.length !== expected.nodeCount) failures.push(issue('error', 'GRAPH_NODE_COUNT_CHANGED', `Node count changed from ${expected.nodeCount} to ${nodes.length}`));
    if(getLinkCount(graph) !== expected.linkCount) failures.push(issue('error', 'GRAPH_LINK_COUNT_CHANGED', `Link count changed from ${expected.linkCount} to ${getLinkCount(graph)}`));
    if(graph && graph.links && typeof graph.links === 'object'){
      for(const [linkId, link] of Object.entries(graph.links)){
        if(!link) continue;
        if(!(graph.getNodeById && graph.getNodeById(link.origin_id)) || !(graph.getNodeById && graph.getNodeById(link.target_id))){
          failures.push(issue('error', 'BROKEN_LINK_REFERENCE', `Link ${linkId} points to a missing node`, { path: `graph.links.${linkId}` }));
          if(failures.length >= 8) break;
        }
      }
    }
    for(const node of nodes){
      if(!node) continue;
      if(!hasFinitePair(node.pos)) failures.push(issue('error', 'NODE_POSITION_INVALID', `Node ${node.id} has an invalid position`, { nodeId: node.id }));
      if(!hasFinitePair(node.size)) failures.push(issue('error', 'NODE_SIZE_INVALID', `Node ${node.id} has an invalid size`, { nodeId: node.id }));
      if(typeof node._until !== 'undefined' && !Number.isFinite(Number(node._until))) failures.push(issue('error', 'NODE_UNTIL_NON_FINITE', `Node ${node.id} has a non-finite _until`, { nodeId: node.id, path: `node#${node.id}._until` }));
      const numericIssues = [];
      scanNonFinite(node, `node#${node.id}`, 0, new WeakSet(), numericIssues, 6);
      for(const numeric of numericIssues) failures.push(issue('error', 'NON_FINITE_NUMERIC_STATE', `Found non-finite numeric state at ${numeric.path}`, { nodeId: node.id, path: numeric.path }));
      if(failures.length >= 16) break;
    }
    const sinks = collectSinkMetrics(graph);
    if(sinks.totalCompleted < 0 || !Number.isFinite(sinks.totalCompleted)) failures.push(issue('error', 'INVALID_TOTAL_COMPLETED', 'Total completed count became invalid'));
    if(sinks.sinkCount === 0) warnings.push(issue('warn', 'NO_SINKS_DETECTED', 'No sink nodes were detected in the tested graph'));
    return { failures, warnings };
  }
  function hasFinitePair(value){
    if(!value || typeof value.length !== 'number' || value.length < 2) return false;
    return Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
  }
  async function buildSources(options, ctx){
    const sources = [];
    const issues = [];
    if(options.includeCurrentGraph && ctx && ctx.snapshot) sources.push({ kind: 'current_graph', name: 'current_graph', data: cloneJson(ctx.snapshot) });
    if(options.includeExamples){
      for(const exampleName of options.examples){
        try{
          sources.push({ kind: 'example', name: resolveExampleKey(exampleName), data: await loadExampleData(exampleName) });
        }catch(err){
          issues.push(issue('error', 'EXAMPLE_LOAD_FAILED', String((err && err.message) || err), { scenario: resolveExampleKey(exampleName) || String(exampleName || '') }));
        }
      }
    }
    return { sources, issues };
  }
  function finalizeCase(result, startWall, simMs, loops){
    const endWall = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
    result.metrics.simTimeMs = Number.isFinite(simMs) ? Number(simMs.toFixed(3)) : 0;
    result.metrics.wallMs = Number(Math.max(0, endWall - startWall).toFixed(3));
    result.metrics.loops = Math.max(0, loops);
    result.status = engineStatus(result.failures.length, result.warnings.length);
    result.ok = result.status !== 'FAIL';
    return result;
  }
  async function runCase(source, engine, options, seed){
    return withSeed(seed, async ()=>{
      const result = {
        engine,
        seed: Number.isFinite(seed) ? seed : null,
        scenario: source.name,
        sourceKind: source.kind,
        ok: false,
        status: 'FAIL',
        failures: [],
        warnings: [],
        metrics: { simTimeMs: 0, wallMs: 0, loops: 0, nodeCount: 0, linkCount: 0, sinkCount: 0, totalCompleted: 0, liveProbeSimTimeMs: 0, liveProbeWallMs: 0, liveProbeLoops: 0, liveTimelineEntries: 0, liveTimelineSegments: 0 },
        liveFlowProbe: null,
        liveStateProbe: null,
        liveTimelineSignature: null,
        sinks: [],
        finalStateSnapshot: null,
        finalWorkSnapshot: null,
        finalSinkSnapshot: null,
        finalEntityLedger: null
      };
      const seen = new Set();
      const startWall = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
      const payload = (typeof App.compactGraphData === 'function') ? App.compactGraphData(cloneJson(source.data)) : cloneJson(source.data);
      const finalSettleMs = finalSnapshotSettleMs(options);
      const baselineGraph = createGraphFromData(payload);
      const expected = {
        nodeCount: Array.isArray(baselineGraph && baselineGraph._nodes) ? baselineGraph._nodes.length : 0,
        linkCount: getLinkCount(baselineGraph)
      };
      let graph = null;
      let simEngine = null;
      let simMs = 0;
      let loops = 0;
      try{
        if(supportedEngines().indexOf(engine) < 0){
          pushIssue(result.failures, seen, issue('error', 'ENGINE_UNSUPPORTED', `Engine "${engine}" is not registered in App.getSupportedSimModes()`, { engine, scenario: source.name }), 24);
          return finalizeCase(result, startWall, simMs, loops);
        }
        result.metrics.nodeCount = expected.nodeCount;
        result.metrics.linkCount = expected.linkCount;
        if(typeof window.setSimTime === 'function') window.setSimTime(0);
        if(typeof window.updateSimTime === 'function') window.updateSimTime();
        simMs = nowSimMs();
        if(isHeadlessOnlyMode(engine) && typeof App.createHeadlessSimRunner === 'function'){
          simEngine = App.createHeadlessSimRunner(engine, source.data, {
            reason: 'engine-test',
            engineOptions: { engineTest: true },
            seed
          });
          if(!simEngine || typeof simEngine.runUntilSimTimeAsync !== 'function'){
            pushIssue(result.failures, seen, issue('error', 'ENGINE_CREATE_FAILED', `Engine "${engine}" did not return an async headless runner`, { engine, scenario: source.name }), 24);
            return finalizeCase(result, startWall, simMs, loops);
          }
          const payload = await simEngine.runUntilSimTimeAsync({
            targetSimMs: options.targetSimMs + finalSettleMs,
            maxWallMs: options.maxWallMs,
            realStepMs: options.realStepMs,
            maxLoops: options.maxLoops
          });
          simMs = Number(payload && payload.simTimeMs) || 0;
          loops = Math.max(0, Number(payload && payload.loops) || 0);
          if(payload && payload.finalGraphData){
            graph = createGraphFromData(payload.finalGraphData);
          }
          if(simMs + 0.001 < options.targetSimMs && Number(payload && payload.wallMs) >= options.maxWallMs){
            pushIssue(result.failures, seen, issue('error', 'ENGINE_STALLED', `Engine "${engine}" did not reach ${options.targetSimMs} ms within ${options.maxWallMs} ms wall time`, { engine, scenario: source.name }), 24);
          }
          if(loops >= options.maxLoops && simMs + 0.001 < options.targetSimMs){
            pushIssue(result.failures, seen, issue('error', 'LOOP_LIMIT_EXCEEDED', `Engine "${engine}" exceeded ${options.maxLoops} update loops`, { engine, scenario: source.name }), 24);
          }
          if(!Number.isFinite(simMs)){
            pushIssue(result.failures, seen, issue('error', 'NON_FINITE_SIM_TIME', 'Simulation time became non-finite', { engine, scenario: source.name }), 24);
          }
          if(simMs <= 0.001){
            pushIssue(result.failures, seen, issue('error', 'NO_SIM_PROGRESS', `Engine "${engine}" made no simulation progress`, { engine, scenario: source.name }), 24);
          }
          if(payload && payload.sinkMetrics){
            result.sinks = Array.isArray(payload.sinkMetrics.sinks) ? payload.sinkMetrics.sinks : [];
            result.metrics.sinkCount = Math.max(0, Number(payload.sinkMetrics.sinkCount) || 0);
            result.metrics.totalCompleted = Math.max(0, Number(payload.sinkMetrics.totalCompleted) || 0);
          }
        }else{
          graph = baselineGraph;
          simEngine = App.createSimEngine(engine, graph);
          if(!simEngine || typeof simEngine.update !== 'function'){
            pushIssue(result.failures, seen, issue('error', 'ENGINE_CREATE_FAILED', `Engine "${engine}" did not return an update() runner`, { engine, scenario: source.name }), 24);
            return finalizeCase(result, startWall, simMs, loops);
          }
          if(typeof simEngine.reset === 'function') simEngine.reset();
          graph.status = LGraph.STATUS_RUNNING;
          graph.starttime = LiteGraph.getTime();
          graph.last_update_time = graph.starttime;
          try{ graph.sendEventToAllNodes('onStart'); }catch(err){
            pushIssue(result.warnings, seen, issue('warn', 'START_HOOK_ERROR', String((err && err.message) || err), { engine, scenario: source.name }), 24);
          }
          let madeProgress = false;
          let nextCheckAt = Math.max(1000, Math.round(options.targetSimMs / 6));
          while(simMs < options.targetSimMs){
            const currentWall = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
            if((currentWall - startWall) > options.maxWallMs){
              pushIssue(result.failures, seen, issue('error', 'ENGINE_STALLED', `Engine "${engine}" did not reach ${options.targetSimMs} ms within ${options.maxWallMs} ms wall time`, { engine, scenario: source.name }), 24);
              break;
            }
            if(loops >= options.maxLoops){
              pushIssue(result.failures, seen, issue('error', 'LOOP_LIMIT_EXCEEDED', `Engine "${engine}" exceeded ${options.maxLoops} update loops`, { engine, scenario: source.name }), 24);
              break;
            }
            loops += 1;
            let nextSim = simMs;
            try{
              simEngine.update(options.realStepMs);
              nextSim = nowSimMs();
            }catch(err){
              pushIssue(result.failures, seen, issue('error', 'ENGINE_UPDATE_ERROR', String((err && err.message) || err), { engine, scenario: source.name }), 24);
              break;
            }
            if(!Number.isFinite(nextSim)){
              pushIssue(result.failures, seen, issue('error', 'NON_FINITE_SIM_TIME', 'Simulation time became non-finite', { engine, scenario: source.name }), 24);
              break;
            }
            if(nextSim + 0.001 < simMs){
              pushIssue(result.failures, seen, issue('error', 'SIM_TIME_REVERSED', `Simulation time reversed from ${simMs.toFixed(3)} to ${nextSim.toFixed(3)}`, { engine, scenario: source.name }), 24);
              break;
            }
            if(nextSim > simMs + 0.001) madeProgress = true;
            simMs = nextSim;
            if(simMs >= nextCheckAt){
              const scan = collectInvariantIssues(graph, expected);
              for(const failure of scan.failures) pushIssue(result.failures, seen, Object.assign(failure, { engine, scenario: source.name }), 24);
              for(const warning of scan.warnings) pushIssue(result.warnings, seen, Object.assign(warning, { engine, scenario: source.name }), 24);
              nextCheckAt += Math.max(1000, Math.round(options.targetSimMs / 6));
              if(result.failures.length >= 24) break;
            }
          }
          if(!result.failures.length){
            try{
              simEngine.update(finalSettleMs);
              const settledSim = nowSimMs();
              if(Number.isFinite(settledSim) && settledSim >= simMs){
                simMs = settledSim;
              }
            }catch(_e){}
          }
          if(!madeProgress) pushIssue(result.failures, seen, issue('error', 'NO_SIM_PROGRESS', `Engine "${engine}" made no simulation progress`, { engine, scenario: source.name }), 24);
        }
        const finalScan = collectInvariantIssues(graph, expected);
        for(const failure of finalScan.failures) pushIssue(result.failures, seen, Object.assign(failure, { engine, scenario: source.name }), 24);
        for(const warning of finalScan.warnings) pushIssue(result.warnings, seen, Object.assign(warning, { engine, scenario: source.name }), 24);
        if(!result.sinks.length && !result.metrics.sinkCount && !result.metrics.totalCompleted){
          const sinks = collectSinkMetrics(graph);
          result.sinks = sinks.sinks;
          result.metrics.sinkCount = sinks.sinkCount;
          result.metrics.totalCompleted = sinks.totalCompleted;
        }
        result.finalStateSnapshot = collectStateSnapshot(graph);
        result.finalWorkSnapshot = inspectWorkLinkEntries(graph);
        result.finalSinkSnapshot = normalizeSinkSnapshot(result.sinks);
        result.finalEntityLedger = collectEntityLedger(graph);
        if(shouldRunLiveProbe(engine)){
          const liveProbe = await runLiveTimelineProbe(source, engine, options);
          if(liveProbe && !liveProbe.skipped){
            result.metrics.liveProbeSimTimeMs = Number(liveProbe.simMs) || 0;
            result.metrics.liveProbeWallMs = Number(liveProbe.wallMs) || 0;
            result.metrics.liveProbeLoops = Math.max(0, Number(liveProbe.loops) || 0);
            result.metrics.liveTimelineEntries = Math.max(0, Number(liveProbe.timeline && liveProbe.timeline.entryCount) || 0);
            result.metrics.liveTimelineSegments = Math.max(0, Number(liveProbe.timeline && liveProbe.timeline.segmentCount) || 0);
            result.liveFlowProbe = liveProbe.flow ? cloneJson(liveProbe.flow) : null;
            result.liveStateProbe = liveProbe.state ? cloneJson(liveProbe.state) : null;
            result.liveTimelineSignature = liveProbe.timelineSignature ? cloneJson(liveProbe.timelineSignature) : null;
            if(!liveProbe.ok){
              pushIssue(result.failures, seen, issue('error', String(liveProbe.code || 'LIVE_PROBE_FAILED'), String(liveProbe.message || 'Live engine probe failed'), { engine, scenario: source.name }), 24);
            }
          }
        }
      } finally {
        if(graph) try{ graph.sendEventToAllNodes('onStop'); }catch(_e){}
        if(simEngine && typeof simEngine.stopAsync === 'function') try{ await simEngine.stopAsync(); }catch(_e){}
        if(simEngine && typeof simEngine.disposeAsync === 'function') try{ await simEngine.disposeAsync(); }catch(_e){}
        if(simEngine && typeof simEngine.stop === 'function') try{ simEngine.stop(); }catch(_e){}
      }
      return finalizeCase(result, startWall, simMs, loops);
    });
  }
  async function runCaseWithReruns(source, engine, options, seed){
    const maxAttempts = Math.max(1, 1 + Math.max(0, Number(options && options.reruns) || 0));
    const attemptStatuses = [];
    let recovered = false;
    let result = null;
    for(let attempt = 1; attempt <= maxAttempts; attempt += 1){
      result = await runCase(source, engine, options, seed);
      attemptStatuses.push(result.status);
      result.attempts = attempt;
      result.maxAttempts = maxAttempts;
      result.attemptStatuses = attemptStatuses.slice();
      if(result.status !== 'FAIL'){
        recovered = attempt > 1 && attemptStatuses.slice(0, -1).some((status)=> status === 'FAIL');
        break;
      }
    }
    if(!result){
      result = await runCase(source, engine, options, seed);
      attemptStatuses.push(result.status);
    }
    result.attempts = attemptStatuses.length;
    result.maxAttempts = maxAttempts;
    result.attemptStatuses = attemptStatuses.slice();
    if(recovered){
      const seen = new Set();
      for(const failure of (Array.isArray(result.failures) ? result.failures : [])){
        seen.add([failure.code || '', failure.message || '', failure.engine || '', failure.scenario || ''].join('|'));
      }
      pushIssue(result.warnings, seen, issue('warn', 'FLAKY_CASE_RECOVERED', `Case recovered after ${attemptStatuses.length} attempts`, {
        engine,
        scenario: source.name,
        message: `Case recovered after ${attemptStatuses.length} attempts (${attemptStatuses.join(' -> ')})`
      }), 24);
      result.status = engineStatus(result.failures.length, result.warnings.length);
      result.ok = result.status !== 'FAIL';
      result.flaky = true;
    }else{
      result.flaky = false;
    }
    return result;
  }
  function compareResults(report){
    const grouped = new Map();
    const seen = new Set();
    for(const row of report.results){
      const key = `${row.sourceKind}:${row.scenario}:seed:${Number.isFinite(Number(row.seed)) ? Number(row.seed) : 'default'}`;
      const list = grouped.get(key) || [];
      list.push(row);
      grouped.set(key, list);
    }
    report.comparisons = [];
    for(const list of grouped.values()){
      if(list.length < 2) continue;
      const baseline = list.find((row)=> row.engine === 'dt') || list[0];
      for(const row of list){
        if(row === baseline) continue;
        const delta = row.metrics.totalCompleted - baseline.metrics.totalCompleted;
        report.comparisons.push({ scenario: row.scenario, seed: Number.isFinite(Number(row.seed)) ? Number(row.seed) : null, baselineEngine: baseline.engine, candidateEngine: row.engine, completedDelta: delta });
        const tolerance = Math.max(1, Math.ceil(Math.max(1, baseline.metrics.totalCompleted) * 0.05));
        if(Math.abs(delta) > tolerance){
          pushIssue(report.warnings, seen, issue('warn', 'COMPLETION_COUNT_DELTA', `Completed count differs from baseline by ${delta} on ${row.scenario} (seed ${row.seed})`, { engine: row.engine, scenario: row.scenario }), 32);
        }
        if(report.options && report.options.strictFinalParity){
          const baseSinkMap = new Map((Array.isArray(baseline.finalSinkSnapshot) ? baseline.finalSinkSnapshot : []).map((entry)=> [entry.key, entry.completedCount]));
          const rowSinkMap = new Map((Array.isArray(row.finalSinkSnapshot) ? row.finalSinkSnapshot : []).map((entry)=> [entry.key, entry.completedCount]));
          if(baseSinkMap.size || rowSinkMap.size){
            const missingSinks = [];
            const extraSinks = [];
            const changedSinks = [];
            for(const [key, count] of baseSinkMap.entries()){
              if(!rowSinkMap.has(key)){
                if(missingSinks.length < 6) missingSinks.push(key);
                continue;
              }
              const rowCount = rowSinkMap.get(key);
              if(Number(rowCount) !== Number(count) && changedSinks.length < 6){
                changedSinks.push(`${key}: ${count} != ${rowCount}`);
              }
            }
            for(const [key] of rowSinkMap.entries()){
              if(!baseSinkMap.has(key) && extraSinks.length < 6) extraSinks.push(key);
            }
            if(missingSinks.length || extraSinks.length || changedSinks.length){
              pushIssue(report.failures, seen, issue('error', 'SINK_COMPLETION_DELTA', `Sink-level completions differ from dt on ${row.scenario}`, {
                engine: row.engine,
                scenario: row.scenario,
                message: `Sink-level completions differ from dt on ${row.scenario}${missingSinks.length ? `, missing=${missingSinks.join(', ')}` : ''}${extraSinks.length ? `, extra=${extraSinks.join(', ')}` : ''}${changedSinks.length ? `, changed=${changedSinks.join(' | ')}` : ''}`
              }), 32);
            }
          }
          const baseFinalState = baseline.finalStateSnapshot;
          const rowFinalState = row.finalStateSnapshot;
          if(baseFinalState && rowFinalState && Array.isArray(baseFinalState.rows) && Array.isArray(rowFinalState.rows)){
            const baseMap = new Map(baseFinalState.rows.map((entry)=> [entry.key, entry.state]));
            const rowMap = new Map(rowFinalState.rows.map((entry)=> [entry.key, entry.state]));
            const missingStates = [];
            const extraStates = [];
            const changedStates = [];
            for(const [key, baseState] of baseMap.entries()){
              if(!rowMap.has(key)){
                if(missingStates.length < 6) missingStates.push(key);
                continue;
              }
              const rowState = rowMap.get(key);
              if(!finalStateTokensEquivalent(baseState, rowState) && changedStates.length < 6){
                changedStates.push(`${key}: ${baseState} != ${rowState}`);
              }
            }
            for(const [key] of rowMap.entries()){
              if(!baseMap.has(key) && extraStates.length < 6) extraStates.push(key);
            }
            if(missingStates.length || extraStates.length || changedStates.length){
              pushIssue(report.failures, seen, issue('error', 'FINAL_STATE_DELTA', `Final node states differ from dt on ${row.scenario}`, {
                engine: row.engine,
                scenario: row.scenario,
                message: `Final node states differ from dt on ${row.scenario}${missingStates.length ? `, missing=${missingStates.join(', ')}` : ''}${extraStates.length ? `, extra=${extraStates.join(', ')}` : ''}${changedStates.length ? `, changed=${changedStates.join(' | ')}` : ''}`
              }), 32);
            }
          }
          const baseFinalWork = baseline.finalWorkSnapshot;
          const rowFinalWork = row.finalWorkSnapshot;
          if(baseFinalWork && rowFinalWork){
            const baseLinks = new Set(Array.isArray(baseFinalWork.observedLinkKeys) ? baseFinalWork.observedLinkKeys : []);
            const rowLinks = new Set(Array.isArray(rowFinalWork.observedLinkKeys) ? rowFinalWork.observedLinkKeys : []);
            const missingFinal = [];
            const extraFinal = [];
            for(const key of baseLinks){ if(!rowLinks.has(key) && missingFinal.length < 8) missingFinal.push(key); }
            for(const key of rowLinks){ if(!baseLinks.has(key) && extraFinal.length < 8) extraFinal.push(key); }
            if(Number(baseFinalWork.activeLinkCount) !== Number(rowFinalWork.activeLinkCount)
              || Number(baseFinalWork.payloadCount) !== Number(rowFinalWork.payloadCount)
              || missingFinal.length
              || extraFinal.length){
              pushIssue(report.failures, seen, issue('error', 'FINAL_WORK_LINK_DELTA', `Final work-link occupancy differs from dt on ${row.scenario}`, {
                engine: row.engine,
                scenario: row.scenario,
                message: `Final work-link occupancy differs from dt on ${row.scenario} (baseline active=${baseFinalWork.activeLinkCount}, candidate active=${rowFinalWork.activeLinkCount}, baseline payload=${baseFinalWork.payloadCount}, candidate payload=${rowFinalWork.payloadCount}${missingFinal.length ? `, missing=${missingFinal.join(', ')}` : ''}${extraFinal.length ? `, extra=${extraFinal.join(', ')}` : ''})`
              }), 32);
            }
          }
          const baseEntityLedger = baseline.finalEntityLedger;
          const rowEntityLedger = row.finalEntityLedger;
          const shouldCompareEntityLedger = !isHeadlessOnlyMode(baseline.engine) && !isHeadlessOnlyMode(row.engine);
          if(shouldCompareEntityLedger && baseEntityLedger && rowEntityLedger){
            const baseRefs = new Set(Array.isArray(baseEntityLedger.refs) ? baseEntityLedger.refs : []);
            const rowRefs = new Set(Array.isArray(rowEntityLedger.refs) ? rowEntityLedger.refs : []);
            const missingRefs = [];
            const extraRefs = [];
            for(const ref of baseRefs){ if(!rowRefs.has(ref) && missingRefs.length < 8) missingRefs.push(ref); }
            for(const ref of rowRefs){ if(!baseRefs.has(ref) && extraRefs.length < 8) extraRefs.push(ref); }
            const baseDupes = Array.isArray(baseEntityLedger.duplicateRefs) ? baseEntityLedger.duplicateRefs : [];
            const rowDupes = Array.isArray(rowEntityLedger.duplicateRefs) ? rowEntityLedger.duplicateRefs : [];
            if(missingRefs.length || extraRefs.length || baseDupes.length !== rowDupes.length){
              pushIssue(report.failures, seen, issue('error', 'FINAL_ENTITY_SET_DELTA', `Final entity set differs from dt on ${row.scenario}`, {
                engine: row.engine,
                scenario: row.scenario,
                message: `Final entity set differs from dt on ${row.scenario}${missingRefs.length ? `, missing=${missingRefs.join(', ')}` : ''}${extraRefs.length ? `, extra=${extraRefs.join(', ')}` : ''}${baseDupes.length !== rowDupes.length ? `, duplicates=${baseDupes.length} != ${rowDupes.length}` : ''}`
              }), 32);
            }
          }
        }
        const baseFlow = baseline.liveFlowProbe;
        const rowFlow = row.liveFlowProbe;
        if(baseFlow && rowFlow && Number(baseFlow.maxActiveLinks) > 0){
          const baseLinks = new Set(Array.isArray(baseFlow.observedLinkKeys) ? baseFlow.observedLinkKeys : []);
          const rowLinks = new Set(Array.isArray(rowFlow.observedLinkKeys) ? rowFlow.observedLinkKeys : []);
          const missing = [];
          const extra = [];
          for(const key of baseLinks){ if(!rowLinks.has(key) && missing.length < 8) missing.push(key); }
          for(const key of rowLinks){ if(!baseLinks.has(key) && extra.length < 8) extra.push(key); }
          const hasFlowDelta = baseFlow.maxActiveLinks > 0 && rowFlow.maxActiveLinks <= 0;
          const hasSetDelta = missing.length > 0 || extra.length > 0 || baseLinks.size !== rowLinks.size;
          if(hasFlowDelta || hasSetDelta){
            pushIssue(report.failures, seen, issue('error', 'LIVE_WORKFLOW_DELTA', `Visible work-link flow differs from dt on ${row.scenario}`, {
              engine: row.engine,
              scenario: row.scenario,
              message: `Visible work-link flow differs from dt on ${row.scenario} (baseline links=${baseLinks.size}, candidate links=${rowLinks.size}${missing.length ? `, missing=${missing.join(', ')}` : ''}${extra.length ? `, extra=${extra.join(', ')}` : ''})`
            }), 32);
          }
        }
        const baseState = baseline.liveStateProbe;
        const rowState = row.liveStateProbe;
        if(baseState && rowState && Array.isArray(baseState.nodeStates) && Array.isArray(rowState.nodeStates)){
          const baseMap = new Map(baseState.nodeStates.map((entry)=> [entry.key, entry.sequence]));
          const rowMap = new Map(rowState.nodeStates.map((entry)=> [entry.key, entry.sequence]));
          const missingStates = [];
          const extraStates = [];
          const changedStates = [];
          for(const [key, baseSeq] of baseMap.entries()){
            if(!isMeaningfulStateSequence(baseSeq)) continue;
            if(!rowMap.has(key)){
              if(missingStates.length < 6) missingStates.push(key);
              continue;
            }
            const rowSeq = rowMap.get(key);
            if(!stateSequencesEquivalent(baseSeq, rowSeq) && changedStates.length < 6){
              changedStates.push(`${key}: ${compactStateSequence(baseSeq).join(' -> ')} != ${compactStateSequence(Array.isArray(rowSeq) ? rowSeq : []).join(' -> ')}`);
            }
          }
          for(const [key, rowSeq] of rowMap.entries()){
            if(!isMeaningfulStateSequence(rowSeq)) continue;
            if(!baseMap.has(key) && extraStates.length < 6){
              extraStates.push(key);
            }
          }
          if(missingStates.length || extraStates.length || changedStates.length){
            pushIssue(report.failures, seen, issue('error', 'LIVE_STATE_DELTA', `Visible state transitions differ from dt on ${row.scenario}`, {
              engine: row.engine,
              scenario: row.scenario,
              message: `Visible state transitions differ from dt on ${row.scenario}${missingStates.length ? `, missing=${missingStates.join(', ')}` : ''}${extraStates.length ? `, extra=${extraStates.join(', ')}` : ''}${changedStates.length ? `, changed=${changedStates.join(' | ')}` : ''}`
            }), 32);
          }
        }
        const baseTimeline = baseline.liveTimelineSignature;
        const rowTimeline = row.liveTimelineSignature;
        if(baseTimeline && rowTimeline && Array.isArray(baseTimeline.rows) && Array.isArray(rowTimeline.rows)){
          const baseMap = new Map(baseTimeline.rows.map((entry)=> [entry.key, entry]));
          const rowMap = new Map(rowTimeline.rows.map((entry)=> [entry.key, entry]));
          const missingRows = [];
          const extraRows = [];
          const changedRows = [];
          for(const [key, baseEntry] of baseMap.entries()){
            if(!baseEntry || !baseEntry.meaningful) continue;
            if(!rowMap.has(key)){
              if(missingRows.length < 6) missingRows.push(`${key}:${baseEntry.label}`);
              continue;
            }
            const rowEntry = rowMap.get(key);
            if(!timelineSignaturesEquivalent(baseEntry.signature, rowEntry && rowEntry.signature) && changedRows.length < 6){
              const fmt = (segments)=> (Array.isArray(segments) ? segments.map((seg)=> `${seg.state}@${seg.durationBins}`).join(' -> ') : '');
              changedRows.push(`${key}:${fmt(baseEntry.signature)} != ${fmt(rowEntry && rowEntry.signature)}`);
            }
          }
          for(const [key, rowEntry] of rowMap.entries()){
            if(!rowEntry || !rowEntry.meaningful) continue;
            if(!baseMap.has(key) && extraRows.length < 6){
              extraRows.push(`${key}:${rowEntry.label}`);
            }
          }
          if(missingRows.length || extraRows.length || changedRows.length){
            pushIssue(report.failures, seen, issue('error', 'LIVE_TIMELINE_DELTA', `Timing chart differs from dt on ${row.scenario}`, {
              engine: row.engine,
              scenario: row.scenario,
              message: `Timing chart differs from dt on ${row.scenario}${missingRows.length ? `, missing=${missingRows.join(', ')}` : ''}${extraRows.length ? `, extra=${extraRows.join(', ')}` : ''}${changedRows.length ? `, changed=${changedRows.join(' | ')}` : ''}`
            }), 32);
          }
        }
      }
    }
  }
  const LATEST_ENGINE_TEST_REPORT_KEY = 'fact_sim_latest_engine_test_report';
  function cloneLatestReport(report){
    const cloned = cloneJson(report);
    if(!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) return null;
    if(String(cloned.kind || '') !== 'engine-test-report') return null;
    if(typeof cloned.status !== 'string') return null;
    if(!Array.isArray(cloned.results)) return null;
    if(!cloned.summary || typeof cloned.summary !== 'object' || Array.isArray(cloned.summary)) return null;
    return cloned;
  }
  function saveLatestReport(report){
    const latest = cloneLatestReport(report);
    App.latestEngineTestReport = latest;
    try{
      if(latest) localStorage.setItem(LATEST_ENGINE_TEST_REPORT_KEY, JSON.stringify(latest));
      else localStorage.removeItem(LATEST_ENGINE_TEST_REPORT_KEY);
    }catch(_e){}
  }
  App.getLatestEngineTestReport = function(){
    const latest = cloneLatestReport(App.latestEngineTestReport);
    if(latest){
      App.latestEngineTestReport = cloneJson(latest);
      return latest;
    }
    try{
      const raw = localStorage.getItem(LATEST_ENGINE_TEST_REPORT_KEY);
      if(!raw) return null;
      const parsed = cloneLatestReport(JSON.parse(raw));
      if(!parsed){
        try{ localStorage.removeItem(LATEST_ENGINE_TEST_REPORT_KEY); }catch(_e){}
        return null;
      }
      App.latestEngineTestReport = cloneJson(parsed);
      return parsed;
    }catch(_e){
      return null;
    }
  };
  App.runEngineTestsAsync = async function(options){
    const normalized = normalizeOptions(options);
    const report = {
      kind: 'engine-test-report',
      version: 1,
      ok: false,
      status: 'FAIL',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      options: cloneJson(normalized),
      engines: normalized.engines.slice(),
      failures: [],
      warnings: [],
      results: [],
      comparisons: [],
      summary: null,
      mcpHint: { tool: 'engine_test', action: 'latest' }
    };
    const seen = new Set();
    const onProgress = (typeof options?.onProgress === 'function') ? options.onProgress : null;
    let stoppedEarly = false;
    if(typeof window.isSimRunning === 'function' && window.isSimRunning() && typeof window.stopSimulation === 'function') try{ window.stopSimulation(); }catch(_e){}
    const ctx = createRunContext();
    App._suspendTimeline = true;
    try{
      const built = await buildSources(normalized, ctx);
      for(const entry of built.issues) pushIssue(report.failures, seen, entry, 32);
      if(!built.sources.length) pushIssue(report.failures, seen, issue('error', 'NO_TEST_SOURCES', 'No graph sources were available for engine testing'), 32);
      const seeds = Array.isArray(normalized.seeds) && normalized.seeds.length ? normalized.seeds : [normalized.seed || 1];
      const totalCases = Math.max(1, built.sources.length * normalized.engines.length * seeds.length);
      let caseIndex = 0;
      outer: for(const source of built.sources){
        for(const seed of seeds){
          for(const engine of normalized.engines){
            caseIndex += 1;
            if(onProgress) try{ onProgress(caseIndex / totalCases, { engine, scenario: source.name, seed, caseIndex, totalCases, suite: normalized.suite }); }catch(_e){}
            const result = await runCaseWithReruns(source, engine, normalized, seed);
            report.results.push(result);
            for(const entry of result.failures) pushIssue(report.failures, seen, entry, 32);
            for(const entry of result.warnings) pushIssue(report.warnings, seen, entry, 32);
            if(normalized.stopOnFirstFailure && result.status === 'FAIL'){
              stoppedEarly = true;
              break outer;
            }
          }
        }
      }
      compareResults(report);
      const passedCases = report.results.filter((row)=> row.status === 'PASS').length;
      const warnedCases = report.results.filter((row)=> row.status === 'WARN').length;
      const failedCases = report.results.filter((row)=> row.status === 'FAIL').length;
      report.summary = {
        passed: passedCases,
        warned: warnedCases,
        failed: failedCases + report.failures.length,
        passedCases,
        warnedCases,
        failedCases,
        caseCount: report.results.length,
        failureCount: report.failures.length,
        warningCount: report.warnings.length,
        engineCount: normalized.engines.length,
        suite: normalized.suite,
        seedCount: seeds.length,
        exampleCount: built.sources.filter((row)=> row.kind === 'example').length,
        includesCurrentGraph: !!built.sources.find((row)=> row.kind === 'current_graph'),
        stoppedEarly: stoppedEarly,
        reruns: normalized.reruns,
        stopOnFirstFailure: normalized.stopOnFirstFailure
      };
      report.status = engineStatus(failedCases + report.failures.length, warnedCases + report.warnings.length);
      report.ok = report.status !== 'FAIL';
      report.finishedAt = new Date().toISOString();
      saveLatestReport(report);
      return cloneJson(report);
    } finally {
      restoreRunContext(ctx);
    }
  };
  function makeStatusPill(status){
    const el = document.createElement('span');
    el.className = 'engineTestStatusPill';
    const normalized = String(status || 'FAIL').toUpperCase();
    if(normalized === 'PASS') el.classList.add('is-pass');
    else if(normalized === 'WARN') el.classList.add('is-warn');
    else el.classList.add('is-fail');
    el.textContent = normalized;
    return el;
  }
  function renderReport(report){
    const summary = document.getElementById('engineTestSummary');
    const casesBody = document.getElementById('engineTestCasesBody');
    const failuresBody = document.getElementById('engineTestFailuresBody');
    const legend = document.getElementById('engineTestLegend');
    if(!summary || !casesBody || !failuresBody || !legend) return false;
    const info = report && report.summary ? report.summary : { passed: 0, warned: 0, failed: 0, passedCases: 0, warnedCases: 0, failedCases: 0, caseCount: 0, failureCount: 0, warningCount: 0, engineCount: 0, exampleCount: 0, includesCurrentGraph: false, suite: 'standard', seedCount: 1, stoppedEarly: false, reruns: 0, stopOnFirstFailure: false };
    summary.textContent = `Status: ${report.status} | Suite: ${String(info.suite || 'standard')} | Cases: ${info.caseCount} | Engines: ${info.engineCount} | Seeds: ${info.seedCount} | Examples: ${info.exampleCount}${info.includesCurrentGraph ? ' + current graph' : ''} | Passed cases: ${info.passedCases} | Warned cases: ${info.warnedCases} | Failed cases: ${info.failedCases} | Global failures: ${info.failureCount} | Global warnings: ${info.warningCount} | Reruns: ${Math.max(0, Number(info.reruns) || 0)}${info.stopOnFirstFailure ? ' | Stop on first fail: ON' : ''}${info.stoppedEarly ? ' | Stopped early' : ''}`;
    casesBody.innerHTML = '';
    for(const row of (Array.isArray(report && report.results) ? report.results : [])){
      const tr = document.createElement('tr');
      const statusTd = document.createElement('td');
      statusTd.appendChild(makeStatusPill(row.status));
      tr.appendChild(statusTd);
      const engineTd = document.createElement('td');
      engineTd.textContent = row.engine || '-';
      tr.appendChild(engineTd);
      const scenarioTd = document.createElement('td');
      scenarioTd.textContent = row.scenario || '-';
      tr.appendChild(scenarioTd);
      const seedTd = document.createElement('td');
      seedTd.className = 'engineTestMono';
      seedTd.textContent = Number.isFinite(Number(row.seed)) ? String(row.seed) : '-';
      tr.appendChild(seedTd);
      const simTd = document.createElement('td');
      simTd.className = 'engineTestMono';
      simTd.textContent = `${Number(row.metrics && row.metrics.simTimeMs || 0).toFixed(1)} ms`;
      tr.appendChild(simTd);
      const completedTd = document.createElement('td');
      completedTd.className = 'engineTestMono';
      completedTd.textContent = String(row.metrics && row.metrics.totalCompleted || 0);
      tr.appendChild(completedTd);
      const notesTd = document.createElement('td');
      notesTd.className = 'engineTestMessage';
      const attempts = Math.max(1, Number(row.attempts) || 1);
      notesTd.textContent = row.failures && row.failures.length
        ? `${row.failures.length} error(s)${attempts > 1 ? ` | attempts: ${attempts}` : ''}`
        : row.warnings && row.warnings.length
          ? `${row.warnings.length} warning(s)${attempts > 1 ? ` | attempts: ${attempts}` : ''}`
          : `Loops: ${Number(row.metrics && row.metrics.loops || 0).toLocaleString()}${attempts > 1 ? ` | attempts: ${attempts}` : ''}`;
      tr.appendChild(notesTd);
      casesBody.appendChild(tr);
    }
    failuresBody.innerHTML = '';
    const issues = [].concat(Array.isArray(report && report.failures) ? report.failures : [], Array.isArray(report && report.warnings) ? report.warnings : []);
    if(!issues.length){
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'engineTestMessage';
      td.textContent = 'No engine test issues were detected.';
      tr.appendChild(td);
      failuresBody.appendChild(tr);
    }else{
      for(const entry of issues){
        const tr = document.createElement('tr');
        const severityTd = document.createElement('td');
        severityTd.appendChild(makeStatusPill(entry.severity === 'warn' ? 'WARN' : 'FAIL'));
        tr.appendChild(severityTd);
        const codeTd = document.createElement('td');
        codeTd.className = 'engineTestMono';
        codeTd.textContent = entry.code || '-';
        tr.appendChild(codeTd);
        const engineTd = document.createElement('td');
        engineTd.textContent = entry.engine || '-';
        tr.appendChild(engineTd);
        const scenarioTd = document.createElement('td');
        scenarioTd.textContent = entry.scenario || '-';
        tr.appendChild(scenarioTd);
        const messageTd = document.createElement('td');
        messageTd.className = 'engineTestMessage';
        messageTd.textContent = entry.message || '-';
        tr.appendChild(messageTd);
        failuresBody.appendChild(tr);
      }
    }
      legend.textContent = report.comparisons && report.comparisons.length
      ? `Engine Test uses clone graphs only. ${report.comparisons.length} differential comparison(s) were recorded against a baseline engine. It now supports Quick / Standard / Soak suites, seed sweeps, hidden-canvas live probes for visible work-link parity, sampled node state-transition parity, timing-chart parity, and optional strict final parity for sink completions, final node states, final work-link occupancy, and final entity-set parity against dt.`
      : 'Engine Test runs clone graphs only. It checks monotonic simulation time, graph integrity, finite numeric state, sink completion metrics, engine stalls, hidden-canvas live probes for timeline population, visible work-link parity, sampled node state-transition parity, timing-chart parity, and optional strict final parity for sink completions, final node states, final work-link occupancy, and final entity-set parity against dt.';
    return true;
  }
  (function initEngineTestUi(){
    const modal = document.getElementById('engineTestModal');
    const closeBtn = document.getElementById('engineTestClose');
    const runBtn = document.getElementById('btnEngineTest');
    const rerunBtn = document.getElementById('engineTestRerunBtn');
    const copyBtn = document.getElementById('engineTestCopyBtn');
    const suiteSelect = document.getElementById('engineTestSuiteSelect');
    const strictToggle = document.getElementById('engineTestStrictToggle');
    const seedsInput = document.getElementById('engineTestSeedsInput');
    const rerunsInput = document.getElementById('engineTestRerunsInput');
    const stopOnFirstFailureToggle = document.getElementById('engineTestStopOnFirstFailureToggle');
    const progressWrap = document.getElementById('engineTestProgressWrap');
    const progressLabel = document.getElementById('engineTestProgressLabel');
    const progressBar = document.getElementById('engineTestProgressBar');
    if(!modal || !closeBtn || !runBtn || !rerunBtn || !copyBtn || !progressWrap || !progressLabel || !progressBar) return;
    let running = false;
    let lastOptions = null;
    const open = ()=>{ modal.style.display = 'block'; modal.setAttribute('aria-hidden', 'false'); };
    const close = ()=>{ if(running) return; modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); };
    App.showEngineTestProgress = function(progress, info){
      const ratio = Math.max(0, Math.min(1, Number(progress) || 0));
      const percent = Math.round(ratio * 100);
      running = true;
      closeBtn.disabled = true;
      progressWrap.style.display = 'block';
      progressBar.style.width = `${percent}%`;
      progressLabel.textContent = info && (info.engine || info.scenario)
        ? `Engine test running... ${percent}% (${String(info.engine || '-')} / ${String(info.scenario || '-')})`
        : `Engine test running... ${percent}%`;
      open();
      return true;
    };
    App.stopEngineTestProgress = function(){
      running = false;
      closeBtn.disabled = false;
      progressWrap.style.display = 'none';
      progressBar.style.width = '0%';
      progressLabel.textContent = 'Engine test running...';
      return true;
    };
    App.showEngineTestModal = function(report){
      App.stopEngineTestProgress();
      if(!renderReport(report)) return false;
      open();
      return true;
    };
    function readControlOptions(){
      const suite = suiteSelect && suiteSelect.value ? suiteSelect.value : 'standard';
      const strictFinalParity = !!(strictToggle && strictToggle.checked);
      const seeds = normalizeSeedList(seedsInput && typeof seedsInput.value === 'string' ? seedsInput.value : '');
      const reruns = Math.max(0, Math.floor(Number(rerunsInput && rerunsInput.value) || 0));
      return {
        suite,
        strictFinalParity,
        engines: defaultEngineTestEngines(),
        includeCurrentGraph: true,
        includeExamples: true,
        examples: defaultExampleIds(),
        seeds: seeds.length ? seeds : undefined,
        reruns,
        stopOnFirstFailure: !!(stopOnFirstFailureToggle && stopOnFirstFailureToggle.checked)
      };
    }
    function applyControlOptions(options){
      const normalized = normalizeOptions(options);
      if(suiteSelect) suiteSelect.value = normalized.suite || 'standard';
      if(strictToggle) strictToggle.checked = !!normalized.strictFinalParity;
      if(seedsInput) seedsInput.value = Array.isArray(normalized.seeds) ? normalized.seeds.join(', ') : '';
      if(rerunsInput) rerunsInput.value = String(Math.max(0, Number(normalized.reruns) || 0));
      if(stopOnFirstFailureToggle) stopOnFirstFailureToggle.checked = !!normalized.stopOnFirstFailure;
    }
    async function runWithOptions(options){
      if(running) return;
      lastOptions = cloneJson(options);
      const prevText = runBtn.textContent;
      runBtn.disabled = true;
      runBtn.textContent = 'Testing...';
      rerunBtn.disabled = true;
      copyBtn.disabled = true;
      try{
        const report = await App.runEngineTestsAsync(Object.assign({}, options, {
          onProgress: (ratio, info)=>{ if(typeof App.showEngineTestProgress === 'function') App.showEngineTestProgress(ratio, info); }
        }));
        if(typeof App.showEngineTestModal === 'function') App.showEngineTestModal(report);
        if(typeof App.showToast === 'function') App.showToast(`Engine Test: ${report.status}`);
      }catch(err){
        console.error(err);
        if(typeof App.stopEngineTestProgress === 'function') App.stopEngineTestProgress();
        alert('Engine test failed');
      }finally{
        running = false;
        runBtn.disabled = false;
        runBtn.textContent = prevText;
        rerunBtn.disabled = false;
        copyBtn.disabled = false;
      }
    }
    runBtn.addEventListener('click', ()=>{
      runWithOptions(readControlOptions());
    });
    rerunBtn.addEventListener('click', ()=>{
      const latest = App.getLatestEngineTestReport();
      const options = lastOptions || (latest && latest.options) || readControlOptions();
      applyControlOptions(options);
      runWithOptions(options);
    });
    copyBtn.addEventListener('click', async ()=>{
      const latest = App.getLatestEngineTestReport();
      if(!latest) return;
      try{
        await navigator.clipboard.writeText(JSON.stringify(latest, null, 2));
        if(typeof App.showToast === 'function') App.showToast('Engine test report copied');
      }catch(err){
        console.error(err);
      }
    });
    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e)=>{ if(e.target === modal) close(); });
    window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && modal.style.display === 'block') close(); });
    applyControlOptions({ suite: DEFAULTS.suite, strictFinalParity: SUITE_PRESETS[DEFAULTS.suite] && SUITE_PRESETS[DEFAULTS.suite].strictFinalParity, seeds: SUITE_PRESETS[DEFAULTS.suite] && SUITE_PRESETS[DEFAULTS.suite].seeds, reruns: DEFAULTS.reruns, stopOnFirstFailure: DEFAULTS.stopOnFirstFailure });
  })();
})();
