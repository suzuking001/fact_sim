// Split node

class SplitNode extends EquipmentNode{
  constructor(){
    super('Split');
    this.title = 'Split';
    if(this.outputs && this.outputs[0]) this.outputs[0].name = 'workOut1';
    this._ensureMinWorkOutputs(2);
    this.properties.ratio = 0.5;
    window.refreshFlipIO(this);
  }
  _isWorkOutputName(name){
    const s = String(name || '');
    return s === 'workOut' || /^workOut\d+$/.test(s);
  }
  _workOutputSlots(){
    const slots = [];
    if(!this.outputs) return slots;
    for(let i=0;i<this.outputs.length;i++){
      const out = this.outputs[i];
      if(out && this._isWorkOutputName(out.name)) slots.push(i);
    }
    return slots;
  }
  _workOutputs(){
    return this._workOutputSlots().map(slotIndex=>({ slotIndex, out: this.outputs[slotIndex] }));
  }
  _normalizeWorkOutputNames(){
    const slots = this._workOutputSlots();
    for(let i=0;i<slots.length;i++){
      const out = this.outputs[slots[i]];
      if(out) out.name = `workOut${i+1}`;
    }
  }
  _ensureMinWorkOutputs(minCount=2){
    let slots = this._workOutputSlots();
    while(slots.length < minCount){
      this.addOutput(`workOut${slots.length+1}`, 0);
      slots = this._workOutputSlots();
    }
    this._normalizeWorkOutputNames();
  }
  _addWorkOutput(){
    this.addOutput('workOut', 0);
    this._normalizeWorkOutputNames();
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true,true);
  }
  _removeWorkOutput(){
    const slots = this._workOutputSlots();
    if(slots.length <= 2) return;
    const idx = slots[slots.length - 1];
    const out = this.outputs && this.outputs[idx];
    if(out && out.links){
      [...out.links].forEach(id=>{
        try{ this.graph && this.graph.removeLink(id); }catch(_e){}
      });
    }
    this.removeOutput(idx);
    this._normalizeWorkOutputNames();
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true,true);
  }
  onConfigure(){
    this._ensureMinWorkOutputs(2);
    window.refreshFlipIO(this);
  }
  _cloneWork(w){
    if(!w || typeof w !== 'object') return w;
    const c = new Work(w.id, w.type);
    return Object.assign(c, w);
  }

  _setWaitIcon(active, type='work'){
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      const payload = this._payload || this._currentWork || null;
      const info = (type === 'work' && payload) ? { id: payload.id, t: payload.type } : null;
      if(active){
        if(this._waitIconLinksSplit) return;
        const links = [];
        const addLinks = (out)=>{
          if(!out || !out.links) return;
          out.links.forEach(id=>{
            if(links.indexOf(id) < 0) links.push(id);
          });
        };
        this._workOutputs().forEach(({out})=> addLinks(out));
        this._waitIconLinksSplit = links;
        this._waitIconLinksSplit.forEach(id=> window.WorkLinkAnimator.showPortIcon(this.graph, id, type, info));
      }else{
        if(!this._waitIconLinksSplit) return;
        this._waitIconLinksSplit.forEach(id=> window.WorkLinkAnimator.hidePortIcon(this.graph, id));
        this._waitIconLinksSplit = null;
      }
    }catch(_e){}
  }

  _spawnSplitTransfer(duration, payload, slotIndex){
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

  _downReadySplit(){
    const entries = this._workOutputs();
    if(entries.length < 2) return false;
    const payload = this._payload;
    let connectedCount = 0;
    const readyFor = (out)=>{
      if(!out || !out.links || out.links.length === 0) return null; // ignore unconnected ports
      connectedCount++;
      for(const id of out.links){
        const link = this.graph.links[id];
        if(!link) continue;
        const t = this.graph.getNodeById(link.target_id);
        if(!t) continue;
        if(typeof t.canAcceptWorkInput === 'function'){
          if(!t.canAcceptWorkInput(link.target_slot, payload)) return false;
          continue;
        }
        if(typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
      }
      return true;
    };
    for(const {out} of entries){
      const ready = readyFor(out);
      if(ready === false) return false;
    }
    // Need at least one connected downstream port to emit.
    return connectedCount > 0;
  }

  onExecute(){
    this._ensureMinWorkOutputs(2);
    // Clear currentWork when truly idle
    if(this._state === 'IDLE') this._currentWork = null;

    // Collect sigIn* signals
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
            this._handoffOffered = false;
            this._setWaitIcon(true);
            again = true;
          }
          break;
        case 'WAIT': {
          const workOuts = this._workOutputs();
          if(this._downReadySplit()){
            const payload = this._payload;
            this._setWaitIcon(false);
            this._state = 'DOWN';
            const downMs = Math.max(0, this.properties.downTime*1000);
            this._until = now + downMs;
            // Output split works simultaneously to all workOut ports
            for(let i=0;i<workOuts.length;i++){
              const {slotIndex} = workOuts[i];
              const wOut = (i === 0) ? payload : this._cloneWork(payload);
              this.setOutputData(slotIndex, wOut);
              this._spawnSplitTransfer(downMs, wOut, slotIndex);
            }
            this._payload = null;
          }else{
            workOuts.forEach(({slotIndex})=> this.setOutputData(slotIndex, null));
          }
          break;
        }
        case 'DOWN':
          if(now >= this._until){
            this._workOutputs().forEach(({slotIndex})=> this.setOutputData(slotIndex, null));
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
          // Script false -> skip process but still obey downstream readiness via WAIT
          if(!this._evalScript(w, sig)){
            this._currentWork = w;
            this._payload = w;
            this._state = 'WAIT';
            this._handoffOffered = false;
            this._lastInRef = w;
            this._setWaitIcon(true);
            again = true;
            break;
          }
          // Accept and process
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

    // Emit signal outputs
    const n = this.properties.sigExtra || 0;
    for(let i=0;i<n;i++) this._emit(i, this._state);

    switch(this._state){
      case 'PROCESS': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
      case 'WAIT':    this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
      case 'DOWN':    this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
      case 'IDLE':    this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
    }
    if(typeof window.applyNodeStateTheme === 'function') window.applyNodeStateTheme(this, this._state);

    if(this._state !== 'IDLE' || this._payload) this.setDirtyCanvas(true,true);
  }

  onDrawForeground(ctx){
    const now = simNow();
    const rem = Math.max(0, this._until - now);
    const remSec = (rem/1000).toFixed(1);
    const w = this._currentWork;
    const lines = [
      `State: ${this._state}`,
      w?`Work: ID=${w.id} Type=${w.type}`:'Work: (none)',
      `Remain(s): ${remSec}`,
      `Ratio: ${this.properties.ratio}`,
      `Sig: enabled=${!!this.properties.sigEnabled} extra=${this.properties.sigExtra}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

menuMixin(SplitNode);
(function(proto){
  const prev = proto.getExtraMenuOptions;
  proto.getExtraMenuOptions = function(){
    let opts = prev ? prev.call(this) : [];
    if(!Array.isArray(opts)) opts = [];
    opts.push({
      content: 'Add workOut',
      callback: ()=> (window.runNodeMutation
        ? window.runNodeMutation(this, ()=> this._addWorkOutput())
        : this._addWorkOutput())
    });
    const count = this._workOutputSlots().length;
    opts.push({
      content: 'Remove workOut',
      disabled: count <= 2,
      callback: ()=> (window.runNodeMutation
        ? window.runNodeMutation(this, ()=> this._removeWorkOutput())
        : this._removeWorkOutput())
    });
    return opts;
  };
})(SplitNode.prototype);
// Ensure palette/menu shows proper name
SplitNode.title = 'Split';
window.SplitNode = SplitNode;

