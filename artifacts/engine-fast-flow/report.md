# event-fast の Flow 同期探索を事前計算

検証日: 2026-09-29。

## 対象の選定

`sample_line2` を event-fast で 30,000,000ms 進めて CPU profile を取得した。同期メンバーの探索を行う `syncGroups` が約8.91秒、その探索からも呼ばれる Flow 取得処理が約2.38秒を占めていた。計測全体は約22.43秒。イベント順序管理より、毎設備イベントで全グラフ・全Flowを探索する処理を先に改善する判断とした。

これは当該モデルで測定した主要な費用であり、すべてのモデル・高速化方式の中で最大の改善になるという保証ではない。

## 実装

- 同期グループに属する設備と Flow ノードを事前に表へまとめる。
- 設備・Flow・グループの元の順序を維持する。
- 同期の判定、空き確認、同時移送、履歴記録は従来の処理を使い、メンバー探索だけを置き換える。
- 実際の Cell と設備状態は各イベントで取得する。動的な状態をキャッシュしない。
- update の入口でグラフ・Flow の変更、同期グループ割当、Flow cache の無効化を確認し、必要なら表を再計算する。Reset でも破棄する。
- 同期グループがない場合は表の作成・検査を省略する。
- event-fast の共通実装を使う Worker / par にも適用する。
- index と Worker 内の script version を更新した。

基準エンジン `js/app/engine.js` は変更していない。共通 FlowRuntime には事前計算結果を任意で受け取る入口を追加し、dt / event は従来の探索経路を使う。

## Benchmark

描画・タイミングチャートを停止した計算処理の比較。同じ初期グラフから 3,000,000ms まで進め、1 update は 10,000ms。ウォームアップ後、事前計算を無効／有効にした実行順を交互にして各5回測定した。表は中央値。計測には最初の表作成と各 update の変更確認を含み、グラフ読込・最終状態の取得は含まない。

| example | 従来の探索 | 事前計算 | 計算速度の比率 |
| --- | ---: | ---: | ---: |
| sample_line2 | 1645.1ms | 618.7ms | **2.66倍** |
| sample_line1 | 283.5ms | 285.6ms | 0.99倍 |
| parallel_benchmark | 385.4ms | 386.9ms | 1.00倍 |
| carrier | 84.4ms | 83.9ms | 1.01倍 |

sample_line2 の処理時間は約62.4%減少。同期グループのない3モデルは約1%以内の差で、改善は確認していない。画面描画を含むアプリ全体が2.66倍になるという測定ではない。

各モデルの全10実行で FlowRuntime の最終状態の SHA-256 が一致した。完成数は sample_line2=402、sample_line1=461、parallel_benchmark=6000、carrier=207。未完成・エラー状態だけの空実行ではないことも確認した。

## 検証

- 変更した JS / 検証スクリプトの `node --check`: 成功。
- MCP `npm run check` / `npm run build`: 成功。
- Engine Test quick: 全8 example × 全5 engine × seed 1/12345 = **80/80 PASS**。completion / visible flow / node 状態遷移 / timing chart / strict final parity を比較。警告なし。
- 既存 Flow シナリオを事前計算経路で実行: **26/26 PASS**。下流の待ち、Recovery、Fork / Join、同時移送、循環する同期グループ、Sensor、保存・復元など。
- 表の内容・順序・無効化: **27項目 PASS**。Flow 置換、グループ割当変更、cache 無効化、グラフ順序変更、グループ追加、グラフ編集を確認。
- 表の再利用・Reset 時の破棄と再構築: 成功。
- par の通常／まとめ実行／FASTEST の状態・Entity・履歴・停止・速度切替: 成功。高速化前の不具合修正も維持されている。

## 記録・再実行

- [変更前 profile 概要](profile-before.json) / [CPU profile](before.cpuprofile)
- [Benchmark](benchmark.json)
- [回帰確認](regression.json) / [全エンジンの結果](engine-test.json)
- [Flow シナリオ](compiled-flow-scenarios.log)
- [par live regression](par-live-regression.json)

```powershell
node mcp/scripts/benchmark-engine-fast-flow.mjs
node mcp/scripts/test-engine-fast-flow.mjs
node mcp/scripts/test-engine-fast-par-live.mjs
```
