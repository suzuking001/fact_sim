// =============================
// 0) 時間/速度 管理
// =============================
const graphElement = document.getElementById("graph");
let speed = 1, realAnchor = Date.now(), simAnchor = realAnchor;
function simNow(){ return simAnchor + (Date.now() - realAnchor) * speed; }
function setSpeed(v){ if(v<=0||v>100) return; const now=Date.now(); simAnchor = simNow(); realAnchor = now; speed = v; updateSimTime(); }
const speedInput = document.getElementById('speedInput');
speedInput.addEventListener('input', e => setSpeed(parseFloat(e.target.value)));
let simInterval, simStart, simAccum=0;
function simTimeMs(){ return simAccum + (simStart ? (simNow() - simStart) : 0); }
function updateSimTime(){ const elapsed = simTimeMs(); document.getElementById('simTime').textContent = (elapsed/1000).toFixed(2)+" s"; }

// =============================
// 0.5) Work flow visualization (moving tokens)
// =============================
// Simple animation of a dot moving along the outgoing link when a Work is emitted.
// Tokens are timed in simulation time (simNow) so speed scaling applies naturally.
const __tokens = [];
const TOKEN_PX_PER_SEC = 450; // visual transit speed (pixels/sec)

function __typeColor(t){
  switch(String(t||'').toUpperCase()){
    case 'A': return '#32d4c2';
    case 'B': return '#ffae42';
    case 'C': return '#a98bff';
    default:  return '#66ccff';
  }
}

function __spawnTokenForOutput(node, slotIndex, work){
  try{
    if(!node || !node.graph || !canvas) return;
    const out = node.outputs?.[slotIndex];
    if(!out || !out.links || !out.links.length) return;
    for(const linkId of out.links){
      const link = node.graph.links[linkId];
      if(!link) continue;
      const tgt = node.graph.getNodeById(link.target_id);
      if(!tgt) continue;
      // Connection points in canvas space
      const p0 = canvas.getConnectionPos(node, false, slotIndex);
      const p1 = canvas.getConnectionPos(tgt, true, link.target_slot);
      if(!p0 || !p1) continue;
      const dx = p1[0]-p0[0], dy = p1[1]-p0[1];
      const dist = Math.max(1, Math.hypot(dx,dy));
      const durMs = (dist / TOKEN_PX_PER_SEC) * 1000; // sim-ms
      const t0 = simTimeMs();
      __tokens.push({
        id: work.id,
        label: work.toString(),
        type: work.type,
        // store endpoints now, but also keep link refs for live recompute on drag
        p0: [p0[0], p0[1]],
        p1: [p1[0], p1[1]],
        srcId: node.id,
        slotIndex,
        linkId,
        tgtId: tgt.id,
        tgtSlot: link.target_slot,
        t0,
        t1: t0 + durMs,
        color: __typeColor(work.type)
      });
    }
  }catch{ /* no-op */ }
}

// Monkey-patch setOutputData to observe Work emissions and spawn tokens
(()=>{
  const orig = LiteGraph.LGraphNode.prototype.setOutputData;
  LiteGraph.LGraphNode.prototype.setOutputData = function(slot, data){
    try{
      if(data && typeof data === 'object' && data.constructor && data.constructor.name === 'Work'){
        __spawnTokenForOutput(this, slot, data);
      }
    }catch{ /* ignore */ }
    return orig.call(this, slot, data);
  };
})();

