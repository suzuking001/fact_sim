# 任意階層の Entity

FACT SIM では、すべての Entity が同じ親子モデルを使用します。Type名に Pallet、Carrier、Container、Work などを使うことはできますが、エンジンはその名前を特別扱いしません。

## 階層ルール

- どの Type もcapacityを1以上にすれば親になれます。
- `allowedContentTypeIds` が空なら任意のTypeを子にできます。
- 許可Typeを指定した場合は、そのTypeだけを直接の子にできます。
- 同一Type同士も親子にできます。
- 自己参照と循環構造は禁止されます。
- root Entity が移動すると、すべての子孫も一緒に移動します。

## 汎用操作

- Attach: 一方のEntityを、capacityと許可Typeを満たすもう一方のEntityへ接続します。
- Detach: 選択した子Entityを親から外し、独立したrootにします。
- Transport Route: role portで選ばれたEntityを時間付きで移動します。
- Store: root Entityを保持し、Flow Ruleに従ってrootまたは子を受け渡します。
- Transfer: Entity間のattach、detach、移し替えを行います。

現在の階層は選択InspectorのContents treeで確認できます。
