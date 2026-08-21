(function(){
  if(typeof LiteGraph === 'undefined') return;

  const getNow = ()=> typeof simNow === 'function' ? simNow() : Date.now();
  const cfg = window.NODES_CONFIG?.animations || {};
  const defaultDuration = (cfg.linkMs || 800);
  const iconRadius = cfg.radius || 22.5;
  const LINK_ANIM_PALETTE = Object.freeze({
    defaultTypeAccent: '#8e8e93',
    defaultBubbleFill: '#d5d8dc',
    defaultBubbleStroke: 'rgba(15,23,42,0.22)',
    agvLabelFill: 'rgba(0,113,227,0.92)',
    agvLabelStroke: 'rgba(255,255,255,0.28)',
    agvLabelText: '#f8fbff',
    palletLabelFill: 'rgba(22,163,74,0.92)',
    palletLabelStroke: 'rgba(255,255,255,0.28)',
    palletLabelText: '#f7fff9',
    workLabelFill: 'rgba(15,23,42,0.88)',
    workLabelStroke: 'rgba(255,255,255,0.22)',
    workLabelText: '#f8fafc',
    labelShadow: 'rgba(15,23,42,0.16)'
  });
  const getLinkAnimPalette = ()=> LINK_ANIM_PALETTE;
  const WORK_TYPE_ACCENTS = {
    A: '#0a84ff',
    B: '#ff9f0a',
    C: '#34c759',
    D: '#bf5af2',
    E: '#ff375f',
    F: '#64d2ff'
  };

  function hashText(text){
    const raw = String(text || '');
    let hash = 0;
    for(let i = 0; i < raw.length; i++){
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function normalizeWorkType(value){
    return String(value == null ? '' : value).trim().toUpperCase();
  }

  function getWorkTypeAccent(typeValue){
    const palette = getLinkAnimPalette();
    const key = normalizeWorkType(typeValue);
    if(!key) return palette.defaultTypeAccent;
    if(WORK_TYPE_ACCENTS[key]) return WORK_TYPE_ACCENTS[key];
    const hue = hashText(key) % 360;
    return `hsl(${hue}, 74%, 46%)`;
  }

  function getAnimatedIconTheme(type, info){
    const palette = getLinkAnimPalette();
    switch(String(type || '').toLowerCase()){
      case 'agv':
        return {
          fill: '#5dade2',
          stroke: 'rgba(255,255,255,0.82)',
          lineWidth: 2
        };
      case 'pallet':
        return {
          fill: '#2ecc71',
          stroke: 'rgba(255,255,255,0.82)',
          lineWidth: 2
        };
      case 'work':{
        const accent = getWorkTypeAccent(info?.t ?? info?.type ?? '');
        return {
          fill: 'rgba(255,255,255,0.96)',
          stroke: accent,
          lineWidth: 3.5
        };
      }
      default:
        return {
          fill: palette.defaultBubbleFill,
          stroke: palette.defaultBubbleStroke,
          lineWidth: 1.5
        };
    }
  }

  function drawRoundRect(ctx, x, y, w, h, r){
    const radius = Math.max(0, Math.min(r || 0, w * 0.5, h * 0.5));
    ctx.beginPath();
    if(typeof ctx.roundRect === 'function'){
      ctx.roundRect(x, y, w, h, radius);
      return;
    }
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function trimAnimatedLabel(ctx, text, maxWidth){
    const raw = String(text || '');
    if(!raw) return '';
    if(ctx.measureText(raw).width <= maxWidth) return raw;
    let out = raw;
    while(out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth){
      out = out.slice(0, -1);
    }
    return `${out}…`;
  }

  function getAnimatedLabelTheme(type){
    const palette = getLinkAnimPalette();
    switch(String(type || '').toLowerCase()){
      case 'agv':
        return {
          fill: palette.agvLabelFill,
          stroke: palette.agvLabelStroke,
          text: palette.agvLabelText
        };
      case 'pallet':
        return {
          fill: palette.palletLabelFill,
          stroke: palette.palletLabelStroke,
          text: palette.palletLabelText
        };
      default:
        return {
          fill: palette.workLabelFill,
          stroke: palette.workLabelStroke,
          text: palette.workLabelText
        };
    }
  }

  function drawAnimatedLabel(ctx, x, y, text, type){
    const theme = getAnimatedLabelTheme(type);
    const palette = getLinkAnimPalette();
    ctx.save();
    ctx.font = '600 11px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    const label = trimAnimatedLabel(ctx, text, 180);
    const padX = 9;
    const height = 19;
    const width = Math.ceil(ctx.measureText(label).width) + padX * 2;
    const left = Math.round(x - width * 0.5);
    const top = Math.round(y - height);
    ctx.shadowColor = palette.labelShadow;
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = theme.fill;
    drawRoundRect(ctx, left, top, width, height, 999);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = theme.stroke;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, left + 0.5, top + 0.5, width - 1, height - 1, 999);
    ctx.stroke();
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, top + height * 0.5 + 0.5);
    ctx.restore();
  }

class LinkAnimator{
  constructor(){
    this.animations = [];
    this._max = Math.max(200, Number(cfg.maxTransient) || 1500);
    this._sampleOffset = 0;
  }
  clear(graph){
    if(!graph){
      this.animations.length = 0;
      this._sampleOffset = 0;
      return;
    }
    this.animations = this.animations.filter((anim)=> anim && anim.graph && anim.graph !== graph);
    if(!this.animations.length) this._sampleOffset = 0;
  }
  _trimTransient(){
    if(this.animations.length <= this._max) return;
    let over = this.animations.length - this._max;
    if(over <= 0) return;
    for(let i = 0; i < this.animations.length && over > 0;){
      const anim = this.animations[i];
      if(anim && anim.tail){
        i++;
        continue;
      }
      this.animations.splice(i, 1);
      over--;
    }
  }
  _getSlotDir(node, slotIndex, isInput){
    const slot = isInput ? (node.inputs && node.inputs[slotIndex]) : (node.outputs && node.outputs[slotIndex]);
    if(slot && slot.dir) return slot.dir;
    if(node.horizontal) return isInput ? LiteGraph.UP : LiteGraph.DOWN;
    return isInput ? LiteGraph.LEFT : LiteGraph.RIGHT;
  }
  _outsideNode(node, point, dir, distance){
    const out = [point[0], point[1]];
    const rawLeft = Number(node?.pos?.[0]);
    const rawTop = Number(node?.pos?.[1]);
    const rawWidth = Number(node?.size?.[0]);
    const rawHeight = Number(node?.size?.[1]);
    const left = Number.isFinite(rawLeft) ? rawLeft : out[0];
    const top = Number.isFinite(rawTop) ? rawTop : out[1];
    const right = left + (Number.isFinite(rawWidth) ? rawWidth : 0);
    const bottom = top + (Number.isFinite(rawHeight) ? rawHeight : 0);
    switch(dir){
      case LiteGraph.LEFT: out[0] = Math.min(out[0], left) - distance; break;
      case LiteGraph.RIGHT: out[0] = Math.max(out[0], right) + distance; break;
      case LiteGraph.UP: out[1] = Math.min(out[1], top) - distance; break;
      case LiteGraph.DOWN: out[1] = Math.max(out[1], bottom) + distance; break;
    }
    return out;
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
    const duration = durationMs || defaultDuration;
    const processTimed = Number.isFinite(Number(durationMs)) && Number(durationMs) > 0;
    const entityId = info && info.id != null ? String(info.id) : '';
    const entityType = info ? String(info.t ?? info.type ?? '') : '';
    if(entityId && String(type).toLowerCase() === 'work'){
      const existing = this.animations.find((anim)=>{
        if(!anim || anim.tail || anim.graph !== graph || anim.linkId !== linkId || anim.type !== type) return false;
        const activeDuration = anim.duration || defaultDuration;
        if((now - anim.start) >= activeDuration) return false;
        const activeInfo = anim.info || {};
        return String(activeInfo.id ?? '') === entityId &&
          String(activeInfo.t ?? activeInfo.type ?? '') === entityType;
      });
      if(existing){
        if(processTimed && !existing.processTimed){
          // Source may draw a short provisional hand-off before the receiver runs.
          // Once the receiver starts processing, restart the same visual at that
          // exact time so arrival coincides with PROCESS completion.
          existing.start = now;
          existing.duration = duration;
          existing.processTimed = true;
        }else{
          const elapsed = Math.max(0, now - existing.start);
          existing.duration = Math.max(existing.duration || defaultDuration, elapsed + duration);
        }
        existing.info = info || existing.info || null;
        return;
      }
    }
    this.animations.push({
      graph,
      linkId,
      type,
      info: info || null,
      start: now,
      duration,
      processTimed,
      tail: false
    });
    this._trimTransient();
  }
  showPortIcon(graph, linkId, type, info){
    if(!graph || !linkId) return;
    const existing = this.animations.find(anim=>(
      anim.tail &&
      anim.graph === graph &&
      anim.linkId === linkId &&
      anim.type === type
    ));
    if(existing){
      existing.info = info || existing.info || null;
      existing.start = getNow();
      existing._tailMiss = 0;
      return;
    }
    this.animations = this.animations.filter(anim=>!(anim.tail && anim.graph===graph && anim.linkId===linkId && anim.type===type));
    this.animations.push({
      graph,
      linkId,
      type,
      info: info || null,
      start: getNow(),
      duration: null,
      tail: true,
      _tailMiss: 0
    });
  }
  hidePortIcon(graph, linkId){
    this.animations = this.animations.filter(anim=>!(anim.tail && anim.graph===graph && anim.linkId===linkId));
  }
  _adaptiveRenderPolicy(canvas){
    const graph = canvas && canvas.graph;
    const nodeCount = Array.isArray(graph && graph._nodes) ? graph._nodes.length : 0;
    const app = window.App || null;
    const fps = (app && typeof app.getRealtimeRenderFps === 'function') ? Number(app.getRealtimeRenderFps()) : 60;
    const running = (typeof isSimRunning === 'function') ? !!isSimRunning() : false;
    if(!running){
      return { step: 1, labelEvery: 1 };
    }

    let targetTransient = 800;
    let labelEvery = 1;
    if(nodeCount >= 300 || fps < 34){
      targetTransient = 600;
      labelEvery = 2;
    }
    if(nodeCount >= 700 || fps < 24){
      targetTransient = 360;
      labelEvery = 3;
    }
    if(nodeCount >= 1100 || fps < 16){
      targetTransient = 220;
      labelEvery = 5;
    }

    let transientCount = 0;
    for(let i = 0; i < this.animations.length; i++){
      const anim = this.animations[i];
      if(anim && !anim.tail) transientCount++;
    }
    const step = (transientCount > targetTransient)
      ? Math.max(1, Math.ceil(transientCount / targetTransient))
      : 1;
    return { step, labelEvery };
  }
  draw(canvas, ctx){
    if(!this.animations.length || !canvas || !ctx) return;
    const now = getNow();
    const policy = this._adaptiveRenderPolicy(canvas);
    const step = Math.max(1, Number(policy.step) || 1);
    const labelEvery = Math.max(1, Number(policy.labelEvery) || 1);
    const drawTransientRemainder = (step > 1)
      ? (this._sampleOffset = (this._sampleOffset + 1) % step)
      : 0;
    let transientIdx = 0;
    let labelCounter = 0;
    ctx.save();
    this.animations = this.animations.filter(anim=>{
      const graph = anim.graph;
      if(!graph) return false;
      const link = graph.links[anim.linkId];
      if(!link) return false;
      const originNode = graph.getNodeById(link.origin_id);
      const targetNode = graph.getNodeById(link.target_id);
      if(!originNode || !targetNode) return false;
      let x, y;
        if(anim.tail){
          const start = originNode.getConnectionPos(false, link.origin_slot);
          const allowAgvWait =
            anim.type === 'agv' &&
            originNode &&
            typeof originNode._stateName === 'string' &&
            (originNode._stateName.startsWith('workIn_idle') ||
             originNode._stateName.startsWith('workIn_process') ||
             originNode._stateName.startsWith('workOut_wait') ||
             originNode._stateName.startsWith('workOut_down') ||
             originNode._stateName.startsWith('palletOut_wait') ||
             originNode._stateName.startsWith('palletOut_down') ||
             originNode._stateName === 'agvOut_wait');
          if(originNode._state !== 'WAIT' && !allowAgvWait){
            anim._tailMiss = (anim._tailMiss || 0) + 1;
            if(anim._tailMiss <= 2) return true;
            return false;
          }
          anim._tailMiss = 0;
          x = start[0];
          y = start[1];
      }else{
        const duration = anim.duration || defaultDuration;
        const t = Math.min((now - anim.start) / duration, 1);
        if(t >= 1) return false;
        const shouldDrawTransient = (step <= 1) || ((transientIdx % step) === drawTransientRemainder);
        transientIdx++;
        if(!shouldDrawTransient){
          return true;
        }
        let start = originNode.getConnectionPos(false, link.origin_slot);
        const startDir = this._getSlotDir(originNode, link.origin_slot, false);
        const eased = t * t * (3 - 2 * t);
        let end = targetNode.getConnectionPos(true, link.target_slot);
        const endDir = this._getSlotDir(targetNode, link.target_slot, true);
        if(String(anim.type).toLowerCase() === 'work'){
          // Keep the whole Work bubble outside both nodes. At t=1 its outer
          // edge reaches the target boundary for the first time; its centre no
          // longer enters the target before processing has completed.
          start = this._outsideNode(originNode, start, startDir, iconRadius);
          end = this._outsideNode(targetNode, end, endDir, iconRadius);
        }
        [x,y] = this._bezierPoint(start, startDir, end, endDir, eased);
      }
      const info = anim.info || {};
      const iconTheme = getAnimatedIconTheme(anim.type, info);
      ctx.beginPath();
      ctx.fillStyle = iconTheme.fill;
      ctx.arc(x, y, iconRadius, 0, Math.PI * 2);
      ctx.fill();
      if(iconTheme.stroke){
        ctx.beginPath();
        ctx.lineWidth = iconTheme.lineWidth || 2;
        ctx.strokeStyle = iconTheme.stroke;
        ctx.arc(x, y, Math.max(0, iconRadius - (iconTheme.lineWidth || 2) * 0.5), 0, Math.PI * 2);
        ctx.stroke();
      }
      // label
      let label = '';
      if(anim.type === 'agv'){
        const kind = String(info.kind || '').toLowerCase();
        const isCarrier = kind === 'carrier';
        const countRaw = Number(info.workCount);
        const hasCount = Number.isFinite(countRaw);
        const count = hasCount ? Math.max(0, Math.floor(countRaw)) : null;

        if(info.label){
          if(isCarrier && hasCount){
            label = `${info.label} (${count})`;
          }else{
            label = info.label;
          }
        }else if(isCarrier){
          const id = info.id ? String(info.id) : 'carrier';
          if(hasCount) label = `${id} (${count})`;
          else label = id;
        }else{
          label = info.id ? `AGV:${info.id}` : 'AGV';
        }
      }else if(anim.type === 'pallet'){
        const id = info.id ? String(info.id) : 'Pallet';
        const countRaw = Number(info.workCount);
        const hasCount = Number.isFinite(countRaw);
        if(hasCount) label = `${id} (${Math.max(0, Math.floor(countRaw))})`;
        else label = id;
      }else if(anim.type === 'work'){
        const id = info.id ?? '';
        const t = info.t ?? info.type ?? '';
        if(id && t) label = `W${id}:${t}`;
        else if(id) label = `W${id}`;
        else if(t) label = String(t);
      }
      if(label){
        const shouldDrawLabel = anim.tail || (labelEvery <= 1) || ((labelCounter++ % labelEvery) === 0);
        if(shouldDrawLabel){
          drawAnimatedLabel(ctx, x, y - iconRadius - 5, label, anim.type);
        }
      }
      return anim.tail ? true : true;
    });
    ctx.restore();
  }
}

  const animator = new LinkAnimator();
  window.WorkLinkAnimator = animator;

  function collectConnectionCullNodes(canvas){
    const graph = canvas && canvas.graph;
    if(!graph || !Array.isArray(graph._nodes) || !graph._nodes.length) return null;

    const allNodes = graph._nodes;
    if(allNodes.length < 200 || typeof canvas.computeVisibleNodes !== 'function') return allNodes;

    const visibleBuf = canvas.__cullVisibleNodesBuf || (canvas.__cullVisibleNodesBuf = []);
    const visibleNodes = canvas.computeVisibleNodes(allNodes, visibleBuf);
    if(!visibleNodes || !visibleNodes.length) return [];
    if(visibleNodes.length >= allNodes.length) return allNodes;

    const includeIds = new Set();
    for(const node of visibleNodes){
      if(!node || typeof node.id === 'undefined') continue;
      includeIds.add(node.id);

      if(Array.isArray(node.inputs)){
        for(const inp of node.inputs){
          if(!inp || inp.link == null) continue;
          const link = graph.links && graph.links[inp.link];
          if(!link) continue;
          if(typeof link.origin_id !== 'undefined') includeIds.add(link.origin_id);
          if(typeof link.target_id !== 'undefined') includeIds.add(link.target_id);
        }
      }

      if(Array.isArray(node.outputs)){
        for(const out of node.outputs){
          if(!out || !out.links) continue;
          for(const lid of out.links){
            const link = graph.links && graph.links[lid];
            if(!link) continue;
            if(typeof link.origin_id !== 'undefined') includeIds.add(link.origin_id);
            if(typeof link.target_id !== 'undefined') includeIds.add(link.target_id);
          }
        }
      }
    }

    if(includeIds.size >= allNodes.length) return allNodes;

    const subset = canvas.__cullNodeSubsetBuf || (canvas.__cullNodeSubsetBuf = []);
    subset.length = 0;
    for(const node of allNodes){
      if(node && includeIds.has(node.id)) subset.push(node);
    }
    return subset;
  }

  const originalSetOutputData = LiteGraph.LGraphNode.prototype.setOutputData;
  LiteGraph.LGraphNode.prototype.setOutputData = function(slot, data){
    // Track output changes to allow same-tick settle passes
    const out = this.outputs && this.outputs[slot];
    if(out){
      const prev = out.__lastSet;
      if(prev !== data){
        out.__lastSet = data;
        if(this.graph){
          this.graph.__outputDirty = true;
          // Track downstream nodes impacted by this output update.
          if(!this.graph.__dirtyNodeIds) this.graph.__dirtyNodeIds = new Set();
          if(out.links){
            out.links.forEach(id=>{
              const link = this.graph.links[id];
              if(link && typeof link.target_id !== 'undefined'){
                this.graph.__dirtyNodeIds.add(link.target_id);
              }
            });
          }
        }
      }
    }
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
    let originalNodes = null;
    let replaced = false;
    try{
      const graph = this.graph;
      const subset = collectConnectionCullNodes(this);
      if(graph && Array.isArray(graph._nodes) && Array.isArray(subset) && subset !== graph._nodes){
        originalNodes = graph._nodes;
        graph._nodes = subset;
        replaced = true;
      }
      originalDrawConnections.call(this, ctx);
    }finally{
      if(replaced && this.graph) this.graph._nodes = originalNodes;
    }
    animator.draw(this, ctx);
  };
})();
