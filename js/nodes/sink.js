// Sink node with simple throughput history visualization

const SINK_THROUGHPUT_WINDOW_MS = 60 * 60 * 1000;

class SinkNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Sink';
    this.addInput('workIn', 0);
    this.size = [220,170];
    this.color = '#f1c40f';
    this.bgcolor = '#fff9db';
    this._recv = [];
    this._history = [];
    this._maxSamples = 60;
    this._prevAt = null;
    this._lastInRef = null; // prevent duplicate intake on same link value
    this._recentRecvTimes = [];
    this._throughputPerHour = 0;
    this.properties = this.properties || {};
    if(window.enableFlipIO) window.enableFlipIO(this);
  }

  _recordSample(ts){
    const cycle = this._prevAt != null ? Math.max(0, ts - this._prevAt) : 0;
    this._prevAt = ts;
    this._history.push({ t: ts, cycle });
    if(this._history.length > this._maxSamples) this._history.shift();
  }

  _pruneRecentRecvTimes(nowMs){
    const cutoff = nowMs - SINK_THROUGHPUT_WINDOW_MS;
    while(this._recentRecvTimes.length > 0 && this._recentRecvTimes[0] < cutoff){
      this._recentRecvTimes.shift();
    }
  }

  _calcThroughputPerHour(nowMs){
    const now = Number(nowMs);
    if(!isFinite(now) || now <= 0){
      this._throughputPerHour = 0;
      return 0;
    }

    this._pruneRecentRecvTimes(now);

    let tph = 0;
    if(now < SINK_THROUGHPUT_WINDOW_MS){
      const elapsedHours = now / SINK_THROUGHPUT_WINDOW_MS;
      tph = elapsedHours > 0 ? (this._recv.length / elapsedHours) : 0;
    }else{
      tph = this._recentRecvTimes.length;
    }

    this._throughputPerHour = isFinite(tph) && tph > 0 ? tph : 0;
    return this._throughputPerHour;
  }

  getThroughputPerHour(){
    return this._calcThroughputPerHour(simNow());
  }

  _formatThroughputPerHour(v){
    const n = Number(v);
    if(!isFinite(n) || n <= 0) return '0.0';
    if(n >= 1000) return n.toFixed(0);
    if(n >= 100) return n.toFixed(1);
    return n.toFixed(2);
  }

  onExecute(){
    const d = this.getInputData(0);
    const now = simNow();
    this._calcThroughputPerHour(now);

    if(!d){
      this._lastInRef = null;
      return;
    }

    // Avoid re-counting the same work object across settle passes or held outputs
    if(this._lastInRef === d) return;

    this._lastInRef = d;
    this._recv.push(d);
    this._recentRecvTimes.push(now);
    this._pruneRecentRecvTimes(now);
    this._lastWork = d;
    this._lastAt = now;
    this._recordSample(now);

    const tph = this._calcThroughputPerHour(now);
    this.tooltip = `Got:${this._recv.length} | TPH(1h): ${this._formatThroughputPerHour(tph)}`;
  }

  onDrawForeground(ctx){
    this._drawHistory(ctx);
    const tph = this._formatThroughputPerHour(this._calcThroughputPerHour(simNow()));
    const lines = [
      `Received: ${this._recv.length}`,
      `TPH(1h): ${tph}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }

  _drawHistory(ctx){
    if(!this._history.length) return;
    const pad = 12;
    const topOffset = 30;
    const width = this.size[0] - pad * 2;
    const height = this.size[1] - topOffset - pad*2;
    const baseY = this.size[1] - height - pad;
    const minT = this._history[0].t;
    const maxT = this._history[this._history.length-1].t || (minT+1);
    const span = Math.max(1, maxT - minT);
    const maxCycle = Math.max(...this._history.map(h=>h.cycle), 1);
    const lastCycle = (this._history[this._history.length-1].cycle/1000).toFixed(1);
    const tphText = this._formatThroughputPerHour(this._calcThroughputPerHour(simNow()));

    ctx.save();
    ctx.translate(pad, baseY);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0,0,width,height);

    // grid
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    const divisions = 4;
    for(let i=0;i<=divisions;i++){
      const y = (i/divisions)*height;
      ctx.beginPath();
      ctx.moveTo(0,y);
      ctx.lineTo(width,y);
      ctx.stroke();
      const labelVal = maxCycle * (1 - i/divisions);
      ctx.fillStyle = '#666';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${(labelVal/1000).toFixed(1)}s`, width - 40, y - 2);
    }

    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    this._history.forEach((sample, idx)=>{
      const x = span > 0 ? ((sample.t - minT)/span) * width : 0;
      const y = height - (sample.cycle / maxCycle) * (height-10) - 5;
      if(idx===0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#444';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Last CT: ${lastCycle}s`, 4, 14);
    ctx.fillText(`TPH(1h): ${tphText}`, 4, 28);
    ctx.restore();
  }
}

window.SinkNode = SinkNode;
