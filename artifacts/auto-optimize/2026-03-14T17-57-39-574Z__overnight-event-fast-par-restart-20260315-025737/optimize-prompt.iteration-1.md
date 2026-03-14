Use the existing AGENTS.md instructions in this repo.
Optimize the target event-fast* engine for speed while preserving dt parity.
Only edit allowed paths. Do not modify dt or event (heap).
Do not edit engine-test or other test-only helpers as part of performance optimization.

Optimization request:
```json
{
  "version": 1,
  "sessionId": "2026-03-14T17-57-39-574Z__overnight-event-fast-par-restart-20260315-025737",
  "iteration": 1,
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
        "speed": 2731.4,
        "simSec": 1365.7,
        "wallMs": 500
      },
      "event": {
        "speed": 4290.315873752788,
        "simSec": 2146.016,
        "wallMs": 500.19999998807907
      },
      "event-fast": {
        "speed": 5301.12,
        "simSec": 2650.56,
        "wallMs": 500
      },
      "event-fast-worker": {
        "speed": 9194.016,
        "simSec": 4597.008,
        "wallMs": 500
      },
      "event-fast-par": {
        "speed": 9679.008,
        "simSec": 4839.504,
        "wallMs": 500
      }
    },
    "targetSpeed": 9679.008,
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

Requirements:
- Make one small, defensible performance improvement.
- Preserve correctness relative to dt.
- Prefer changes that improve headless benchmark speed for the target engine.
- Do not broaden the patch beyond the allowed paths.
- After editing, summarize the expected performance hypothesis.