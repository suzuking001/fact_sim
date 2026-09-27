# 機能別コード案内

該当する行の入口だけ確認し、関連ファイルは必要になった時点で読む。パスはリポジトリ root 基準。実装を移動したら該当行を更新する。

## アプリ

| 機能 | 最初に確認するファイル | 必要時の関連ファイル |
| --- | --- | --- |
| 起動・script 読込順 | `index.html` | `js/app.js`, `js/core.js`, `js/app/state.js`, `js/app/graph-init.js` |
| ダブルクリックでローカル HTTP 起動 | `Start_FactSim.bat` | `scripts/start-factsim.ps1`（Python 3・localhost 限定サーバー・既存サーバー再利用） |
| 全体 UI・画面切替 | `js/app/ui.js`, `js/app/workspace-ui.js` | `js/app/landing.js`, `css/app.css`, `css/workspace.css` |
| AI Assistant・Provider・Tool | `js/ai/ui/ai-chat-panel.js`, `js/ai/agent/factsim-agent.js` | `js/ai/providers/*`, `js/ai/tools/*`, `js/ai/models/model-registry.js`, `css/ai-assistant.css`, `docs/ai-assistant.md` |
| AI 停滞調査・全体状態・実時間計測 | `js/ai/tools/simulation-diagnostics.js` | `js/ai/agent/system-prompt.js`, `mcp/scripts/test-ai-assistant.mjs`, `mcp/scripts/test-ai-scenarios.mjs`（実Ollama・10質問） |
| AI 取り消し保護・テンプレート検査・追加10指示 | `js/ai/tools/tool-registry.js`, `js/ai/tools/factsim-tools.js` | `mcp/scripts/test-ai-scenarios.mjs --suite=extended`、`docs/ai-assistant.md` |
| AI 一括編集・接続解除・削除再接続・複製・相対移動 | `js/ai/tools/editing-tools.js` | `mcp/scripts/test-ai-scenarios.mjs --suite=editing`（編集指示21–30）、`js/ai/tools/tool-registry.js` |
| 選択・プロパティ・詳細 | `js/app/selection-inspector.js`, `js/app/details-ui.js` | `js/app/selection.js`, `js/app/node-props-panel.js`, `css/details.css` |
| Entity・内容物・型 | `js/app/entity-ui.js`, `js/nodes/entity_model.js` | `js/nodes/basic_node.js`, `js/nodes/entity_source.js`, `js/nodes/entity_store.js`, `docs/entity-model-ja.md`, `docs/entity-hierarchy-ja.md` |
| Flow 設定・Add メニュー・配線のドラッグ編集 | `js/app/flow-view.js`, `js/app/flow-model.js` | `js/app/sim.js`（開始後の編集時に実行状態を初期化）、`css/flow-view.css`, `docs/flow-cycle-ja.md`（Join / Fork・接続操作）、`mcp/scripts/test-flow-v2-wiring.cjs` |
| Flow Sensor のノード内グラフ・拡大モーダル・別ウィンドウ表示 | `js/nodes/basic_node.js`, `js/app/sensor-chart-ui.js` | `css/sensor-chart.css`, `js/app/flow-runtime.js` |
| Flow 実行・搬送・Recovery・Fork の複製出力・Joinでの同一Type/ID合流 | `js/app/flow-runtime.js` | `js/nodes/basic_node.js`, `js/link-anim.js`, `mcp/scripts/test-flow-v2-runtime.cjs`, `mcp/scripts/test-flow-v2-fanout.cjs`, `mcp/scripts/test-flow-v2-join.cjs` |
| Flow ノード内の状態・条件成立・経過時間 | `js/app/flow-status.js` | `js/app/flow-view.js`, `mcp/scripts/test-flow-v2-status.cjs` |
| ノード定義・追加メニュー | `js/nodes/<対象ノード>.js`, `js/app/node-catalog.js` | `js/app/node-definition-editor.js`, `config/node-definitions.json`, `js/nodes/register.js`, `js/nodes/menu.js`, `js/nodes-config.js` |
| リンク・編集履歴・表示位置 | `js/app/graph-links.js`, `js/app/history.js` | `js/app/fit.js`, `js/app/background-layout.js` |
| 保存・読込・example | `js/app/file-io.js`, `js/app/examples.js` | `sample/<対象example>.json`, `sample/<対象example>.js`, `docs/sample-line2-ja.md`（4型の構成・分岐設定） |
| シミュレーション操作・基準 engine | `js/app/sim.js`, `js/app/engine.js` | `js/app/stop-groups.js`。自動最適化では基準 engine を変更しない |
| event-fast 共通 | `js/app/engine-fast-runtime.js`, `js/app/engine-fast-mode.js` | `js/app/engine-fast-compiler.js`, `js/app/engine-fast-kernels.js`, `js/app/engine-fast-compat.js` |
| event-fast-worker | `js/app/engine-fast-worker-host.js`, `js/app/engine-fast-worker.js` | `js/app/engine-fast-worker-protocol.js`, event-fast 共通 |
| event-fast-par | `js/app/engine-fast-par-host.js`, `js/app/engine-fast-par-worker.js` | `js/app/engine-fast-par-partitioner.js`, `js/app/engine-fast-par-protocol.js`, event-fast 共通 |
| Engine Test・benchmark | `js/app/engine-test.js`, `js/app/benchmark.js` | runtime group 01、`docs/agent-operations.md` の Engine Test 節 |
| タイミングチャート | `js/app/timeline-init.js`, `js/timeline.js` | runtime group 01 / 05 の CSV 処理 |

