// Nodes and related helpers

// Work ID counter and class
let workCounter = 0;
class Work{
  constructor(id=null, type='A'){
    this.id = id;
    this.type = type;
  }
  toString(){ return `ID:${this.id},Type:${this.type}`; }
}

// SigPort helpers
function syncSigPorts(node, base=3){
  const need = base + (node.properties.sigExtra || 0);
  let curIn = node.inputs.filter(i=>i.name.startsWith('sigIn')).length;
  let curOut = node.outputs.filter(o=>o.name.startsWith('sigOut')).length;
  for(let i=curIn;i<need;i++) node.addInput(`sigIn${i}`, 'string');
  for(let i=curOut;i<need;i++) node.addOutput(`sigOut${i}`, 'string');
  while(curIn>need){ curIn--; removeSigInput(node, curIn); }
  while(curOut>need){ curOut--; removeSigOutput(node, curOut); }
}
function removeSigInput(node, idx){
  const p = node.inputs.findIndex(p=>p.name===`sigIn${idx}`);
  if(p<0) return;
  if(node.inputs[p].link!=null) node.graph.removeLink(node.inputs[p].link);
  node.removeInput(p);
}
function removeSigOutput(node, idx){
  const p = node.outputs.findIndex(p=>p.name===`sigOut${idx}`);
  if(p<0) return;
  const out = node.outputs[p];
  if(out.links) [...out.links].forEach(id=>node.graph.removeLink(id));
  node.removeOutput(p);
}

// Menu mixin (script/properties & signal toggles)
function menuMixin(cls){
  cls.prototype.getExtraMenuOptions = function(){
    const opts = [];
    if(this.properties.script !== undefined){
      opts.push({
        content: 'Edit Script…',
        callback: ()=>{
          window.editingNode = this;
          scriptEditorTextarea.value = this.properties.script;
          document.getElementById('scriptEditorModal').style.display = 'block';
        }
      });
    }
    if(this.properties.processTime !== undefined || this.properties.downTime !== undefined){
      opts.push({
        content: 'Edit Properties…',
        callback: ()=>{
          const p = this.properties;
          if(p.processTime !== undefined){
            const v = prompt('ProcessTime (s):', p.processTime);
            if(v!=null && !isNaN(v)) p.processTime = +v;
          }
          if(p.downTime !== undefined){
            const v = prompt('DownTime (s):', p.downTime);
            if(v!=null && !isNaN(v)) p.downTime = +v;
          }
          this.setDirtyCanvas(true,true);
        }
      });
    }
    if(this.properties.sigEnabled !== undefined){
      opts.push({
        content: this.properties.sigEnabled ? 'Disable Signals' : 'Enable Signals',
        callback: ()=>{ this.properties.sigEnabled = !this.properties.sigEnabled; this.setDirtyCanvas(true,true); }
      });
    }
    const extra = this.properties.sigExtra || 0;
    opts.push({ content: 'Add Sig Port', callback: ()=>{ this.properties.sigExtra++; syncSigPorts(this); this.setDirtyCanvas(true,true); } });
    opts.push({ content: 'Remove Sig Port', disabled: extra===0, callback: ()=>{ if(extra===0) return; this.properties.sigExtra--; syncSigPorts(this); this.setDirtyCanvas(true,true); } });
    return opts;
  };
}

// Default script body
function defaultScript(){
  return `// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Example: simple type filter\nif(work.type!==\"A\") return false;\n\n// Custom logic can be added here.\nreturn true;`;
}

