(function(proto){
  proto.onDrawForeground = function(ctx){
    const now = simNow();
    const rem = Math.max(0, (this._until||0) - now);
    const agv = this._currentAgv || this._departingAgv;
    const seq = Array.isArray(agv?.meta?.routeSequence) ? agv.meta.routeSequence : [];
    const cursorRaw = Number(agv?.meta?.routeCursor);
    const cursor = (!isFinite(cursorRaw) || cursorRaw < 0) ? 0 : cursorRaw;
    const seqText = seq.length ? `${cursor + 1}/${seq.length} next=${seq[cursor % seq.length]}` : '(none)';
    const routeKey = String(this.properties?.routeKey ?? '').trim() || String(this.id ?? '-');
    const lines = [
      `State: ${this._stateName}`,
      `Route key: ${routeKey}`,
      agv ? `Carrier: ${agv.id} load=${agv.cargo.length}/${agv.capacity}` : 'Carrier: (none)',
      agv ? `Sequence: ${seqText}` : 'Sequence: -',
      `Pending unload: ${this._pendingUnload.length}`,
      `Remain(s): ${(rem/1000).toFixed(1)}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  };
})(CarrierRouteNode.prototype);

menuMixin(CarrierRouteNode);
