// Source node (simple: downstream READY -> supply immediately)
/*
 * SourceNode（供給ノード）
 * - 接続先が IDLE/READY なら順番に Work を生成
 * - 信号ポートは任意数追加可能（sigExtra）
 */

class SourceNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Source';
    this.size = [200,150];
    this.addOutput('workOut', 0);
    this.color = '#f39c12';
    this.bgcolor = '#fff6e6';
    this.properties = {
      sequence: 'A,B',
      sigExtra: 0,
      sigEnabled: true,
    };
    syncSigPorts(this);
    this._seq = [];
    this._cursor = 0;
    this._outLast = [];
    this._readyPrev = false;
    this._counter = 0;
    this._parseSeq();
    if(window.enableFlipIO) window.enableFlipIO(this);
  }
  _parseSeq(){
    this._seq = [];
    this._cursor = 0;
    this.properties.sequence.split(/[\,\n]+/).forEach(t=>{ t=t.trim(); if(t) this._seq.push({type:t}); });
    if(!this._seq.length) this._seq.push({type:'A'});
  }
  _emit(i,state){
    if(!this.properties.sigEnabled){ this.setOutputData(i+1, null); return; }
    if(this._outLast[i] !== state){ this.setOutputData(i+1, state); this._outLast[i] = state; }
    else this.setOutputData(i+1, null);
  }
  onPropertyChanged(n){
    if(n==='sequence') this._parseSeq();
    if(n==='sigExtra') syncSigPorts(this);
  }
  _downstreamStatus(){
    const out = this.outputs && this.outputs[0];
    if(!out || !Array.isArray(out.links) || out.links.length === 0){
      return { ready: false, status: 'DISCONNECTED' };
    }

    let hasValidLink = false;
    for(const lid of out.links){
      const link = this.graph && this.graph.links ? this.graph.links[lid] : null;
      if(!link) continue;
      const t = this.graph && typeof this.graph.getNodeById === 'function'
        ? this.graph.getNodeById(link.target_id)
        : null;
      if(!t) continue;
      hasValidLink = true;

      if(typeof t.canAcceptWorkInput === 'function'){
        if(!t.canAcceptWorkInput(link.target_slot, null)){
          return { ready: false, status: 'BUSY' };
        }
        continue;
      }

      if(typeof t._state !== 'undefined' && t._state !== 'IDLE'){
        return { ready: false, status: 'BUSY' };
      }
    }

    if(!hasValidLink){
      return { ready: false, status: 'DISCONNECTED' };
    }
    return { ready: true, status: 'READY' };
  }
  onExecute(){
    const extra = this.properties.sigExtra || 0;
    const sigCount = Math.max(0, extra);
    const downstream = this._downstreamStatus();
    const ready = !!downstream.ready;

    if(ready){
      if(!this._seq || !this._seq.length) this._parseSeq();
      const nextId = (this._counter || 0) + 1;
      const e = this._seq[this._cursor] || {type:'A'};
      const w = new Work(nextId, e.type);
      this.setOutputData(0, w);
      this._counter = nextId;
      this._cursor = (this._cursor + 1) % this._seq.length;
      for(let i=0;i<sigCount;i++) this._emit(i, 'SEND');
      return;
    }

    this.setOutputData(0, null);
    for(let i=0;i<sigCount;i++) this._emit(i, 'IDLE');
  }
}

menuMixin(SourceNode);
window.SourceNode = SourceNode;

SourceNode.prototype.onDrawForeground = function(ctx){
  const next = (this._seq && this._seq.length) ? this._seq[this._cursor] : {type:'A'};
  const downstream = (typeof this._downstreamStatus === 'function')
    ? this._downstreamStatus().status
    : 'DISCONNECTED';
  const lines = [
    `Next: ID=${(this._counter||0)+1} Type=${next?next.type:'A'}`,
    `Downstream: ${downstream}`,
    `Sig: enabled=${!!this.properties.sigEnabled} extra=${this.properties.sigExtra}`,
    `SeqLen: ${this._seq?this._seq.length:0} Cursor: ${this._cursor}`,
    `localCounter: ${this._counter||0}`
  ];
  drawStateBelow(ctx, this, lines, 8, 6);
};
