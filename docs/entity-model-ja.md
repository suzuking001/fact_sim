# Entity階層とBasic Node

FACT SIMのモデル編集ではEntity Typeだけを定義し、Runtime InstanceはLoadまたはReset時に自動生成する。

## 保存データ

- グラフ直下の `__factSimEntityModel` がモデル内Typeカタログの唯一の定義元。
- Nodeの `properties.initialContents` にはType、数量、loadと再帰childrenだけを保存する。
- Runtime Instance、Current Contents、採番器、予約状態は保存しない。
- 新規保存では実行Nodeを `factory/basic` として保存し、`presetId` が通常UIを決める。
- 旧Nodeは読込可能。保存前のmigration previewが未知Nodeや損失を検出した場合は保存を中止する。

## Runtime

Instanceは `instanceId / typeId / parentId / childIds / locationNodeId / attributes` を持つ。場所を持つのはrootだけで、子の場所は親をたどって導出する。探索はrootから幅優先、同階層では到着順となる。

ResetはRuntime Storeを破棄し、Node ID順、Initial行順、深さ優先の固定順で再生成する。Stopからの再Startでは再生成しない。

## Flow

Input RuleはTargetとAccept when、Output RuleはTarget、Release when、Toを持つ。Ruleは上から評価し、最初に成立したRuleだけを使う。子孫をInput対象にした場合も到着root全体を受け入れ、Outputで子を選択したときだけdetachする。

Custom Conditionは任意JavaScriptではなく、`and / or / not / compare` からなる制約付きJSON ASTを使う。旧scriptはlegacy compatibility actionとしてのみ残す。

## MCP

`graph` は `entity_types / node_contents / flow_rules / validate_entity_model / migration_preview` を提供する。`edit_graph` はType CRUD、Initial Contents、Flow Rule、Preset、Basic移行を扱い、Current ContentsのInstance treeは明示要求時だけ返す。
