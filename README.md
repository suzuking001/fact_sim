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

## Core Message (Japanese)
fact_sim は「ロボットの動く絵」を作るツールではありません。
企画段階で本当に必要な問いを、秒単位で説明可能な形で検証するための生産ラインシミュレータです。

- タクトに間に合うか
- スループットはいくつか
- どこがボトルネックか
- 設備・バッファ・AGV・キャリアの台数は妥当か

ブラウザだけで動き、タイミングチャートとCSVで「間に合う理由／間に合わない理由」を可視化。
高額投資の前に、現場で使える判断材料を最短で作れます。

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

## note Article Intro (Japanese)
「動く絵」は会議を通しやすくします。
でも、投資判断に必要なのは“見栄え”ではなく“説明責任”です。

私は15年以上、現場の生産技術として

- どこで詰まるか
- 何台あれば間に合うか
- なぜ間に合わないか

を問い続けてきました。
fact_sim は、その問いに秒単位で答えるために作ったツールです。
この記事では、机上のDXではなく、現場で本当に使えるシミュレーション設計を公開します。

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
