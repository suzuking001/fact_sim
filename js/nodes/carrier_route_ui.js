(function(proto){
  proto.onDrawForeground = function(ctx){
    const now = simNow();
    const rem = Math.max(0, (this._until||0) - now);
    const agv = this._currentAgv || this._departingAgv;
    const cfg = (agv && typeof this._findCarrierConfigForAgv === 'function')
      ? this._findCarrierConfigForAgv(agv)
      : null;
    const cfgText = cfg
      ? `${String(cfg.properties?.carrierId ?? agv?.id ?? '').trim() || '-'} @${cfg.id ?? '-'}`
      : '(none)';
    const homeFlag = (cfg && typeof cfg.isHomeRoute === 'function' && cfg.isHomeRoute(this)) ? 'YES' : 'NO';
    const inLane = Number(this._currentCarrierLane) + 1;
    const outLane = this._departingAgv ? (Number(this._departingCarrierLane) + 1) : '-';
    const initialCarrier = String(this.properties?.initialCarrier ?? '').trim() || '(none)';
    const lines = [
      `State: ${this._stateName}`,
      `Initial carrier: ${initialCarrier}`,
      agv ? `Carrier: ${agv.id} load=${agv.cargo.length}/${agv.capacity}` : 'Carrier: (none)',
      `Carrier Config: ${cfgText} / Home here: ${homeFlag}`,
      `Lane(in/out): ${inLane} / ${outLane}`,
      `Pending unload: ${this._pendingUnload.length}`,
      `Remain(s): ${(rem/1000).toFixed(1)}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  };
})(CarrierRouteNode.prototype);

menuMixin(CarrierRouteNode);
(function(proto){
  const prev = proto.getExtraMenuOptions;
  proto.getExtraMenuOptions = function(){
    let opts = prev ? prev.call(this) : [];
    if(!Array.isArray(opts)) opts = [];
    const laneCount = typeof this._carrierLaneCount === 'function' ? this._carrierLaneCount() : 1;
    const workLaneCount = typeof this._workLaneCount === 'function' ? this._workLaneCount() : 0;
    opts.push({
      content: 'Add carrier IN/OUT',
      callback: ()=> this._addCarrierLane && this._addCarrierLane()
    });
    opts.push({
      content: 'Remove carrier IN/OUT',
      disabled: laneCount <= 1,
      callback: ()=> this._removeCarrierLane && this._removeCarrierLane()
    });
    opts.push({
      content: 'Add work IN/OUT',
      callback: ()=> this._addWorkLane && this._addWorkLane()
    });
    opts.push({
      content: 'Remove work IN/OUT',
      disabled: workLaneCount <= 0,
      callback: ()=> this._removeWorkLane && this._removeWorkLane()
    });
    return opts;
  };
})(CarrierRouteNode.prototype);
