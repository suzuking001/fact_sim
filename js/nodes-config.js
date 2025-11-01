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
  }
};

