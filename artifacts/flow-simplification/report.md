# Flow 簡略化の実装・検証

## 実装

- 既存設備のFlow表示と自由配線エディタに、通常表示／詳細表示を追加。
- 通常表示では条件ノード・条件線を設定欄へまとめ、条件の要約をノード上に表示。
- 条件の行編集、AND／OR／NOT相当の組み合わせ、入れ子、追加・削除に対応。
- 自由配線の共通条件は使用先を表示し、編集を全使用先へ反映。他で使われる条件を削除しない。
- 未接続条件を通常表示に残し、不正な条件は所有ノード・設定欄に表示。
- 通常表示の処理分岐を別の段へ配置。表示位置と完全な保存グラフを分離。
- 保存形式、実行エンジン、既存動作から自由配線への切替方式は維持。

## 結果

| 検証 | 結果 |
| --- | --- |
| 変更JS・テストスクリプトの `node --check` | PASS |
| `mcp/` の `npm run check` / `npm run build` | PASS |
| `test-flow-simplification.mjs` | PASS：通常表示で11ノード→5ノード。共有・入れ子・条件編集後の分岐／待機・表示切替・Undo／Redo・JSON復元・未接続修復・実行中の編集防止・狭幅 |
| `test-flow-program.mjs` | PASS：実行順・並列・AND／OR／NOT・実ドラッグ接続・適用Undo・ポップアップ・狭幅 |
| `test-flow-view.mjs` | PASS：Sample Line 2全121設備、時間・条件・ワーク設定、ポップアップ。表示開閉で240秒の流動・状態遷移が一致 |
| `test-flow-settings.mjs` | PASS：既存詳細表示、Sequence、条件編集、Undo、JSON、狭幅 |
| `test-flow-ports.mjs` | PASS：実ドラッグ接続、表示切替・設備切替で下書き維持、実行設定不変 |
| Engine Test quick | PASS：全8 example × 全5 engine = 40件、strict final parityを含む。失敗0・警告0 |

Engine TestはMCP経由で実行し、runtimeを再読込している。quickの所定値である10,000 msをテストスクリプトで明示した。MCPアダプターが省略引数を `undefined` のキーとして渡すため、未指定のままだとプリセットの10秒ではなく既定の30秒に変わることを確認した。

## 別途確認した30秒比較の差分

30,000 ms・strict final parityでは `sample_line1` の最終ノード状態に4件の差分がある（event / event-fast / event-fast-worker / event-fast-par と dt の比較）。今回変更したFlow画面3スクリプトを読み込まない環境でも、コード・engine・scenario・messageが一致する4件を再現した。今回の表示変更とは独立しており、エンジンには変更を加えていない。

- [簡略化テストの結果](validation.json)
- [quickの結果](../engine-test/2026-09-08T16-53-47-562Z__flow-view/summary.json)
- [30秒比較・現在の画面](../engine-test/2026-09-08T16-52-31-934Z__flow-view/failures.json)
- [30秒比較・Flow画面を省略](engine-ui-omitted.json)

確認画像は `tmp/flow-compact-program.png`、`tmp/flow-compact-conditions.png`、`tmp/flow-compact-legacy.png` に保存。
