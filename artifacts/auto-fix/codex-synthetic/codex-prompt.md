Use the existing AGENTS.md instructions in this repo.
Fix the single target failure described below.
Only edit allowed paths. Do not modify protected engines or unrelated files.

Target failure:
```json
{
  "severity": "error",
  "code": "LIVE_WORKFLOW_DELTA",
  "message": "Visible work-link flow differs from dt",
  "engine": "event-fast-par",
  "scenario": "sample_line1",
  "suite": "quick"
}
```

Protected engines: dt, event
Allowed paths: js/app/engine-fast-runtime.js, js/app/engine-fast-compat.js, js/app/engine-fast-kernels.js, js/app/engine-fast-worker.js, js/app/engine-fast-worker-host.js, js/app/engine-fast-par-worker.js, js/app/engine-fast-par-host.js, js/app/engine-fast-par-partitioner.js, js/app/engine-test.js
Recommended files: js/app/engine-fast-par-host.js, js/app/engine-fast-par-worker.js, js/app/engine-test.js

Requirements:
- Apply the smallest defensible patch that resolves this failure.
- Keep dt and event behavior untouched.
- Prefer fixing event-fast* engines or engine-test helpers only.
- After editing, run a focused verification for the same failure if possible.
- Use reruns=2 and strictFinalParity=true as guidance.
- Benchmark regressions are not acceptable (wallMs=2000).

At the end, summarize:
1. what changed
2. which verification you ran
3. any residual risk