# 任意階層の搬送エンティティ

`fact_sim` では、ワーク、パレット、キャリア、コンテナ、船を共通の搬送エンティティとして扱えます。
親エンティティが移動すると、その中にあるすべての子孫エンティティも一緒に移動します。

## Entity Source

`Entity Source` は、初期状態の搬送エンティティを1個生成します。

主な設定:

- `Root Kind`: `pallet`、`carrier`、`container`、`ship`
- `Root ID`: ルートエンティティのID
- `Child Capacity`: 直下に保持できる最大数
- `Accepted Kinds`: 受け入れる種類をカンマ区切りで指定
- `Initial Hierarchy Paths`: 初期の入れ子構造

階層は1行1パスで記述します。`[数字]`は子要素の容量です。

```text
container:C-1[20]/pallet:P-1[6]/work:W-1
container:C-1[20]/pallet:P-1[6]/work:W-2
container:C-2[20]/pallet:P-2[6]/work:W-3
```

ルートを`ship`に設定し、上記を`Initial Hierarchy Paths`へ入力すると、船→コンテナ→パレット→ワークの階層になります。

## Transfer Station

`Transfer Station` は任意のエンティティを積載、荷降ろし、載せ替えします。

入力:

- `sourceIn`: 荷降ろし元
- `targetIn`: 積載先
- `itemIn`: 単体で搬入されるエンティティ

出力:

- `sourceOut`: 処理後の荷降ろし元
- `targetOut`: 処理後の積載先
- `itemOut`: 荷降ろしされたエンティティ

プリセット:

- Work → Pallet
- Work → Carrier
- Pallet → AGV
- Pallet → Container
- Container → Ship
- Unload one / all
- Transfer one

`Transfer`では`sourceIn`と`targetIn`の両方を接続します。対象エンティティは、IDを維持したまま子孫ごと移動します。

## Cargo Tree

エンティティを保持しているノードを選択して`Details`を開くと、`Cargo Tree`に現在の階層が表示されます。
シミュレーション停止中は子エンティティを別の親へドラッグして移し替えられます。容量超過や循環構造になる移動は拒否されます。

## 互換性

既存の次の構造は自動的に共通エンティティへ変換されます。

- `AGV.cargo`
- `AGV.pallets`
- `pallet.works`

既存の`Work`スクリプト、Station、Carrier Route、および保存済みグラフは引き続き利用できます。
