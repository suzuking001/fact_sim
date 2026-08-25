// Sink node with simple throughput history visualization

const SINK_THROUGHPUT_WINDOW_MS = 60 * 60 * 1000;

const SINK_PALETTE = Object.freeze({
  node: { title: '#fbefbe', body: '#fffdf3', accent: '#f1c40f' },
  metricFill: 'rgba(255,255,255,0.78)',
  metricStroke: 'rgba(166, 142, 29, 0.22)',
  metricLabel: 'rgba(93, 80, 16, 0.82)',
  metricValue: '#594f14',
  chartFill: 'rgba(82,72,14,0.06)',
  chartStroke: 'rgba(166, 142, 29, 0.18)',
  chartGrid: 'rgba(82,72,14,0.10)',
  chartAxisText: 'rgba(93, 80, 16, 0.68)',
  chartEmptyText: 'rgba(93, 80, 16, 0.45)',
  cycleColor: '#f39c12',
  throughputColor: '#2d8f6f'
});

function getSinkPalette(){
  return SINK_PALETTE;
}

class SinkNode extends LiteGraph.LGraphNode{
  constructor(){
    super();
    this.title = 'Sink';
    this.addInput('inPort1', 0);
    this.size = [244,224];
    this._applyTheme();
    this.__disableCompactOverlay = true;
    this._recv = [];
    this._history = [];
    this._maxSamples = 60;
    this._prevAt = null;
    this._lastInRef = null; // prevent duplicate intake on same link value
    this._lastInRefs = [];
    this._recentRecvTimes = [];
    this._throughputPerHour = 0;
    this.properties = this.properties || {};
    if(window.enableFlipIO) window.enableFlipIO(this);
  }

  _applyTheme(){
    const palette = getSinkPalette();
    this.color = palette.node.title;
    this.bgcolor = palette.node.body;
    this.boxcolor = palette.node.accent;
  }

  _recordSample(ts, tph){
    const cycle = this._prevAt != null ? Math.max(0, ts - this._prevAt) : 0;
    this._prevAt = ts;
    this._history.push({ t: ts, cycle, tph: Math.max(0, Number(tph) || 0) });
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
    const now = simNow();
    const currentTph = this._calcThroughputPerHour(now);
    const ruleSlots = (this.properties?.inputRules || []).map((rule)=>
      (this.inputs || []).findIndex((port)=>port?.portId === rule?.fromPortId)).filter((slot)=>slot >= 0);
    const slots = [...new Set([...ruleSlots, ...(this.inputs || []).map((_port, slot)=>slot)])]
      .filter((slot)=>this.inputs?.[slot]?.channel !== 'signal');
    for(const slot of slots){
      const d = this.getInputData(slot);
      if(!d){ this._lastInRefs[slot] = null; continue; }
      if(this._lastInRefs[slot] === d) continue;
      if(typeof this._runtimeSelectInputRule === 'function' && !this._runtimeSelectInputRule(d, slot)) continue;
      this._lastInRefs[slot] = d;
      this._lastInRef = d;
      this._recv.push(d);
      this._recentRecvTimes.push(now);
      this._pruneRecentRecvTimes(now);
      this._lastWork = d;
      this._lastAt = now;
      const tph = this._calcThroughputPerHour(now);
      this._recordSample(now, tph || currentTph);
      this.tooltip = `Got:${this._recv.length} | TPH(1h): ${this._formatThroughputPerHour(tph)}`;
    }
  }

