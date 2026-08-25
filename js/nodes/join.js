// Join node: multi-input first-come-first-served pass-through

const JOIN_DEFAULT_SCRIPT = `// work: Work object (work.id, work.type, etc.)
// signalArr: array of sigIn values

// Join passes works in arrival order by default.
return true;`;

class JoinNode extends EquipmentNode{
  constructor(title='Join'){
    super(title);
    this.title = 'Join';

    // Join defaults: keep transfer visually trackable.
    this.properties.processTime = 5;
    this.properties.downTime = 6;
    this.properties.script = JOIN_DEFAULT_SCRIPT;
    this._compiled = null;

    // Rebuild work inputs to support N-way joining.
    this.inputs = [];
    this.addInput('inPort1', 0);
    this.addInput('inPort2', 0);

    this._state = 'IDLE';
    this._until = 0;
    this._payload = null;
    this._currentWork = null;
    this._handoffOffered = false;

    this._queue = [];
    this._arrivalSeq = 0;
    this._scanCursor = 0;
    this._activeInputSlot = -1;
    this._lastInRefBySlot = Object.create(null);

    // Ensure flip menu wrapper is reapplied after input rebuild.
    if(this.constructor && this.constructor.prototype.__flipMenuPatched) delete this.constructor.prototype.__flipMenuPatched;
    if(window.enableFlipIO) window.enableFlipIO(this);
  }

  _isWorkInputName(name){
    return true;
  }

  _workInputSlots(){
    const slots = [];
    if(!this.inputs) return slots;
    for(let i=0;i<this.inputs.length;i++){
      const inp = this.inputs[i];
      if(inp && String(inp.channel || '').toLowerCase() !== 'signal' && String(inp.type || '').toLowerCase() !== 'string') slots.push(i);
    }
    return slots;
  }

  _normalizeWorkInputNames(){
    const slots = this._workInputSlots();
    for(let i=0;i<slots.length;i++){
      const inp = this.inputs[slots[i]];
      if(inp){ inp.name = `inPort${i+1}`; inp.channel = 'entity'; inp.type = 0; }
    }
  }

  _ensureMinWorkInputs(minCount=2){
    let slots = this._workInputSlots();
    while(slots.length < minCount){
      this.addInput(`inPort${slots.length+1}`, 0);
      slots = this._workInputSlots();
    }
    this._normalizeWorkInputNames();
  }

  _resetQueue(clearRefs){
    this._queue = [];
    this._activeInputSlot = -1;
    if(clearRefs) this._lastInRefBySlot = Object.create(null);
  }

  _captureIncoming(now){
    const slots = this._workInputSlots();
    if(!slots.length) return;
    if(this._scanCursor >= slots.length) this._scanCursor = 0;
    const start = this._scanCursor;

    for(let i=0;i<slots.length;i++){
      const slot = slots[(start + i) % slots.length];
      const inp = this.inputs && this.inputs[slot];
      if(!inp || inp.link == null){
        this._lastInRefBySlot[slot] = null;
        continue;
      }

      const w = this.getInputData(slot);
      if(!w){
        this._lastInRefBySlot[slot] = null;
        continue;
      }
      if(typeof w !== 'object') continue;
      if(this._lastInRefBySlot[slot] === w) continue;
      if(typeof this._runtimeSelectInputRule === 'function' && !this._runtimeSelectInputRule(w, slot)) continue;

      // Guard against duplicate enqueue when one work object fans out.
      if(this._queue.some(item=> item.work === w)){
        this._lastInRefBySlot[slot] = w;
        continue;
      }

      this._queue.push({
        slotIndex: slot,
        work: w,
        at: now,
        seq: ++this._arrivalSeq
      });
      this._lastInRefBySlot[slot] = w;
    }

    this._scanCursor = (start + 1) % slots.length;
  }

