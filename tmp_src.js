// Source node (simple: downstream READY -> supply immediately)
/*
 * SourceNode（供給ノード）
 * - 下流が IDLE/READY のときだけ、即座に1件供給して ID を +1 する。
 * - インターバルや pending バッファは使用しない、最小仕様。
 */

class SourceNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Source';
    this.size = [240,180];
    this.addOutput('workOut', 0);
    this.properties = {
      sequence: 'A,B',
      sigExtra: 0,
      sigEnabled: true,
    };
    syncSigPorts(this);
    this._seq = [];
    this._cursor = 0;
    this._outLast = [];
    this._readyPrev = false; // 前回 onExecute 時の下流 readiness
    this._parseSeq();
  }
  _parseSeq(){
    this._seq = [];
    this._cursor = 0;
    this.properties.sequence.split(/[\,\n]+/).forEach(t=>{ t=t.trim(); if(t) this._seq.push({type:t}); });
    if(!this._seq.length) this._seq.push({type:'A'});
  }
  _emit(i,m){
    if(!this.properties.sigEnabled){ this.setOutputData(i+1, null); return; }
    if(this._outLast[i] !== m){ this.setOutputData(i+1, m); this._outLast[i] = m; }
    else this.setOutputData(i+1, null);
  }
  onPropertyChanged(n){ if(n==='sequence') this._parseSeq(); if(n==='sigExtra') syncSigPorts(this); }
  onExecute(){
    const need = 3 + (this.properties.sigExtra||0);

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
    if(ready){
      if(!this._seq || !this._seq.length) this._parseSeq();
      const e = this._seq[this._cursor] || {type:'A'};
      const w = new Work(workCounter + 1, e.type);
      this.setOutputData(0, w);
      workCounter += 1;
      this._cursor = (this._cursor + 1) % this._seq.length;
      for(let i=0;i<need;i++) this._emit(i, 'SEND');
      return;
    }

    this.setOutputData(0, null);
    for(let i=0;i<need;i++) this._emit(i, 'IDLE');
  }
}

menuMixin(SourceNode);
window.SourceNode = SourceNode;

// Overlay: 次に供給される予定の情報を表示（下流の可用状態表示は READY/BUSY に統一）
SourceNode.prototype.onDrawForeground = function(ctx){
  const next = (this._seq && this._seq.length) ? this._seq[this._cursor] : {type:'A'};
  // 下流の可用状態（READY/BUSY）に統一
  let downstream = 'DISCONNECTED';
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
    `Next: ID=${workCounter+1} Type=${next?next.type:'A'}`,
    `Downstream: ${downstream}`,
    `Sig: enabled=${!!this.properties.sigEnabled} extra=${this.properties.sigExtra}`,
    `SeqLen: ${this._seq?this._seq.length:0} Cursor: ${this._cursor}`,
    `workCounter: ${workCounter}`
  ];
  drawStateBelow(ctx, this, lines, 8, 6);
};