## MCP・自動運用

| 機能 | 入口 | 必要時の関連ファイル |
| --- | --- | --- |
| ツール名・引数・登録 | `mcp/src/server/register-ai-tools.ts` | `mcp/src/server/tool-helpers.ts`, `mcp/src/server/create-mcp-server.ts`, `mcp/src/index.ts` |
| runtime 組立・型 | `mcp/src/fact-sim-runtime.ts` | `mcp/src/runtime/runtime-types.ts`, `mcp/src/runtime/runtime-advanced-types.ts` |
| 夜間最適化 | `mcp/package.json`, `mcp/scripts/auto-improve.mjs` | `automation/jobs/event-fast-par.optimize.json`, `mcp/scripts/auto-optimize-event-fast.mjs`, `mcp/scripts/auto-patch-event-fast.mjs` |
| 夜間修正・監視 | `mcp/scripts/auto-fix-runner.mjs` | `mcp/scripts/watch-auto-improve-status.mjs`, `mcp/scripts/watch-auto-optimize-status.mjs` |

### 番号付き runtime の対応表

配置は `mcp/src/runtime/runtime-methods-group-NN.ts`。番号は機能単位と完全には一致しないため、目的に合うメソッドを検索して読む。

| NN | 主な役割 | 検索するメソッド例 |
| --- | --- | --- |
| 01 | example 実行・テスト・benchmark・KPI | `loadExample`, `runEngineTests`, `runBenchmark`, `getKpiSummary` |
| 02 | シナリオ比較・モード・乱数・リセット | `runScenarioMatrix`, `listExamples`, `setSimulationMode`, `setRandomSeed`, `clearGraph` |
| 03 | リンク修復・一定時間実行 | `repairGraphLinks`, `runSimulationFor` |
| 04 | ボトルネック・snapshot・graph JSON・概要 | `getBottleneckReport`, `captureSnapshotPng`, `importGraphJson`, `getGraphOverview` |
| 05 | ファイル保存・HTML/CSV export・ノード型 | `saveGraphJson`, `exportEmbeddedHtml`, `saveTimelineCsv`, `describeNodeType` |
| 06 | blueprint・ボトルネック最適化 | `buildGraphFromBlueprint`, `optimizeLineByBottleneck` |
| 07 | 目標・レイアウト制約・実験計画 | `setTaktTargetAndObjective`, `validateLayoutRules`, `runDesignOfExperiments` |
| 08 | ノード追加・ポート種別による接続 | `addNode`, `getNodePorts`, `connectNodesByPortKind` |
| 09 | ノード更新・接続・削除 | `updateNode`, `connectNodes`, `disconnectNodes`, `removeNode` |
| 10 | 候補評価・順位・CSV 解析・終了 | `evaluateCandidateGraph`, `rankCandidateGraphs`, `parseTimelineCsv`, `close` |
| 11 | graph JSON・ポート正規化・最適化補助 | `parseGraphJsonObject`, `selectPortSlot`, `canonicalizeSerializedLinks`, `resolveDoeTargetNodeIds` |
| 12 | 実験組合せ・スコア・引数正規化 | `buildDoeCombinations`, `computeObjectiveScore`, `sanitizeWallMs` |
| 13 | browser/runtime 起動・再読込・パス・配信 | `reloadPage`, `ensureReady`, `initialize`, `ensureStaticServer` |
| 14 | Entity 型・内容物・フロールール・移行 | `listEntityTypes`, `getNodeContents`, `setNodeFlowRules`, `migrateCurrentGraphToBasic` |

## 検索・検証の入口

```powershell
# 名前を探し、ヒットしたファイルの必要範囲だけ読む
rg -n 'runEngineTests' mcp/src/runtime/runtime-methods-group-01.ts
rg -n 'キーワード' js/app -g 'engine-fast-par-*.js'
```

必須検証は root の `AGENTS.md` に従う。MCP の型チェックは `mcp/` で `npm run check`、build は `npm run build`。engine/parity は MCP の `engine_test` で quick を実行する。フロー専用の確認スクリプトは `mcp/scripts/test-flow-{view,program,ports,engines}.mjs` にあるため、使用時は該当スクリプトの実行条件を確認する。

`index.html` は script を直接参照し、worker も URL で読み込む。ファイル移動時は読込順・worker URL・export 内の参照・この案内を確認する。通常の修正でフォルダ全体を再編しない。
