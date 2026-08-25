(function(proto){
  proto.onDrawForeground = function(ctx){
    if(typeof this._ensureOutSequenceFresh === 'function') this._ensureOutSequenceFresh();
    const now = simNow();
    const rem = Math.max(0, (this._until||0) - now);
    const agv = this._currentAgv || this._departingAgv;
    const cfg = (agv && typeof this._findCarrierConfigForAgv === 'function')
      ? this._findCarrierConfigForAgv(agv)
      : null;
    const cfgText = cfg
      ? `${String(cfg.properties?.carrierId ?? agv?.id ?? '').trim() || '-'} @${cfg.id ?? '-'}`
      : '(none)';
    const carrierInfo = (agv && typeof this._carrierAnimInfo === 'function')
      ? this._carrierAnimInfo(agv)
      : null;
    const loadText = carrierInfo
      ? `work=${Number(carrierInfo.workCount) || 0}/${Number(carrierInfo.capacity) || 0}`
      : (agv ? `load=${agv.cargo.length}/${agv.capacity}` : 'load=-');
    const palletText = carrierInfo && Number(carrierInfo.palletCapacity) > 0
      ? ` pallets=${Number(carrierInfo.palletCount) || 0}/${Number(carrierInfo.palletCapacity) || 0}`
      : '';
    const inLane = Number(this._currentCarrierLane) + 1;
    const outLane = this._departingAgv
      ? (Number(this._departingCarrierLane) + 1)
      : (this._stateName === 'agvOut_wait' ? (Number(this._plannedDepartureLane) + 1) : '-');
    const initialCarrier = String(this.properties?.initialCarrier ?? '').trim() || '(none)';
    const outSeq = String(this.properties?.outSequence ?? '').trim() || '(input lane -> same output lane)';
    const seqStep = (Array.isArray(this._parsedOutSequence) && this._parsedOutSequence.length)
      ? `${(Number(this._outSequenceCursor) % this._parsedOutSequence.length) + 1}/${this._parsedOutSequence.length}`
      : '-';
    const lines = [
      `State: ${this._stateName}`,
      `Initial carrier: ${initialCarrier}`,
      agv ? `Carrier: ${agv.id} ${loadText}${palletText}` : 'Carrier: (none)',
      `Carrier Config: ${cfgText}`,
      `Out sequence: ${outSeq}`,
      `Sequence step: ${seqStep}`,
      `Lane(in/out): ${inLane} / ${outLane}`,
      `Pending unload: ${this._pendingUnload.length}`,
      `Pending pallet unload: ${this._pendingPalletUnload.length}`,
      `Remain(s): ${(rem/1000).toFixed(1)}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  };
})(CarrierRouteNode.prototype);

menuMixin(CarrierRouteNode);
