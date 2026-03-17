# FACT SIM クイックリファレンス

`fact_sim` を初めて触る人向けの、日本語の簡易ガイドです。  
「まず動かす」「画面の意味を知る」「結果を見る」までを短時間で把握できるようにまとめています。

## 1. これは何のアプリか

`fact_sim` は、ブラウザ上で動くノードベースの離散事象シミュレータです。

向いている対象:
- 生産ライン
- AGV / carrier 搬送
- 物流や倉庫内フロー
- 人や物が工程を通過する一般的なワークフロー

できること:
- ノードをつないで工程を作る
- `Start` でシミュレーションを回す
- `Timeline` で状態遷移を見る
- `Details` や `Sink` で throughput / cycle time を確認する
- `Engine Test` や `Speed Test` でエンジン差分を検証する

## 2. 最初の 3 分

1. アプリを開く  
   `http://127.0.0.1:8123/` または GitHub Pages のデモを使います。
2. `Example` で `Sample Line2` などを選ぶ  
   初心者は `Sample Line2` か `Sample Line1` が見やすいです。
3. `Start` を押す  
   まずは何も編集せずに流れを見ます。
4. 下部の `Timeline` を開く  
   ノードが `IDLE / PROCESS / WAIT / DOWN` のどれにいるかを見ます。
5. ノードをクリックして `Details` を見る  
   そのノードの状態や設定を確認できます。

## 3. 画面の見方

### 左側サイドバー

主な役割:
- 例題の選択
- シミュレーションの開始・停止・リセット
- エンジン切替
- ノード追加や設定変更
- 診断機能の起動

よく使う項目:
- `Start` / `Stop` / `Reset`
- `Example`
- `Engine`
- `Speed Test`
- `Engine Test`

### 中央のノードグラフ

工程や搬送経路をノードとして配置する領域です。

基本操作:
- ドラッグで移動
- ホイールでズーム
- ノードクリックで選択
- 接続線で work や carrier の流れを表現

### 下部ドック

3 つのタブをよく使います。

- `Timeline`
  各ノードの状態遷移を時系列で表示
- `Nodes`
  ノード一覧、テーブル確認
- `Details`
  選択中ノードの詳細設定や情報

## 4. 最低限覚える用語

- `Source`
  ワークを発生させる入口
- `Equipment`
  加工・処理を行う装置
- `Branch`
  条件に応じて経路を分岐
- `Merge`
  複数入力を同期して合流
- `Join`
  複数入力を順次合流
- `Sink`
  ワークの終点。throughput や cycle time を確認する場所
- `Carrier Route`
  carrier の移動経路
- `Station`
  work と carrier / pallet の受け渡しを行うノード

## 5. Equipment の基本的な見方

`Equipment` は主に次の状態を取ります。

- `IDLE`
  入力待ち
- `PROCESS`
  処理中
- `WAIT`
  処理は終わったが下流が詰まっていて出せない
- `DOWN`
  排出後のダウン・復帰待ち

初心者向けの見方:
- `WAIT` が長い
  下流が詰まっている可能性が高い
- `IDLE` が長い
  上流から供給されていない可能性がある
- `PROCESS` が長い
  その工程の処理時間が支配的かもしれない

## 6. エンジンの選び方

主要エンジン:
- `dt`
  わかりやすさ重視。最初の確認向け
- `event (heap)`
  標準的なイベント駆動
- `event-fast (compiled)`
  高速化系の基本形

環境や graph により利用されることがあるもの:
- `event-fast-worker`
  Web Worker を使う高速化系
- `event-fast-par`
  並列実行を使う高速化系

迷ったときの目安:
- 挙動確認をしたい: `dt`
- 通常利用: `event (heap)`
- 高速化を試したい: `event-fast*`

## 7. よく使う操作

### 例題を読み込む

- `Example` から選ぶ
- 初期状態は `Sample Line2` のことが多い

### リセットする

- `Reset` を押す
- 現在の既定 example を開き直した直後に近い状態へ戻ります

### ノードを追加する

- サイドバーの `Add Node`
- 追加後に work ポートや carrier ポートを接続します

### stop group を作る

- `Add Stop Group`
- ダウンタイムや停止条件をまとめて扱えます

### 例題を上書き保存する

`Chrome / Edge + localhost` なら使えます。

手順:
1. `Link Sample Folder`
2. `sample` フォルダへの権限を与える
3. `Overwrite Example`

保存されるもの:
- `sample/<example>.json`
- `sample/<example>.js`

## 8. 結果の見方

### Timeline

いちばん重要なビューです。

見るポイント:
- どのノードが長く `WAIT` しているか
- どのノードが連続して `PROCESS` しているか
- どこで `DOWN` が throughput を落としているか

### Sink

`Sink` ノードでは、主に次を見ます。

- 到達数
- throughput
- cycle time

工程全体の出口指標を見るなら、まず `Sink` を確認します。

### Details

ノードを選択したときに、次を確認します。

- node type
- state
- 処理時間
- downTime
- route 設定
- スクリプトや条件分岐

## 9. 診断機能

### Speed Test

エンジンごとの速度比較を行います。

用途:
- `dt` と `event` の速さ比較
- `event-fast*` の改善率確認

### Engine Test

`dt` を基準に、全エンジンの挙動差を比較します。

主な確認項目:
- completion parity
- visible work-flow parity
- node 状態遷移 parity
- timing chart parity
- strict final parity

suite:
- `quick`
- `standard`
- `soak`

## 10. よくあるつまずき

### シミュレーションが進まない

確認すること:
- `Start` を押しているか
- `Source` から work が出ているか
- work ポート接続が正しいか
- `WAIT` が長いノードがないか

### 例題を保存できない

確認すること:
- `file://` 直開きではないか
- `http://127.0.0.1:8123/` で開いているか
- Chrome / Edge か
- `Link Sample Folder` を済ませたか

### worker 系エンジンが期待どおり速くない

可能性:
- graph が unsafe で fallback している
- 小さい graph なので並列化の効果が小さい
- parity 優先で `event-fast` や `event` 相当に落ちている

### MCP の結果と UI の結果が違う

可能性:
- 古い runtime を掴んでいる
- script 更新後に再読み込みしていない

対処:
- ブラウザを再読み込み
- MCP runtime を再起動

## 11. ローカル起動

最短:

```bat
scripts/start_fact_sim_server.bat
```

手動:

```bash
python -m http.server 8123
```

開く URL:

```text
http://127.0.0.1:8123/
```

## 12. 開発者向けの次の入口

より詳しく知りたい場合:
- 研究ノート: `docs/research.md`
- 研究ノート日本語版: `docs/research-ja.md`
- MCP 利用: `docs/ai-mcp.md`
- 夜間最適化: `docs/overnight-auto-optimize-ja.md`

## 13. 迷ったときのおすすめ

最初はこれだけで十分です。

1. `Sample Line2` を開く
2. `dt` で `Start`
3. `Timeline` を見る
4. `Sink` の throughput を見る
5. 気になるノードをクリックして `Details` を見る

この流れで、ほとんどの初回学習は進められます。
