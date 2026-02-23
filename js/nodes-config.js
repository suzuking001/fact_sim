// Simple, standalone config for node default settings and units.
// Edit this file frequently during development to test different timings.

window.NODES_CONFIG = {
  units: {
    // All node time properties are in seconds.
    timeSeconds: true,
    // Simulation step (UI refresh cadence expectation), in seconds.
    stepSeconds: 0.1,
  },
  source: {
    // Default interval between works (seconds)
    intervalSec: 2,
  },
  equipment: {
    // Default process/down times (seconds)
    processTimeSec: 2,
    downTimeSec: 3,
  },
  agvRoute: {
    processTimeSec: 3,
    downTimeSec: 0.5,
    agvCapacity: 2,
  },
  carrierRoute: {
    processTimeSec: 3,
    downTimeSec: 0.5,
    initialCarrierId: '',
    outSequence: '',
  },
  carrierConfig: {
    capacity: 2,
  },
  // Backward compatibility key (old name).
  carrierHome: {
    capacity: 2,
  },
  limits: {
    // LiteGraph default is 1000. Raise it for large models.
    maxNodes: 5000,
  }
};

// Apply graph-size limit override as early as possible.
(function(){
  if(typeof LiteGraph === 'undefined') return;
  const cfg = Number(window.NODES_CONFIG?.limits?.maxNodes);
  if(!isFinite(cfg) || cfg < 1) return;
  LiteGraph.MAX_NUMBER_OF_NODES = Math.round(cfg);
})();