function __drawTokens(ctx){
  if(!__tokens.length) return;
  const now = simTimeMs();
  function resolveEndpoints(tk){
    try{
      const g = graph;
      if(!g || tk.linkId==null) return null;
      const src = g.getNodeById(tk.srcId);
      const link = g.links[tk.linkId];
      const tgt = g.getNodeById(tk.tgtId);
      if(!src || !link || !tgt) return null;
      const a = canvas.getConnectionPos(src, false, tk.slotIndex);
      const b = canvas.getConnectionPos(tgt, true, tk.tgtSlot);
      if(!a || !b) return null;
      return [[a[0],a[1]],[b[0],b[1]]];
    }catch{ return null; }
  }
  function roundRectPath(ctx,x,y,w,h,r){
    const rr = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.lineTo(x+w-rr, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+rr);
    ctx.lineTo(x+w, y+h-rr);
    ctx.quadraticCurveTo(x+w, y+h, x+w-rr, y+h);
    ctx.lineTo(x+rr, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-rr);
    ctx.lineTo(x, y+rr);
    ctx.quadraticCurveTo(x, y, x+rr, y);
  }
  // draw tokens in SCREEN space to avoid double transforms
  const prevComp = ctx.globalCompositeOperation;
  ctx.save();
  try{
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation = 'source-over';
    // filter and draw
  for(let i=__tokens.length-1;i>=0;i--){
    const tk = __tokens[i];
    const p = (now - tk.t0) / (tk.t1 - tk.t0);
    if(p >= 1){ __tokens.splice(i,1); continue; }
    // endpoints (live recompute so dragging nodes keeps tokens aligned)
    const live = resolveEndpoints(tk);
    const p0 = live? live[0] : tk.p0;
    const p1 = live? live[1] : tk.p1;
    const x = p0[0] + (p1[0]-p0[0]) * p;
    const y = p0[1] + (p1[1]-p0[1]) * p;
    const ang = Math.atan2(p1[1]-p0[1], p1[0]-p0[0]);
    // draw oriented rounded-rect token with label
    ctx.save();
    // trail
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = tk.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(x, y);
    ctx.stroke();
    // move to token center and orient
    ctx.translate(x, y);
    ctx.rotate(ang);
    // token halo for visibility on dark backgrounds
    ctx.save();
    ctx.rotate(-ang); // halo not rotated
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    // token body
    ctx.globalAlpha = 1.0;
    const w=26, h=16, r=6;
    roundRectPath(ctx, -w/2, -h/2, w, h, r);
    ctx.fillStyle = tk.color;
    ctx.fill();
    ctx.strokeStyle = '#0b0b0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // label (type)
    ctx.fillStyle = '#001015';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(tk.type || ''), 0, 0);
    ctx.restore();
  }
  }finally{
    ctx.restore();
    ctx.globalCompositeOperation = prevComp;
  }
}

// =============================
// 1) Work オブジェクト
// =============================
let workCounter = 0;
class Work {
  constructor(id=null,type="A",attrs={}){
    this.id = id ?? (++workCounter);
    this.type = type;
    this.attrs = attrs; // 任意属性
  }
  toString(){ return `ID:${this.id} Type:${this.type}`; }
}

// =============================
// 2) Signal ポート ヘルパ
// =============================
function countSigIn(node){ return node.inputs?.filter(i=> i && typeof i.name === 'string' && i.name.startsWith('sigIn')).length || 0; }
function countSigOut(node){ return node.outputs?.filter(o=> o && typeof o.name === 'string' && o.name.startsWith('sigOut')).length || 0; }
function syncSigPorts(node, base=3){
  const need = base + (node.properties.sigExtra||0);
  let curIn = countSigIn(node), curOut = countSigOut(node);
  for(let i=curIn;i<need;i++) node.addInput(`sigIn${i}`,"string");
  for(let i=curOut;i<need;i++) node.addOutput(`sigOut${i}`,"string");
  while(curIn>need){ curIn--; removeSigInput(node,curIn); }
  while(curOut>need){ curOut--; removeSigOutput(node,curOut); }
}
function removeSigInput(node,idx){
  const p = node.inputs.findIndex(p=> p?.name===`sigIn${idx}`);
  if(p<0) return;
  const port = node.inputs[p];
  if(port && port.link!=null) node.graph.removeLink(port.link);
  node.removeInput(p);
}
function removeSigOutput(node,idx){
  const p = node.outputs.findIndex(p=> p?.name===`sigOut${idx}`);
  if(p<0) return;
  const out = node.outputs[p];
  if(out && out.links) [...out.links].forEach(id => node.graph.removeLink(id));
  node.removeOutput(p);
}