  onDrawForeground(ctx){
    this._applyTheme();
    if(this._ensureMinimumSize()) return;
    const tph = this._formatThroughputPerHour(this._calcThroughputPerHour(simNow()));
    const lastCycleSec = this._history.length ? (Math.max(0, Number(this._history[this._history.length - 1].cycle) || 0) / 1000) : 0;
    this._drawMetrics(ctx, tph, lastCycleSec);
    this._drawHistory(ctx);
    const lines = [
      `Received: ${this._recv.length}`,
      `TPH(1h): ${tph}`,
      `Last CT: ${lastCycleSec.toFixed(1)}s`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }

  _ensureMinimumSize(){
    const minW = 244;
    const minH = 224;
    const size = Array.isArray(this.size) ? this.size : null;
    if(!size) return false;
    const nextW = Math.max(minW, Number(size[0]) || 0);
    const nextH = Math.max(minH, Number(size[1]) || 0);
    if(nextW !== size[0] || nextH !== size[1]){
      size[0] = nextW;
      size[1] = nextH;
      if(typeof this.setDirtyCanvas === 'function') this.setDirtyCanvas(true, true);
      return true;
    }
    return false;
  }

  _drawMetrics(ctx, tphText, lastCycleSec){
    const palette = getSinkPalette();
    const top = 30;
    const left = 10;
    const gap = 6;
    const cardHeight = 28;
    const cardWidth = Math.floor((this.size[0] - left * 2 - gap * 2) / 3);
    const specs = [
      { label: 'Received', value: String(this._recv.length) },
      { label: 'TPH(1h)', value: tphText },
      { label: 'Last CT', value: `${lastCycleSec.toFixed(1)}s` }
    ];
    ctx.save();
    try{
      specs.forEach((spec, idx)=>{
        const x = left + idx * (cardWidth + gap);
        ctx.fillStyle = palette.metricFill;
        ctx.strokeStyle = palette.metricStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, top, cardWidth, cardHeight, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = palette.metricLabel;
        ctx.font = '10px sans-serif';
        ctx.fillText(spec.label, x + 8, top + 11);
        ctx.fillStyle = palette.metricValue;
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(spec.value, x + 8, top + 23);
      });
    }finally{
      ctx.restore();
    }
  }

  _drawHistory(ctx){
    const palette = getSinkPalette();
    const pad = 12;
    const topOffset = 68;
    const axisWidth = 34;
    const chartGap = 8;
    const width = Math.max(60, this.size[0] - pad * 2 - axisWidth);
    const totalHeight = Math.max(92, this.size[1] - topOffset - pad);
    const chartHeight = Math.max(40, Math.floor((totalHeight - chartGap) / 2));
    const samples = Array.isArray(this._history) ? this._history : [];
    const minT = samples.length ? samples[0].t : 0;
    const maxT = samples.length ? (samples[samples.length - 1].t || (minT + 1)) : 1;
    const span = Math.max(1, maxT - minT);
    const maxCycle = Math.max(1, ...samples.map((entry)=> Number(entry && entry.cycle) || 0));
    const maxTph = Math.max(1, ...samples.map((entry)=> Number(entry && entry.tph) || 0));

    this._drawSeriesChart(ctx, {
      x: pad,
      y: topOffset,
      width,
      height: chartHeight,
      label: 'Cycle Time',
      color: palette.cycleColor,
      samples,
      span,
      minT,
      maxValue: maxCycle,
      valueAccessor: (sample)=> Number(sample && sample.cycle) || 0,
      valueFormatter: (value)=> `${(value / 1000).toFixed(1)}s`
    });

    this._drawSeriesChart(ctx, {
      x: pad,
      y: topOffset + chartHeight + chartGap,
      width,
      height: chartHeight,
      label: 'Throughput',
      color: palette.throughputColor,
      samples,
      span,
      minT,
      maxValue: maxTph,
      valueAccessor: (sample)=> Number(sample && sample.tph) || 0,
      valueFormatter: (value)=> this._formatThroughputPerHour(value)
    });
  }

  _drawSeriesChart(ctx, config){
    const palette = getSinkPalette();
    const x = Number(config.x) || 0;
    const y = Number(config.y) || 0;
    const width = Math.max(40, Number(config.width) || 0);
    const height = Math.max(30, Number(config.height) || 0);
    const samples = Array.isArray(config.samples) ? config.samples : [];
    const span = Math.max(1, Number(config.span) || 1);
    const minT = Number(config.minT) || 0;
    const maxValue = Math.max(1, Number(config.maxValue) || 1);
    const valueAccessor = typeof config.valueAccessor === 'function' ? config.valueAccessor : ((sample)=> Number(sample) || 0);
    const valueFormatter = typeof config.valueFormatter === 'function' ? config.valueFormatter : ((value)=> String(value));
    const label = String(config.label || '');
    const color = config.color || '#f39c12';
    const plotInsetTop = 18;
    const plotInsetBottom = 6;
    const plotHeight = Math.max(18, height - plotInsetTop - plotInsetBottom);
    const divisions = 3;

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = palette.chartFill;
    ctx.strokeStyle = palette.chartStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.metricValue;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(label, 8, 12);

    ctx.strokeStyle = palette.chartGrid;
    ctx.lineWidth = 1;
    for(let i = 0; i <= divisions; i++){
      const yy = plotInsetTop + (i / divisions) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(width, yy);
      ctx.stroke();
      const labelValue = maxValue * (1 - i / divisions);
      ctx.fillStyle = palette.chartAxisText;
      ctx.font = '10px sans-serif';
      ctx.fillText(valueFormatter(labelValue), width + 6, Math.max(10, yy + 3));
    }

    if(samples.length){
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      samples.forEach((sample, idx)=>{
        const xx = span > 0 ? ((Number(sample && sample.t) || 0) - minT) / span * width : 0;
        const raw = Math.max(0, valueAccessor(sample));
        const yy = plotInsetTop + plotHeight - (raw / maxValue) * Math.max(8, plotHeight - 6) - 3;
        if(idx === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    }else{
      ctx.fillStyle = palette.chartEmptyText;
      ctx.font = '10px sans-serif';
      ctx.fillText('No samples yet', 8, plotInsetTop + 16);
    }
    ctx.restore();
  }
}

window.SinkNode = SinkNode;
