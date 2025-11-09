// Sink node

class SinkNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Sink';
    this.addInput('workIn', 0);
    // コンパクトな表示に調整（タイトル+1行でも余裕のある最小構成）
    this.size = [160,60];
    // Fixed color: yellow (Sink has no state machine)
    this.color = '#f1c40f';   // border (yellow)
    this.bgcolor = '#fff9db'; // fill   (light yellow)
    this._recv = [];
    // シグナルポートやシグナル関連のプロパティは持たない（受け取りのみ）
  }
  onExecute(){
    const d = this.getInputData(0);
    if(d){
      this._recv.push(d);
      this._lastWork = d;
      // 絶対時刻（epoch）ではなく、シミュレーション経過時間(ms)を記録する
      const elapsed = simAccum + (simStart ? (simNow() - simStart) : 0);
      this._lastAt = elapsed; // ms since sim start (with pauses)
      this.tooltip = `Got:${this._recv.length}`;
    }
  }
  onDrawForeground(ctx){
    const last = this._lastWork;
    const atSec = (this._lastAt!=null) ? (this._lastAt/1000).toFixed(1) : null;
    const lines = [
      `Recv: ${this._recv.length}`,
      last?`Last: ID=${last.id} Type=${last.type}`:'Last: (none)',
      last?`At(s): ${atSec}`:null
    ].filter(Boolean);
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

window.SinkNode = SinkNode;
