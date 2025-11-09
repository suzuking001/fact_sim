// Split node

class SplitNode extends EquipmentNode{
  constructor(){
    super('Split');
    this.title = 'Split';
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

menuMixin(SplitNode);
// Ensure palette/menu shows proper name
SplitNode.title = 'Split';
window.SplitNode = SplitNode;
