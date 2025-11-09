// Merge2 node: two-input merge that processes in two stages (process1, process2)
// Inherits timing helpers and menu utilities via EquipmentNode

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
        }
        break;

      case 'WAIT': {
        // Same handoff logic as Equipment
        if(!this._handoffOffered){
          if(this._downReady()){
            this.setOutputData(0, this._payload);
            this._handoffOffered = true;
          }
          break;
        }
        let accepted = false;
        if(this.outputs.length && this.outputs[0].links){
          for(const id of this.outputs[0].links){
            const link = this.graph.links[id]; if(!link) continue;
            const t = this.graph.getNodeById(link.target_id); if(!t) continue;
            if(typeof t._state === 'undefined'){ accepted = true; break; }
            if(t._currentWork === this._payload || t._payload === this._payload){ accepted = true; break; }
          }
        }
        if(accepted){
          // clear latched output and go DOWN
          this.setOutputData(0, null);
          this._payload = null;
          this._state = 'DOWN';
          this._until = now + this.properties.downTime*1000;
        }else{
          if(this._downReady()) this.setOutputData(0, this._payload);
        }
        break;
      }

      case 'DOWN':
        if(now >= this._until){
          // Reset for next pair
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
          this._until = now + this.properties.processTime*1000;
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
          this._until = now + this.properties.processTime*1000;
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
      `Proc(s): ${this.properties.processTime}  Down(s): ${this.properties.downTime}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

menuMixin(Merge2Node);
// Ensure palette/menu shows proper name
Merge2Node.title = 'Merge2';
window.Merge2Node = Merge2Node;
