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
    STOP: 'stop',
    DISPOSE: 'dispose',
    GET_STATS: 'getStats',
    READY: 'ready',
    ERROR: 'error'
  });

  root.factSimEventFastWorkerProtocol = protocol;
  App.eventFastWorkerProtocol = protocol;
})(typeof self !== 'undefined' ? self : window);