// =============================
// 3) 右クリックメニュー Mixin
// =============================
function menuMixin(cls){
  cls.prototype.getExtraMenuOptions = function(){
    const opts=[];
    if(this.properties.script !== undefined){
      opts.push({ content:"Edit Script…", callback: ()=> openScriptEditor(this) });
    }
    if(this.properties.processTime !== undefined || this.properties.downTime !== undefined){
      opts.push({ content:"Edit Times…", callback: ()=>{
        const p=this.properties;
        if(p.processTime !== undefined){ const v = prompt("ProcessTime (ms):", p.processTime); if(v!=null&&!isNaN(v)) p.processTime=+v; }
        if(p.downTime !== undefined){ const v = prompt("DownTime (ms):", p.downTime); if(v!=null&&!isNaN(v)) p.downTime=+v; }
        this.setDirtyCanvas(true,true);
      }});
    }
    if(this.properties.sigEnabled !== undefined){
      opts.push({ content: this.properties.sigEnabled?"Disable Signals":"Enable Signals", callback: ()=>{ this.properties.sigEnabled=!this.properties.sigEnabled; this.setDirtyCanvas(true,true);} });
    }
    const extra = this.properties.sigExtra||0;
    opts.push({ content:"Add Sig Port", callback: ()=>{ this.properties.sigExtra++; syncSigPorts(this); this.setDirtyCanvas(true,true);} });
    opts.push({ content:"Remove Sig Port", disabled: extra===0, callback: ()=>{ if(extra===0) return; this.properties.sigExtra--; syncSigPorts(this); this.setDirtyCanvas(true,true);} });
    return opts;
  };
}

// =============================
// Script Editor (modal) + Inspector (side panel)
// =============================
const scriptEditorModal = document.getElementById('scriptEditorModal');
const scriptEditorTextarea = document.getElementById('scriptEditorTextarea');
const scriptNodeTitle = document.getElementById('scriptNodeTitle');
let editingNode = null;
scriptEditorModal.setAttribute('aria-hidden', 'true');
function openScriptEditor(node){
  editingNode = node;
  scriptNodeTitle.textContent = `Script: ${node.title}`;
  scriptEditorTextarea.value = node.properties.script ?? defaultScript();
  scriptEditorModal.setAttribute('aria-hidden', 'false');
}
function closeScript(){ scriptEditorModal.setAttribute('aria-hidden', 'true'); editingNode=null; }

document.getElementById('scriptEditorSave').onclick = ()=>{
  if(editingNode){ editingNode.properties.script = scriptEditorTextarea.value; editingNode._compiled = null; editingNode.setDirtyCanvas(true,true); }
  closeScript();
};

document.getElementById('scriptEditorCancel').onclick = ()=> closeScript();

// Inspector
const insp = document.getElementById('inspector');
const inspTitle = document.getElementById('inspTitle');
const inspPropsBox = document.getElementById('inspProps');
const btnOpenScript = document.getElementById('btnOpenScript');
const btnApply = document.getElementById('btnApply');
let selectedNode = null;

function renderInspector(node){
  if(!node){ insp.hidden = true; return; }
  insp.hidden = false; selectedNode = node;
  inspTitle.value = node.title;
  inspPropsBox.innerHTML = '';
  // Render known properties
  const p = node.properties || {};
  for(const key of Object.keys(p)){
    if(key==="script") continue; // Dedicated button
    const val = p[key];
    const row = document.createElement('div'); row.className='row';
    const lab = document.createElement('label'); lab.textContent=key; row.appendChild(lab);
    const input = (key==="sequence"||key==="expression")? document.createElement('textarea'): document.createElement('input');
    input.value = typeof val==='object'? JSON.stringify(val): val;
    input.dataset.key = key; row.appendChild(input);
    inspPropsBox.appendChild(row);
  }
}

