// Equipment node
const EQUIP_UI = {
  baseSize: [150, 50],
  widgetPaddingX: 30,
  widgetSpacingBottom: { top: 60, gap: 28 },
  widgetMinWidth: 120,
  signalHeightStep: 16
};
/*
 * EquipmentNode
 *
 * Overview:
 *   Moves Work received through workIn through PROCESS, release, DOWN, and IDLE.
 *   A node-level script can determine whether an incoming Work item is accepted.
 *
 * Time units:
 *   processTime and downTime are stored in seconds and converted to milliseconds
 *   for comparisons. simNow() returns simulation time in milliseconds.
 *
 * Main states:
 *   - IDLE    : Waiting for input; no active Work item.
 *   - PROCESS : Processing until processTime elapses, then transitions to WAIT.
 *   - WAIT    : Waiting for downstream acceptance, then releases and enters DOWN.
 *   - DOWN    : Recovering until downTime elapses, then returns to IDLE.
 *
 * Script:
 *   A small function editable through the Edit Script context-menu command.
 *   Returning true accepts and processes the item; false passes it through.
 *   The second argument, signalArr, contains values collected from sigIn* ports.
 *
 * Signal ports:
 *   Emits the current state (IDLE/PROCESS/WAIT/DOWN) through sigOut*.
 *   Changing sigExtra adds or removes sigIn* and sigOut* ports.
 *
 * Display:
 *   The node overlay shows State, active Work, remaining time, Proc/Down, and Sig.
 */

