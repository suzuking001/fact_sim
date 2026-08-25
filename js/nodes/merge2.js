// Merge node: multi-input merge with ID match across all active inputs
// Backward-compatible file name/type alias for old merge2 graphs.

const MERGE_DEFAULT_SCRIPT = `// work: Work object (work.id, work.type, etc.)
// signalArr: array of sigIn values

if(work.type === 'A'){
  this.properties.processTime = 5.0;
  this.properties.processTime2 = 5.0;
  this.properties.downTime = 3.0;
}else if(work.type === 'B'){
  this.properties.processTime = 4.0;
  this.properties.processTime2 = 4.0;
  this.properties.downTime = 2.0;
}else{
  // default
  this.properties.processTime = 10.0;
  this.properties.processTime2 = 10.0;
  this.properties.downTime = 2.0;
}

return true;`;

class MergeNode extends EquipmentNode{
  constructor(title='Merge'){
    super(title);
    this.title = 'Merge';

    // Rebuild inputs: multiple work inputs only (sigIn* can be added via menu later)
    this.inputs = [];
    this.addInput('inPort1', 0);
    this.addInput('inPort2', 0);

    this._state = 'IDLE';
    this._until = 0;
    this._payload = null;
    this._handoffOffered = false;

    this._cycleActive = false;
    this._activeSlots = [];
    this._nextSlotCursor = 0;
    this._worksBySlot = Object.create(null);
    this._lastInRefBySlot = Object.create(null);

    this.color = '#f1c40f';
    this.bgcolor = '#fff9db';

    if(this.properties.script === defaultScript()) this.properties.script = MERGE_DEFAULT_SCRIPT;

    const clamp = v=> Math.max(0, Math.round(parseFloat(v||0)*10)/10);
    if(typeof this.properties.processTime2 === 'undefined') this.properties.processTime2 = this.properties.processTime;
    this.properties.processTime2 = clamp(this.properties.processTime2);
    if(typeof this.properties.strictIdMatch === 'undefined') this.properties.strictIdMatch = false;
    this._mergeMismatchCount = 0;
    this._lastMergeMismatch = null;

    // Ensure flip menu wrapper is reapplied
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

  _collectConnectedWorkSlots(){
    return this._workInputSlots().filter(slot=>{
      const inp = this.inputs && this.inputs[slot];
      return !!(inp && inp.link != null);
    });
  }

  _resetCycleData(clearRefs){
    this._cycleActive = false;
    this._activeSlots = [];
    this._nextSlotCursor = 0;
    this._worksBySlot = Object.create(null);
    this._payload = null;
    this._currentWork = null;
    if(clearRefs){
      this._lastInRefBySlot = Object.create(null);
    }
  }

  _prepareCycleIfNeeded(){
    if(this._cycleActive) return true;
    const connected = this._collectConnectedWorkSlots();
    if(connected.length < 2) return false;
    this._activeSlots = connected;
    this._nextSlotCursor = 0;
    this._cycleActive = true;
    return true;
  }

  _expectedSlot(){
    if(!this._cycleActive) return -1;
    if(this._nextSlotCursor < 0 || this._nextSlotCursor >= this._activeSlots.length) return -1;
    return this._activeSlots[this._nextSlotCursor];
  }

  _triggerProcessAnimation(slotIndex, durationMs, info){
    if(!durationMs || durationMs <= 0) return;
    try{
      if(window.WorkLinkAnimator && this.graph){
        const port = this.inputs && this.inputs[slotIndex];
        if(port && port.link != null){
          window.WorkLinkAnimator.spawn(this.graph, port.link, 'work', durationMs, info);
        }
      }
    }catch(_e){}
  }

  _handleIdMismatch(expectedWork, actualWork){
    const expectedId = expectedWork ? expectedWork.id : '-';
    const actualId = actualWork ? actualWork.id : '-';
    this._mergeMismatchCount = (Number(this._mergeMismatchCount) || 0) + 1;
    this._lastMergeMismatch = {
      atMs: simNow(),
      expectedId,
      actualId,
      count: this._mergeMismatchCount
    };

    if(this.properties && this.properties.strictIdMatch){
      try{
        alert(`Merge ID mismatch: expected=${expectedId} actual=${actualId}`);
      }catch(_e){}
      this._state = 'ERROR';
      try{
        if(typeof window.stopSimulation === 'function') window.stopSimulation();
        else if(this.graph && typeof this.graph.stop === 'function') this.graph.stop();
      }catch(_e){}
      return false;
    }

    console.warn(`[merge] ID mismatch on node #${this.id}: expected=${expectedId} actual=${actualId}. Resetting merge cycle.`);
    const activeSlots = Array.isArray(this._activeSlots) ? this._activeSlots.slice() : [];
    for(const activeSlot of activeSlots){
      try{
        this._lastInRefBySlot[activeSlot] = this.getInputData(activeSlot) || null;
      }catch(_e){
        this._lastInRefBySlot[activeSlot] = null;
      }
    }
    this._state = 'IDLE';
    this._until = 0;
    this.setOutputData(0, null);
    this._setWaitIcon(false);
    this._resetCycleData(false);
    if(typeof this.setDirtyCanvas === 'function') this.setDirtyCanvas(true, true);
    return false;
  }

  _acceptFromExpectedSlot(now){
    const slot = this._expectedSlot();
    if(slot < 0) return false;
    const inp = this.inputs && this.inputs[slot];
    if(!inp || inp.link == null){
      // Topology changed while collecting
      this._resetCycleData(true);
      return false;
    }

    const w = this.getInputData(slot);
    if(!w){
      this._lastInRefBySlot[slot] = null;
      return false;
    }
    if(typeof w !== 'object') return false;
    if(this._lastInRefBySlot[slot] === w) return false;
    if(typeof this._runtimeSelectInputRule === 'function' && !this._runtimeSelectInputRule(w, slot)) return false;

    if(this._nextSlotCursor > 0){
      const firstSlot = this._activeSlots[0];
      const firstWork = this._worksBySlot[firstSlot];
      if(!firstWork || w.id !== firstWork.id){
        return this._handleIdMismatch(firstWork, w);
      }
    }

    this._worksBySlot[slot] = w;
    this._currentWork = w;
    this._lastInRefBySlot[slot] = w;

    const isFirst = (this._nextSlotCursor === 0);
    const sec = typeof this._flowTiming === 'function'
      ? this._flowTiming('input', slot)
      : (isFirst ? this.properties.processTime : (this.properties.processTime2 || this.properties.processTime));
    const durationMs = Math.max(0, sec * 1000);
    this._state = 'PROCESS';
    this._until = now + durationMs;
    this._triggerProcessAnimation(slot, durationMs, { id: w.id, t: w.type, entity: w });

    if(durationMs === 0) return true;
    return false;
  }

  _addWorkInput(){
    this.addInput(`inPort${this.inputs.length + 1}`, 0);
    this._normalizeWorkInputNames();
    this._state = 'IDLE';
    this.setOutputData(0, null);
    this._setWaitIcon(false);
    this._resetCycleData(true);
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
    this._resetCycleData(true);
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true,true);
  }

