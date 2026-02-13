// Branch node: route work to one output by work.type

class BranchNode extends EquipmentNode{
  constructor(){
    super('Branch');
    this.title = 'Branch';
    this._ensureMinWorkOutputs(2);
    this._waitIconLinksBranch = null;
    window.refreshFlipIO(this);
  }

  _isWorkOutput(out){
    if(!out) return false;
    if(out.__branchWorkOut) return true;
    const n = String(out.name || '');
    return n === 'workOut' || n.startsWith('workOut ');
  }

  _workOutputs(){
    const rows = [];
    if(!this.outputs) return rows;
    for(let i=0;i<this.outputs.length;i++){
      const out = this.outputs[i];
      if(this._isWorkOutput(out)) rows.push({ slotIndex: i, out });
    }
    return rows;
  }

  _defaultRouteType(idx){
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if(idx >= 0 && idx < alphabet.length) return alphabet[idx];
    return String(idx + 1);
  }

  _outputLabel(routeType){
    const t = String(routeType || '').trim();
    return t ? `workOut ${t}` : 'workOut';
  }

  _ensureMinWorkOutputs(minCount){
    let rows = this._workOutputs();
    // Mark and normalize existing work outputs first
    rows.forEach(({out}, i)=>{
      out.__branchWorkOut = true;
      if(typeof out.routeType === 'undefined' || out.routeType === null){
        const n = String(out.name || '').trim();
        if(n.startsWith('workOut ')) out.routeType = n.slice(8).trim();
        else out.routeType = this._defaultRouteType(i);
      }
      out.name = this._outputLabel(out.routeType);
      out.type = 0;
    });
    while(rows.length < minCount){
      this.addOutput('workOut', 0);
      rows = this._workOutputs();
      const last = rows[rows.length - 1];
      if(last && last.out){
        last.out.__branchWorkOut = true;
        if(!last.out.routeType) last.out.routeType = this._defaultRouteType(rows.length - 1);
        last.out.name = this._outputLabel(last.out.routeType);
      }
    }
  }