class EquipmentNode extends LiteGraph.LGraphNode{
  constructor(title='Equip'){
    super();
    this.title = title;
    this.size = EQUIP_UI.baseSize.slice();
    this.resizable = true;
    this.addInput('workIn', 0);
    this.addOutput('workOut', 0);
    // Time properties are stored in seconds.
    this.properties = {
      processTime: (window.NODES_CONFIG?.equipment?.processTimeSec ?? 2),
      downTime: (window.NODES_CONFIG?.equipment?.downTimeSec ?? 3),
      script: defaultScript(),
      sigExtra: 0,
      sigEnabled: true,

    };    // Runtime state, time boundary, and held payload.
    this._state = 'IDLE';
    this._until = 0;
    this._payload = null;
    this._compiled = null;
    this._last = [];
    this._currentWork = null;
    
    this._lastInRef = null; // last seen input object
    this._handoffOffered = false; // Prevent duplicate output offers while in WAIT.
    // initial colors (IDLE = yellow)
    this.color = '#f1c40f';   // border (yellow)
    this.bgcolor = '#fff9db'; // fill   (light yellow)

    try{ this._syncSignalPorts(); }catch(e){}
    if(window.enableFlipIO) window.enableFlipIO(this);
  }
  _setWaitIcon(active, type="work"){
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      const out = this.outputs && this.outputs[0];
      if(!out || !out.links) return;
      const payload = this._payload || this._currentWork || null;
      const info = (type === 'work' && payload) ? { id: payload.id, t: payload.type, entity: payload } : null;
      if(active){
        if(this._waitIconLinks) return;
        this._waitIconLinks = out.links.slice();
        this._waitIconLinks.forEach(id=> window.WorkLinkAnimator.showPortIcon(this.graph, id, type, info));
      }else{
        if(!this._waitIconLinks) return;
        this._waitIconLinks.forEach(id=> window.WorkLinkAnimator.hidePortIcon(this.graph, id));
        this._waitIconLinks = null;
      }
    }catch(_e){}
  }
  _spawnSinkTransfer(duration, payload){
    if(!duration || duration <= 0) return;
    try{
      if(!window.WorkLinkAnimator || !this.graph) return;
      const info = payload ? { id: payload.id, t: payload.type, entity: payload } : null;
      const out = this.outputs && this.outputs[0];
      if(!out || !out.links) return;
      out.links.forEach(id=>{
        const link = this.graph.links[id]; if(!link) return;
        const target = this.graph.getNodeById(link.target_id);
        const sinkCtor = window.SinkNode;
        const isSink = !!target && (target.properties?.presetId === 'sink'
          || (sinkCtor && target instanceof sinkCtor)
          || target.title === 'Sink');
        if(isSink) window.WorkLinkAnimator.spawn(this.graph, id, 'work', duration, info);
      });
    }catch(_e){}
  }
  // Compile the script when needed. true accepts; false passes through.
  _evalScript(w, s){
    if(this.properties && this.properties.scriptDisabled){
      // Safe mode for imported/shared graphs: skip user script execution.
      return true;
    }
    if(!this._compiled){
      const source = (typeof this.properties?.script === 'string' && this.properties.script.trim())
        ? this.properties.script
        : 'return true;';
      try{ this._compiled = new Function('work','signalArr', source); }
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
  // Advance the state machine on each LiteGraph evaluation.
  onExecute(){
    // Clear the displayed Work item while IDLE.
    if(this._state === 'IDLE') this._currentWork = null;

    // Collect the variable number of sigIn* values in port order.
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
          // Processing: transition to WAIT when the configured time elapses.
          if(now >= this._until){
            this._state = 'WAIT';
            this._handoffOffered = false;
            this._setWaitIcon(true);
            again = true; // allow immediate WAIT->DOWN if ready
          }
          break;
        case 'WAIT': {
          // Release wait: begin DOWN as soon as downstream can accept the item.
          if(this._downReady()){
            const payload = this._payload;
            this._setWaitIcon(false);
            this._state = 'DOWN';
            const downMs = Math.max(0, this.properties.downTime*1000);
            this._until = now + downMs; // ms
            // Publish workOut immediately when transfer begins.
            this.setOutputData(0, payload);
            this._spawnSinkTransfer(downMs, payload);
            this._payload = null;
          }else{
            this.setOutputData(0, null);
          }
          break;
        }
        case 'DOWN':
          // Recovery: return to IDLE when downTime elapses.
          if(now >= this._until){
            this.setOutputData(0, null);
            this._state = 'IDLE';
            this._setWaitIcon(false);
            again = true; // allow immediate IDLE accept if input already present
          }
          break;
        case 'IDLE': {
          // IDLE: evaluate incoming Work when available.
          const in0 = (this.inputs && this.inputs[0]) ? this.inputs[0] : null;
          const hasLink = !!(in0 && in0.link != null);
          if(!hasLink) break;
          const w = this.getInputData(0);
          if(!w){ this._lastInRef = null; break; }
          if(typeof w !== 'object') break;
          // LiteGraph links retain values, so ignore the same object reference.
          if(this._lastInRef === w) break;
          // Pass through without processing when the script returns false.
          if(!this._evalScript(w, sig)){
            this.setOutputData(0, w);
            break;
          }
          // Accept the item and begin PROCESS.
          this._currentWork = w;
          this._payload = w;
          this._state = 'PROCESS';
          const durationMs = Math.max(0, this.properties.processTime*1000);
          this._until = now + durationMs; // ms
          this._lastInRef = w; // remember last accepted input to avoid duplicate starts
          try{
            if(durationMs > 0 && window.WorkLinkAnimator && this.graph){
              const inPort = this.inputs && this.inputs[0];
              if(inPort && inPort.link != null){
                const info = (w && typeof w === 'object') ? { id: w.id, t: w.type, entity: w } : null;
                window.WorkLinkAnimator.spawn(this.graph, inPort.link, 'work', durationMs, info);
              }
            }
          }catch(_e){}
          if(durationMs === 0) again = true; // allow immediate PROCESS->WAIT chain
          break;
        }
      }
      // If we just started DOWN, keep output visible at least one tick.
      if(this._state === 'DOWN') break;
    }

    // Emit state changes through sigOut*.
    const n = this.properties.sigExtra || 0;
    for(let i=0;i<n;i++) this._emit(i, this._state);
    switch(this._state){
      case 'PROCESS': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
      case 'WAIT':    this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
      case 'DOWN':    this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
      case 'IDLE':    this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
    }
    if(typeof window.applyNodeStateTheme === 'function') window.applyNodeStateTheme(this, this._state);

    // Refresh rendering while the node is active.
    if(this._state !== 'IDLE' || this._payload) this.setDirtyCanvas(true,true);
  }
  _reflowWidgets(){}
  _syncSignalPorts(){
    syncSigPorts(this, 0);
    this._updateNodeSize();
    window.refreshFlipIO(this);
    this.setDirtyCanvas(true,true);
  }
  _updateNodeSize(){
    const extra = this.properties.sigExtra || 0;
    const targetHeight = EQUIP_UI.baseSize[1] + extra * EQUIP_UI.signalHeightStep;
    if(this.size[1] !== targetHeight){
      this.size[1] = targetHeight;
      if(this.computeSize) this.computeSize();
    }
    this._reflowWidgets();
    window.refreshFlipIO(this);
  }
  onResize(size){
    try{ this._reflowWidgets(); }catch(e){}
  }
  // Reflect external property changes into widgets and handle dynamic ports
  onPropertyChanged(n){
    try{
      const r01 = v=> Math.max(0, Math.round(parseFloat(v||0)*10)/10);
      if(n==='processTime') this.properties.processTime = r01(this.properties.processTime);
      if(n==='downTime') this.properties.downTime = r01(this.properties.downTime);
      if(n==='sigExtra'){
        this._syncSignalPorts();
      }
      if(n==='script'){
        this._compiled = null;
        if(this.properties) this.properties.scriptDisabled = false;
      }
    }catch(e){}
  }
  // Determine whether every workOut destination can accept the item.
  _downReady(){
    // Without a connected output, the item remains in this node and stays in WAIT.
    if(!this.outputs.length) return false;
    const out = this.outputs[0];
    if(!out || !out.links || out.links.length === 0) return false;
    let hasValidLink = false;
    for(const id of out.links){
      const link = this.graph.links[id];
      if(!link) continue;
      hasValidLink = true;
      const t = this.graph.getNodeById(link.target_id);
      if(t && typeof t.canAcceptWorkInput === 'function'){
        if(!t.canAcceptWorkInput(link.target_slot, this._payload)) return false;
        continue;
      }
      // Nodes without _state, such as Sink, are treated as always available.
      if(t && typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
    }
    return hasValidLink;
  }
  // Draw the runtime state overlay below the node.
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
window.EquipmentNode = EquipmentNode;























