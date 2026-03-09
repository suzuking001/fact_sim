// Register event-fast without modifying legacy dt/event implementations.

var App = window.App || (window.App = {});

(function(){
  function normalizeFastMode(mode){
    const raw = String(mode || '').trim().toLowerCase();
    if(raw === 'event-fast' || raw === 'event_fast' || raw === 'eventfast' || raw === 'fast'){
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
})();