btnOpenScript.onclick = ()=>{ if(selectedNode && selectedNode.properties.script!==undefined) openScriptEditor(selectedNode); };
btnApply.onclick = ()=>{
  if(!selectedNode) return;
  selectedNode.title = inspTitle.value || selectedNode.title;
  // apply props
  const inputs = inspPropsBox.querySelectorAll('input,textarea');
  inputs.forEach(inp=>{
    const k = inp.dataset.key; let v = inp.value;
    // try number
    if(!isNaN(v) && v.trim()!=='') v = +v; 
    else if((v.startsWith('{') && v.endsWith('}'))||(v.startsWith('[')&&v.endsWith(']'))){
      try{ v = JSON.parse(v); }catch{ /* keep string */ }
    }
    selectedNode.properties[k] = v;
  });
  // keep sig ports in sync if needed
  if(selectedNode.properties.sigExtra !== undefined) syncSigPorts(selectedNode);
  selectedNode.setDirtyCanvas(true,true);
};

// =============================
// 4) Script デフォルト (長文テンプレート)
// =============================
function defaultScript(){ return `// === Script API ===\n// function(work, signalArr) -> boolean | object\n//  - Return false to REJECT the incoming work (pass-through to next).\n//  - Return true to ACCEPT and process normally.\n//  - Or return {accept:true, nextType:'B', mutate:{key:val}} to mutate work before processing.\n//\n// Available node state strings: 'IDLE','PROCESS','WAIT','DOWN'\n// You can read signals: signalArr[i] might be 'SEND','IDLE', or any upstream custom string.\n// You can also EMIT your own signal text by setting this._customSignal = 'ANY_TEXT';\n//\n// Examples:\n// 1) フィルタ: TypeがAでなければ受け付けず、素通し\nif(work.type !== 'A'){ return false; }\n\n// 2) Typeを書き換えて処理\n//return { accept:true, nextType:'B' };\n\n// 3) 属性を更新\n//return { accept:true, mutate:{ passedEquip: (work.attrs.passedEquip||0)+1 } };\n\nreturn true;`; }

// =============================
// 5) 基本ノード
// =============================
class EquipmentNode extends LiteGraph.LGraphNode{
  constructor(title='Equip'){
    super();
    this.title = title; this.size=[260,150];
    this.addInput('workIn',0);
    this.addOutput('workOut',0);
    this.properties = { processTime: 2000, downTime: 3000, script: defaultScript(), sigExtra: 0, sigEnabled: true };
    syncSigPorts(this);
    this._state='IDLE'; this._until=0; this._payload=null; this._compiled=null; this._last=[]; this._currentWork=null; this._customSignal = null;
  }
  _compile(){ if(!this._compiled){ try{ this._compiled = new Function('work','signalArr', this.properties.script); }catch(e){ console.error('[Script compile error]', e); this._compiled=null; } } }
  _evalScript(w,s){ this._compile(); try{ return this._compiled? this._compiled(w,s): true; }catch(e){ console.error('[Script run error]', e); return true; } }
  _emit(i,msg){ if(!this.properties.sigEnabled){ this.setOutputData(i+1,null); return; }
    const outMsg = this._customSignal ?? msg; // custom overrides
    if(this._last[i]!==outMsg){ this.setOutputData(i+1,outMsg); this._last[i]=outMsg; }
    else this.setOutputData(i+1,null);
  }
  _downReadyForPort(portIndex=0){
    const out = this.outputs[portIndex]; if(!out || !out.links) return true;
    for(const id of out.links){ const link = this.graph.links[id]; const t = this.graph.getNodeById(link.target_id); if(t && t._state !== 'IDLE') return false; }
    return true;
  }
  onExecute(){
    if(this._state==='IDLE') this._currentWork=null;
    const signals=[]; for(let i=0;;i++){ const idx=this.inputs.findIndex(x=>x?.name===`sigIn${i}`); if(idx<0) break; signals.push(this.getInputData(idx)); }
    const now = simNow();
    switch(this._state){
      case 'PROCESS': if(now>=this._until) this._state='WAIT'; break;
      case 'WAIT': if(this._downReadyForPort(0)){ this.setOutputData(0,this._payload); this._payload=null; this._state='DOWN'; this._until=now+this.properties.downTime; } break;
      case 'DOWN': if(now>=this._until) this._state='IDLE'; break;
      default: { // IDLE
        const w = this.getInputData(0);
        if(!w) break;
        // evaluate script
        this._customSignal=null; // reset
        const r = this._evalScript(w,signals);
        if(r===false){ // reject -> pass-through immediately
          this.setOutputData(0,w);
        }else{
          let ww = w;
          if(r && typeof r==='object'){
            if(r.nextType) ww = new Work(w.id, r.nextType, w.attrs);
            if(r.mutate && typeof r.mutate==='object') Object.assign(ww.attrs, r.mutate);
          }
          this._currentWork = ww; this._payload=ww; this._state='PROCESS'; this._until=now+this.properties.processTime;
        }
      }
    }
    const n = 3+(this.properties.sigExtra||0);
    for(let i=0;i<n;i++) this._emit(i,this._state);
    if(this._state!=='IDLE' || this._payload) this.setDirtyCanvas(true,true);
  }
  onDrawForeground(ctx){
    ctx.fillStyle="#FFF"; ctx.font="12px sans-serif";
    const h=this.size[1];
    if(this._currentWork) ctx.fillText(`${this._currentWork}`,8,h-36);
    ctx.fillText(`State:${this._state}`,8,h-18);
  }
}
menuMixin(EquipmentNode);

