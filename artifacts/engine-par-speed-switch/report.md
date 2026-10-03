# event-fast-par の減速不具合修正

## 再現

`sample_line2` を 1024x で動かしてから 1x に戻すと、高速時に蓄積した未実行時間を処理し続けていた。減速後の実測は約 223x、表示は 220.5x だった。測定値は端末性能と未実行時間の量によって変わる。

FASTEST から戻る際にも、共通時計が FASTEST 中の経過時間を次の通常フレームに加算する問題があった。倍率の計測履歴にも変更前のサンプルが残っていた。

## 修正

- 速度を下げると、parallel engine の未実行キューと端数を解放する。実行中のバッチは完了させ、状態と履歴を維持する。
- 速度・モード変更時に実時間時計と倍率の計測履歴をリセットする。
- 変更前に開始したバッチが完了した場合、その時点から倍率を測り直す。
- FASTEST の各フレームでも実時間時計を更新する。
- core と parallel host の script version を更新する。

dt・event のエンジン本体には変更を加えていない。

## 検証

通常の実行ループで測定した減速後の結果:

| 操作 | 実測 | 表示 |
| --- | ---: | ---: |
| 1024x → 1x | 0.990x | 1.00x |
| FASTEST → 1x | 0.989x | 1.00x |

Worker の処理に 50ms の遅延を加え、未処理キューが確実に存在する条件でも確認した。1024x → 1x は 0.999x、FASTEST → 1x は 0.997x、128x → 0.25x は 0.249x。各操作でキューは即座に 0 になり、再加速と再減速にも成功した。

共通時計の独立テストでは、FASTEST で 500ms 動かした後の通常フレームの最大時間は 16.8ms。FASTEST の経過時間は加算されなかった。

- JS 構文チェック: 成功
- MCP `npm run check` / `npm run build`: 成功
- Live regression: 状態・Entity・履歴・停止・速度切替の全項目に成功
- Engine Test quick: 8 example × 5 engine × 2 seed = 80/80 PASS、警告なし。strict final parity を有効化。

元データ: [修正前](before.json)、[修正後](after.json)、[Engine Test](engine-test.json)、[Live regression](../engine-par-live-fix/live-regression.json)。
