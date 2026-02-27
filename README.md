# fact_sim

[![Demo](https://img.shields.io/badge/demo-live-2ea44f)](https://suzuking001.github.io/fact_sim/)
[![License](https://img.shields.io/badge/license-Research%20%2F%20Non--Commercial-blue)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/suzuking001/fact_sim?style=social)](https://github.com/suzuking001/fact_sim)

**Prove takt and throughput before you buy equipment.**

`fact_sim` is an open-source, browser-based discrete-event simulator for production-line design.
It helps manufacturing teams validate takt feasibility, throughput, bottlenecks, and resource sizing (equipment, buffers, AGVs, carriers) with explainable timing charts instead of presentation-only animations.

![fact_sim demo](docs/assets/fact_sim_demo.gif)

## Live Demo
https://suzuking001.github.io/fact_sim/

## Core Message
fact_sim is not a tool for making flashy robot animations.
It is a production-line simulator designed to answer the questions that matter at planning stage, with second-level explainability:

- Will the line meet takt?
- What throughput can we achieve?
- Where is the bottleneck?
- Are equipment, buffers, AGVs, and carriers sized correctly?

It runs fully in the browser and visualizes *why* a line meets or misses target via timing charts and CSV.
Before major CAPEX, it helps teams build decision-grade evidence fast.

## Why fact_sim
- Browser-native workflow for fast iteration
- Node-based modeling that maps to real line design
- Discrete-event simulation with practical engine options (`dt`, `event`)
- Explainable analysis with timing chart + CSV export
- URL-based scenario sharing for fast team reviews

## Core Capabilities
- **Modeling:** Source, Equipment, Split, Branch, Merge, Join, Carrier Route, Carrier Config, Pallet Carrier Config, Station, Sink
- **Simulation:** engine switching, speed scaling, large scenario execution
- **Analysis:** timing chart, node highlighting, benchmark comparison, CSV export
- **Collaboration:** JSON save/load and shareable URL state

## Quick Start (2 Minutes)
1. Open the live demo.
2. Select `Sample Line1` or `Carrier Config Example`.
3. Click `Start`.
4. Inspect `Timing Chart` to verify state transitions.
5. Export CSV when you need evidence for review.

## Product Hunt Copy
**Tagline**
Prove takt and throughput before you buy equipment.

**Short description**
A browser-based discrete-event simulator for manufacturing engineers. Validate takt, throughput, bottlenecks, and AGV/buffer sizing with explainable timing charts.

**Launch post**
fact_sim was built for one purpose: make production decisions explainable before CAPEX. Not flashy robot animation, but second-level operational truth. Model quickly, run in-browser, inspect timing charts, export CSV, and share scenarios by URL. If your team asks “Will this line really meet takt?”, fact_sim gives a defensible answer.

## note Article Intro
“Moving visuals” make meetings easier.
But investment decisions need accountability, not aesthetics.

For over 15 years in production engineering, the key questions have remained:

- Where will it choke?
- How many units are actually needed?
- Why exactly does it miss target?

fact_sim was built to answer those questions at second-level resolution.
This article shares practical simulation design for real factories, not presentation-only DX.

## Run Locally
```bash
python -m http.server 8123
```
Open `http://127.0.0.1:8123`

## Documentation
- Research notes: `docs/research.md`
- Third-party notices: `THIRD_PARTY_NOTICES.md`

## Contributing
Issues and pull requests are welcome:
https://github.com/suzuking001/fact_sim/issues

## Commercial Use
Commercial use is not permitted under the default Research / Non-Commercial License.

If you want to use `fact_sim` for commercial purposes, contact us for a separate commercial license:
- Email: suzukiuser01@gmail.com
- GitHub Issues: https://github.com/suzuking001/fact_sim/issues
- Recommended issue title: `Commercial License Inquiry`

## License
Research / Non-Commercial License (`LICENSE`)
