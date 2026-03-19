Use the existing AGENTS.md instructions in this repo.
Optimize the target event-fast* engine for speed while preserving dt parity.
Only edit allowed paths. Do not modify dt or event (heap).
Do not edit engine-test or other test-only helpers as part of performance optimization.

Target engine: event-fast-par
Prompt mode: compact
Scope mode: focused
Allowed paths: js/app/engine-fast-par-worker.js, js/app/engine-fast-par-host.js, js/app/engine-fast-par-partitioner.js
Recommended files: js/app/engine-fast-par-host.js, js/app/engine-fast-par-worker.js, js/app/engine-fast-par-partitioner.js
Benchmark example: parallel_benchmark
Target speed: 6396.576x
Minimum improvement: 1%
Verification after patch: suites=quick,standard, reruns=0, strictFinalParity=true

Requirements:
- Make one small, defensible performance improvement.
- Preserve correctness relative to dt.
- Prefer changes that improve headless benchmark speed for the target engine.
- Do not broaden the patch beyond the allowed paths.
- After editing, summarize the expected performance hypothesis.