  _triggerProcessAnimation(slotIndex, durationMs, work){
    if(!durationMs || durationMs <= 0) return;
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      const port = this.inputs && this.inputs[slotIndex];
      if(!port || port.link == null) return;
      const info = (work && typeof work === 'object') ? { id: work.id, t: work.type, entity: work } : null;
      window.WorkLinkAnimator.spawn(this.graph, port.link, 'work', durationMs, info);
    }catch(_e){}
  }

  _startNextQueued(sig, now){
    if(!this._queue.length) return false;
    const next = this._queue.shift();
    if(!next || !next.work || typeof next.work !== 'object') return false;

    const w = next.work;
    this._activeInputSlot = next.slotIndex;
    this._currentWork = w;
    this._payload = w;

    // Script false -> skip PROCESS and go directly to WAIT arbitration.
    if(!this._evalScript(w, sig)){
      this._state = 'WAIT';
      this._setWaitIcon(true);
      return true;
    }

    const processSeconds = typeof this._flowTiming === 'function' ? this._flowTiming('input', next.slotIndex) : this.properties.processTime;
    const durationMs = Math.max(0, processSeconds * 1000);
    this._state = 'PROCESS';
    this._until = now + durationMs;
    this._triggerProcessAnimation(next.slotIndex, durationMs, w);
    return durationMs === 0;
  }

  _addWorkInput(){
    this.addInput(`inPort${this.inputs.length + 1}`, 0);
    this._normalizeWorkInputNames();
    this._state = 'IDLE';
    this.setOutputData(0, null);
    this._setWaitIcon(false);
    this._resetQueue(true);
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true,true);
  }

  _removeWorkInput(){
    const slots = this._workInputSlots();
    if(slots.length <= 2) return;
    const idx = slots[slots.length - 1];
    const inp = this.inputs && this.inputs[idx];
    if(inp && inp.link != null){
      try{ this.graph && this.graph.removeLink(inp.link); }catch(_e){}
    }
    this.removeInput(idx);
    this._normalizeWorkInputNames();
    this._state = 'IDLE';
    this.setOutputData(0, null);
    this._setWaitIcon(false);
    this._resetQueue(true);
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true,true);
  }

  onConfigure(){
    this._ensureMinWorkInputs(2);
    this._normalizeWorkInputNames();
    this._resetQueue(true);
    window.refreshFlipIO(this);
  }

  canAcceptWorkInput(slotIndex, work){
    const inp = this.inputs && this.inputs[slotIndex];
    if(!inp || !this._isWorkInputName(inp.name)) return false;
    // Keep source/equipment generation bounded: new accepts only when ready to start.
    if(this._state !== 'IDLE' || this._queue.length !== 0) return false;
    return typeof this._runtimeSelectInputRule !== 'function' || !!this._runtimeSelectInputRule(work, slotIndex);
  }

  onExecute(){
    this._ensureMinWorkInputs(2);
    if(this._state === 'IDLE') this._currentWork = null;

    // Collect sigIn* values (same convention as EquipmentNode).
    const sig = [];
    for(let i=0;;i++){
      const idx = this.inputs.findIndex(x=>x.name===`sigIn${i}`);
      if(idx < 0) break;
      sig.push(this.getInputData(idx));
    }

    const now = simNow();
    this._captureIncoming(now);

    let guard = 0;
    let again = true;
    while(again && guard++ < 8){
      again = false;
      switch(this._state){
        case 'PROCESS':
          if(now >= this._until){
            this._state = 'WAIT';
            this._setWaitIcon(true);
            again = true;
          }
          break;

        case 'WAIT':
          {
          const selected = typeof this._runtimeSelectOutputRule === 'function'
            ? this._runtimeSelectOutputRule(this._payload, { processComplete:true }) : { slot:0 };
          const outputSlot = Number.isInteger(selected?.slot) ? selected.slot : 0;
          if(selected && this._downReady(outputSlot, this._payload)){
            const payload = this._payload;
            this._setWaitIcon(false);
            this._state = 'DOWN';
            const downSeconds = typeof this._flowTiming === 'function' ? this._flowTiming('output', outputSlot) : this.properties.downTime;
            const downMs = Math.max(0, downSeconds * 1000);
            this._until = now + downMs;
            this._flowOutputSlot = outputSlot;
            this.setOutputData(outputSlot, payload);
            this._spawnSinkTransfer(downMs, payload, outputSlot);
            this._payload = null;
          }else{
            this.setOutputData(outputSlot, null);
          }
          }
          break;

        case 'DOWN':
          if(now >= this._until){
            const outputSlot = Number.isInteger(this._flowOutputSlot) ? this._flowOutputSlot : 0;
            this.setOutputData(outputSlot, null);
            this._flowOutputSlot = null;
            this._setWaitIcon(false);
            this._state = 'IDLE';
            this._activeInputSlot = -1;
            again = true;
          }
          break;

        case 'IDLE': {
          const immediate = this._startNextQueued(sig, now);
          if(immediate) again = true;
          break;
        }
      }

      // Keep output visible at least one tick after entering DOWN.
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
    if(typeof window.applyNodeStateTheme === 'function') window.applyNodeStateTheme(this, this._state);

    if(this._state !== 'IDLE' || this._payload || this._queue.length) this.setDirtyCanvas(true,true);
  }

  onDrawForeground(ctx){
    const now = simNow();
    const rem = Math.max(0, this._until - now);
    const remSec = (rem/1000).toFixed(1);
    const w = this._currentWork;
    const lines = [
      `State: ${this._state}`,
      w ? `Work: ID=${w.id} Type=${w.type}` : 'Work: (none)',
      `Queue: ${this._queue.length}`,
      `Remain(s): ${remSec}`,
      `Proc(s): ${this.properties.processTime}  Down(s): ${this.properties.downTime}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

menuMixin(JoinNode);

JoinNode.title = 'Join';
window.JoinNode = JoinNode;
