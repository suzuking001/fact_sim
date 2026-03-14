Use the existing AGENTS.md instructions in this repo.
Fix the single target failure described below.
Only edit allowed paths. Do not modify protected engines or unrelated files.

Target failure:
```json
{}
```

Protected engines: dt, event
Allowed paths: js/app/engine-test.js, js/app/engine-fast-par-worker.js, js/app/engine-fast-par-host.js, js/app/engine-fast-par-partitioner.js, js/app/engine-fast-worker.js, js/app/engine-fast-worker-host.js, js/app/engine-fast-runtime.js, js/app/engine-fast-compat.js, js/app/engine-fast-kernels.js
Recommended files: js/app/engine-fast-par-host.js, js/app/engine-fast-par-worker.js, js/app/engine-fast-par-partitioner.js

Requirements:
- Apply the smallest defensible patch that resolves this failure.
- Keep dt and event behavior untouched.
- Prefer fixing event-fast* engines or engine-test helpers only.
- Do not ask questions. Do not call request_user_input. Make reasonable assumptions and continue.
- Do not browse external websites.
- After editing, run a focused verification for the same failure if possible.
- Use reruns=0 and strictFinalParity=false as guidance.
- Benchmark regressions are not acceptable (wallMs=0).

At the end, summarize:
1. what changed
2. which verification you ran
3. any residual risk