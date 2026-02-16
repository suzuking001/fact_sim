// Signal node: per-tick script execution for signal-only flow control

const SIGNAL_UI = {
  baseSize: [170, 60],
  signalHeightStep: 16
};

const SIGNAL_DEFAULT_SCRIPT = `// signalArr: [sigIn0, sigIn1, ...]
// nowSec: simulation time in seconds
// tick: local execute counter
//
// Output methods:
// 1) Return value:
//    - array  -> [sigOut0, sigOut1, ...]
//    - object -> { 0: value, sigOut1: value }
//    - other  -> sigOut0
// 2) Call this.setSigOut(index, value)

// default: pass-through sigIn0 -> sigOut0
if(signalArr.length > 0) return [signalArr[0]];
return undefined;`;

class SignalNode extends LiteGraph.LGraphNode{
  constructor(title = 'Signal'){
    super();
    this.title = title;
    this.size = SIGNAL_UI.baseSize.slice();
    this.resizable = true;
    this.color = '#3b82f6';
    this.bgcolor = '#eff6ff';
    this.properties = {
      script: SIGNAL_DEFAULT_SCRIPT,
      sigExtra: 1,
      sigEnabled: true
    };

    this._compiled = null;
    this._outState = [];
    this._tickCount = 0;
    this._lastError = '';

    this._syncSignalPorts();
    if(window.enableFlipIO) window.enableFlipIO(this);
  }

  _sigInputSlots(){
    const slots = [];
    if(!Array.isArray(this.inputs)) return slots;
    for(let i = 0; i < this.inputs.length; i++){
      const p = this.inputs[i];
      if(p && /^sigIn\d+$/.test(String(p.name || ''))) slots.push(i);
    }
    return slots;
  }

  _sigOutputSlots(){
    const rows = [];
    if(!Array.isArray(this.outputs)) return rows;
    for(let i = 0; i < this.outputs.length; i++){
      const p = this.outputs[i];
      const m = String(p?.name || '').match(/^sigOut(\d+)$/);
      if(!m) continue;
      rows.push({ slotIndex: i, sigIndex: Number(m[1]) });
    }
    rows.sort((a, b) => a.sigIndex - b.sigIndex);
    return rows;
  }

  _normalizeStateSize(){
    const count = this._sigOutputSlots().length;
    if(!Array.isArray(this._outState)) this._outState = [];
    while(this._outState.length < count) this._outState.push(null);
    if(this._outState.length > count) this._outState.length = count;
  }

  _updateNodeSize(){
    const sigCount = Math.max(
      Number(this.properties.sigExtra) || 0,
      this._sigInputSlots().length,
      this._sigOutputSlots().length
    );
    this.size[1] = SIGNAL_UI.baseSize[1] + sigCount * SIGNAL_UI.signalHeightStep;
    if(typeof this.computeSize === 'function') this.computeSize();
  }

  _syncSignalPorts(){
    syncSigPorts(this, 0);
    this._normalizeStateSize();
    this._updateNodeSize();
    try{
      window.refreshFlipIO(this);
    }catch(_e){}
    this.setDirtyCanvas(true, true);
  }

  setSigOut(index, value){
    const i = Number(index);
    if(!isFinite(i)) return;
    if(i < 0) return;
    this._normalizeStateSize();
    if(i >= this._outState.length) return;
    this._outState[i] = value;
  }

  getSigOut(index){
    const i = Number(index);
    if(!isFinite(i)) return null;
    if(i < 0) return null;
    this._normalizeStateSize();
    if(i >= this._outState.length) return null;
    return this._outState[i];
  }

  _compileScript(){
    if(this._compiled) return;
    try{
      this._compiled = new Function('signalArr', 'nowSec', 'tick', this.properties.script || '');
      this._lastError = '';
    }catch(err){
      this._compiled = null;
      this._lastError = String(err?.message || err || 'compile error');
      console.error(err);
    }
  }

  _evalScript(signalArr, nowSec, tick){
    this._compileScript();
    if(!this._compiled) return undefined;
    try{
      this._lastError = '';
      return this._compiled.call(this, signalArr, nowSec, tick);
    }catch(err){
      this._lastError = String(err?.message || err || 'runtime error');
      console.error(err);
      return undefined;
    }
  }

  _applyResult(result){
    if(typeof result === 'undefined') return;
    this._normalizeStateSize();
    if(Array.isArray(result)){
      for(let i = 0; i < this._outState.length; i++){
        this._outState[i] = (i < result.length) ? result[i] : this._outState[i];
      }
      return;
    }
    if(result && typeof result === 'object'){
      Object.keys(result).forEach((k)=>{
        let idx = null;
        if(/^\d+$/.test(k)) idx = Number(k);
        else{
          const m = String(k).match(/^sigOut(\d+)$/);
          if(m) idx = Number(m[1]);
        }
        if(idx === null || idx < 0 || idx >= this._outState.length) return;
        this._outState[idx] = result[k];
      });
      return;
    }
    if(this._outState.length > 0) this._outState[0] = result;
  }

  onConfigure(){
    this._syncSignalPorts();
  }

  onPropertyChanged(name){
    if(name === 'sigExtra'){
      const n = Math.max(0, Math.floor(Number(this.properties.sigExtra) || 0));
      this.properties.sigExtra = n;
      this._syncSignalPorts();
      return;
    }
    if(name === 'script'){
      this._compiled = null;
      this._lastError = '';
      return;
    }
  }

  onExecute(){
    this._tickCount++;
    const nowSec = simNow() / 1000;

    const sig = [];
    for(let i = 0;; i++){
      const idx = this.inputs.findIndex((x) => x && x.name === `sigIn${i}`);
      if(idx < 0) break;
      sig.push(this.getInputData(idx));
    }

    const result = this._evalScript(sig, nowSec, this._tickCount);
    this._applyResult(result);
    this._normalizeStateSize();

    const outRows = this._sigOutputSlots();
    for(let i = 0; i < outRows.length; i++){
      const slotIndex = outRows[i].slotIndex;
      const v = this.properties.sigEnabled ? this._outState[i] : null;
      this.setOutputData(slotIndex, (typeof v === 'undefined') ? null : v);
    }

    this.setDirtyCanvas(true, true);
  }

  onDrawForeground(ctx){
    const lines = [
      'Mode: tick script',
      `Tick: ${this._tickCount}`,
      `Sig: enabled=${!!this.properties.sigEnabled} extra=${this.properties.sigExtra}`,
      this._lastError ? `Error: ${this._lastError}` : 'Error: (none)'
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

menuMixin(SignalNode);
SignalNode.title = 'Signal';
window.SignalNode = SignalNode;
