# Entity Type と Basic Node

FACT SIM の移動物はすべて共通の Entity として扱います。`work`、`container`、`carrier` のような固定カテゴリはありません。モデル編集では Entity Type だけを定義し、Flow Rule で `Any Entity` または具体的な Type を選択します。

## 保存データ

- グラフ直下の `__factSimEntityModel` が schema v2 の Type カタログです。
- Type は `typeId / name / subtype / tags / capacity / allowedContentTypeIds / defaultAttributes / appearance` を持ちます。
- `appearance.shape` は `circle / rounded-square / square / triangle / diamond / hexagon`、`appearance.colorTheme` は `auto / blue / orange / green / purple / red / cyan / yellow / gray` から選択します。旧グラフは `circle + auto` として読み込まれます。
- `capacity = 0` の Type は子を持てません。1以上は直接の子の最大数です。
- `allowedContentTypeIds` が空ならすべての Type を子として許可します。値がある場合だけ許可リストとして働きます。
- Node の `properties.initialContents` には Type、数量、load、再帰的な children だけを保存します。
- Runtime Instance や Current Contents は保存しません。Load または Reset 時に再生成します。

## Runtime

Instance は `instanceId / typeId / parentId / childIds / locationNodeId / attributes` を持ちます。すべての Type が親・子のどちらにもなれます。同一 Type の親子も許可されますが、自己参照、循環、capacity 超過、明示された許可Type違反は拒否されます。

場所を直接持つのはrootだけです。子の場所は親をたどって導出します。親が移動すると、その子孫も同時に移動します。

## Flow

Flow target は次の4種類です。

- `any`: 任意の Entity
- `type`: 指定した `typeId` の Entity
- `otherwise`: 先行ルールに一致しなかった Entity
- `sequence`: Source が順番に生成する Entity Type

Input Rule は Target と Accept when、Output Rule は Target、Release when、出力先を持ちます。固定カテゴリによる暗黙の判定は行いません。Attach、Detach、Transport、Store の役割は接続ポートと Flow Rule で決まります。

## 互換性

schema v1 の `category`、category target、旧port kind、旧専用ノードは読込時にschema v2へ変換されます。再保存されるデータには旧カテゴリを出力しません。
