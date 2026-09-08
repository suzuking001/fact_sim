# fact_sim Agent Notes

## 探索と読み込み

- 対象ファイルが分かる場合は直接確認する。不明なら [機能別案内](docs/code-map.md) の該当行から探索を始める。
- `rg` は関連ディレクトリ・ファイルに限定し、不足時や依存関係の確認が必要な場合だけ範囲を広げる。
- 大きなファイルはシンボルを検索して必要範囲を読む。全ファイル一覧・全文・既読内容を理由なく繰り返し取得しない。
- `artifacts/`、`tmp/`、`js/vendor/`、`mcp/node_modules/`、`mcp/dist/`、画像・サンプルは通常のコード探索から外し、作業に必要な場合だけ読む。除外はアクセス禁止ではない。
- 夜間運用・Engine Test オプション・example 保存・プロンプト例は [運用手順](docs/agent-operations.md) の必要な節だけ読む。
- テスト・MCP の結果は要約と失敗箇所を優先し、詳細ログはファイルに保存する。raw JSON や export を求められていない限り返答は簡潔にする。
- PowerShell で日本語文書を読むときは `-Encoding UTF8` を指定する。
- 機能の追加・移動で入口が変わった場合は機能別案内の該当行だけ更新する。

## MCP 優先

- example 読込、シミュレーション、KPI・ボトルネック・benchmark・graph overview、グラフ編集、blueprint 生成、export は統合 MCP `fact-sim-ai` を第一候補にする。UI・見た目の確認が必要な場合だけブラウザ自動操作を使う。
- 推奨順は `prepare_session` → `run_report` → `graph` → `edit_graph` → `metrics` → `optimize`。必要なツールだけ使う。
- 再現性のある実行は `simulate(action="run_for")`、単発評価は `run_report`、生成と検証は `build_blueprint_report` を優先する。
- グラフ変更は `edit_graph(action="batch")` と `ref` + `$name` 参照を優先する。古いプロンプトの legacy alias が利用可能ならそのまま使う。

## 自動修正・自動最適化の保護範囲

- `dt`、`event (heap)`、`js/app/engine.js` は原則変更しない。無関係な UI / docs / sample も編集しない。
- 原則編集可能なのは `js/app/engine-fast*`、`js/app/engine-test.js`、`mcp/scripts/auto-*`、`mcp/src/runtime/*` のうち自動最適化・engine test に直接関係する部分。
- 性能改善の対象は `event-fast` / `event-fast-worker` / `event-fast-par`。夜間最適化の既定対象は `event-fast-par`。

## 検証

1. 変更した JS / TS の `node --check`。
2. `mcp/` で `npm run check`。
3. engine / parity に関わる変更は `Engine Test quick`。`dt` を基準に全 engine・全 example の completion / visible work-flow / node 状態遷移 / timing chart / strict final parity を比較する。
4. 夜間最適化や MCP 変更は `mcp/` で `npm run build`。

- 性能改善を主張する場合は benchmark を取り、改善率を明示する。
- `index.html`・script version・worker・`event-fast*`・`engine-test` を変更したら runtime を再読み込みして検証する。UI と MCP の不一致や古い page の疑いがある場合も同様。古い runtime は false failure や古い benchmark の原因になる。
- 必須検証が通った後の再実行は、新しい変更・失敗・未解決の懸念がある場合に行う。

## 出力先

- 一時スクリーンショット・確認画像は `tmp/`。root 直下には置かない。
- 恒久的な test / optimization / benchmark / report / export は `artifacts/`。
- 夜間進捗はまず `artifacts/auto-optimize/latest-event-fast-par-status.json` を読み、必要時だけ該当 iteration のログを調べる。
