# event-fast の追加高速化: 数量を展開しない Source 選択

検証日: 2026-09-29。前回までの同期メンバー事前計算、状態/期限走査、履歴索引、Flow 接続/経路索引、空き確認の配列削減を有効にした状態から追加した。

## 選定

最新の実装で30,000,000ms進める CPU profile を取得した。実時間は約5.17秒。Flow execute、kernel、runtime 取得、同期確認、状態走査などに負荷が分散していた。

以下を実装して、同じ初期状態から個別・組合せで比較した。

1. 状態と次回イベント期限の走査統合、未到着の同期メンバーの早期確認。主なモデルで効果が小さく、組合せで遅くなるケースがあったため不採用。
2. 空または期限待ちの Cell/Signal の遷移ループを省く方法。sample_line2 / sample_line1 / carrier では追加判定の負荷が上回ったため不採用。
3. Source の数量を展開せず、現在の生成位置から直接 Entry を選ぶ方法。採用。
4. Source の累積数量を事前に索引化する方法。小さな Entry リストでは準備・検証の負荷が増え、数量10万・Entry 1件では直接選択との速度差もなかったため不採用。

不採用の実験コードはアプリから除いた。比較した候補のうち、大きい数量で最も効果があり、既存モデルにも適用できる直接選択方式を残した。あらゆる高速化方法の中で最速と証明したという意味ではない。

## 実装

従来は Source の実行ごとに、`entries.flatMap(e => Array(count).fill(e))` で数量分の配列を作っていた。数量10万なら10万個の参照を展開し、既に Work が搬送中で生成できない呼出しでもこの配列を作っていた。

新方式は Entry の数量を合計し、生成済み数を周期内の位置に変換して、対応する Entry を数量の範囲から選ぶ。配列を展開しない。Entry 数を E、合計数量を Q とすると、この選択処理は従来の O(Q) の展開と一時メモリから、O(E) の計算・O(1) の追加メモリになる。Entity の生成そのものや実行中の Work のメモリは別。

数量・Entry の順序・Type・子内容・repeat・interval は実行時に読む。索引の準備やキャッシュを追加しない。無効な数量や互換性の必要な状態は従来の選択処理へ戻す。Source の Work 生成位置、搬送中の active、次の生成時刻、子 Entity の生成と階層、通常の Flow 遷移は維持する。

高速処理は event-fast の update 中だけ有効。dt / event のエンジン本体は変更していない。共通実装を使う event-fast-worker / event-fast-par にも適用した。script と worker のバージョンを更新済み。手動コンパイルは不要。

## 最終測定

回帰テストを完了してから単独で実施した。描画とタイミングチャートを停止し、同じ初期グラフから、ウォームアップ後に実行順を交互にして各条件5回測定した。表は実時間の中央値。今回の処理だけを無効にした経路と比較し、前回までの高速化は両条件で有効。

通常の4モデルは3,000,000ms、1 update 10,000ms。大数量の専用ケースは Source → Process 0.1秒 / Recovery 0秒 → Sink の3ノード、Source 数量100,000・repeat false・interval 0秒で、1,000msを100ms刻みで進めた。専用ケースは100,000件すべてを完成させる測定ではなく、大きな数量設定を持つ Source の実行負荷を測る。

| モデル | 変更前 | 直接選択 | 速度向上 |
| --- | ---: | ---: | ---: |
| sample_line2 | 538.8ms | 505.0ms | 6.7% |
| sample_line1 | 234.9ms | 227.5ms | 3.3% |
| parallel_benchmark | 341.4ms | 326.6ms | 4.5% |
| carrier | 67.0ms | 63.6ms | 5.3% |
| Source 数量100,000の専用ケース | 50.3ms | 0.5ms | **約100倍** |

通常4モデルの処理時間の減少率は6.3%、3.2%、4.3%、5.1%。速度向上率とは計算式が異なる。専用ケースの高速側は0.5msと短いため、倍率は概数として扱う。

既存モデルの Source は数量1の Entry が中心で、効果は小さい。候補段階でも小幅な差が変動したため、通常モデルの数%の向上をあらゆる実行条件で保証しない。数量10万のケースでの約100倍を、一般的なモデル全体の向上率として扱わない。描画込みのアプリ全体の速度も別。

各モデルの全10実行で、表示履歴を含む FlowRuntime 最終状態の SHA-256 が一致した。最終時刻と完成数も一致。

## 検証

- 変更した JS / 検証スクリプトの `node --check`: 成功。
- MCP `npm run check` / `npm run build`: 成功。
- `git diff --check`: 成功。
- Engine Test quick: 全8 example × 全5 engine × seed 1/12345 = **80/80 PASS**。completion / visible work-flow / node 状態遷移 / timing chart / strict final parity を比較。警告なし。
- 高速処理経路で既存 Flow シナリオ: **26/26 PASS**。
- 新規の Source テスト **6群 PASS**: 数量ごとの順序、repeat の折り返しと非 repeat の終了、子階層、数量・Entry・順序・Type/子内容の編集、搬送の待ちと途中復元、数量10万での結果一致、無効数量と従来の例外、engine update 中の直接数量変更と Reset。
- 前回の状態/期限・履歴テスト **4群 PASS**、配線・動的設定・復元・Reset **4群 PASS**、同期表の内容/順序/無効化 **27項目 PASS**。
- par の通常／まとめ実行／FASTEST の状態・Entity・履歴・停止・速度切替: 成功。FASTESTから1倍への復帰も実測と表示を確認。

## 記録と再実行

- [改善前 profile](profile-before.json) / [CPU profile](before.cpuprofile)
- [最終 Benchmark](benchmark.json)
- [回帰確認](regression.json) / [Engine Test](engine-test.json)
- [Source の確認](scheduling-tests.json)
- [既存 Flow シナリオ](compiled-flow-scenarios.log)
- [par live regression](par-live-regression.json)
- 不採用候補: [走査統合・同期確認](candidate-fused-sync-benchmark.json)、[遷移ループ・Source 選択](candidate-transitions-source-benchmark.json)、[Source の累積索引](candidate-prefix-benchmark.json)

```powershell
node mcp/scripts/benchmark-engine-fast-flow.mjs --scheduling
node mcp/scripts/test-engine-fast-flow.mjs --scheduling
node mcp/scripts/test-engine-fast-par-live.mjs
```
