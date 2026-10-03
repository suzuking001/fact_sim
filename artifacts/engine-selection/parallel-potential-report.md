# event-fast-par 高速化余地の確認

確認日: 2026-09-28。アプリのコードは変更していない。既存の統合MCPによる比較結果に加え、MCPが引数として公開していないWorker数・時間幅・snapshot頻度を、同じFactSimRuntimeから一時的に指定して測定した。

## 結論

将来の高速化を主軸に3エンジンへ絞るなら、dt / event (heap) / event-fast-parを推奨する。parの内部で共有するevent-fastの計算処理や単一Worker処理は必要なため、公開するモードと内部実装を区別して整理する。

夜間最適化ジョブの主対象はparである。ただし、最適化履歴のlatest-statusファイルは存在せず、他エンジンより改善量が多かったという履歴上の断定はできない。parは同じevent-fast計算処理を複数Workerで実行する構成なので、共有部分の高速化もparへ反映される。

## 同じ計算結果を保った時間幅の変更

parallel_benchmarkをシミュレーション時刻3,000,000msまで進めた。同じ2Workerを使い、事前に両設定でウォームアップし、16ms / 1000msの実行順を交互にして各5回測定した。Worker起動時間は含めず、実行要求から最終snapshot取得・統合までを含む。

| 時間幅 | 実時間の中央値 | 合計update呼出数 | ノード実行数 | 完成数 |
| --- | ---: | ---: | ---: | ---: |
| 16ms | 803.7ms | 375,000 | 144,016 | 6,000 |
| 1000ms | 461.5ms | 6,000 | 144,016 | 6,000 |

速度は約1.74倍（約74%向上）、処理時間は約42.6%減少。全10実行で、最終FlowRuntime状態の配列順を正規化したSHA-256が一致した。計算の時間幅をまとめてupdate自体の呼出回数を減らす効果であり、dtの刻み幅は変更していない。

これは当該サンプル・当該時刻での一致確認である。全example、乱数seed、タイミングチャート、途中状態の一致まで保証する結果ではない。単一Worker側にも時間幅をまとめる効果があり、この改善は並列化だけに固有ではない。

## 状態取得の費用

sample_line2の145ノードを、2Worker、partitionSubsteps=1で20,000msまで進め、各3回測定した。実画面の描画・syncLiveGraphは測定対象に含めず、Worker実行とsnapshot取得・統合にかかる時間を比較した。

| 設定 | 実時間の中央値 |
| --- | ---: |
| 100msごとに計算し、毎回snapshotを取得 | 2,370.2ms |
| 100msごとに計算し、10回に1回snapshotを取得 | 270.9ms |
| 1000msごとに計算し、毎回snapshotを取得 | 245.6ms |

snapshotを10回に1回へ減らすだけで、この処理経路は約8.75倍速くなった。最終時刻、ノード状態、Entity数は一致した。ただしこの20秒の区間では完成数は0であり、生産量の一致を検証する区間としては不十分。途中状態・リンク状態・タイミングチャート・実際の画面全体の速度は未検証で、アプリ全体が8.75倍になるという意味ではない。

本番へ反映する場合は、全snapshotを単純に間引くより、変更された状態の差分を送信し、必要なイベント履歴を別途保持する設計を優先する。

## 並列化の現状と制限

- 検証環境のnavigator.hardwareConcurrencyは32。headlessホストではWorker数の未指定値が2へ変換され、partitionerにあるCPU数に応じた自動選択（上限4）が利用されない。
- parallel_benchmarkは32ノード・8つの独立ライン。2 / 4 / 8Workerを試したが、各3回の測定にばらつきがあり、Worker数の増加だけで安定して速くなるとは言えない。
- sample_line1は63ノードだが1区画のみ。parの名前で動いていても複数Workerでの計算にはならない。
- sample_line2は128ノードと17ノードの2区画。Worker数を4や8に指定しても2区画のままで、処理量の偏りがある。
- 現在のpartitionerは接続されていない成分を単位に分割する。接続グラフを分割するassignConnectedGraphは定義されているが呼ばれない。2026-09-15の変更で、この呼出経路が外されている。
- 通常表示のparは毎100msの計算ごとにsnapshotを要求する。Worker間の実行要求、snapshotの生成・送信・JSONコピー・統合が、高速実行時の制約になる。

優先候補は、(1)独立区画の計算のまとめ実行、(2)差分による画面同期、(3)単一区画なら直接compiled実行へ切り替える判断、(4)計算負荷に応じたWorker数・区画の調整。接続グラフを分割する再実装は、Flowや同期グループの因果関係とdt parityを守る必要があり、より大きな変更になる。

## 現行コードの正しさ確認

Engine Test quick、全5エンジン・全8example、seed=12345、strictFinalParity=trueを実行した。38/40ケースが通過し、parの2ケースでリンク数変化が検出された。

- carrier: 20本 → 13本
- sample_line1: 64本 → 52本

高速化を実装・採用する前に、この失敗を修正し、completion、visible flow、状態遷移、タイミングチャート、strict final parityを確認する必要がある。

## 根拠と記録

- [最初の5エンジン比較](comparison.json)
- [区画計画と各設定3回の測定](parallel-potential.json)
- [同じWorkerでの対比較・snapshot頻度の測定](parallel-controlled.json)
- [Engine Test概要](../engine-test/2026-09-28T14-14-49-020Z__parallel-potential/summary.json)
- [Engine Test失敗箇所](../engine-test/2026-09-28T14-14-49-020Z__parallel-potential/failures.json)
- [夜間最適化の設定](../../automation/jobs/event-fast-par.optimize.json)
- [parホスト](../../js/app/engine-fast-par-host.js)
- [par分割処理](../../js/app/engine-fast-par-partitioner.js)

一時検証スクリプトはtmp/engine-par-potential.mjsとtmp/engine-par-controlled.mjsに保存した。両スクリプトのnode --checkは通過した。
