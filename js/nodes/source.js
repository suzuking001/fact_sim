// Source node (simple: downstream READY -> supply immediately)
/*
 * SourceNode (supply node)
 * - Generates Work items in sequence while the downstream node is IDLE/READY.
 * - Supports any number of optional signal ports through sigExtra.
 */

class SourceNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Source';
    this.size = [200,150];
    this.addOutput('outPort1', 0);
    this.color = '#fee8c7';
    this.bgcolor = '#fff8ee';
    this.boxcolor = '#f39c12';
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
    this._pendingWork = null;
    this._pendingOutputSlot = null;
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
  _downstreamStatus(work=null, slotIndex=0){
    const out = this.outputs && this.outputs[slotIndex];
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
        if(!t.canAcceptWorkInput(link.target_slot, work)){
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
  _animateWorkOutput(work, slotIndex=0){
    const out = this.outputs && this.outputs[slotIndex];
    if(!work || !out || !Array.isArray(out.links) || !window.WorkLinkAnimator || !this.graph) return;
    const info = { id: work.id, t: work.type, entity: work };
    for(const lid of out.links){
      const link = this.graph.links && this.graph.links[lid];
      if(!link) continue;
      window.WorkLinkAnimator.spawn(this.graph, lid, 'work', undefined, info);
    }
  }
  _targetAcceptedWork(target, slotIndex, work){
    if(!target || !work) return false;
    if(target._lastInRef === work || target._payload === work || target._currentWork === work ||
       target._activeRoot === work || target._activeTarget === work || target._lastWork === work){
      return true;
    }
    if(Array.isArray(target._lastInputRefs) && target._lastInputRefs[slotIndex] === work) return true;
    if(Array.isArray(target._worksBySlot) && target._worksBySlot.includes(work)) return true;
    if(Array.isArray(target._recv) && target._recv.includes(work)) return true;
    return Array.isArray(target.outputs) && target.outputs.some((_output, index)=>{
      try{ return target.getOutputData(index) === work; }catch(_e){ return false; }
    });
  }
  _pendingWorkAccepted(work){
    const slot = Number.isInteger(this._pendingOutputSlot) ? this._pendingOutputSlot : 0;
    const out = this.outputs && this.outputs[slot];
    if(!work || !out || !Array.isArray(out.links) || !out.links.length || !this.graph) return false;
    let targetCount = 0;
    for(const lid of out.links){
      const link = this.graph.links && this.graph.links[lid];
      const target = link && typeof this.graph.getNodeById === 'function'
        ? this.graph.getNodeById(link.target_id)
        : null;
      if(!target) continue;
      targetCount++;
      if(!this._targetAcceptedWork(target, link.target_slot, work)) return false;
    }
    return targetCount > 0;
  }
  _holdPendingWork(){
    const work = this._pendingWork;
    if(!work) return false;
    if(this._pendingWorkAccepted(work)){
      this._pendingWork = null;
      const slot = Number.isInteger(this._pendingOutputSlot) ? this._pendingOutputSlot : 0;
      this.setOutputData(slot, null);
      this._pendingOutputSlot = null;
    }else{
      const slot = Number.isInteger(this._pendingOutputSlot) ? this._pendingOutputSlot : 0;
      this.setOutputData(slot, work);
    }
    return true;
  }
  onExecute(){
    const extra = this.properties.sigExtra || 0;
    const sigCount = Math.max(0, extra);
    if(this._holdPendingWork()){
      for(let i=0;i<sigCount;i++) this._emit(i, 'SEND');
      return;
    }
    if(!this._seq || !this._seq.length) this._parseSeq();
    const nextId = (this._counter || 0) + 1;
    const e = this._seq[this._cursor] || {type:'A'};
    const preview = new Work(nextId, e.type);
    const flowSelection = typeof this._runtimeSelectOutputRule === 'function'
      ? this._runtimeSelectOutputRule(preview, { processComplete:true })
      : { slot:0 };
    const flowSlot = Number.isInteger(flowSelection?.slot) ? flowSelection.slot : 0;
    const downstream = flowSelection
      ? this._downstreamStatus(preview, flowSlot)
      : { ready:false, status:'RULE BLOCKED' };
    const ready = !!downstream.ready;

    if(ready){
      const w = preview;
      this.setOutputData(flowSlot, w);
      this._pendingWork = w;
      this._pendingOutputSlot = flowSlot;
      this._animateWorkOutput(w, flowSlot);
      this._counter = nextId;
      this._cursor = (this._cursor + 1) % this._seq.length;
      for(let i=0;i<sigCount;i++) this._emit(i, 'SEND');
      return;
    }

    (this.outputs || []).forEach((_output, slot)=>this.setOutputData(slot, null));
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
