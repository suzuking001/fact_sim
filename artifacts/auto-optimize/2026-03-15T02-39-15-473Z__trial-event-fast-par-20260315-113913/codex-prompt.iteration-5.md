Use the existing AGENTS.md instructions in this repo.
Optimize the target event-fast* engine for speed while preserving dt parity.
This is an optimization request, not a failure-fix request.
Only edit allowed paths. Do not modify protected engines, engine-test, benchmark harnesses, or unrelated files.

Optimization request:
```json
{
  "version": 1,
  "mode": "optimize",
  "sessionId": "2026-03-15T02-39-15-473Z__trial-event-fast-par-20260315-113913",
  "iteration": 5,
  "targetEngine": "event-fast-par",
  "profile": "nightly",
  "examples": null,
  "benchmarkExample": "parallel_benchmark",
  "seeds": [
    1
  ],
  "engines": [
    "dt",
    "event",
    "event-fast",
    "event-fast-worker",
    "event-fast-par"
  ],
  "constraints": {
    "protectEngines": [
      "dt",
      "event"
    ],
    "allowedPaths": [
      "js/app/engine-fast-par-worker.js",
      "js/app/engine-fast-par-host.js",
      "js/app/engine-fast-par-partitioner.js",
      "js/app/engine-fast-worker.js",
      "js/app/engine-fast-worker-host.js",
      "js/app/engine-fast-runtime.js",
      "js/app/engine-fast-compat.js",
      "js/app/engine-fast-kernels.js"
    ]
  },
  "recommendedFiles": [
    "js/app/engine-fast-par-host.js",
    "js/app/engine-fast-par-worker.js",
    "js/app/engine-fast-par-partitioner.js"
  ],
  "benchmark": {
    "wallMs": 500,
    "baseline": {
      "dt": {
        "speed": 2643.6712656208156,
        "simSec": 1322.1,
        "wallMs": 500.10000002384186
      },
      "event": {
        "speed": 4138.016,
        "simSec": 2069.008,
        "wallMs": 500
      },
      "event-fast": {
        "speed": 5479.824069849464,
        "simSec": 2741.008,
        "wallMs": 500.2000000476837
      },
      "event-fast-worker": {
        "speed": 9312.032,
        "simSec": 4656.016,
        "wallMs": 500
      },
      "event-fast-par": {
        "speed": 9726.176,
        "simSec": 4863.088,
        "wallMs": 500
      }
    },
    "targetSpeed": 9726.176,
    "minImprovementPct": 1
  },
  "verification": {
    "suites": [
      "quick",
      "standard"
    ],
    "strictFinalParity": true,
    "reruns": 2,
    "stopOnFirstFailure": true
  }
}
```

Target engine: event-fast-par
Protected engines: dt, event
Allowed paths: js/app/engine-fast-par-worker.js, js/app/engine-fast-par-host.js, js/app/engine-fast-par-partitioner.js, js/app/engine-fast-worker.js, js/app/engine-fast-worker-host.js, js/app/engine-fast-runtime.js, js/app/engine-fast-compat.js, js/app/engine-fast-kernels.js
Recommended files: js/app/engine-fast-par-host.js, js/app/engine-fast-par-worker.js, js/app/engine-fast-par-partitioner.js

Requirements:
- Make one small, defensible performance improvement in the target engine implementation.
- Preserve correctness relative to dt. Do not widen the patch scope.
- Prefer changes that improve headless benchmark speed for the target engine.
- Do not ask questions. Do not call request_user_input. Make reasonable assumptions and continue.
- Do not browse external websites.
- Keep dt and event behavior untouched.
- Benchmark target speed is 9726.176x with minimum improvement 1%.
- Verification guidance: suites=quick,standard, reruns=2, strictFinalParity=true.

At the end, summarize:
1. the performance hypothesis
2. what changed
3. which focused verification you ran
4. any residual risk