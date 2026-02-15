# fact_sim

[![Demo](https://img.shields.io/badge/demo-live-2ea44f)](https://suzuking001.github.io/fact_sim/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/suzuking001/fact_sim?style=social)](https://github.com/suzuking001/fact_sim)

Web-based production line simulation engine for manufacturing engineers.  
`fact_sim` is an open-source discrete-event simulator that runs entirely in the browser.

Live demo:  
https://suzuking001.github.io/fact_sim/

Quick walkthrough GIF:  
![fact_sim demo](docs/assets/fact_sim_demo.gif)

## Why fact_sim
- No install, no license server, no heavy setup.
- Build a line quickly with node-based modeling.
- Simulate with `dt` and `event` engines.
- Inspect behavior with timing charts and CSV export.
- Share models instantly with `Share URL` / `Share ID`.

## Key Capabilities
| Area | What you can do |
| --- | --- |
| Modeling | Build lines with Source / Equipment / Split / Branch / Merge / Join / AGV Route / Sink |
| Simulation | Switch engine mode (`dt` or `event`), adjust speed, run large scenarios |
| Analysis | Inspect timing chart, follow work progress, export timeline CSV |
| Benchmark | Compare engine speed with render on/off cases in app |
| Collaboration | Save/Load JSON, share via URL hash or short Share ID |

## Quick Start
1. Open the demo site.
2. Choose `Sample Line1` from the example selector.
3. Click `Start`.
4. Change speed to inspect transient and steady behavior.
5. Open `Compare Speed` for engine benchmark.

## Run Locally
```bash
python -m http.server 8123
```
Open `http://127.0.0.1:8123`.

## Typical Use Cases
- Automotive production line planning
- Assembly throughput estimation
- Conveyor and branch/merge logic validation
- Manufacturing education and research

## Documentation
- Research-oriented document: `docs/research.md`
- Third-party notices: `THIRD_PARTY_NOTICES.md`

## Contributing
Issues and pull requests are welcome:  
https://github.com/suzuking001/fact_sim/issues

## License
Apache License 2.0 (`LICENSE`)
