// Equipment node
const EQUIP_UI = {
  baseSize: [150, 50],
  widgetPaddingX: 30,
  widgetSpacingBottom: { top: 60, gap: 28 },
  widgetMinWidth: 120,
  signalHeightStep: 16
};
/*
 * EquipmentNode（装置ノード）
 *
 * 概要:
 *   入力（workIn）で受け取った Work を『処理→排出→ダウン→待機』の順に進める
 *   シンプルな状態機械です。処理可否はノードに紐づくスクリプトで判定できます。
 *
 * 時間単位:
 *   processTime / downTime は「秒(s)」で保持しています。内部では ms に換算して
 *   比較（now >= _until）を行います（simNow() はシミュレーション時間の ms）。
 *
 * 主な状態:
 *   - IDLE    : 入力待ち／処理対象なし
 *   - PROCESS : 加工中（processTime 経過で WAIT へ）
 *   - WAIT    : 排出待ち（下流が受け取り可能なら即排出して DOWN へ）
 *   - DOWN    : ダウン時間の消化（downTime 経過で IDLE へ）
 *
 * スクリプト:
 *   右クリックメニュー「Edit Script…」で編集できる短い関数です。
 *   true を返すと受け入れて加工、false を返すと『素通し』で右に流します。
 *   第2引数 signalArr には sigIn* から集めた信号が入ります。
 *
 * シグナルポート:
 *   sigOut* に現在の状態（IDLE/PROCESS/WAIT/DOWN）をイベント的に出力します。
 *   sigExtra を増減すると sigIn　sigOut* の数が変わります（右クリックメニュー）。
 *
 * 表示:
 *   ノード下部のオーバーレイに State / 処理中 Work / 残り秒数 / Proc/Down / Sig を表示します。
 */

class EquipmentNode extends LiteGraph.LGraphNode{
  constructor(title='Equip'){
    super();
    this.title = title;
    this.size = EQUIP_UI.baseSize.slice();
    this.resizable = true;
    this.addInput('workIn', 0);
    this.addOutput('workOut', 0);
    // プロパティ（いずれも秒単位）
    this.properties = {
      processTime: (window.NODES_CONFIG?.equipment?.processTimeSec ?? 2),
      downTime: (window.NODES_CONFIG?.equipment?.downTimeSec ?? 3),
      script: defaultScript(),
      sigExtra: 0,
      sigEnabled: true,

    };    // 現在の状態／時刻境界／保持データ
    this._state = 'IDLE';
    this._until = 0;
    this._payload = null;
    this._compiled = null;
    this._last = [];
    this._currentWork = null;
    
    this._lastInRef = null; // last seen input object
    this._handoffOffered = false; // WAITで一度だけ出力オファーを出すためのフラグ
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
      const info = (type === 'work' && payload) ? { id: payload.id, t: payload.type } : null;
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
      const info = payload ? { id: payload.id, t: payload.type } : null;
      const out = this.outputs && this.outputs[0];
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
  // スクリプトを（必要なら）コンパイルして実行。true で受け入れ、false で素通し
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
  // 毎フレーム（LiteGraph の評価タイミング）呼ばれる本体。状態機械で処理を進める
  onExecute(){
    // 表示用の現在ワークを IDLE 時にクリア
    if(this._state === 'IDLE') this._currentWork = null;

    // sigIn* を 0 から順に収集（ポート数は可変）
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
          // 加工中: 規定時間を過ぎたら WAIT へ
          if(now >= this._until){
            this._state = 'WAIT';
            this._handoffOffered = false;
            this._setWaitIcon(true);
            again = true; // allow immediate WAIT->DOWN if ready
          }
          break;
        case 'WAIT': {
          // 排出待ち: 後工程が受入可能になったら即 DOWN 開始（搬送開始）
          if(this._downReady()){
            const payload = this._payload;
            this._setWaitIcon(false);
            this._state = 'DOWN';
            const downMs = Math.max(0, this.properties.downTime*1000);
            this._until = now + downMs; // ms
            // 搬送開始時に即座に workOut を出力
            this.setOutputData(0, payload);
            this._spawnSinkTransfer(downMs, payload);
            this._payload = null;
          }else{
            this.setOutputData(0, null);
          }
          break;
        }
        case 'DOWN':
          // ダウン中: 規定時間経過で IDLE へ復帰
          if(now >= this._until){
            this.setOutputData(0, null);
            this._state = 'IDLE';
            this._setWaitIcon(false);
            again = true; // allow immediate IDLE accept if input already present
          }
          break;
        case 'IDLE': {
          // IDLE 相当: 入力があれば受入判定
          const in0 = (this.inputs && this.inputs[0]) ? this.inputs[0] : null;
          const hasLink = !!(in0 && in0.link != null);
          if(!hasLink) break;
          const w = this.getInputData(0);
          if(!w){ this._lastInRef = null; break; }
          if(typeof w !== 'object') break;
          // 直近に観測した参照と同一なら新規受入れではない（LiteGraphのリンクは値を保持するため）
          if(this._lastInRef === w) break;
          // スクリプトが false を返した場合は素通し（受けずに右へ）
          if(!this._evalScript(w, sig)){
            this.setOutputData(0, w);
            break;
          }
          // 受入れ → PROCESS 開始
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
                const info = (w && typeof w === 'object') ? { id: w.id, t: w.type } : null;
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

    // 状態シグナルを sigOut* に通知（エッジのみ）
    const n = this.properties.sigExtra || 0;
    for(let i=0;i<n;i++) this._emit(i, this._state);
    switch(this._state){
      case 'PROCESS': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
      case 'WAIT':    this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
      case 'DOWN':    this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
      case 'IDLE':    this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
    }
    if(typeof window.applyNodeStateTheme === 'function') window.applyNodeStateTheme(this, this._state);

    // 状態が動いている間は描画を更新
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
  // 下流（workOut の接続先）が受入可能かどうかを判定
  _downReady(){
    // 出力先が無い（ポート自体が無い、またはリンク未接続）の場合は受け渡し不可
    // → ワークは装置内で滞留（WAIT を維持）
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
      // _state を持たないノード（Sink 等）は常に受入可能とみなす
      if(t && typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
    }
    return hasValidLink;
  }
  // ノード下部に状態をオーバーレイ表示
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