  _addWorkOutput(){
    this._ensureMinWorkOutputs(2);
    this.addOutput('workOut', 0);
    const rows = this._workOutputs();
    const last = rows[rows.length - 1];
    if(last && last.out){
      last.out.__branchWorkOut = true;
      last.out.routeType = this._defaultRouteType(rows.length - 1);
      last.out.name = this._outputLabel(last.out.routeType);
      last.out.type = 0;
    }
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true,true);
  }

  _removeWorkOutput(){
    const rows = this._workOutputs();
    if(rows.length <= 2) return;
    const last = rows[rows.length - 1];
    if(!last) return;
    if(last.out && last.out.links){
      [...last.out.links].forEach(id=>{
        try{ this.graph && this.graph.removeLink(id); }catch(_e){}
      });
    }
    this.removeOutput(last.slotIndex);
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true,true);
  }

  _findRouteSlot(work){
    const wType = (work && work.type != null) ? String(work.type).trim() : '';
    if(!wType) return -1;
    const rows = this._workOutputs();
    for(const {slotIndex, out} of rows){
      const routeType = String(out.routeType || '').trim();
      if(routeType && routeType === wType) return slotIndex;
    }
    return -1;
  }

  _clearWorkOutputs(){
    this._workOutputs().forEach(({slotIndex})=> this.setOutputData(slotIndex, null));
  }

  _setWaitIcon(active, type='work'){
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      if(active){
        if(this._waitIconLinksBranch) return;
        const payload = this._payload;
        const slot = this._findRouteSlot(payload);
        if(slot < 0) return;
        const out = this.outputs && this.outputs[slot];
        if(!out || !out.links || out.links.length === 0) return;
        this._waitIconLinksBranch = out.links.slice();
        this._waitIconLinksBranch.forEach(id=> window.WorkLinkAnimator.showPortIcon(this.graph, id, type));
      }else{
        if(!this._waitIconLinksBranch) return;
        this._waitIconLinksBranch.forEach(id=> window.WorkLinkAnimator.hidePortIcon(this.graph, id));
        this._waitIconLinksBranch = null;
      }
    }catch(_e){}
  }

  _spawnBranchTransfer(duration, payload, slotIndex){
    if(!duration || duration <= 0) return;
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      const info = payload ? { id: payload.id, t: payload.type } : null;
      const out = this.outputs && this.outputs[slotIndex];
      if(!out || !out.links) return;
      out.links.forEach(id=>{
        const link = this.graph.links[id]; if(!link) return;
        const target = this.graph.getNodeById(link.target_id);
        const sinkCtor = window.SinkNode;
        const isSink = sinkCtor ? (target instanceof sinkCtor) : (target && target.title === 'Sink');
        if(isSink) window.WorkLinkAnimator.spawn(this.graph, id, 'work', duration, info);
      });
    }catch(_e){}
  }

  _downReadyForSlot(slotIndex, payload){
    const out = this.outputs && this.outputs[slotIndex];
    if(!out || !out.links || out.links.length === 0) return false;
    let hasValidLink = false;
    for(const id of out.links){
      const link = this.graph.links[id];
      if(!link) continue;
      hasValidLink = true;
      const t = this.graph.getNodeById(link.target_id);
      if(t && typeof t.canAcceptWorkInput === 'function'){
        if(!t.canAcceptWorkInput(link.target_slot, payload)) return false;
        continue;
      }
      if(t && typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
    }
    return hasValidLink;
  }

  _promptRouteTypeForOutput(slotIndex){
    const out = this.outputs && this.outputs[slotIndex];
    if(!out || !this._isWorkOutput(out)) return;
    const current = String(out.routeType || '').trim();
    const next = prompt('workType for this output:', current);
    if(next === null) return;
    const val = String(next).trim();
    if(!val) return;
    out.routeType = val;
    out.name = this._outputLabel(val);
    this.setDirtyCanvas(true,true);
  }

  onMouseDown(e, local_pos){
    const p = Array.isArray(local_pos) ? local_pos : null;
    if(!p) return false;
    const rows = this._workOutputs();
    for(const {slotIndex} of rows){
      const cp = this.getConnectionPos(false, slotIndex);
      if(!cp) continue;
      const lx = cp[0] - this.pos[0];
      const ly = cp[1] - this.pos[1];
      const yHit = Math.abs(p[1] - ly) <= 10;
      if(!yHit) continue;
      // Click label area (not connector circle) on either side, respecting flip.
      let x1, x2;
      if(lx > this.size[0] * 0.5){
        x1 = Math.max(0, lx - 140);
        x2 = lx - 10;
      }else{
        x1 = lx + 10;
        x2 = Math.min(this.size[0], lx + 140);
      }
      if(p[0] >= x1 && p[0] <= x2){
        this._promptRouteTypeForOutput(slotIndex);
        if(e && e.preventDefault) e.preventDefault();
        if(e && e.stopPropagation) e.stopPropagation();
        return true;
      }
    }
    return false;
  }

  onConfigure(){
    this._ensureMinWorkOutputs(2);
    window.refreshFlipIO(this);
  }

  onExecute(){
    this._ensureMinWorkOutputs(2);
    if(this._state === 'IDLE') this._currentWork = null;

    const sig = [];
    for(let i=0;;i++){
      const idx = this.inputs.findIndex(x=>x.name===`sigIn${i}`);
      if(idx<0) break;
      sig.push(this.getInputData(idx));
    }

    const now = simNow();
    let guard = 0;
    let again = true;
    while(again && guard++ < 6){
      again = false;
      switch(this._state){
        case 'PROCESS':
          if(now >= this._until){
            this._state = 'WAIT';
            this._setWaitIcon(true);
            again = true;
          }
          break;
        case 'WAIT': {
          const payload = this._payload;
          const slot = this._findRouteSlot(payload);
          if(slot >= 0 && this._downReadyForSlot(slot, payload)){
            this._setWaitIcon(false);
            this._state = 'DOWN';
            const downMs = Math.max(0, this.properties.downTime*1000);
            this._until = now + downMs;
            this._clearWorkOutputs();
            this.setOutputData(slot, payload);
            this._spawnBranchTransfer(downMs, payload, slot);
            this._payload = null;
          }else{
            this._clearWorkOutputs();
          }
          break;
        }
        case 'DOWN':
          if(now >= this._until){
            this._clearWorkOutputs();
            this._state = 'IDLE';
            this._setWaitIcon(false);
            again = true;
          }
          break;
        case 'IDLE': {
          const in0 = (this.inputs && this.inputs[0]) ? this.inputs[0] : null;
          const hasLink = !!(in0 && in0.link != null);
          if(!hasLink) break;
          const w = this.getInputData(0);
          if(!w){ this._lastInRef = null; break; }
          if(typeof w !== 'object') break;
          if(this._lastInRef === w) break;
          // Script false -> route without process
          if(!this._evalScript(w, sig)){
            this._currentWork = w;
            this._payload = w;
            this._state = 'WAIT';
            this._lastInRef = w;
            this._setWaitIcon(true);
            again = true;
            break;
          }
          this._currentWork = w;
          this._payload = w;
          this._state = 'PROCESS';
          const durationMs = Math.max(0, this.properties.processTime*1000);
          this._until = now + durationMs;
          this._lastInRef = w;
          try{
            if(durationMs > 0 && window.WorkLinkAnimator && this.graph){
              const inPort = this.inputs && this.inputs[0];
              if(inPort && inPort.link != null){
                const info = (w && typeof w === 'object') ? { id: w.id, t: w.type } : null;
                window.WorkLinkAnimator.spawn(this.graph, inPort.link, 'work', durationMs, info);
              }
            }
          }catch(_e){}
          if(durationMs === 0) again = true;
          break;
        }
      }
      if(this._state === 'DOWN') break;
    }

    const n = this.properties.sigExtra || 0;
    for(let i=0;i<n;i++) this._emit(i, this._state);

    switch(this._state){
      case 'PROCESS': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
      case 'WAIT':    this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
      case 'DOWN':    this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
      case 'IDLE':    this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
    }

    if(this._state !== 'IDLE' || this._payload) this.setDirtyCanvas(true,true);
  }

  onDrawForeground(ctx){
    const now = simNow();
    const rem = Math.max(0, this._until - now);
    const remSec = (rem/1000).toFixed(1);
    const w = this._currentWork;
    const routes = this._workOutputs().map(({out})=> String(out.routeType || '?')).join(', ');
    const lines = [
      `State: ${this._state}`,
      w ? `Work: ID=${w.id} Type=${w.type}` : 'Work: (none)',
      `Remain(s): ${remSec}`,
      `Routes: ${routes || '(none)'}`,
      `Tip: Click workOut label to set workType`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

menuMixin(BranchNode);
(function(proto){
  const prev = proto.getExtraMenuOptions;
  proto.getExtraMenuOptions = function(){
    let opts = prev ? prev.call(this) : [];
    if(!Array.isArray(opts)) opts = [];
    opts.push({ content: 'Add workOut', callback: ()=> this._addWorkOutput() });
    const cnt = this._workOutputs().length;
    opts.push({ content: 'Remove workOut', disabled: cnt <= 2, callback: ()=> this._removeWorkOutput() });
    return opts;
  };
})(BranchNode.prototype);

BranchNode.title = 'Branch';
window.BranchNode = BranchNode;

