# fact_sim

[![Demo](https://img.shields.io/badge/demo-live-2ea44f)](https://suzuking001.github.io/fact_sim/)
[![License](https://img.shields.io/badge/license-Research%20%2F%20Non--Commercial-blue)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/suzuking001/fact_sim?style=social)](https://github.com/suzuking001/fact_sim)

**Build production-line simulations in minutes, directly in the browser.**

`fact_sim` is a source-available discrete-event simulation platform for manufacturing teams.
No installation. No heavy setup. Just model, run, analyze, and share.

![fact_sim demo](docs/assets/fact_sim_demo.gif)

## Live Demo
https://suzuking001.github.io/fact_sim/

## Why fact_sim
- Browser-native workflow for fast iteration
- Node-based modeling that maps to real line design
- Dual simulation engines (`dt` and `event`) for practical trade-offs
- Timing chart + CSV export for analysis and reporting
- URL-based sharing for instant collaboration

## Core Capabilities
- **Modeling:** Source, Equipment, Split, Branch, Merge, Join, Carrier Route, Carrier Config, Sink
- **Simulation:** engine switching, speed scaling, large scenario execution
- **Analysis:** timing chart, node highlighting, benchmark comparison, CSV export
- **Collaboration:** JSON save/load and sharable URL state

## Quick Start (2 Minutes)
1. Open the live demo.
2. Select `Sample Line1`.
3. Click `Start`.
4. Adjust speed.
5. Open `Compare Speed` when you need benchmark data.

## Run Locally
```bash
python -m http.server 8123
```
Open `http://127.0.0.1:8123`

## Typical Use Cases
- Early-stage production line planning
- Throughput and bottleneck exploration
- Conveyor and routing logic validation
- Manufacturing education and research

## Security Scanning
- CI secret scan: `.github/workflows/secret-scan.yml`
- Local hook setup: `powershell -File scripts/setup-git-hooks.ps1`
- Manual scan: `powershell -File scripts/secret-scan.ps1`

## Documentation
- Research notes: `docs/research.md`
- Third-party notices: `THIRD_PARTY_NOTICES.md`

## Contributing
Issues and pull requests are welcome:
https://github.com/suzuking001/fact_sim/issues

## Commercial Use
Commercial use is not permitted under the default Research / Non-Commercial License.

If you want to use `fact_sim` for commercial purposes, please contact us for a separate commercial license:
- Email: suzukiuser01@gmail.com
- GitHub Issues: https://github.com/suzuking001/fact_sim/issues
- Recommended issue title: `Commercial License Inquiry`

## License
Research / Non-Commercial License (`LICENSE`)
