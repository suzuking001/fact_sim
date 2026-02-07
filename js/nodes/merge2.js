// Merge2 node: two-input merge that processes in two stages (process1, process2)
// Inherits timing helpers and menu utilities via EquipmentNode

const MERGE2_DEFAULT_SCRIPT = `// work: Work object (work.id, work.type, etc.)
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

class Merge2Node extends EquipmentNode{
  constructor(title='Merge2'){
    super(title);
    this.title = 'Merge2';
    // Rebuild ports: two work inputs, one work output
    this.inputs = [];
    this.addInput('workIn1', 0);
    this.addInput('workIn2', 0);
    // keep single workOut from EquipmentNode constructor
    // State & internals
    this._state = 'IDLE';
    this._until = 0;
    this._work1 = null;
    this._work2 = null;
    this._payload = null;
    this._handoffOffered = false;
    this._lastIn1Ref = null;
    this._lastIn2Ref = null;
    this._awaitingIn2 = false; // after PROCESS1 completes, wait for input2
    // initial colors (IDLE = yellow)
    this.color = '#f1c40f';
    this.bgcolor = '#fff9db';

    if(this.properties.script === defaultScript()){
      this.properties.script = MERGE2_DEFAULT_SCRIPT;
    }
    const clamp = v=> Math.max(0, Math.round(parseFloat(v||0)*10)/10);
    if(typeof this.properties.processTime2 === 'undefined')
      this.properties.processTime2 = this.properties.processTime;
    this.properties.processTime2 = clamp(this.properties.processTime2);
    // ensure flip menu wrapper is reapplied (menuMixin runs after class definition)
    if(this.constructor && this.constructor.prototype.__flipMenuPatched) delete this.constructor.prototype.__flipMenuPatched;
    if(window.enableFlipIO) window.enableFlipIO(this);
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

  onExecute(){
    // clear currentWork when truly idle
    if(this._state === 'IDLE') this._currentWork = null;

    const now = simNow();
    switch(this._state){
      case 'PROCESS1':
        if(now >= this._until){
          // Expose as IDLE so upstream of input2 will offer; accept in IDLE branch
          this._awaitingIn2 = true;
          this._state = 'IDLE';
          this._currentWork = null;
        }
        break;

      case 'PROCESS2':
        if(now >= this._until){
          // finished both → prepare to handoff
          this._payload = this._work1; // ids must match
          this._handoffOffered = false;
          this._state = 'WAIT';
          this._setWaitIcon(true);
        }
        break;

      case 'WAIT': {
        // WAIT: downstream ready -> start DOWN and emit immediately
        if(this._downReady()){
          const payload = this._payload;
          this._setWaitIcon(false);
          this._state = 'DOWN';
          this._until = now + this.properties.downTime*1000;
          this.setOutputData(0, payload);
          try{ this._spawnSinkTransfer && this._spawnSinkTransfer(this.properties.downTime*1000, payload); }catch(_e){}
          this._payload = null;
        }else{
          this.setOutputData(0, null);
        }
        break;
      }

      case 'DOWN':
        if(now >= this._until){
          // Reset for next pair
          this.setOutputData(0, null);
          this._state = 'IDLE';
          this._work1 = null; this._work2 = null; this._payload = null;
          this._currentWork = null;
          this._lastIn1Ref = null; this._lastIn2Ref = null;
          this._handoffOffered = false;
        }
        break;

      case 'ERROR':
        // stay here; user can reset the graph
        break;

      case 'IDLE': {
        if(!this._awaitingIn2){
          // accept from input1
          const in1 = (this.inputs && this.inputs[0]) ? this.inputs[0] : null;
          const link1 = !!(in1 && in1.link != null);
          if(!link1){ this._lastIn1Ref = null; break; }
          const w1 = this.getInputData(0);
          if(!w1){ this._lastIn1Ref = null; break; }
          if(typeof w1 !== 'object') break;
          if(this._lastIn1Ref === w1) break; // not a new arrival
          // accept first work and start PROCESS1
          this._work1 = w1;
          this._currentWork = w1; // so upstream can detect acceptance
          this._state = 'PROCESS1';
          const duration1 = Math.max(0, this.properties.processTime*1000);
          this._until = now + duration1;
          this._triggerProcessAnimation(0, duration1, { id: w1.id, t: w1.type });
          this._lastIn1Ref = w1;
          break;
        } else {
          // awaiting second input
          const in2 = (this.inputs && this.inputs[1]) ? this.inputs[1] : null;
          const link2 = !!(in2 && in2.link != null);
          if(!link2){ this._lastIn2Ref = null; break; }
          const w2 = this.getInputData(1);
          if(!w2){ this._lastIn2Ref = null; break; }
          if(typeof w2 !== 'object') break;
          if(this._lastIn2Ref === w2) break; // not a new arrival
          // compare IDs
          if(!this._work1 || w2.id !== this._work1.id){
            try{ alert(`Merge2 ID mismatch: in1=${this._work1?this._work1.id:'-'} in2=${w2.id}`); }catch(_e){}
            try{ this.graph && this.graph.stop && this.graph.stop(); }catch(_e){}
            this._state = 'ERROR';
            break;
          }
          // accept second work and start PROCESS2
          this._work2 = w2;
          this._currentWork = w2;
          this._state = 'PROCESS2';
          const duration2 = Math.max(0, (this.properties.processTime2||0)*1000);
          this._until = now + duration2;
          this._triggerProcessAnimation(1, duration2, { id: w2.id, t: w2.type });
          this._lastIn2Ref = w2;
          this._awaitingIn2 = false;
          break;
        }
      }
    }

    // color mapping for visual feedback
    switch(this._state){
      case 'PROCESS1':
      case 'PROCESS2': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
      case 'WAIT':     this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
      case 'DOWN':     this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
      case 'IDLE':     this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
      case 'ERROR':    this.color = '#e74c3c'; this.bgcolor = '#fdecea'; break;
    }
    if(this._state !== 'IDLE' || this._payload) this.setDirtyCanvas(true,true);
  }

  // show status below the node
  onDrawForeground(ctx){
    const now = simNow();
    const rem = Math.max(0, this._until - now);
    const remSec = (rem/1000).toFixed(1);
    const lines = [
      `State: ${this._state}`,
      this._work1 ? `In1: ID=${this._work1.id} Type=${this._work1.type}` : 'In1: (none)',
      this._work2 ? `In2: ID=${this._work2.id} Type=${this._work2.type}` : 'In2: (none)',
      `Remain(s): ${remSec}`,
      `Proc1(s): ${this.properties.processTime}  Proc2(s): ${this.properties.processTime2}`,
      `Down(s): ${this.properties.downTime}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }

  onPropertyChanged(n){
    EquipmentNode.prototype.onPropertyChanged && EquipmentNode.prototype.onPropertyChanged.call(this, n);
    if(n === 'processTime2'){
      const clamp = v=> Math.max(0, Math.round(parseFloat(v||0)*10)/10);
      this.properties.processTime2 = clamp(this.properties.processTime2);
    }
  }

  // Downstream readiness check for upstream nodes
  canAcceptWorkInput(slotIndex){
    if(this._state !== 'IDLE') return false;
    if(slotIndex === 0) return !this._awaitingIn2;
    if(slotIndex === 1) return !!this._awaitingIn2;
    return false;
  }
}

menuMixin(Merge2Node);
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
})(Merge2Node.prototype);
// Ensure palette/menu shows proper name
Merge2Node.title = 'Merge2';
window.Merge2Node = Merge2Node;







