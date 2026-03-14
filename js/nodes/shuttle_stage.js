// Shuttle stage node: synchronous transfer among stages in same group

const SHUTTLE_STAGE_UI = {
  baseSize: [180, 74]
};

class ShuttleStageNode extends LiteGraph.LGraphNode{
  constructor(title = 'Shuttle Stage'){
    super();
    this.title = title;
    this.size = SHUTTLE_STAGE_UI.baseSize.slice();
    this.resizable = true;
    this.addInput('workIn', 0);
    this.addOutput('workOut', 0);

    this.properties = {
      processTime: 2,
      groupId: 'shuttle-1',
      flipIO: false
    };

    this._state = 'IDLE'; // IDLE -> PROCESS -> WAIT -> TRANSFER -> IDLE
    this._until = 0;
    this._payload = null;
    this._currentWork = null;
    this._pendingTransfer = null;
    this._incomingPayload = null;
    this._transferHold = false;
    this._lastInRef = null;

    this._applyStateColor();
    if(window.enableFlipIO) window.enableFlipIO(this);
  }

  _applyStateColor(){
    switch(this._state){
      case 'PROCESS':
        this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
      case 'WAIT':
        this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
      case 'TRANSFER':
        this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
      default:
        this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
    }
    if(typeof window.applyNodeStateTheme === 'function'){
      window.applyNodeStateTheme(this, this._state === 'TRANSFER' ? 'DOWN' : this._state);
    }
  }

  _setState(next){
    if(this._state === next) return;
    const prev = this._state;
    this._state = next;
    if(prev !== 'WAIT' && next === 'WAIT') this._setWaitIcon(true, 'work');
    if(prev === 'WAIT' && next !== 'WAIT') this._setWaitIcon(false, 'work');
    this._applyStateColor();
    this._markGroupDirty();
  }

