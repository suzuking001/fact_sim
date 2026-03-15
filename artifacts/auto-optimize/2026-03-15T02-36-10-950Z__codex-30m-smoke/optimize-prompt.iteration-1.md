Use the existing AGENTS.md instructions in this repo.
Optimize the target event-fast* engine for speed while preserving dt parity.
Only edit allowed paths. Do not modify dt or event (heap).
Do not edit engine-test or other test-only helpers as part of performance optimization.

Optimization request:
```json
{
  "version": 1,
  "mode": "optimize",
  "sessionId": "2026-03-15T02-36-10-950Z__codex-30m-smoke",
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
    "wallMs": 300,
    "baseline": {
      "dt": {
        "speed": 2670.995670889641,
        "simSec": 802.1,
        "wallMs": 300.30000001192093
      },
      "event": {
        "speed": 3774.177215339746,
        "simSec": 1133.008,
        "wallMs": 300.19999998807907
      },
      "event-fast": {
        "speed": 5294.346666666666,
        "simSec": 1588.304,
        "wallMs": 300
      },
      "event-fast-worker": {
        "speed": 8693.386666666667,
        "simSec": 2608.016,
        "wallMs": 300
      },
      "event-fast-par": {
        "speed": 9586.24,
        "simSec": 2875.872,
        "wallMs": 300
      }
    },
    "targetSpeed": 9586.24,
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