# Engine removal verification

- Engines: dt, event (heap), event-fast.
- Removed the worker and parallel implementations and script loaders.
- Persisted worker/par preferences migrate to event-fast (2 cases PASS).
- Shared MCP headless runner: 9 graph/data/JSON cases PASS.
- MCP benchmark: all 3 engines with rendering off/on (6 cases PASS).
- Engine Test quick: 8 examples × 3 engines × 2 seeds = 48 cases PASS; strict final parity enabled; no warnings or failures.
- HTML export retains the 3 engines and shared registration; no retired script references.
- JS syntax, MCP type check and build PASS.
- Nightly optimizer dry-run on simple and parallel_benchmark reached request generation without running a delegate; target event-fast; protected dt/event.

## Existing standard-suite differences

The full nightly preflight quick suite passed, but the standard suite reported 8 final-state/entity differences on branch and pallet_station_demo for event and event-fast. Loading the original HEAD engine-test.js reproduced exactly the same 8 issues. These differences were not introduced by removing worker/par. The default full nightly optimization still stops at this standard-suite parity gate.

Details: regression.json, engine-test.json, automation-smoke.json, standard-baseline.json.