// EquipmentNode
class EquipmentNode extends LiteGraph.LGraphNode{
  constructor(title='Equip'){
    super();
    this.title = title;
    this.size = [230,200];
    this.addInput('workIn', 0);
    this.addOutput('workOut', 0);
    this.properties = {
      processTime: (window.NODES_CONFIG?.equipment?.processTimeSec ?? 2),
      downTime: (window.NODES_CONFIG?.equipment?.downTimeSec ?? 3),
      script: defaultScript(),
      sigExtra: 0,
      sigEnabled: true,
    };
    syncSigPorts(this);
    this._state = 'IDLE';
    this._until = 0;
    this._payload = null;
    this._compiled = null;
    this._last = [];
    this._currentWork = null;
  }
  _evalScript(w, s){
    if(!this._compiled){
      try{ this._compiled = new Function('work','signalArr', this.properties.script); }
      catch(e){ console.error(e); }
    }
    try{ return this._compiled ? this._compiled(w,s) : true; }
    catch(e){ console.error(e); return false; }
  }
  _emit(i,state){
    if(!this.properties.sigEnabled){ this.setOutputData(i+1, null); return; }
    if(this._last[i] !== state){ this.setOutputData(i+1, state); this._last[i] = state; }
    else this.setOutputData(i+1, null);
  }
  onExecute(){
    if(this._state === 'IDLE') this._currentWork = null;
    const sig = [];
    for(let i=0;;i++){
      const idx = this.inputs.findIndex(x=>x.name===`sigIn${i}`);
      if(idx<0) break;
      sig.push(this.getInputData(idx));
    }
    const now = simNow();
    switch(this._state){
      case 'PROCESS':
        if(now >= this._until) this._state = 'WAIT';
        break;
      case 'WAIT':
        if(this._downReady()){
          this.setOutputData(0, this._payload);
          this._payload = null;
          this._state = 'DOWN';
          this._until = now + this.properties.downTime*1000;
        }
        break;
      case 'DOWN':
        if(now >= this._until) this._state = 'IDLE';
        break;
      default: {
        const w = this.getInputData(0);
        if(!w) break;
        if(!this._evalScript(w, sig)){
          this.setOutputData(0, w);
          break;
        }
        this._currentWork = w;
        this._payload = w;
        this._state = 'PROCESS';
        this._until = now + this.properties.processTime*1000;
      }
    }
    const n = 3 + (this.properties.sigExtra||0);
    for(let i=0;i<n;i++) this._emit(i, this._state);
    if(this._state !== 'IDLE' || this._payload) this.setDirtyCanvas(true,true);
  }
  _downReady(){
    if(!this.outputs.length || !this.outputs[0].links) return true;
    for(const id of this.outputs[0].links){
      const t = this.graph.getNodeById(this.graph.links[id].target_id);
      // nodes without _state are always ready (e.g., Sink-like)
      if(t && typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
    }
    return true;
  }
  onDrawForeground(ctx){
    const now = simNow();
    const rem = Math.max(0, this._until - now);
    const remSec = (rem/1000).toFixed(1);
    const lines = [
      `State: ${this._state}`,
      this._currentWork ? `Work: ID=${this._currentWork.id} Type=${this._currentWork.type}` : 'Work: (none)',
      `Remain(s): ${remSec}`,
      `Proc(s): ${this.properties.processTime}  Down(s): ${this.properties.downTime}`,
      `Sig: enabled=${!!this.properties.sigEnabled} extra=${this.properties.sigExtra}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}
menuMixin(EquipmentNode);

// SourceNode
class SourceNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Source';
    this.size = [240,180];
    this.addOutput('workOut', 0);
    this.properties = {
      interval: (window.NODES_CONFIG?.source?.intervalSec ?? 2),
      sequence: 'A,B',
      sigExtra: 0,
      sigEnabled: true,
    };
    syncSigPorts(this);
    this._lastGen = 0;
    this._pending = null;
    this._seq = [];
    this._cursor = 0;
    this._outLast = [];
    this._parseSeq();
  }
  _parseSeq(){
    this._seq = [];
    this._cursor = 0;
    this.properties.sequence.split(/[\,\n]+/).forEach(t=>{ t=t.trim(); if(t) this._seq.push({id:null,type:t}); });
    if(!this._seq.length) this._seq.push({id:null,type:'A'});
  }
  _emit(i,m){
    if(!this.properties.sigEnabled){ this.setOutputData(i+1, null); return; }
    if(this._outLast[i] !== m){ this.setOutputData(i+1, m); this._outLast[i] = m; }
    else this.setOutputData(i+1, null);
  }
  onPropertyChanged(n){ if(n==='sequence') this._parseSeq(); if(n==='sigExtra') syncSigPorts(this); }
  onExecute(){
    const now = simNow();
    const need = 3 + (this.properties.sigExtra||0);
    const emitSig = (m)=>{ for(let i=0;i<need;i++) this._emit(i,m); };

    // Generate into pending if interval elapsed
    if(!this._pending){
      const lastGen = this._lastGen || 0;
      if(now - lastGen >= this.properties.interval*1000){
        if(!this._seq || !this._seq.length) this._parseSeq();
        const e = this._seq[this._cursor] || {type:'A'};
        const nid = workCounter + 1;
        this._pending = new Work(nid, e.type);
        this._cursor = (this._cursor + 1) % this._seq.length;
        this._lastGen = now;
      }
    }

    if(this._pending){
      // downstream readiness
      let ready = false;
      const out = this.outputs && this.outputs[0];
      if(out && out.links){
        for(const lid of out.links){
          const link = this.graph.links[lid]; if(!link) continue;
          const t = this.graph.getNodeById(link.target_id); if(!t) continue;
          if(typeof t._state === 'undefined' || t._state === 'IDLE'){ ready = true; break; }
        }
      }
      // Offer pending
      this.setOutputData(0, this._pending);
      if(ready){
        workCounter = this._pending.id;
        this._pending = null;
        emitSig('SEND');
      } else {
        emitSig('IDLE');
      }
      return;
    }

    this.setOutputData(0, null);
    emitSig('IDLE');
  }
}
menuMixin(SourceNode);

// Source: overlay to show internal info (seconds-based)
SourceNode.prototype.onDrawForeground = function(ctx){
  const now = simNow();
  const next = (this._seq && this._seq.length) ? this._seq[this._cursor] : {id:null,type:'A'};

  // downstream status
  let targetState = 'disconnected';
  const out = this.outputs && this.outputs[0];
  if(out && out.links){
    for(const lid of out.links){
      const link = this.graph.links[lid]; if(!link) continue;
      const t = this.graph.getNodeById(link.target_id); if(!t) continue;
      targetState = (typeof t._state === 'undefined') ? 'READY' : t._state;
      break;
    }
    if(targetState==='disconnected') targetState='unknown';
  }

  const hasPending = !!this._pending;
  const nextId = hasPending ? this._pending.id : (workCounter+1);
  const nextType = hasPending ? this._pending.type : (next?next.type:'A');
  const nextInSec = Math.max(0, (((this._lastGen||0) + this.properties.interval*1000 - now)/1000));

  const lines = [
    `Interval(s): ${this.properties.interval}`,
    hasPending ? `Pending: ID=${nextId} Type=${nextType}` : `Next: ID=${nextId} Type=${nextType}`,
    `Downstream: ${targetState}`,
    `NextIn(s): ${nextInSec.toFixed(1)}`,
    `Sig: enabled=${!!this.properties.sigEnabled} extra=${this.properties.sigExtra}`,
    `SeqLen: ${this._seq?this._seq.length:0} Cursor: ${this._cursor}`,
    `workCounter: ${workCounter}`
  ];
  drawStateBelow(ctx, this, lines, 8, 6);
};

// Split & Sink
class SplitNode extends EquipmentNode{
  constructor(){
    super('Split');
    this.addOutput('workB', 0);
    this.properties.ratio = 0.5;
  }
  _sendNow(w){ this.setOutputData(Math.random()<this.properties.ratio?0:1, w); }
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

class SinkNode extends LiteGraph.LGraphNode{
  constructor(){ super(); this.title='Sink'; this.addInput('workIn',0); this.size=[240,120]; this._recv=[]; this.properties={sigEnabled:true}; syncSigPorts(this); }
  onExecute(){ const d=this.getInputData(0); if(d){ this._recv.push(d); this._lastWork=d; this._lastAt=simNow(); this.tooltip=`Got:${this._recv.length}`; } }
  onDrawForeground(ctx){
    const last = this._lastWork;
    const lines = [
      `Recv: ${this._recv.length}`,
      last?`Last: ID=${last.id} Type=${last.type}`:'Last: (none)',
      last?`At(ms): ${this._lastAt|0}`:null,
      `Sig: enabled=${!!this.properties.sigEnabled} extra=${this.properties.sigExtra}`
    ].filter(Boolean);
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}
menuMixin(SplitNode); menuMixin(SinkNode);

// Register
function afterRegister(){
  LiteGraph.registerNodeType('factory/source', SourceNode);
  LiteGraph.registerNodeType('factory/equip',  EquipmentNode);
  LiteGraph.registerNodeType('factory/split',  SplitNode);
  LiteGraph.registerNodeType('factory/sink',   SinkNode);
}
afterRegister();

// Export globals that other scripts may use
window.syncSigPorts = syncSigPorts;
window.Work = Work;
window.workCounter = workCounter;
