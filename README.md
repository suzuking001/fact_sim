# fact_sim

[![Demo](https://img.shields.io/badge/demo-live-2ea44f)](https://suzuking001.github.io/fact_sim/)
[![License](https://img.shields.io/badge/license-Research%20%2F%20Non--Commercial-blue)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/suzuking001/fact_sim?style=social)](https://github.com/suzuking001/fact_sim)

Quick walkthrough GIF:  
![fact_sim demo](docs/assets/fact_sim_demo.gif)

## English / 日本語

| English | 日本語 |
| --- | --- |
| **Overview**<br>Web-based production line simulation engine for manufacturing engineers.<br>`fact_sim` is a source-available discrete-event simulator that runs entirely in the browser. | **概要**<br>製造エンジニア向けの Web ベース生産ラインシミュレーションエンジンです。<br>`fact_sim` は、ブラウザだけで動作するソース公開型の離散事象シミュレータです。 |
| **Live Demo**<br>https://suzuking001.github.io/fact_sim/ | **デモサイト**<br>https://suzuking001.github.io/fact_sim/ |
| **Why fact_sim**<br>• No install, no license server, no heavy setup.<br>• Build a line quickly with node-based modeling.<br>• Simulate with `dt` and `event` engines.<br>• Inspect behavior with timing charts and CSV export.<br>• Share models instantly with `Share URL`. | **fact_sim の特長**<br>• インストール不要・ライセンスサーバ不要・軽量。<br>• ノードベースでラインをすばやく構築可能。<br>• `dt` / `event` エンジンを切替可能。<br>• タイミングチャート表示と CSV 出力に対応。<br>• `Share URL` で即共有。 |
| **Quick Start**<br>1. Open the demo site.<br>2. Choose `Sample Line1`.<br>3. Click `Start`.<br>4. Change speed as needed.<br>5. Open `Compare Speed` if you want benchmark results.<br><br>You can start running a useful production-line simulation in just a few minutes. | **クイックスタート**<br>1. デモサイトを開く。<br>2. `Sample Line1` を選ぶ。<br>3. `Start` を押す。<br>4. 必要に応じて速度を変更する。<br>5. ベンチ結果を見たい場合は `Compare Speed` を開く。<br><br>数分で実用的な生産ラインシミュレーションを開始できます。 |
| **Run Locally**<br>`python -m http.server 8123`<br>Open: `http://127.0.0.1:8123` | **ローカル実行**<br>`python -m http.server 8123`<br>アクセス先: `http://127.0.0.1:8123` |
| **Typical Use Cases**<br>• Automotive production line planning<br>• Assembly throughput estimation<br>• Conveyor and branch/merge logic validation<br>• Manufacturing education and research | **主な用途**<br>• 自動車生産ライン計画<br>• 組立ラインのスループット見積もり<br>• コンベヤおよび分岐・合流ロジック検証<br>• 製造教育・研究 |
| **Documentation**<br>• Research document: `docs/research.md`<br>• Third-party notices: `THIRD_PARTY_NOTICES.md` | **ドキュメント**<br>• 研究者向け: `docs/research.md`<br>• サードパーティ通知: `THIRD_PARTY_NOTICES.md` |
| **Contributing**<br>Issues and pull requests are welcome.<br>https://github.com/suzuking001/fact_sim/issues | **コントリビュート**<br>Issue / Pull Request を歓迎します。<br>https://github.com/suzuking001/fact_sim/issues |
| **License**<br>Research / Non-Commercial License (`LICENSE`) | **ライセンス**<br>Research / Non-Commercial License（研究・非商用）(`LICENSE`) |

## Key Capabilities

| Area | What you can do |
| --- | --- |
| Modeling | Build lines with Source / Equipment / Split / Branch / Merge / Join / AGV Route / Carrier Home / Carrier Route / Sink |
| Simulation | Switch engine mode (`dt` or `event`), adjust speed, run large scenarios |
| Analysis | Inspect timing chart, follow work progress, export timeline CSV |
| Benchmark | Compare engine speed with render on/off cases in app |
| Collaboration | Save/Load JSON, share via URL hash |

## Secret Scan / シークレット検査

| English | 日本語 |
| --- | --- |
| **CI scan**<br>GitHub Actions runs gitleaks on every push / PR.<br>Workflow: `.github/workflows/secret-scan.yml` | **CI スキャン**<br>GitHub Actions で push / PR ごとに gitleaks を実行します。<br>ワークフロー: `.github/workflows/secret-scan.yml` |
| **Local pre-commit**<br>1. Install gitleaks<br>2. Run `powershell -File scripts/setup-git-hooks.ps1`<br>3. Commit normally (`.githooks/pre-commit` scans staged changes). | **ローカル pre-commit**<br>1. gitleaks をインストール<br>2. `powershell -File scripts/setup-git-hooks.ps1` を実行<br>3. 通常どおりコミット（`.githooks/pre-commit` が staged 変更を検査）。 |
| **Manual scan**<br>`powershell -File scripts/secret-scan.ps1` | **手動スキャン**<br>`powershell -File scripts/secret-scan.ps1` |
