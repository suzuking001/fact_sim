// Source node (simple: downstream READY -> supply immediately)
/*
 * SourceNode（供給ノード）
 * - 下流が IDLE/READY のときだけ、即座に1件供給して ID を +1 する。
 * - インターバルや pending バッファは使用しない、最小仕様。
 */

class SourceNode extends LiteGraph.LGraphNode{                 // Source ノードの定義（ワーク供給専用）
  constructor(){
    super();                                                   // 親クラス(LiteGraph.LGraphNode)の初期化
    this.title = 'Source';                                     // ノードタイトル
    this.size = [240,180];                                     // 表示サイズ [幅, 高さ]
    this.addOutput('workOut', 0);                              // 出力0: ワークを流すポート
    // Fixed color: orange (Source has no state machine)
    this.color = '#f39c12';   // border (orange)
    this.bgcolor = '#fff6e6'; // fill   (light orange)
    this.properties = {                                        // ノード設定（プロパティ）
      sequence: 'A,B',                                         // 供給するタイプの並び（カンマ/改行区切り）
    };
    this._seq = [];                                            // 解析済み sequence の配列（{type}）
    this._cursor = 0;                                          // 次に供給する type のインデックス
    this._readyPrev = false;                                   // 前回 onExecute 時の下流 READY 状態（現仕様では未使用）
    this._counter = 0;
    this._parseSeq();                                          // 初期の sequence を解析
  }
  _parseSeq(){
    this._seq = [];                                            // 配列を初期化
    this._cursor = 0;                                          // 先頭から供給を開始
    // sequence 文字列をカンマ/改行で分割し、空白を除去して {type} として格納
    this.properties.sequence.split(/[\,\n]+/).forEach(t=>{ t=t.trim(); if(t) this._seq.push({type:t}); });
    if(!this._seq.length) this._seq.push({type:'A'});          // 空ならデフォルトで 'A' を1件入れる
  }
  onPropertyChanged(n){
    if(n==='sequence'){ this._counter = 0; this._parseSeq(); }
  }
  onExecute(){
    // 下流が READY/IDLE かを判定（_state を持たないノード = 常時READY とみなす）
    let ready = false;                 // 受け渡し可能かどうかの最終判定フラグ
    let statelessReady = false;        // Sink 等（_state 未定義）で READY の場合に true
    const out = this.outputs && this.outputs[0]; // 出力0ポートの参照（存在しない場合は false）
    if(out && out.links){              // 出力ポートがあり、少なくとも1本リンクされている
      for(const lid of out.links){     // すべてのリンクIDを走査
        const link = this.graph.links[lid]; if(!link) continue;          // リンク実体を取得（無ければスキップ）
        const t = this.graph.getNodeById(link.target_id); if(!t) continue; // 接続先ノードを取得（無ければスキップ）
        if(typeof t._state === 'undefined'){          // _state を持たない（= stateless。例: Sink）
          ready = true;                                // 常時 READY とみなす
          statelessReady = true;                      // stateless の READY であることを記録
          break;                                      // 判定終了
        }
        if(t._state === 'IDLE'){                     // stateful ノード（例: Equipment）が IDLE
          ready = true;                               // 受け渡し可能
          /* 継続探索しない */ break;                // ひとつ READY が見つかれば十分
        }
      }
    }

    // 供給条件: 下流が READY/IDLE であれば即座に供給（Equipment は供給直後に PROCESS へ遷移し、
    // 次フレームには READY でなくなるため、多重供給は起きません）
    if(ready){                                 // 下流が READY/IDLE なら供給する
      if(!this._seq || !this._seq.length)      // まだ sequence が用意されていなければ
        this._parseSeq();                      // sequence を解析して初期化
      const e = this._seq[this._cursor] || {type:'A'};      // 現在カーソルの type（なければ 'A'）
      const w = new Work(this._counter + 1, e.type);          // 供給直前に ID を付与して Work を生成
      this.setOutputData(0, w);                              // 出力0（workOut）に供給
      this._counter += 1;                                      // Work ID を1つ進める
      this._cursor = (this._cursor + 1) % this._seq.length;  // 次に供給する type へカーソルを進める（循環）
      return;                                                // 供給したので処理終了
    }

    this.setOutputData(0, null);                  // 下流が準備できていないので供給なし
  }
}

menuMixin(SourceNode);
window.SourceNode = SourceNode;

// Overlay: 次に供給される予定の情報を表示（下流の可用状態表示は READY/BUSY に統一）
SourceNode.prototype.onDrawForeground = function(ctx){
  const next = (this._seq && this._seq.length) ? this._seq[this._cursor] : {type:'A'};
  // 下流の可用状態（READY/BUSY）に統一（未接続も BUSY とみなす）
  let downstream = 'BUSY';
  const out = this.outputs && this.outputs[0];
  if(out && out.links){
    let ready = false;
    for(const lid of out.links){
      const link = this.graph.links[lid]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      if(typeof t._state === 'undefined' || t._state === 'IDLE'){ ready = true; break; }
    }
    downstream = ready ? 'READY' : 'BUSY';
  }
  const lines = [
    `Next: ID=${(this._counter||0)+1} Type=${next?next.type:'A'}`,
    `Downstream: ${downstream}`,
    `SeqLen: ${this._seq?this._seq.length:0} Cursor: ${this._cursor}`,
    `localCounter: ${this._counter||0}`
  ];
  drawStateBelow(ctx, this, lines, 8, 6);
};