class SourceNode extends LiteGraph.LGraphNode{
  constructor(){
    super(); this.title='Source'; this.size=[260,150];
    this.addOutput('workOut',0);
    this.properties={ interval:2000, sequence:'A,B', sigExtra:0, sigEnabled:true };
    syncSigPorts(this);
    this._last=0; this._seq=[]; this._cursor=0; this._outLast=[];
    this._parseSeq();
  }
  _parseSeq(){ this._seq=[]; this._cursor=0; this.properties.sequence.split(/[\,\n]+/).forEach(t=>{ t=t.trim(); if(t) this._seq.push({id:null,type:t}); }); if(!this._seq.length) this._seq.push({id:null,type:'A'}); }
  onPropertyChanged(n){ if(n==='sequence') this._parseSeq(); if(n==='sigExtra') syncSigPorts(this); }
  _emit(i,m){ if(!this.properties.sigEnabled){ this.setOutputData(i+1,null); return; } if(this._outLast[i]!==m){ this.setOutputData(i+1,m); this._outLast[i]=m; } else this.setOutputData(i+1,null); }
  onExecute(){ const now=simNow(), need=3+(this.properties.sigExtra||0);
    if(now - this._last >= this.properties.interval){ this._last=now; const e=this._seq[this._cursor]; this.setOutputData(0,new Work(e.id,e.type)); this._cursor=(this._cursor+1)%this._seq.length; for(let i=0;i<need;i++) this._emit(i,'SEND'); }
    else{ for(let i=0;i<need;i++) this._emit(i,'IDLE'); this.setOutputData(0,null); }
  }
}
menuMixin(SourceNode);

class SinkNode extends LiteGraph.LGraphNode{
  constructor(){ super(); this.title='Sink'; this.addInput('workIn',0); this.size=[220,90]; this._recv=0; this._lastWork='-'; this.properties={sigEnabled:true}; syncSigPorts(this); }
  onExecute(){ const d=this.getInputData(0); if(d){ this._recv++; this._lastWork=d.toString(); updateHud(); } }
  onDrawForeground(ctx){ ctx.fillStyle="#FFF"; ctx.font="12px sans-serif"; ctx.fillText(`Count:${this._recv}`,8,18); ctx.fillText(this._lastWork,8,36); }
}
menuMixin(SinkNode);

