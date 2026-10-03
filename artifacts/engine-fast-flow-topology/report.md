# event-fast の追加高速化: Flow の接続索引と搬送先の空き確認

検証日: 2026-09-29。前回の同期メンバー事前計算、状態・期限走査、表示履歴索引、出力参照の再利用を有効にした状態から、さらに改善した。

## 選定と実装

最新の実装で30,000,000ms進める CPU profile を取得した。残る負荷は、搬送先の空き確認での `activeCells` による配列連結、および Flow ノード・リンク・Join の接続を繰り返し検索する処理だった。改善前の profile では `activeCells` の自己時間が約408ms、`spec` とその検索コールバックが合計約353ms、`assemblyTargets` が約177ms、`outgoing` の検索コールバックが約153msだった。

次の2方式を、個別と組み合わせで比較した。

1. **接続索引と静的経路の再利用**: Flow ノード ID・種類・始点・出力ポートの索引を作る。Join の Work 入力、Fork の Work/Signal 接続、Sensor を通過する経路、次の Work Join までの経路も必要になった時点で計算して再利用する。同じ Flow 内で続く検索には直前の索引を再利用し、WeakMap の取得回数も減らす。
2. **搬送先の空き確認で一時配列を作らない**: Work と Signal を直接走査する。Join の入力ごとの空き、Palletizing の親・子と容量制限、移動中の Cell の除外は従来と同じ判定を行う。

比較した2方式では、両方を組み合わせた構成が全4モデルで最速だったため採用した。あらゆる高速化方式の中で最速と証明したという意味ではない。

索引は engine の WeakMap に保持し、保存データには追加しない。最初の update で自動生成する。各 update の開始時に Flow・ノード/リンク配列・件数・FlowModel のキャッシュ無効化を確認し、配線編集や Flow の置換後に作り直す。Reset でも破棄する。通常の FlowModel 編集操作はこの無効化を行う。コードで同じ Flow の配線を直接変更する場合も、既存の `FlowModel.invalidateFlowCaches` を呼ぶ。

索引化するのは静的な接続関係。Cell/Signal の占有、Entity の種類と内容、Router の種類優先・round-robin の選択、処理時間・Recovery・搬送先の受入可否は実行時に読み続ける。動的な判定結果はキャッシュしない。ノード・リンク・ポートの順序と、検索の最初の一致を維持する。

高速処理は event-fast の update 中に有効になる。dt / event のエンジン本体は変更していない。共通実装を使う event-fast-worker / event-fast-par にも適用し、script と worker のバージョンを更新した。利用者によるコンパイル操作は不要。

## 測定

同じ初期グラフから描画・タイミングチャートを停止して3,000,000ms進めた。1 update は10,000ms。ウォームアップ後、条件の実行順を交互にし、各条件5回測定した。最終計測は回帰テストを完了してから実施し、テストとの同時実行を避けた。表は実時間の中央値。今回の索引生成を含み、グラフ読込と engine の生成は含まない。

比較基準は今回の2方式を無効にした経路。前回までの高速化は全条件で有効。

| example | 前回までの処理 | 空き確認のみ | 接続索引のみ | 両方 | 速度向上 |
| --- | ---: | ---: | ---: | ---: | ---: |
| sample_line2 | 623.8ms | 587.5ms | 563.5ms | **493.7ms** | **26.4%** |
| sample_line1 | 257.3ms | 255.6ms | 244.7ms | **234.0ms** | **10.0%** |
| parallel_benchmark | 359.9ms | 350.5ms | 327.4ms | **318.5ms** | **13.0%** |
| carrier | 79.5ms | 75.4ms | 68.6ms | **68.4ms** | **16.2%** |

処理時間の減少率は順に20.9%、9.1%、11.5%、14.0%。速度向上率は「変更前の時間 / 変更後の時間 - 1」で求めた。carrier の接続索引のみと両方の差は0.2msと小さい。

各モデルの全20実行で、表示履歴を含む FlowRuntime 最終状態の SHA-256 が一致した。完成数は順に402、461、6000、207。アプリ全体の描画を含む向上率ではなく、シミュレーション処理の測定。モデル構造により効果は異なる。

## 検証

- 変更した JS / 検証スクリプトの `node --check`: 成功。
- MCP `npm run check` / `npm run build`: 成功。
- `git diff --check`: 成功。
- Engine Test quick: 全8 example × 全5 engine × seed 1/12345 = **80/80 PASS**。completion / visible work-flow / node 状態遷移 / timing chart / strict final parity を比較。警告なし。
- 高速処理経路で既存 Flow シナリオ: **26/26 PASS**。Recovery、Join/Fork、Palletizing/DePalletizing、Router、FIFO、同期グループ、Sensor、編集、復元などを検証。
- 新規テスト **4群 PASS**: 同じ配列・件数での配線変更、配列置換、Sensor 追加、Flow commit、途中復元を含む全履歴の一致。索引生成後の Router の種類・dispatch・処理時間変更。Cell/Signal 配列を置換した空き確認。engine の索引再利用と Reset・再構築。
- 前回の状態・期限の境界値、コンテキスト復帰、重複履歴 ID、128件の削除、180件の完成と途中復元: **4群 PASS**。
- 同期表の内容・順序・編集による無効化: **27項目 PASS**。再利用・Reset・再構築も成功。
- par の通常／まとめ実行／FASTEST の状態・Entity・履歴・停止・速度切替: 成功。FASTEST から1倍への復帰も実測と表示を確認。

## 記録

- [改善前 profile](profile-before.json) / [CPU profile](before.cpuprofile)
- [候補段階の profile](profile-candidate.json) / [CPU profile](candidate.cpuprofile)
- [最終の個別・組合せ Benchmark](benchmark.json)
- [回帰確認](regression.json) / [Engine Test](engine-test.json)
- [配線・動的設定・占有・復元・Reset の確認](topology-tests.json)
- [境界値・履歴の確認](hot-path-tests.json)
- [既存 Flow シナリオ](compiled-flow-scenarios.log)
- [par live regression](par-live-regression.json)

```powershell
node mcp/scripts/benchmark-engine-fast-flow.mjs --topology
node mcp/scripts/test-engine-fast-flow.mjs --topology
node mcp/scripts/test-engine-fast-par-live.mjs
```
