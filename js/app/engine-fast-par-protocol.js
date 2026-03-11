var App = (typeof window !== 'undefined'
  ? (window.App || (window.App = {}))
  : (self.App || (self.App = {})));

(function(root){
  const protocol = Object.freeze({
    INIT: 'init',
    RESET: 'reset',
    STEP: 'step',
    RUN_BENCHMARK_CASE: 'runBenchmarkCase',
    RUN_UNTIL_SIM_TIME: 'runUntilSimTime',
    APPLY_REMOTE_MESSAGES: 'applyRemoteMessages',
    APPLY_AND_FLUSH: 'applyAndFlush',
    FLUSH: 'flush',
    GET_SNAPSHOT: 'getSnapshot',
    GET_STATS: 'getStats',
    STOP: 'stop',
    DISPOSE: 'dispose'
  });

  root.factSimEventFastParProtocol = protocol;
  App.eventFastParProtocol = protocol;
})(typeof self !== 'undefined' ? self : window);
