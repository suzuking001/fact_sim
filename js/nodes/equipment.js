// Equipment node
const EQUIP_UI = {
  baseSize: [320, 360],
  widgetPaddingX: 40,
  widgetSpacingBottom: { proc: 110, down: 70 },
  widgetMinWidth: 160
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
      sigVisible: false,
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

    // Inline property widgets (always visible on node)
    try{
      // normalize to 0.1s precision
      const r01 = v=> Math.max(0, Math.round(parseFloat(v||0)*10)/10);
      this.properties.processTime = r01(this.properties.processTime);
      this.properties.downTime = r01(this.properties.downTime);

      // place widgets near the bottom to avoid overlapping IN/OUT ports
      this.widgets_start_y = 120;
      this.serialize_widgets = true;

      this._sigToggle = this.addWidget(
        'toggle', 'Signals', this.properties.sigVisible ? 1 : 0,
        (v)=>{ this.properties.sigVisible = !!v; this._applySigVisibility(); }
      );
      if(this._sigToggle) this._sigToggle.serialize = false;

      this._wProc = this.addWidget(
        'number', 'Proc(s)', this.properties.processTime,
        (v)=>{ v = r01(v); this.properties.processTime = v; if(this._wProc) this._wProc.value = v; if(this.onPropertyChanged) this.onPropertyChanged('processTime'); this.setDirtyCanvas(true,true); },
        { min: 0, step: 0.1, precision: 1, width: EQUIP_UI.widgetMinWidth }
      );
      this._wDown = this.addWidget(
        'number', 'Down(s)', this.properties.downTime,
        (v)=>{ v = r01(v); this.properties.downTime = v; if(this._wDown) this._wDown.value = v; if(this.onPropertyChanged) this.onPropertyChanged('downTime'); this.setDirtyCanvas(true,true); },
        { min: 0, step: 0.1, precision: 1, width: EQUIP_UI.widgetMinWidth }
      );
      this._applySigVisibility();
      this._reflowWidgets();
      if(this.computeSize) this.computeSize();
    }catch(e){}
  }
  // スクリプトを（必要なら）コンパイルして実行。true で受け入れ、false で素通し
  _evalScript(w, s){
    if(!this._compiled){
      try{ this._compiled = new Function('work','signalArr', this.properties.script); }
      catch(e){ console.error(e); }
    }
    try{ return this._compiled ? this._compiled(w,s) : true; }
    catch(e){ console.error(e); return false; }
  }
  _emit(i,state){
    if(!this.properties.sigVisible) return;
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
    switch(this._state){
      case 'PROCESS':
        // 加工中: 規定時間を過ぎたら WAIT へ
        if(now >= this._until){ this._state = 'WAIT'; this._handoffOffered = false; }
        break;
      case 'WAIT': {
        // 排出待ち: まず一度だけ "出力オファー" を提示し、その後 本当に受け取られたかを検知して遷移
        if(!this._handoffOffered){
          if(this._downReady()){
            this.setOutputData(0, this._payload); // オファー提示
            this._handoffOffered = true;
          }
          break; // 次フレーム以降で受け取り検知
        }
        // 受け取り検知: 接続先ノードが _currentWork か _payload に同一オブジェクトを保持しているか
        let accepted = false;
        if(this.outputs.length && this.outputs[0].links){
          for(const id of this.outputs[0].links){
            const link = this.graph.links[id]; if(!link) continue;
            const t = this.graph.getNodeById(link.target_id); if(!t) continue;
            // Sink 等（_state未定義）は提示時点で受理されたとみなす
            if(typeof t._state === 'undefined'){ accepted = true; break; }
            if(t._currentWork === this._payload || t._payload === this._payload){ accepted = true; break; }
          }
        }
        if(accepted){
          // 受け渡し確定 → 出力をクリアしてラッチ値を消す → DOWN へ
          this.setOutputData(0, null); // リンク上の前回データを明示的にクリア
          this._payload = null;
          this._state = 'DOWN';
          this._until = now + this.properties.downTime*1000; // 秒→ms
        }else{
          // まだ受け取られていない → オファーを再提示して WAIT 維持
          if(this._downReady()) this.setOutputData(0, this._payload);
        }
        break;
      }
      case 'DOWN':
        // ダウン中: 規定時間経過で IDLE へ復帰
        if(now >= this._until) this._state = 'IDLE';
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
        this._until = now + this.properties.processTime*1000; // ms
        this._lastInRef = w; // remember last accepted input to avoid duplicate starts

      }
    }

    // 状態シグナルを sigOut* に通知（エッジのみ）
    if(this.properties.sigVisible){
      const n = 3 + (this.properties.sigExtra||0);
      for(let i=0;i<n;i++) this._emit(i, this._state);
    }
    switch(this._state){
      case 'PROCESS': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
      case 'WAIT':    this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
      case 'DOWN':    this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
      case 'IDLE':    this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
    }

    // 状態が動いている間は描画を更新
    if(this._state !== 'IDLE' || this._payload) this.setDirtyCanvas(true,true);
  }
  _reflowWidgets(){
    const width = Math.max(EQUIP_UI.widgetMinWidth, this.size[0] - EQUIP_UI.widgetPaddingX * 2);
    const offsetX = (this.size[0] - width) * 0.5;
    if(this._sigToggle){
      this._sigToggle.y = this.size[1] - (EQUIP_UI.widgetSpacingBottom.proc + 40);
      this._sigToggle.options = this._sigToggle.options || {};
      this._sigToggle.options.x = offsetX;
    }
    const procY = this.size[1] - EQUIP_UI.widgetSpacingBottom.proc;
    const downY = this.size[1] - EQUIP_UI.widgetSpacingBottom.down;
    if(this._wProc){
      this._wProc.y = procY;
      this._wProc.options = this._wProc.options || {};
      this._wProc.options.width = width;
      this._wProc.options.x = offsetX;
    }
    if(this._wDown){
      this._wDown.y = downY;
      this._wDown.options = this._wDown.options || {};
      this._wDown.options.width = width;
      this._wDown.options.x = offsetX;
    }
  }
  _applySigVisibility(){
    if(typeof this.properties.sigVisible === 'undefined') this.properties.sigVisible = false;
    const visible = !!this.properties.sigVisible;
    syncSigPorts(this, visible ? 3 : 0);
    if(this._sigToggle) this._sigToggle.value = visible ? 1 : 0;
    this.setDirtyCanvas(true,true);
  }
  onResize(size){
    try{ this._reflowWidgets(); }catch(e){}
  }
  // Reflect external property changes into widgets and handle dynamic ports
  onPropertyChanged(n){
    try{
      const r01 = v=> Math.max(0, Math.round(parseFloat(v||0)*10)/10);
      if(n==='processTime'){
        this.properties.processTime = r01(this.properties.processTime);
        if(this._wProc) this._wProc.value = this.properties.processTime;
      }
      if(n==='downTime'){
        this.properties.downTime = r01(this.properties.downTime);
        if(this._wDown) this._wDown.value = this.properties.downTime;
      }
      if(n==='sigVisible'){
        this._applySigVisibility();
      }
      if(n==='sigExtra'){
        syncSigPorts(this, this.properties.sigVisible ? 3 : 0);
      }
    }catch(e){}
  }
  // 下流（workOut の接続先）が受入可能かどうかを判定
  _downReady(){
    // 出力先が無い（ポート自体が無い、またはリンク未接続）の場合は受け渡し不可
    // → ワークは装置内で滞留（WAIT を維持）
    if(!this.outputs.length || !this.outputs[0].links) return false;
    for(const id of this.outputs[0].links){
      const t = this.graph.getNodeById(this.graph.links[id].target_id);
      // _state を持たないノード（Sink 等）は常に受入可能とみなす
      if(t && typeof t._state !== 'undefined' && t._state !== 'IDLE') return false;
    }
    return true;
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