// Router / Splitter (2出力, ratio or expression)
class SplitNode extends EquipmentNode{
  constructor(){ super('Split'); this.size=[280,160];
    // ensure two work outputs
    if(this.outputs.length<2){ this.addOutput('workB',0); }
    this.properties.ratio = 0.5; // 0..1 -> port0 else port1
    this.properties.mode = 'ratio'; // 'ratio' or 'expr'
    this.properties.expression = "work.type==='A'?0:1"; // which port index
  }
  _choosePort(w){
    if(this.properties.mode==='expr'){
      try{ const fn = new Function('work','attrs',`return (${this.properties.expression});`); const idx = fn(w,w.attrs); return (idx===1)?1:0; }catch(e){ console.warn('expr error',e); return 0; }
    }
    return (Math.random() < this.properties.ratio)?0:1;
  }
  onExecute(){
    const now=simNow();
    const signals=[]; for(let i=0;;i++){ const idx=this.inputs.findIndex(x=>x?.name===`sigIn${i}`); if(idx<0) break; signals.push(this.getInputData(idx)); }
    switch(this._state){
      case 'PROCESS': if(now>=this._until) this._state='WAIT'; break;
      case 'WAIT': {
        const port = this._selectedPort ?? 0;
        if(this._downReadyForPort(port)){
          this.setOutputData(port, this._payload);
          this._payload=null; this._state='DOWN'; this._until=now+this.properties.downTime; this._selectedPort=null;
        }
      } break;
      case 'DOWN': if(now>=this._until) this._state='IDLE'; break;
      default: {
        const w=this.getInputData(0); if(!w) break;
        const r=this._evalScript(w,signals);
        if(r===false){ this.setOutputData(0,w); break; }
        let ww=w; if(r && typeof r==='object'){ if(r.nextType) ww=new Work(w.id,r.nextType,w.attrs); if(r.mutate) Object.assign(ww.attrs,r.mutate); }
        this._payload=ww; this._selectedPort=this._choosePort(ww); this._state='PROCESS'; this._until=now+this.properties.processTime;
      }
    }
    const n=3+(this.properties.sigExtra||0); for(let i=0;i<n;i++) this._emit(i,this._state);
    if(this._state!=='IDLE'||this._payload) this.setDirtyCanvas(true,true);
  }
}
menuMixin(SplitNode);

// Buffer (FIFO) with capacity
class BufferNode extends LiteGraph.LGraphNode{
  constructor(){ super(); this.title='Buffer'; this.size=[240,140]; this.addInput('in',0); this.addOutput('out',0);
    this.properties={ capacity:5, releaseMs:200, sigExtra:0, sigEnabled:true };
    syncSigPorts(this); this._q=[]; this._last=[]; this._lastPush=0; this._lastPop=0; this._state='IDLE';
  }
  _emit(i,msg){ if(!this.properties.sigEnabled){ this.setOutputData(i+1,null); return; } if(this._last[i]!==msg){ this.setOutputData(i+1,msg); this._last[i]=msg; } else this.setOutputData(i+1,null); }
  onExecute(){
    const now=simNow();
    const w = this.getInputData(0);
    if(w){ if(this._q.length < this.properties.capacity){ this._q.push(w); this._lastPush=now; this._state='RECV'; } /* else: drop or backpressure? here we drop-through */ }
    // release
    const canOut = this.outputs[0].links ? this._downReady() : true;
    if(canOut && this._q.length && (now - this._lastPop >= this.properties.releaseMs)){
      const out = this._q.shift(); this._lastPop=now; this.setOutputData(0,out); this._state='SEND';
    }else{ this.setOutputData(0,null); if(!this._q.length) this._state='IDLE'; }
    const n=3+(this.properties.sigExtra||0); for(let i=0;i<n;i++) this._emit(i,this._state);
    this.setDirtyCanvas(true,true);
  }
  _downReady(){ const out=this.outputs[0]; for(const id of out.links){ const link=this.graph.links[id]; const t=this.graph.getNodeById(link.target_id); if(t && t._state && t._state!=='IDLE') return false; } return true; }
  onDrawForeground(ctx){ ctx.fillStyle='#fff'; ctx.font='12px sans-serif'; ctx.fillText(`Q:${this._q.length}/${this.properties.capacity}`,8,18); }
}
menuMixin(BufferNode);

