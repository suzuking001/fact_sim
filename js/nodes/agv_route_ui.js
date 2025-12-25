(function(proto){
  // Status overlay
  proto.onDrawForeground = function(ctx){
    const now = simNow();
    const rem = Math.max(0, (this._until||0) - now);
    const agv = this._currentAgv || this._departingAgv;
    const lines = [
      `State: ${this._stateName}`,
      agv ? `AGV: ${agv.id} load=${agv.cargo.length}/${agv.capacity}` : 'AGV: (none)',
      `Pending unload: ${this._pendingUnload.length}`,
      `Remain(s): ${(rem/1000).toFixed(1)}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  };

  // Right-click menu for flip IO
  const prevMenu = proto.getExtraMenuOptions;
  proto.getExtraMenuOptions = function(){
    let opts = prevMenu ? prevMenu.call(this) : [];
    if(!Array.isArray(opts)) opts = [];
    if(this.properties && Object.prototype.hasOwnProperty.call(this.properties,'flipIO')){
      const label = this.properties.flipIO ? 'Ports: reset alignment' : 'Ports: flip horizontally';
      const toggle = ()=>{
        this.properties.flipIO = !this.properties.flipIO;
        if(window.refreshFlipIO) window.refreshFlipIO(this);
      };
      const existing = opts.find(o=>o && typeof o.content==='string' && o.content.indexOf('Ports:')===0);
      if(existing){ existing.content = label; existing.callback = toggle; }
      else opts.push({ content: label, callback: toggle });
    }
    return opts;
  };
})(AGVRouteNode.prototype);

menuMixin(AGVRouteNode);