  onConfigure(){
    this._ensureMinWorkInputs(2);
    this._normalizeWorkInputNames();
    window.refreshFlipIO(this);
  }

  onExecute(){
    this._ensureMinWorkInputs(2);
    if(this._state === 'ERROR') return;

    const now = simNow();
    let guard = 0;
    let again = true;

    while(again && guard++ < 8){
      again = false;
      switch(this._state){
        case 'PROCESS':
          if(now >= this._until){
            this._nextSlotCursor++;
            if(this._nextSlotCursor < this._activeSlots.length){
              // Become IDLE so upstream sees this slot ready
              this._state = 'IDLE';
              this._currentWork = null;
              again = true;
            }else{
              // All inputs collected; proceed to output wait/down
              const firstSlot = this._activeSlots[0];
              this._payload = this._worksBySlot[firstSlot] || null;
              this._handoffOffered = false;
              this._state = 'WAIT';
              this._setWaitIcon(true);
              again = true;
            }
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
            this._resetCycleData(true);
            again = true;
          }
          break;

        case 'IDLE': {
          if(!this._prepareCycleIfNeeded()) break;
          const immediate = this._acceptFromExpectedSlot(now);
          if(immediate) again = true;
          break;
        }
      }

      // Keep output visible at least one tick after entering DOWN.
      if(this._state === 'DOWN') break;
    }

    switch(this._state){
      case 'PROCESS': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
      case 'WAIT':    this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
      case 'DOWN':    this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
      case 'IDLE':    this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
      case 'ERROR':   this.color = '#e74c3c'; this.bgcolor = '#fdecea'; break;
    }
    if(typeof window.applyNodeStateTheme === 'function') window.applyNodeStateTheme(this, this._state);

    if(this._state !== 'IDLE' || this._payload) this.setDirtyCanvas(true,true);
  }