// =============================
// 6) 登録
// =============================
function register(){
  LiteGraph.registerNodeType('factory/source', SourceNode);
  LiteGraph.registerNodeType('factory/equip',  EquipmentNode);
  LiteGraph.registerNodeType('factory/split',  SplitNode);
  LiteGraph.registerNodeType('factory/buffer', BufferNode);
  LiteGraph.registerNodeType('factory/sink',   SinkNode);
}
register();

// =============================
// 7) グラフ初期化 & 例レイアウト
// =============================
let graph, canvas;
const TP = document.getElementById('tp');
const WIP = document.getElementById('wip');
const LAST = document.getElementById('lastWork');

function updateHud(){
  // Throughput = sum of sinks
  let tp=0, last='-'; let wip=0;
  graph._nodes.forEach(n=>{
    if(n instanceof SinkNode){ tp += n._recv; last = n._lastWork || last; }
    if(n._state && n._state!=='IDLE') wip++;
  });
  // include in-transit tokens to make WIP reflect visible movement
  const inTransit = __tokens.length;
  TP.textContent = tp; LAST.textContent = last; WIP.textContent = wip + inTransit;
}

function makeExample(kind){
  graph.clear();
  if(kind==='simple'){
    const s=LiteGraph.createNode('factory/source'); s.pos=[30,50]; s.properties.sequence='A,A,A,B';
    const e1=LiteGraph.createNode('factory/equip'); e1.pos=[310,50]; e1.properties.processTime=1200;
    const e2=LiteGraph.createNode('factory/equip'); e2.pos=[590,50]; e2.properties.processTime=800;
    const k=LiteGraph.createNode('factory/sink'); k.pos=[860,50];
    graph.add(s); graph.add(e1); graph.add(e2); graph.add(k);
    s.connect(0,e1,0); e1.connect(0,e2,0); e2.connect(0,k,0);
  }else if(kind==='branch'){
    const s=LiteGraph.createNode('factory/source'); s.pos=[30,60];
    const sp=LiteGraph.createNode('factory/split'); sp.pos=[310,60]; sp.properties.mode='expr'; sp.properties.expression="work.type==='A'?0:1";
    const a=LiteGraph.createNode('factory/equip'); a.title='Line A'; a.pos=[600,0]; a.properties.processTime=900;
    const b=LiteGraph.createNode('factory/equip'); b.title='Line B'; b.pos=[600,140]; b.properties.processTime=1500;
    const k=LiteGraph.createNode('factory/sink'); k.pos=[900,70];
    graph.add(s); graph.add(sp); graph.add(a); graph.add(b); graph.add(k);
    s.connect(0,sp,0); sp.connect(0,a,0); sp.connect(1,b,0); a.connect(0,k,0); b.connect(0,k,0);
  }else if(kind==='buffer'){
    const s=LiteGraph.createNode('factory/source'); s.pos=[30,60]; s.properties.interval=700;
    const buf=LiteGraph.createNode('factory/buffer'); buf.pos=[300,60]; buf.properties.capacity=8; buf.properties.releaseMs=300;
    const e=LiteGraph.createNode('factory/equip'); e.pos=[550,60]; e.properties.processTime=1000; e.properties.downTime=200;
    const k=LiteGraph.createNode('factory/sink'); k.pos=[820,60];
    graph.add(s); graph.add(buf); graph.add(e); graph.add(k);
    s.connect(0,buf,0); buf.connect(0,e,0); e.connect(0,k,0);
  }
}

