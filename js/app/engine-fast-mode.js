// Register event-fast without modifying legacy dt/event implementations.

var App = window.App || (window.App = {});

(function(){
  // Migrate persisted preferences and old MCP requests to the remaining fast
  // engine; these names are never advertised as available engines.
  const retiredFastModes = new Set(['event-fast-worker','event_fast_worker','eventfastworker','fast-worker',
    'event-fast-par','event_fast_par','eventfastpar','fast-par','par']);
  function normalizeFastMode(mode){
    const raw = String(mode || '').trim().toLowerCase();
    if(raw === 'event-fast' || raw === 'event_fast' || raw === 'eventfast' || raw === 'fast' || retiredFastModes.has(raw)){
      return 'event-fast';
    }
    return null;
  }

  const legacyGetSupportedSimModes = (typeof App.getSupportedSimModes === 'function')
    ? App.getSupportedSimModes.bind(App)
    : function(){ return ['dt', 'event']; };
  const legacyNormalizeSimMode = (typeof App.normalizeSimMode === 'function')
    ? App.normalizeSimMode.bind(App)
    : function(mode){ return String(mode || '').toLowerCase() === 'event' ? 'event' : 'dt'; };
  const legacyGetSimModeLabel = (typeof App.getSimModeLabel === 'function')
    ? App.getSimModeLabel.bind(App)
    : function(mode){ return legacyNormalizeSimMode(mode); };
  const legacySetSimMode = (typeof App.setSimMode === 'function')
    ? App.setSimMode.bind(App)
    : function(mode){ App.simMode = legacyNormalizeSimMode(mode); return App.simMode; };
  const legacyCreateSimEngine = (typeof App.createSimEngine === 'function')
    ? App.createSimEngine.bind(App)
    : function(mode, graph){ return null; };

  App.createLegacySimEngine = function(mode, graph){
    return legacyCreateSimEngine(mode, graph);
  };

  App.getSupportedSimModes = function(){
    const list = Array.isArray(legacyGetSupportedSimModes()) ? legacyGetSupportedSimModes().slice() : ['dt', 'event'];
    if(list.indexOf('event-fast') < 0) list.push('event-fast');
    return list;
  };

  App.normalizeSimMode = function(mode){
    const fast = normalizeFastMode(mode);
    if(fast) return fast;
    return legacyNormalizeSimMode(mode);
  };

  App.getSimModeLabel = function(mode){
    const normalized = App.normalizeSimMode(mode);
    if(normalized === 'event-fast') return 'event-fast';
    return legacyGetSimModeLabel(normalized);
  };

  App.setSimMode = function(mode){
    const normalized = App.normalizeSimMode(mode);
    App.simMode = normalized;
    return normalized;
  };

  App.getSimMode = function(){
    App.simMode = App.normalizeSimMode(App.simMode);
    return App.simMode;
  };

  App.createSimEngine = function(mode, graph){
    const normalized = App.normalizeSimMode(mode);
    if(normalized === 'event-fast'){
      if(typeof App.EventFastEngine !== 'function'){
        throw new Error('App.EventFastEngine is not available');
      }
      return new App.EventFastEngine(graph);
    }
    return legacyCreateSimEngine(normalized, graph);
  };

  // Benchmark/MCP capabilities belong to the common engine registration,
  // independently of any worker implementation.
  App.normalizeHeadlessSimMode = App.normalizeSimMode;
  App.getHeadlessModeLabel = App.getSimModeLabel;
  App.isHeadlessOnlyBenchmarkMode = function(){ return false; };
  App.getBenchmarkSimModes = App.getSupportedSimModes;
  App.getEngineTestModes = App.getSupportedSimModes;
  App.createHeadlessSimRunner = function(mode, graphOrData, options){
    let graph = graphOrData;
    if(!graph || typeof graph.serialize !== 'function'){
      const data = typeof graphOrData === 'string' ? JSON.parse(graphOrData) : graphOrData;
      graph = new LGraph(); graph.configure(data);
      App.restoreEntityModel?.(graph, data, true);
      App.repairGraphLinks?.(graph);
      App.stopGroups?.restoreSerializedData?.(graph, data, false);
      window.configureGraphClock?.(graph);
      App.FlowRuntime?.restore(graph, data);
    }
    if(App.normalizeSimMode(mode) === 'event-fast'){
      return new App.EventFastEngine(graph, options?.engineOptions || options);
    }
    return App.createSimEngine(mode, graph);
  };
})();