  onPropertyChanged(n){
    EquipmentNode.prototype.onPropertyChanged && EquipmentNode.prototype.onPropertyChanged.call(this, n);
    if(n === 'processTime2'){
      const clamp = v=> Math.max(0, Math.round(parseFloat(v||0)*10)/10);
      this.properties.processTime2 = clamp(this.properties.processTime2);
    }
    if(n === 'strictIdMatch'){
      this.properties.strictIdMatch = !!this.properties.strictIdMatch;
    }
  }

  canAcceptWorkInput(slotIndex, work){
    if(this._state !== 'IDLE') return false;
    if(!this._cycleActive && !this._prepareCycleIfNeeded()) return false;
    if(slotIndex !== this._expectedSlot()) return false;
    return typeof this._runtimeSelectInputRule !== 'function' || !!this._runtimeSelectInputRule(work, slotIndex);
  }

  onDrawForeground(ctx){
    const now = simNow();
    const rem = Math.max(0, this._until - now);
    const accepted = Object.keys(this._worksBySlot).length;
    const needed = this._cycleActive ? this._activeSlots.length : this._collectConnectedWorkSlots().length;
    const lines = [
      `State: ${this._state}`,
      this._currentWork ? `Work: ID=${this._currentWork.id} Type=${this._currentWork.type}` : 'Work: (none)',
      `Inputs: ${accepted}/${needed < 2 ? 2 : needed}`,
      `Remain(s): ${(rem/1000).toFixed(1)}`,
      `Proc1(s): ${this.properties.processTime}  ProcN(s): ${this.properties.processTime2}`,
      `Down(s): ${this.properties.downTime}`,
      `Strict ID Match: ${!!this.properties.strictIdMatch}  Mismatch: ${this._mergeMismatchCount || 0}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

menuMixin(MergeNode);
(function(proto){
  const prev = proto.getExtraMenuOptions;
  proto.getExtraMenuOptions = function(){
    let opts = prev ? prev.call(this) : [];
    if(!Array.isArray(opts)) opts = [];

    if(this.properties && Object.prototype.hasOwnProperty.call(this.properties,'flipIO')){
      const label = this.properties.flipIO ? 'Ports: reset alignment' : 'Ports: flip horizontally';
      let entry = opts.find(o=>o && typeof o.content==='string' && o.content.indexOf('Ports:')===0);
      const toggle = ()=>{
        this.properties.flipIO = !this.properties.flipIO;
        if(window.refreshFlipIO) window.refreshFlipIO(this);
      };
      if(entry){
        entry.content = label;
        entry.callback = toggle;
      }else{
        opts.push({ content: label, callback: toggle });
      }
    }

    return opts;
  };
})(MergeNode.prototype);

MergeNode.title = 'Merge';
window.MergeNode = MergeNode;
// Backward compatibility for old references/types.
window.Merge2Node = MergeNode;
