var App = window.App || (window.App = {});

(function(){
  const DEFAULT_EXAMPLES = ['simple', 'branch', 'sample_line1'];
  const EXAMPLE_ALIASES = { agv_config: 'carrier', carrier_config: 'carrier' };
  const EXAMPLE_FILES = {
    simple: 'sample/simple.json',
    branch: 'sample/branch.json',
    shuttle_line5: 'sample/shuttle_line5.json',
    carrier: 'sample/graph (3).json',
    pallet_station_demo: 'sample/pallet_station_demo.json',
    sample_line1: 'sample/sample_line1.json'
  };
  const DEFAULTS = {
    includeCurrentGraph: true,
    includeExamples: false,
    examples: DEFAULT_EXAMPLES,
    targetSimMs: 30000,
    maxWallMs: 2500,
    realStepMs: 16,
    maxLoops: 25000,
    seed: 1
  };
  const SCAN_SKIP = new Set(['app', 'canvas', 'constructor', 'flags', 'graph', 'inputs', 'outputs', 'parent', 'widgets', 'widgets_values']);

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
    const selected = (window.App && typeof App.getSimMode === 'function') ? App.getSimMode() : 'dt';
    const targetSimMs = Math.max(1000, Number(raw.targetSimMs) || DEFAULTS.targetSimMs);
    const realStepMs = Math.max(1, Number(raw.realStepMs) || DEFAULTS.realStepMs);
    const derivedLoopFloor = Math.ceil(targetSimMs / realStepMs) + 1024;
    const hasExplicitMaxLoops = Object.prototype.hasOwnProperty.call(source, 'maxLoops') && Number.isFinite(Number(raw.maxLoops));
    return {
      engines: uniq(raw.engines && raw.engines.length ? raw.engines : [selected || 'dt']).map(normalizeEngineMode),
      includeCurrentGraph: raw.includeCurrentGraph !== false,
      includeExamples: !!raw.includeExamples,
      examples: uniq(raw.examples && raw.examples.length ? raw.examples : DEFAULT_EXAMPLES),
      targetSimMs,
      maxWallMs: Math.max(250, Number(raw.maxWallMs) || DEFAULTS.maxWallMs),
      realStepMs,
      maxLoops: hasExplicitMaxLoops
        ? Math.max(100, Math.floor(Number(raw.maxLoops)))
        : Math.max(DEFAULTS.maxLoops, derivedLoopFloor),
      seed: Number.isFinite(Number(raw.seed)) ? Math.floor(Math.abs(Number(raw.seed))) : null
    };
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
    if(typeof configureGraphClock === 'function') configureGraphClock(graph);
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
  async function runCase(source, engine, options){
    return withSeed(options.seed, async ()=>{
      const result = {
        engine,
        scenario: source.name,
        sourceKind: source.kind,
        ok: false,
        status: 'FAIL',
        failures: [],
        warnings: [],
        metrics: { simTimeMs: 0, wallMs: 0, loops: 0, nodeCount: 0, linkCount: 0, sinkCount: 0, totalCompleted: 0 },
        sinks: []
      };
      const seen = new Set();
      const startWall = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
      const payload = (typeof App.compactGraphData === 'function') ? App.compactGraphData(cloneJson(source.data)) : cloneJson(source.data);
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
            seed: options.seed
          });
          if(!simEngine || typeof simEngine.runUntilSimTimeAsync !== 'function'){
            pushIssue(result.failures, seen, issue('error', 'ENGINE_CREATE_FAILED', `Engine "${engine}" did not return an async headless runner`, { engine, scenario: source.name }), 24);
            return finalizeCase(result, startWall, simMs, loops);
          }
          const payload = await simEngine.runUntilSimTimeAsync({
            targetSimMs: options.targetSimMs,
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
      } finally {
        if(graph) try{ graph.sendEventToAllNodes('onStop'); }catch(_e){}
        if(simEngine && typeof simEngine.stopAsync === 'function') try{ await simEngine.stopAsync(); }catch(_e){}
        if(simEngine && typeof simEngine.disposeAsync === 'function') try{ await simEngine.disposeAsync(); }catch(_e){}
        if(simEngine && typeof simEngine.stop === 'function') try{ simEngine.stop(); }catch(_e){}
      }
      return finalizeCase(result, startWall, simMs, loops);
    });
  }
  function compareResults(report){
    const grouped = new Map();
    const seen = new Set();
    for(const row of report.results){
      const key = `${row.sourceKind}:${row.scenario}`;
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
        report.comparisons.push({ scenario: row.scenario, baselineEngine: baseline.engine, candidateEngine: row.engine, completedDelta: delta });
        const tolerance = Math.max(1, Math.ceil(Math.max(1, baseline.metrics.totalCompleted) * 0.05));
        if(Math.abs(delta) > tolerance){
          pushIssue(report.warnings, seen, issue('warn', 'COMPLETION_COUNT_DELTA', `Completed count differs from baseline by ${delta} on ${row.scenario}`, { engine: row.engine, scenario: row.scenario }), 32);
        }
      }
    }
  }
  function saveLatestReport(report){
    App.latestEngineTestReport = cloneJson(report);
    try{ localStorage.setItem('fact_sim_latest_engine_test_report', JSON.stringify(report)); }catch(_e){}
  }
  App.getLatestEngineTestReport = function(){
    if(App.latestEngineTestReport) return cloneJson(App.latestEngineTestReport);
    try{
      const raw = localStorage.getItem('fact_sim_latest_engine_test_report');
      return raw ? JSON.parse(raw) : null;
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
    if(typeof window.isSimRunning === 'function' && window.isSimRunning() && typeof window.stopSimulation === 'function') try{ window.stopSimulation(); }catch(_e){}
    const ctx = createRunContext();
    App._suspendTimeline = true;
    try{
      const built = await buildSources(normalized, ctx);
      for(const entry of built.issues) pushIssue(report.failures, seen, entry, 32);
      if(!built.sources.length) pushIssue(report.failures, seen, issue('error', 'NO_TEST_SOURCES', 'No graph sources were available for engine testing'), 32);
      const totalCases = Math.max(1, built.sources.length * normalized.engines.length);
      let caseIndex = 0;
      for(const source of built.sources){
        for(const engine of normalized.engines){
          caseIndex += 1;
          if(onProgress) try{ onProgress(caseIndex / totalCases, { engine, scenario: source.name, caseIndex, totalCases }); }catch(_e){}
          const result = await runCase(source, engine, normalized);
          report.results.push(result);
          for(const entry of result.failures) pushIssue(report.failures, seen, entry, 32);
          for(const entry of result.warnings) pushIssue(report.warnings, seen, entry, 32);
        }
      }
      compareResults(report);
      const passed = report.results.filter((row)=> row.status === 'PASS').length;
      const warned = report.results.filter((row)=> row.status === 'WARN').length;
      const failed = report.results.filter((row)=> row.status === 'FAIL').length;
      report.summary = { passed, warned, failed, caseCount: report.results.length, failureCount: report.failures.length, warningCount: report.warnings.length };
      report.status = engineStatus(failed + report.failures.length, warned + report.warnings.length);
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
    const info = report && report.summary ? report.summary : { passed: 0, warned: 0, failed: 0, caseCount: 0, failureCount: 0, warningCount: 0 };
    summary.textContent = `Status: ${report.status} | Cases: ${info.caseCount} | Passed: ${info.passed} | Warned: ${info.warned} | Failed: ${info.failed} | Global issues: ${info.failureCount + info.warningCount}`;
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
      notesTd.textContent = row.failures && row.failures.length ? `${row.failures.length} error(s)` : row.warnings && row.warnings.length ? `${row.warnings.length} warning(s)` : `Loops: ${Number(row.metrics && row.metrics.loops || 0).toLocaleString()}`;
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
      ? `Engine Test uses clone graphs only. ${report.comparisons.length} differential comparison(s) were recorded against a baseline engine.`
      : 'Engine Test runs clone graphs only. It checks monotonic simulation time, graph integrity, finite numeric state, sink completion metrics, and engine stalls without touching the live canvas graph.';
    return true;
  }
  (function initEngineTestUi(){
    const modal = document.getElementById('engineTestModal');
    const closeBtn = document.getElementById('engineTestClose');
    const runBtn = document.getElementById('btnEngineTest');
    const rerunBtn = document.getElementById('engineTestRerunBtn');
    const copyBtn = document.getElementById('engineTestCopyBtn');
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
      const modeSelect = document.getElementById('simModeSelect');
      const selected = (modeSelect && modeSelect.value) || ((typeof App.getSimMode === 'function') ? App.getSimMode() : 'dt');
      runWithOptions({ engines: [normalizeEngineMode(selected)], includeCurrentGraph: true, includeExamples: false });
    });
    rerunBtn.addEventListener('click', ()=>{
      const latest = App.getLatestEngineTestReport();
      const modeSelect = document.getElementById('simModeSelect');
      const selected = (modeSelect && modeSelect.value) || ((typeof App.getSimMode === 'function') ? App.getSimMode() : 'dt');
      runWithOptions(lastOptions || (latest && latest.options) || { engines: [normalizeEngineMode(selected)], includeCurrentGraph: true, includeExamples: false });
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
  })();
})();