function initGraph(){
  if(graph) graph.stop();
  workCounter=0; simStart=null; simAccum=0; realAnchor=Date.now(); simAnchor=realAnchor; updateSimTime();
  graph = new LGraph();
  canvas = new LGraphCanvas(graphElement, graph);
  // chain foreground drawing: HUD + tokens
  const __prevDraw = updateHud;
  canvas.onDrawForeground = function(ctx){
    if(__prevDraw) __prevDraw(ctx);
    __drawTokens(ctx);
  };
  canvas.allow_searchbox = true;
  canvas.getCanvasWindow().addEventListener('resize', resizeCanvas);
  canvas.onNodeSelected = node => renderInspector(node);
  canvas.onNodeDeselected = () => renderInspector(null);
  function resizeCanvas(){ const r=canvas.canvas.getBoundingClientRect(), d=window.devicePixelRatio||1; canvas.canvas.width=r.width*d; canvas.canvas.height=r.height*d; canvas.resize(r.width,r.height); canvas.draw(true); }
  resizeCanvas();

  // default minimal graph
  const src=LiteGraph.createNode('factory/source'); src.pos=[30,50];
  const eq=LiteGraph.createNode('factory/equip');  eq.pos=[300,50];
  graph.add(src); graph.add(eq); src.connect(0,eq,0);
}

initGraph();

// example loader
const exampleSelect = document.getElementById('exampleSelect');
exampleSelect.onchange = e=>{ const v=e.target.value; if(v) makeExample(v); };

// =============================
// 8) Save / Load / Autosave (localStorage)
// =============================
const btnSave = document.getElementById('btnSave');
const btnLoad = document.getElementById('btnLoad');
const fileInput = document.getElementById('fileInput');
const btnAuto = document.getElementById('btnAuto');
const autoState = document.getElementById('autoState');
let autosaveOn = false, autosaveTimer=null;

function serializeGraph(){
  const data = graph.serialize();
  // embed metadata
  data.__meta = { ts: Date.now(), app: 'LiteGraph Factory Simulator v3.5' };
  return data;
}

btnSave.onclick = ()=>{
  const blob = new Blob([ JSON.stringify(serializeGraph(),null,2) ], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='graph.json'; a.click(); URL.revokeObjectURL(url);
};
btnLoad.onclick = ()=> fileInput.click();
fileInput.addEventListener('change', e=>{
  const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ graph.clear(); graph.configure(JSON.parse(r.result)); }catch(err){ alert('JSON読込失敗'); console.error(err); } }; r.readAsText(f);
});

btnAuto.onclick = ()=>{
  autosaveOn = !autosaveOn; autoState.textContent = autosaveOn? 'ON':'OFF';
  if(autosaveOn){ if(autosaveTimer) clearInterval(autosaveTimer); autosaveTimer = setInterval(()=>{ localStorage.setItem('factory_graph_autosave', JSON.stringify(serializeGraph())); }, 1500);
  }else{ if(autosaveTimer) clearInterval(autosaveTimer); autosaveTimer=null; }
};

// Try restore
(function(){ const s = localStorage.getItem('factory_graph_autosave'); if(s){ try{ graph.configure(JSON.parse(s)); autoState.textContent='ON (restored)'; }catch{} } })();

// =============================
// 9) Controls
// =============================
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnReset = document.getElementById('btnReset');

btnStart.onclick = ()=>{ if(!simInterval){ graph.start(); simStart=simNow(); simInterval=setInterval(()=>{ updateSimTime(); updateHud(); if(canvas) try{ canvas.draw(true); }catch{} }, 50); } };
btnStop.onclick  = ()=>{ if(simInterval){ graph.stop(); simAccum += simNow()-simStart; clearInterval(simInterval); simInterval=null; updateSimTime(); updateHud(); } };
btnReset.onclick = ()=>{ if(simInterval){ graph.stop(); clearInterval(simInterval); simInterval=null; } initGraph(); updateHud(); };

// keyboard helpers
window.addEventListener('keydown', (e)=>{
  if(e.key===' '){ e.preventDefault(); if(simInterval) btnStop.onclick(); else btnStart.onclick(); }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); btnSave.onclick(); }
});

