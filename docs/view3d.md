# FactSim 3D Viewer

Graph領域の **Graph / 3D** タブで表示を切り替えます。Runと下部のTimeline / Nodes / Detailsは従来どおり使えます。スマートフォンでは下部ナビにも3Dがあります。

- ドラッグ：回転、ホイール／ピンチ：ズーム、右ドラッグ：パン。
- Perspective / Top：透視投影／真上からの平行投影。Fit：全設備、Focus selected：選択設備に合わせる。
- Labels / Connections：ラベルと接続の表示切替。
- 設備をクリックするとGraph・Nodes・Details・Timelineの選択を同期します。Ctrl / Cmdで追加選択できます。

## 構成

`Simulation Core → VisualizationAdapter → plain VisualizationState → Viewer3D`

`js/visualization/VisualizationAdapter.js`だけがグラフと既存の`WorkLinkAnimator.sample()`を読みます。状態色は2Dと同じ`_getNodeStatePalette()`のaccentです。選択の正本は`App.canvas.selected_nodes`で、3D専用の選択モデルは作りません。

`js/view3d/`はScene / Camera / Node / Connection / Work / Label / Modelの責務に分かれています。CoreにBabylon依存はなく、3Dはシミュレーションを実行しません。Viewerへ過去のplain snapshotを渡す入口もあるため、Replayは別Adapterとして拡張できます。

```javascript
const snapshot = App.getVisualizationState();
// schemaVersion, time (seconds), running, fastest, selectedNodeIds,
// nodes, connections, works (id, from, to, progress, fromPosition, toPosition)
App.view3d.setView('3d');
App.visualization.selectNode(2);
App.view3d.setCamera('fit');
App.view3d.viewer.update(snapshot); // Replay等はgetState供給元も切り替える
```

座標変換は`CoordinateConverter.js`に集約しています。Graph X→world X、Graph Y→world Z、100 graph pixels→1 world unitです。ノードの2D矩形中心を設備中心とし、接続は既存ポート位置を使います。

## optional属性と互換性

3D属性のない既存データは自動的にprimitive表示します。通常は保存互換性のある`properties.view3d`に指定します。Basic Nodeではトップレベルの`view3d`も保存・読込できます。

```json
{
  "properties": {
    "view3d": { "height": 1.2, "rotation": 45, "scale": 1, "model": "robot", "kind": "equipment" }
  }
}
```

`height`はworld単位の設備高さ、`rotation`はworld Y軸周りの度数、`scale`は全体倍率です。`kind`はequipment / source / sink / buffer / carrier / conveyor。role・名称から推定できない場合にも形状を指定できます。設備／Source／SinkはBox、Bufferは低いBox、Carrier／Conveyorは薄いBox、Workは小さいBoxです。

ModelRegistry / ModelLoaderを通じてprimitiveをGLB / glTFに拡張できます。未登録モデルや読込失敗ではprimitiveを維持します。

```javascript
FactSim3D.models.register('robot', 'assets/3d/robot.glb');
// 将来のFile API UIでも、サーバーへの保存は不要
FactSim3D.models.register('local-equipment', selectedGlbFile);
```

モデルは作者がworld単位・原点・向きを合わせたものを想定します。モデル選択UI、自動サイズ正規化、保存ファイルへのGLB同梱はVer.1の対象外です。モデルにも選択と状態色を示すprimitive envelopeを残します。

## 負荷とLifecycle

- Babylon.js 9.29.0を`js/vendor/babylon/`に固定配置（Apache-2.0）。3D初回表示時だけ読み込み、glTF loaderはモデルを使う時だけ読みます。外部CDNやサーバー処理は不要です。
- Snapshotは最大20回／秒、描画は独立したBabylon loop。Workは前後snapshot間を補間し、シミュレーション時間を進めません。同一形状のWorkにはinstancesを使います。
- Graph表示、非表示のブラウザタブ、スマートフォンの他パネルでは3D render loopを停止。Graph表示時はsnapshot timerもありません。
- FASTEST実行中はsnapshotとrenderを停止。120ms間隔の軽い状態確認で再開を検知し、停止後に最終状態を反映します。
- Sceneは切替時に再利用。ResizeObserverで実際のcanvasサイズに追従し、dispose時にlistener / observer / timer / mesh / texture / material / engineを解放します。
- WebGLまたはリソース読込の失敗は3Dパネルに閉じ込め、RetryまたはGraphへの復帰ができます。

WebGPUは`Viewer3D`の`engineFactory`拡張点、Layout Imageは`SceneManager.setGroundTexture()`拡張点を用意しています。Ver.1はWebGLです。Timeline Replay、AGV専用形状、Layout texture UI、5000 Work規模のthin instancesは今後の拡張です。

## 検証

`mcp/`で`npm run check`と`npm run build`後、`node scripts/test-view3d.mjs`を実行します。静的HTTP配信の実ブラウザで表示・Work移動・選択・タブ切替・FASTEST・サイズ変更・旧データ・optional属性の保存互換・エラー復帰を確認し、結果は`artifacts/view3d/`、確認画像は`tmp/`に保存します。