  _setWaitIcon(active, type = 'work'){
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      const out = this.outputs && this.outputs[0];
      if(!out || !out.links || !out.links.length){
        if(!active) this._waitIconLinks = null;
        return;
      }
      const payload = this._payload || this._currentWork || this._pendingTransfer || null;
      const info = (type === 'work' && payload) ? { id: payload.id, t: payload.type } : null;
      if(active){
        if(this._waitIconLinks) return;
        this._waitIconLinks = out.links.slice();
        this._waitIconLinks.forEach((id)=> window.WorkLinkAnimator.showPortIcon(this.graph, id, type, info));
      }else{
        if(!this._waitIconLinks) return;
        this._waitIconLinks.forEach((id)=> window.WorkLinkAnimator.hidePortIcon(this.graph, id));
        this._waitIconLinks = null;
      }
    }catch(_e){}
  }

  _groupId(){
    return String(this.properties?.groupId ?? '').trim();
  }

  _groupNodes(){
    const graph = this.graph;
    if(!graph || !Array.isArray(graph._nodes)) return [this];
    const gid = this._groupId();
    if(!gid) return [this];
    const list = [];
    for(const n of graph._nodes){
      if(!n) continue;
      if(String(n.type || '').toLowerCase() !== 'factory/shuttle_stage') continue;
      if(String(n.properties?.groupId ?? '').trim() !== gid) continue;
      list.push(n);
    }
    return list.length ? list : [this];
  }

  _markGroupDirty(){
    const graph = this.graph;
    if(!graph) return;
    if(!graph.__dirtyNodeIds) graph.__dirtyNodeIds = new Set();
    const peers = this._groupNodes();
    for(const p of peers){
      if(p && typeof p.id !== 'undefined') graph.__dirtyNodeIds.add(p.id);
    }
    graph.__outputDirty = true;
  }

  _leaderOf(peers){
    if(!Array.isArray(peers) || !peers.length) return this;
    let leader = peers[0];
    for(let i = 1; i < peers.length; i++){
      const a = peers[i];
      if(Number(a.id) < Number(leader.id)) leader = a;
    }
    return leader;
  }

  _hasDownstreamLinks(){
    if(!this.outputs || !this.outputs.length) return false;
    const out = this.outputs[0];
    return !!(out && out.links && out.links.length);
  }

  _downReadyForShuttle(vacatingIds){
    if(!this._payload) return false;
    if(!this.outputs || !this.outputs.length) return false;
    const out = this.outputs[0];
    if(!out || !out.links || !out.links.length) return false;

    let hasValid = false;
    for(const id of out.links){
      const link = this.graph?.links ? this.graph.links[id] : null;
      if(!link) continue;
      const target = this.graph?.getNodeById ? this.graph.getNodeById(link.target_id) : null;
      if(!target) continue;
      hasValid = true;

      const targetIsShuttle = String(target.type || '').toLowerCase() === 'factory/shuttle_stage';
      const sameGroup = targetIsShuttle &&
        String(target.properties?.groupId ?? '').trim() === this._groupId();
      if(sameGroup && vacatingIds && vacatingIds.has(target.id)){
        continue; // simultaneous move: target vacates this tick
      }

      if(typeof target.canAcceptWorkInput === 'function'){
        if(!target.canAcceptWorkInput(link.target_slot, this._payload)) return false;
        continue;
      }
      if(typeof target._state !== 'undefined' && target._state !== 'IDLE') return false;
    }
    return hasValid;
  }

  _beginTransfer(){
    if(!this._payload) return false;
    if(!this._hasDownstreamLinks()) return false;
    this._spawnTransferAnimation(this._payload);
    this._pendingTransfer = this._payload;
    this._payload = null;
    this._currentWork = null;
    this._transferHold = true;
    this.setOutputData(0, this._pendingTransfer);
    this._setState('TRANSFER');
    return true;
  }

  _spawnProcessAnimation(durationMs, work){
    if(!durationMs || durationMs <= 0) return;
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      const port = this.inputs && this.inputs[0];
      if(!port || port.link == null) return;
      const info = (work && typeof work === 'object') ? { id: work.id, t: work.type } : null;
      window.WorkLinkAnimator.spawn(this.graph, port.link, 'work', durationMs, info);
    }catch(_e){}
  }

  _spawnTransferAnimation(work){
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      const out = this.outputs && this.outputs[0];
      if(!out || !out.links || !out.links.length) return;
      const info = (work && typeof work === 'object') ? { id: work.id, t: work.type } : null;
      const durationMs = Math.max(120, Number(this.properties.processTime || 0) * 1000);
      for(const lid of out.links){
        const link = this.graph.links && this.graph.links[lid];
        if(!link) continue;
        const target = this.graph.getNodeById ? this.graph.getNodeById(link.target_id) : null;
        // EquipmentNode互換: 受け側が処理を描画するので、送出側ではSink向けのみ生成
        const sinkCtor = window.SinkNode;
        const isSink = sinkCtor ? (target instanceof sinkCtor) : (target && target.title === 'Sink');
        if(isSink) window.WorkLinkAnimator.spawn(this.graph, lid, 'work', durationMs, info);
      }
    }catch(_e){}
  }

  _tryCommitGroupTransfer(){
    const peers = this._groupNodes();
    const leader = this._leaderOf(peers);
    if(!leader || leader !== this) return false;

    // Block while any occupied stage is still processing.
    for(const n of peers){
      if(!n || !n._payload) continue; // empty stage does not block
      if(n._state === 'PROCESS') return false;
    }

    const waitNodes = [];
    for(const n of peers){
      if(!n || !n._payload) continue;
      if(n._state !== 'WAIT') continue;
      waitNodes.push(n);
    }
    if(!waitNodes.length) return false;

    // Stages with no downstream hold their work, but do not block transfer.
    const transferNodes = waitNodes.filter(n => n._hasDownstreamLinks());
    if(!transferNodes.length) return false;

    const vacating = new Set(transferNodes.map(n => n.id));
    for(const n of transferNodes){
      if(!n._downReadyForShuttle(vacating)) return false;
    }

    let moved = false;
    for(const n of transferNodes){
      if(n._beginTransfer()) moved = true;
    }
    if(moved) this._markGroupDirty();
    return moved;
  }

  _acceptInput(now){
    if(this._incomingPayload){
      const buffered = this._incomingPayload;
      this._incomingPayload = null;
      this._startProcessWith(buffered, now);
      return;
    }

    const in0 = this.inputs && this.inputs[0];
    const hasLink = !!(in0 && in0.link != null);
    if(!hasLink){
      this._lastInRef = null;
      return;
    }

    const w = this.getInputData(0);
    if(!w){
      this._lastInRef = null;
      return;
    }
    if(typeof w !== 'object') return;
    if(this._lastInRef === w) return;

    this._lastInRef = w;
    this._startProcessWith(w, now);
  }

  _startProcessWith(work, now){
    if(!work || typeof work !== 'object') return;
    this._payload = work;
    this._currentWork = work;
    const procMs = Math.max(0, Number(this.properties.processTime || 0) * 1000);
    this._until = now + procMs;
    this._setState('PROCESS');
    this._spawnProcessAnimation(procMs, work);
  }

  _captureIncomingDuringTransfer(){
    if(this._incomingPayload) return;
    const in0 = this.inputs && this.inputs[0];
    const hasLink = !!(in0 && in0.link != null);
    if(!hasLink) return;
    const w = this.getInputData(0);
    if(!w || typeof w !== 'object') return;
    if(this._lastInRef === w) return;
    this._lastInRef = w;
    this._incomingPayload = w;
  }

  onExecute(){
    const now = simNow();
    this.setOutputData(0, null);

    switch(this._state){
      case 'PROCESS':
        if(now >= this._until){
          this._setState('WAIT');
        }
        break;
      case 'WAIT':
        this._tryCommitGroupTransfer();
        break;
      case 'TRANSFER':
        this.setOutputData(0, this._pendingTransfer);
        this._captureIncomingDuringTransfer();
        if(this._transferHold){
          this._transferHold = false; // keep one full execute tick
        }else{
          this.setOutputData(0, null);
          this._pendingTransfer = null;
          if(this._incomingPayload){
            const buffered = this._incomingPayload;
            this._incomingPayload = null;
            this._startProcessWith(buffered, now);
          }else{
            this._setState('IDLE');
          }
        }
        break;
      case 'IDLE':
      default:
        this._currentWork = null;
        this._acceptInput(now);
        break;
    }

    if(this._state !== 'IDLE' || this._payload || this._pendingTransfer){
      this.setDirtyCanvas(true, true);
    }
  }

  canAcceptWorkInput(slotIndex){
    if(!this.inputs || slotIndex < 0 || slotIndex >= this.inputs.length) return false;
    const inp = this.inputs[slotIndex];
    if(!inp || inp.name !== 'workIn') return false;
    return this._state === 'IDLE' && !this._payload && !this._pendingTransfer;
  }

  onPropertyChanged(name){
    if(name === 'processTime'){
      const n = Number(this.properties.processTime);
      this.properties.processTime = (isFinite(n) && n >= 0) ? n : 0;
    }
    if(name === 'groupId'){
      this._markGroupDirty();
    }
  }

  onDrawForeground(ctx){
    const now = simNow();
    const rem = Math.max(0, this._until - now);
    const remSec = (rem / 1000).toFixed(1);
    const lines = [
      `State: ${this._state}`,
      `Group: ${this._groupId() || '-'}`,
      this._currentWork ? `Work: ID=${this._currentWork.id} Type=${this._currentWork.type}` : 'Work: (none)',
      `Remain(s): ${remSec}`,
      `Proc(s): ${this.properties.processTime}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }

  getEventUntil(now){
    if(this._state === 'TRANSFER'){
      return Number(now) || 0;
    }
    return NaN;
  }
}

menuMixin(ShuttleStageNode);
(function(proto){
  const prev = proto.getExtraMenuOptions;
  proto.getExtraMenuOptions = function(){
    let opts = prev ? prev.call(this) : [];
    if(!Array.isArray(opts)) opts = [];
    opts.push({
      content: 'Edit Shuttle Settings...',
      callback: ()=>{
        const gid = prompt('Group ID:', this.properties.groupId ?? 'shuttle-1');
        if(gid != null) this.properties.groupId = String(gid).trim() || 'shuttle-1';
        if(typeof this.onPropertyChanged === 'function'){
          this.onPropertyChanged('groupId');
        }
        this.setDirtyCanvas(true, true);
      }
    });
    return opts;
  };
})(ShuttleStageNode.prototype);

ShuttleStageNode.title = 'Shuttle Stage';
window.ShuttleStageNode = ShuttleStageNode;
