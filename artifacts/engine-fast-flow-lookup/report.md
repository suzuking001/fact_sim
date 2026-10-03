# event-fast の追加高速化: 状態走査と表示履歴の索引

検証日: 2026-09-29。前回の同期メンバー事前計算を有効にした状態から、追加で改善した。

## 選定と実装

30,000,000ms の実行を CPU profile で調査した。状態・次回イベント時刻のための一時配列生成、表示履歴の検索、設備出力の変化検出に負荷が残っていた。

以下を個別に無効／有効にして比較した。

1. 状態・次回イベント時刻を直接走査し、concat / filter / map による一時配列を省く。設備出力の変化検出にも、設備ごとの参照配列を再利用する。
2. 表示履歴を ID / Cell で索引化する。見つからない履歴を毎回128件走査する処理を省く。重複 ID は従来の最初の一致、Work の履歴は従来の最後の一致を維持する。

両方を組み合わせた構成が、比較した全4モデルで最速だったため採用した。すべての高速化方式を比較したという意味ではない。

表示履歴・イベント順序・Entity・搬送ルールは維持する。索引は engine の WeakMap に保持し、保存データには加えない。履歴の128件上限と削除も維持する。Reset 時に索引と出力参照を破棄する。

共通 FlowRuntime の高速処理は event-fast の update 中だけ有効にし、終了・例外時には元の処理コンテキストへ戻す。dt / event のエンジン本体は変更していない。共通実装を使う Worker / par にも適用し、script version を更新した。利用者による準備操作は不要。

## 測定

同じ初期グラフから、描画・タイミングチャートを停止して 3,000,000ms 進めた。1 update は10,000ms。ウォームアップ後、実行順を交互にし、各条件5回ずつ測定した。表は実時間の中央値。

比較基準は今回の2方式を無効にした処理経路。前回の同期メンバー事前計算は、全条件で有効。

| example | 追加処理なし | 配列削減のみ | 履歴索引のみ | 両方 | 速度向上 |
| --- | ---: | ---: | ---: | ---: | ---: |
| sample_line2 | 622.5ms | 573.7ms | 589.6ms | **563.3ms** | **10.5%** |
| sample_line1 | 279.7ms | 257.1ms | 269.0ms | **249.2ms** | **12.2%** |
| parallel_benchmark | 403.9ms | 373.7ms | 378.4ms | **351.0ms** | **15.1%** |
| carrier | 87.7ms | 82.6ms | 84.2ms | **74.5ms** | **17.7%** |

処理時間の減少率は順に9.5%、10.9%、13.1%、15.1%。上表の速度向上率とは計算式が異なる。

各モデルの全20実行で、表示履歴を含む FlowRuntime 最終状態の SHA-256 が一致した。完成数は順に402、461、6000、207。画面描画込みのアプリ全体の向上率を測ったものではない。

## 検証

- 変更した JS / 検証スクリプトの `node --check`: 成功。
- MCP `npm run check` / `npm run build`: 成功。
- Engine Test quick: 全8 example × 全5 engine × seed 1/12345 = **80/80 PASS**。completion / visible flow / node 状態遷移 / timing chart / strict final parity を比較。警告なし。
- 高速処理経路で既存 Flow シナリオ: **26/26 PASS**。
- 状態・期限・Source の境界値、コンテキストの入れ子と例外後の復帰、重複履歴 ID、128件の削除、180件の完成と途中の snapshot 復元を検証: **4群 PASS**。
- 同期表の内容・順序・編集による無効化: **27項目 PASS**。再利用・Reset・再構築も成功。
- par の通常／まとめ実行／FASTEST の状態・Entity・履歴・停止・速度切替: 成功。

## 記録

- [変更前 profile](profile-before.json) / [CPU profile](before.cpuprofile)
- [個別・組合せ Benchmark](benchmark.json)
- [回帰確認](regression.json) / [Engine Test](engine-test.json)
- [境界値・履歴の確認](hot-path-tests.json)
- [既存 Flow シナリオ](compiled-flow-scenarios.log)
- [par live regression](par-live-regression.json)

```powershell
node mcp/scripts/benchmark-engine-fast-flow.mjs --hot-paths
node mcp/scripts/test-engine-fast-flow.mjs --hot-paths
node mcp/scripts/test-engine-fast-par-live.mjs
```
