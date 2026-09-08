# fact_sim 運用手順

必要な作業の節だけ参照する。共通ルールは [AGENTS.md](../AGENTS.md)、実装の入口は [code-map.md](code-map.md) を参照。

## エンジンテスト運用

`Engine Test` は `dt` を基準に、全 engine・全 example を比較する前提です。主な確認対象は次です。

- completion parity
- visible work-flow parity
- node 状態遷移 parity
- timing chart parity
- strict final parity

利用可能な suite:

- `quick`
- `standard`
- `soak`

追加オプション:

- `seeds`
- `strictFinalParity`
- `saveArtifacts`
- `reruns`
- `stopOnFirstFailure`

artifact 保存先:

- `artifacts/engine-test/<timestamp>__<label>/`


## 夜間ジョブ / 自動最適化

夜間ジョブの入口は `mcp/` 配下の npm script です。

```bash
cd mcp
npm run nightly
```

自動 patch を含む夜間修正ループ:

```bash
cd mcp
npm run nightly:auto-patch
```

benchmark 主導の夜間最適化:

```bash
cd mcp
npm run nightly:optimize
```

`nightly:optimize` は次を自動で回します。

1. `quick` engine test
2. `standard` engine test
3. benchmark baseline 取得
4. optimization request 生成
5. patch delegate 実行
6. 再度 `quick`
7. 再度 `standard`
8. benchmark 再実行
9. 改善時のみ patch 採用、悪化時は revert

自動最適化 artifact 保存先:

- `artifacts/auto-optimize/<timestamp>__<label>/`

最新ステータス:

- `artifacts/auto-optimize/latest-event-fast-par-status.json`
- `artifacts/auto-optimize/latest-event-fast-par-status.md`


## リアルタイム監視

夜間ジョブの進捗監視は次で行えます。

```bash
cd mcp
npm run watch:auto-optimize
```

Windows では root のバッチも使えます。

```bat
scripts/watch_event_fast_par_status.bat
```

監視画面には次が出ます。

- session id
- current status
- baseline / best / improvement %
- latest iteration
- recent files
- stdout / stderr 末尾


## example の上書き保存

静的サイト運用でも、**Chrome 系ブラウザ + localhost** であれば `File System Access API` を使って example を上書き保存できます。

条件:

- `scripts/start_fact_sim_server.bat` などで `http://127.0.0.1:8123/` から開く
- Chrome / Edge を使う
- 初回に `Link Sample Folder` で `sample` フォルダへの権限を与える

保存対象:

- `sample/<example>.json`
- `sample/<example>.js`

`file://` 直開きでは保存できません。


## 推奨プロンプト例

- `Use fact-sim-ai MCP to load sample_line1, run 3000ms in dt mode, and return KPI + bottleneck summary.`
- `Use fact-sim-ai MCP to add an equipment node after node 12 and connect work ports.`
- `Use fact-sim-ai MCP to build a small blueprint, run 1000ms, and report throughput.`
- `Use fact-sim-ai MCP to run engine_test in standard suite with saveArtifacts=true and summarize failures only.`
- `Use fact-sim-ai MCP to benchmark event-fast-par on parallel_benchmark and compare it with the latest baseline.`


## プロンプトテンプレート

- quick scenario check  
  `Use fact-sim-ai MCP. Prepare session with example=<name>, mode=<dt|event>, reset=true. Then run_report for <wallMs> ms and return KPI, top <N> bottlenecks, and a short conclusion.`

- graph patch + verify  
  `Use fact-sim-ai MCP. Apply edit_graph batch operations with ref names, then run_report for <wallMs> ms and tell me whether throughput improved.`

- blueprint build + verify  
  `Use fact-sim-ai MCP. Build the graph from a blueprint with build_blueprint_report, run for <wallMs> ms, and return node/link counts, KPI, and bottleneck summary.`

- engine test  
  `Use fact-sim-ai MCP. Run engine_test with suite=<quick|standard|soak>, seeds=<...>, strictFinalParity=<true|false>, saveArtifacts=true, and summarize only failures and warnings.`

- overnight optimization status  
  `Read artifacts/auto-optimize/latest-event-fast-par-status.json and summarize current improvement %, iteration, status, and whether the delegate is making progress.`

- export workflow  
  `Use fact-sim-ai MCP. Save the current graph JSON, snapshot PNG, and embedded HTML, then return only the saved paths.`

- legacy prompt fallback  
  `If an older prompt uses load_example / run_simulation_for / get_kpi_summary, use the legacy alias tools instead of rewriting the workflow manually.`


## 関連ドキュメント

- `docs/quick-reference-ja.md`
- `docs/ai-mcp.md`
- `docs/research.md`
- `docs/overnight-auto-optimize.md`
- `docs/overnight-auto-optimize-ja.md`
