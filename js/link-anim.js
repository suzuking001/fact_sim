(function(){
  if(typeof LiteGraph === 'undefined') return;

  const getNow = ()=> typeof simNow === 'function' ? simNow() : Date.now();
  const cfg = window.NODES_CONFIG?.animations || {};
  const defaultDuration = (cfg.linkMs || 800);
  const iconRadius = cfg.radius || 22.5;

class LinkAnimator{
  constructor(){
    this.animations = [];
    this._max = 200;
  }
  _getSlotDir(node, slotIndex, isInput){
    const slot = isInput ? (node.inputs && node.inputs[slotIndex]) : (node.outputs && node.outputs[slotIndex]);
    if(slot && slot.dir) return slot.dir;
    if(node.horizontal) return isInput ? LiteGraph.UP : LiteGraph.DOWN;
    return isInput ? LiteGraph.LEFT : LiteGraph.RIGHT;
  }
  _bezierPoint(start, startDir, end, endDir, t){
    const dist = Math.hypot(end[0]-start[0], end[1]-start[1]);
    const quarter = dist * 0.25;
    const startOff = [0,0];
    const endOff = [0,0];
    switch(startDir){
      case LiteGraph.LEFT: startOff[0] = -quarter; break;
      case LiteGraph.RIGHT: startOff[0] = quarter; break;
      case LiteGraph.UP: startOff[1] = -quarter; break;
      case LiteGraph.DOWN: startOff[1] = quarter; break;
    }
    switch(endDir){
      case LiteGraph.LEFT: endOff[0] = -quarter; break;
      case LiteGraph.RIGHT: endOff[0] = quarter; break;
      case LiteGraph.UP: endOff[1] = -quarter; break;
      case LiteGraph.DOWN: endOff[1] = quarter; break;
    }
    const c1 = [start[0] + startOff[0], start[1] + startOff[1]];
    const c2 = [end[0] + endOff[0], end[1] + endOff[1]];
    const u = 1 - t;
    const uu = u*u;
    const tt = t*t;
    const uuu = uu*u;
    const ttt = tt*t;
    const x = uuu*start[0] + 3*uu*t*c1[0] + 3*u*tt*c2[0] + ttt*end[0];
    const y = uuu*start[1] + 3*uu*t*c1[1] + 3*u*tt*c2[1] + ttt*end[1];
    return [x,y];
  }
  spawn(graph, linkId, type, durationMs, info){
    if(!graph || !linkId) return;
    const now = getNow();
    this.animations.push({
      graph,
      linkId,
      type,
      info: info || null,
      start: now,
      duration: durationMs || defaultDuration,
      tail: false
    });
    if(this.animations.length > this._max) this.animations.shift();
  }
  showPortIcon(graph, linkId, type, info){
    if(!graph || !linkId) return;
    this.animations = this.animations.filter(anim=>!(anim.tail && anim.graph===graph && anim.linkId===linkId));
    this.animations.push({
      graph,
      linkId,
      type,
      info: info || null,
      start: getNow(),
      duration: null,
      tail: true
    });
  }
  hidePortIcon(graph, linkId){
    this.animations = this.animations.filter(anim=>!(anim.tail && anim.graph===graph && anim.linkId===linkId));
  }
  draw(canvas, ctx){
    if(!this.animations.length || !canvas || !ctx) return;
    const now = getNow();
    ctx.save();
    this.animations = this.animations.filter(anim=>{
      const graph = anim.graph;
      if(!graph) return false;
      const link = graph.links[anim.linkId];
      if(!link) return false;
      const originNode = graph.getNodeById(link.origin_id);
      const targetNode = graph.getNodeById(link.target_id);
      if(!originNode || !targetNode) return false;
      const start = originNode.getConnectionPos(false, link.origin_slot);
      const startDir = this._getSlotDir(originNode, link.origin_slot, false);
      let x, y;
        if(anim.tail){
          const allowAgvWait =
            anim.type === 'agv' &&
            originNode &&
            typeof originNode._stateName === 'string' &&
            (originNode._stateName.startsWith('workIn_idle') ||
             originNode._stateName.startsWith('workIn_process') ||
             originNode._stateName.startsWith('workOut_wait') ||
             originNode._stateName.startsWith('workOut_down') ||
             originNode._stateName === 'agvOut_wait');
          if(originNode._state !== 'WAIT' && !allowAgvWait) return false;
          x = start[0];
          y = start[1];
      }else{
        const duration = anim.duration || defaultDuration;
        const t = Math.min((now - anim.start) / duration, 1);
        if(t >= 1) return false;
        const eased = t * t * (3 - 2 * t);
        const end = targetNode.getConnectionPos(true, link.target_slot);
        const endDir = this._getSlotDir(targetNode, link.target_slot, true);
        [x,y] = this._bezierPoint(start, startDir, end, endDir, eased);
      }
      ctx.beginPath();
      ctx.fillStyle = anim.type === 'agv' ? '#5dade2' : '#d5d8dc';
      ctx.arc(x, y, iconRadius, 0, Math.PI * 2);
      ctx.fill();
      // label
      const info = anim.info || {};
      let label = '';
      if(anim.type === 'agv'){
        label = info.label || (info.id ? `AGV:${info.id}` : 'AGV');
      }else if(anim.type === 'work'){
        const id = info.id ?? '';
        const t = info.t ?? info.type ?? '';
        if(id && t) label = `W${id}:${t}`;
        else if(id) label = `W${id}`;
        else if(t) label = String(t);
      }
      if(label){
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, x, y - iconRadius - 4);
      }
      return anim.tail ? true : true;
    });
    ctx.restore();
  }
}

  const animator = new LinkAnimator();
  window.WorkLinkAnimator = animator;

  const originalSetOutputData = LiteGraph.LGraphNode.prototype.setOutputData;
  LiteGraph.LGraphNode.prototype.setOutputData = function(slot, data){
    if(this.outputs && this.outputs[slot] && !data){
      this.outputs[slot].__animToken = null;
    }
    const result = originalSetOutputData.apply(this, arguments);
    if(data && this.graph){
      const type =
        (typeof AGV !== 'undefined' && data instanceof AGV) ? 'agv' :
        (typeof Work !== 'undefined' && data instanceof Work) ? 'work' : null;
      if(type && (type === 'work' || type === 'agv')) return result;
      if(type){
        const out = this.outputs && this.outputs[slot];
        if(out && out.links){
          const same = out.__animToken === data;
          out.__animToken = data;
          if(!same){
            out.links.forEach(id=>{
              if(this.graph.links[id]) animator.spawn(this.graph, id, type);
            });
          }
        }
      }
    }
    return result;
  };

  const originalDrawConnections = LiteGraph.LGraphCanvas.prototype.drawConnections;
  LiteGraph.LGraphCanvas.prototype.drawConnections = function(ctx){
    originalDrawConnections.call(this, ctx);
    animator.draw(this, ctx);
  };
})();
