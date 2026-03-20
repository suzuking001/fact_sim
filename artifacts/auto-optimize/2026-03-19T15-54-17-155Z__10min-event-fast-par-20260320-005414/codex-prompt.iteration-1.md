Use the existing AGENTS.md instructions in this repo.
Optimize the target event-fast* engine for speed while preserving dt parity.
This is an optimization request, not a failure-fix request.
Only edit allowed paths. Do not modify protected engines, engine-test, benchmark harnesses, or unrelated files.

Target engine: event-fast-par
Prompt mode: compact
Scope mode: focused
Protected engines: dt, event
Allowed paths: js/app/engine-fast-par-worker.js, js/app/engine-fast-par-host.js, js/app/engine-fast-par-partitioner.js
Recommended files: js/app/engine-fast-par-host.js, js/app/engine-fast-par-worker.js, js/app/engine-fast-par-partitioner.js

Compact optimization context:
- Benchmark example: parallel_benchmark
- Baseline speed for event-fast-par: 6408.736x
- Minimum improvement to keep patch: 1%
- Verification after patch will be handled by the runner: suites=quick,standard, reruns=0, strictFinalParity=true.
- Favor the smallest change that plausibly improves the benchmarked hot path.
- Avoid broad refactors. If no small improvement is clear, make no change.

Requirements:
- Make one small, defensible performance improvement in the target engine implementation.
- Preserve correctness relative to dt. Do not widen the patch scope.
- Prefer changes that improve headless benchmark speed for the target engine.
- Do not ask questions. Do not call request_user_input. Make reasonable assumptions and continue.
- Do not browse external websites.
- Keep dt and event behavior untouched.
- Benchmark target speed is 6408.736x with minimum improvement 1%.
- Verification guidance: suites=quick,standard, reruns=0, strictFinalParity=true.

At the end, summarize:
1. the performance hypothesis
2. what changed
3. which focused verification you ran
4. any residual risk