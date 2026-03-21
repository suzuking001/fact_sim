// Timeline chart for node states (process/wait/down/idle)
(function(){
  function getResolvedUiTheme(){
    try{
      if(window.App && typeof window.App.getResolvedTheme === 'function'){
        return window.App.getResolvedTheme();
      }
    }catch(_e){}
    const theme = document && document.documentElement ? document.documentElement.dataset.theme : '';
    return theme === 'dark' ? 'dark' : 'light';
  }

  function getTimelinePalette(){
    if(getResolvedUiTheme() === 'dark'){
      return {
        stateColors: {
          process: '#34d399',
          wait: '#fbbf24',
          down: '#60a5fa',
          idle: '#fcd34d',
          other: '#9ca3af'
        },
        background: '#0f1115',
        gutterBg: '#151922',
        grid: '#2a3342',
        axisText: '#94a3b8',
        rowEven: '#131821',
        rowOdd: '#10151d',
        rowDragFill: 'rgba(96,165,250,0.16)',
        rowSelectedFill: '#241a3b',
        rowSelectedBorder: '#a78bfa',
        labelDragFill: '#1b2433',
        labelDropFill: '#182235',
        labelSelectedFill: '#2a1d4a',
        labelSelectedText: '#ddd6fe',
        labelText: '#e5e7eb',
        utilMutedText: '#64748b',
        utilText: '#cbd5e1',
        matchStroke: '#e5e7eb',
        dropLine: '#60a5fa',
        nowLine: '#f87171',
        border: '#273142'
      };
    }
    return {
      stateColors: {
        process: '#2ecc71',
        wait: '#f39c12',
        down: '#3498db',
        idle: '#f1c40f',
        other: '#9ca3af'
      },
      background: '#ffffff',
      gutterBg: '#f3f4f6',
      grid: '#e5e7eb',
      axisText: '#6b7280',
      rowEven: '#ffffff',
      rowOdd: '#fafafa',
      rowDragFill: 'rgba(37,99,235,0.08)',
      rowSelectedFill: '#f5f3ff',
      rowSelectedBorder: '#7c3aed',
      labelDragFill: '#dbeafe',
      labelDropFill: '#eff6ff',
      labelSelectedFill: '#ede9fe',
      labelSelectedText: '#5b21b6',
      labelText: '#111827',
      utilMutedText: '#9ca3af',
      utilText: '#1f2937',
      matchStroke: '#111827',
      dropLine: '#2563eb',
      nowLine: '#ef4444',
      border: '#e5e7eb'
    };
  }

  function niceStep(target){
    if(!isFinite(target) || target <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const norm = target / pow;
    let step = 1;
    if(norm < 1.5) step = 1;
    else if(norm < 3.5) step = 2;
    else if(norm < 7.5) step = 5;
    else step = 10;
    return step * pow;
  }

  class TimelineChart{
    constructor(canvas){
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.graph = null;
      this.entries = new Map();
      this.leftGutter = 250;
      this.utilColWidth = 74;
      this.topPadding = 18;
      this.bottomPadding = 6;
      this.rowHeight = 18;
      this.rowGap = 4;
      this.scrollY = 0;
      this.windowSec = 100;
      this.minWindowSec = 5;
      this.maxWindowSec = 600;
      this.historySec = 600;
      this.follow = true;
      this.offsetSec = 0;
      this.selectedWorkId = null;
      this.selectedAgvId = null;
      this.selectedNodeId = null;
      this._selectionEl = document.getElementById('timelineSelection');
      this.onFollowChange = null;
      this._lastNow = 0;
      this._drag = null;
      this._rowDrag = null;
      this._autoOrderCacheKey = '';
      this._autoOrderCache = new Map();
      this._interactionWindow = null;
      this._windowMouseMoveHandler = null;
      this._windowMouseUpHandler = null;
      this.width = 0;
      this.height = 0;
      this._installEvents();
      this._updateSelectionLabel();
      this.resize();
    }

    setFollow(v){
      if(this.follow === v) return;
      this.follow = v;
      if(typeof this.onFollowChange === 'function') this.onFollowChange(v);
    }

    resize(){
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.width = rect.width;
      this.height = rect.height;
      this.draw();
    }

    attachGraph(graph){
      this.graph = graph;
      this.reset();
      this.capture();
    }

    reset(){
      this.entries.clear();
      this.scrollY = 0;
      this._autoOrderCacheKey = '';
      this._autoOrderCache = new Map();
    }

    capture(){
      if(!this.graph) return;
      const now = this._nowSec();
      this._lastNow = now;
      const nodes = this._nodeList();
      nodes.forEach(n => this._recordNode(n, now));
      this._prune(now);
      this.draw();
    }

    onStep(shouldDraw = true){
      if(!this.graph) return;
      const now = this._nowSec();
      this._lastNow = now;
      const nodes = this._nodeList();
      for(const n of nodes){
        this._recordNode(n, now);
      }
      this._prune(now);
      if(shouldDraw !== false) this.draw();
    }

    _nowSec(){
      if(typeof simNow === 'function') return simNow() / 1000;
      return Date.now() / 1000;
    }

    _nodeList(){
      if(!this.graph || !Array.isArray(this.graph._nodes)) return [];
      const nodes = this.graph._nodes.slice().filter(n => this._isTimelineNode(n));
      let needAuto = false;
      for(let i = 0; i < nodes.length; i++){
        if(this._timelineOrderOf(nodes[i]) === null){ needAuto = true; break; }
      }
      const autoRanks = needAuto ? this._getAutoOrderRankMap(nodes) : new Map();
      nodes.sort((a,b)=>{
        const ta = this._timelineOrderOf(a);
        const tb = this._timelineOrderOf(b);
        if(ta !== null || tb !== null){
          if(ta === null) return 1;
          if(tb === null) return -1;
          if(ta !== tb) return ta - tb;
        }
        const ra = autoRanks.get(this._nodeKey(a));
        const rb = autoRanks.get(this._nodeKey(b));
        if(isFinite(ra) && isFinite(rb) && ra !== rb) return ra - rb;
        const oa = this._fallbackOrderOf(a);
        const ob = this._fallbackOrderOf(b);
        if(oa !== ob) return oa - ob;
        const ia = (typeof a?.id === 'number') ? a.id : 0;
        const ib = (typeof b?.id === 'number') ? b.id : 0;
        return ia - ib;
      });
      return nodes;
    }

    _fallbackOrderOf(node){
      if(!node) return 0;
      if(typeof node.order === 'number' && isFinite(node.order)) return node.order;
      if(typeof node.id === 'number' && isFinite(node.id)) return node.id;
      return 0;
    }

    _nodePosX(node){
      const x = Number(node?.pos?.[0]);
      return isFinite(x) ? x : 0;
    }

    _nodePosY(node){
      const y = Number(node?.pos?.[1]);
      return isFinite(y) ? y : 0;
    }

    _nodeVisualCompare(a, b){
      const ax = this._nodePosX(a);
      const bx = this._nodePosX(b);
      if(ax !== bx) return ax - bx;
      const ay = this._nodePosY(a);
      const by = this._nodePosY(b);
      if(ay !== by) return ay - by;
      const oa = this._fallbackOrderOf(a);
      const ob = this._fallbackOrderOf(b);
      if(oa !== ob) return oa - ob;
      const ia = (typeof a?.id === 'number') ? a.id : 0;
      const ib = (typeof b?.id === 'number') ? b.id : 0;
      return ia - ib;
    }

    _isFlowPortName(name){
      const s = String(name || '').trim().toLowerCase();
      if(!s) return false;
      if(s.startsWith('sig')) return false;
      if(s.startsWith('work')) return true;
      if(s.startsWith('agv')) return true;
      return false;
    }

    _isFlowLink(originNode, originSlot, link, targetNode){
      if(!originNode || !targetNode || !link) return false;
      const outName = String(originNode?.outputs?.[originSlot]?.name || '').trim();
      const inName = String(targetNode?.inputs?.[link.target_slot]?.name || '').trim();
      if(/^sig/i.test(outName) || /^sig/i.test(inName)) return false;
      if(this._isFlowPortName(outName) || this._isFlowPortName(inName)) return true;
      return false;
    }

    _autoOrderStamp(nodes){
      const links = this.graph && this.graph.links ? this.graph.links : {};
      const nodeSet = new Set();
      let manual = 0;
      let sum = 0;
      let posSig = 0;
      for(let i = 0; i < nodes.length; i++){
        const n = nodes[i];
        const key = this._nodeKey(n);
        nodeSet.add(key);
        if(this._timelineOrderOf(n) !== null) manual++;
        const id = Number(this._nodeKey(n));
        if(isFinite(id)) sum += id;
        const x = Math.round(this._nodePosX(n) / 20);
        const y = Math.round(this._nodePosY(n) / 20);
        posSig += (x * 131 + y * 17);
      }

      let flowCount = 0;
      let flowHash = 2166136261 >>> 0;
      const linkIds = Object.keys(links);
      for(let i = 0; i < linkIds.length; i++){
        const lk = links[linkIds[i]];
        if(!lk) continue;
        const origin = this.graph.getNodeById(lk.origin_id);
        const target = this.graph.getNodeById(lk.target_id);
        if(!origin || !target) continue;
        const fromKey = this._nodeKey(origin);
        const toKey = this._nodeKey(target);
        if(!nodeSet.has(fromKey) || !nodeSet.has(toKey) || fromKey === toKey) continue;
        if(!this._isFlowLink(origin, lk.origin_slot, lk, target)) continue;

        const o = (Number(lk.origin_id) | 0) >>> 0;
        const t = (Number(lk.target_id) | 0) >>> 0;
        const os = (Number(lk.origin_slot) | 0) >>> 0;
        const ts = (Number(lk.target_slot) | 0) >>> 0;
        const token = (o * 73856093) ^ (t * 19349663) ^ ((os + 1) * 83492791) ^ ((ts + 1) * 2654435761);
        flowHash ^= (token >>> 0);
        flowHash = Math.imul(flowHash, 16777619) >>> 0;
        flowCount++;
      }

      return `${nodes.length}|${manual}|${sum}|${posSig}|${flowCount}|${flowHash}`;
    }

    _getAutoOrderRankMap(nodes){
      if(!Array.isArray(nodes) || !nodes.length) return new Map();
      const stamp = this._autoOrderStamp(nodes);
      if(this._autoOrderCacheKey === stamp && this._autoOrderCache){
        return this._autoOrderCache;
      }

      const keyToNode = new Map();
      const outMap = new Map();
      const inMap = new Map();
      const undMap = new Map();
      for(const n of nodes){
        const k = this._nodeKey(n);
        keyToNode.set(k, n);
        outMap.set(k, new Set());
        inMap.set(k, new Set());
        undMap.set(k, new Set());
      }

      for(const n of nodes){
        const fromKey = this._nodeKey(n);
        const outputs = Array.isArray(n?.outputs) ? n.outputs : [];
        for(let oi = 0; oi < outputs.length; oi++){
          const port = outputs[oi];
          const links = Array.isArray(port?.links) ? port.links : [];
          for(let li = 0; li < links.length; li++){
            const linkId = links[li];
            const link = this.graph?.links ? this.graph.links[linkId] : null;
            if(!link) continue;
            const target = this.graph.getNodeById(link.target_id);
            if(!target) continue;
            if(!this._isFlowLink(n, oi, link, target)) continue;
            const toKey = this._nodeKey(target);
            if(!keyToNode.has(toKey) || toKey === fromKey) continue;
            outMap.get(fromKey).add(toKey);
            inMap.get(toKey).add(fromKey);
            undMap.get(fromKey).add(toKey);
            undMap.get(toKey).add(fromKey);
          }
        }
      }

      const comps = [];
      const visited = new Set();
      for(const n of nodes){
        const startKey = this._nodeKey(n);
        if(visited.has(startKey)) continue;
        const stack = [startKey];
        visited.add(startKey);
        const compKeys = [];
        while(stack.length){
          const k = stack.pop();
          compKeys.push(k);
          const nbr = undMap.get(k);
          if(!nbr) continue;
          nbr.forEach((nx)=>{
            if(visited.has(nx)) return;
            visited.add(nx);
            stack.push(nx);
          });
        }
        if(compKeys.length) comps.push(compKeys);
      }

      comps.sort((ca, cb)=>{
        const na = ca.map(k => keyToNode.get(k)).filter(Boolean).sort((x,y)=> this._nodeVisualCompare(x,y))[0];
        const nb = cb.map(k => keyToNode.get(k)).filter(Boolean).sort((x,y)=> this._nodeVisualCompare(x,y))[0];
        return this._nodeVisualCompare(na, nb);
      });

      const orderedKeys = [];
      for(const comp of comps){
        const compSet = new Set(comp);
        const indeg = new Map();
        for(const k of comp){
          let d = 0;
          const ins = inMap.get(k);
          if(ins){
            ins.forEach((src)=>{ if(compSet.has(src)) d++; });
          }
          indeg.set(k, d);
        }

        const compareKey = (ka, kb)=> this._nodeVisualCompare(keyToNode.get(ka), keyToNode.get(kb));
        const localOrder = [];
        const visitedComp = new Set();
        const walkFrom = (startKey)=>{
          const stack = [startKey];
          while(stack.length){
            const k = stack.pop();
            if(visitedComp.has(k)) continue;
            visitedComp.add(k);
            localOrder.push(k);

            const outs = Array.from(outMap.get(k) || []).filter(nx => compSet.has(nx) && !visitedComp.has(nx));
            outs.sort(compareKey);

            const others = Array.from(undMap.get(k) || []).filter(nx => compSet.has(nx) && !visitedComp.has(nx) && outs.indexOf(nx) < 0);
            others.sort(compareKey);

            const next = outs.concat(others);
            for(let i = next.length - 1; i >= 0; i--){
              stack.push(next[i]);
            }
          }
        };

        const seeds = comp.filter(k => (indeg.get(k) || 0) === 0);
        seeds.sort(compareKey);
        for(const s of seeds){
          if(!visitedComp.has(s)) walkFrom(s);
        }

        if(visitedComp.size < comp.length){
          const remain = comp.filter(k => !visitedComp.has(k));
          remain.sort(compareKey);
          for(const r of remain){
            if(!visitedComp.has(r)) walkFrom(r);
          }
        }

        orderedKeys.push(...localOrder);
      }

      if(orderedKeys.length < nodes.length){
        const localOrder = [];
        const exists = new Set(orderedKeys);
        for(const n of nodes){
          const k = this._nodeKey(n);
          if(exists.has(k)) continue;
          localOrder.push(k);
        }
        localOrder.sort((ka, kb)=> this._nodeVisualCompare(keyToNode.get(ka), keyToNode.get(kb)));
        orderedKeys.push(...localOrder);
      }

      const rank = new Map();
      for(let i = 0; i < orderedKeys.length; i++){
        rank.set(orderedKeys[i], i + 1);
      }
      this._autoOrderCacheKey = stamp;
      this._autoOrderCache = rank;
      return rank;
    }

    _timelineOrderOf(node){
      const v = Number(node?.properties?.timelineOrder);
      if(!isFinite(v)) return null;
      return Math.round(v);
    }

    _setTimelineOrder(node, order){
      if(!node) return;
      node.properties = node.properties || {};
      node.properties.timelineOrder = Math.max(1, Math.round(order));
    }

    _saveTimelineOrder(nodes){
      if(!Array.isArray(nodes)) return;
      for(let i = 0; i < nodes.length; i++){
        this._setTimelineOrder(nodes[i], i + 1);
      }
    }

    _notifyGraphChanged(){
      try{
        if(this.graph && typeof this.graph.onAfterChange === 'function'){
          this.graph.onAfterChange();
          return;
        }
      }catch(_e){}
      try{
        if(typeof pushHistory === 'function') pushHistory();
      }catch(_e){}
    }

    resetTimelineOrderToAuto(options){
      const opts = options || {};
      const nodes = this._nodeList();
      let changed = 0;
      for(let i = 0; i < nodes.length; i++){
        const n = nodes[i];
        if(!n) continue;
        if(!n.properties || typeof n.properties !== 'object') continue;
        if(!Object.prototype.hasOwnProperty.call(n.properties, 'timelineOrder')) continue;
        delete n.properties.timelineOrder;
        changed++;
      }
      this._autoOrderCacheKey = '';
      this._autoOrderCache = new Map();
      if(changed > 0 && opts.notify !== false){
        this._notifyGraphChanged();
      }
      if(opts.draw !== false){
        this.draw();
      }
      return changed;
    }

    _moveTimelineRow(fromIdx, toIdx){
      const nodes = this._nodeList();
      if(!nodes.length) return false;
      if(!isFinite(fromIdx) || !isFinite(toIdx)) return false;
      let from = Math.max(0, Math.min(nodes.length - 1, Math.floor(fromIdx)));
      let to = Math.max(0, Math.min(nodes.length - 1, Math.floor(toIdx)));
      if(from === to) return false;
      const moved = nodes.splice(from, 1)[0];
      nodes.splice(to, 0, moved);
      this._saveTimelineOrder(nodes);
      this._notifyGraphChanged();
      return true;
    }

    _rowIndexFromY(y, rows){
      const count = Math.max(0, Number(rows) || 0);
      if(count <= 0) return -1;
      if(y < this.topPadding) return -1;
      const rowStep = this.rowHeight + this.rowGap;
      const idx = Math.floor((y + this.scrollY - this.topPadding) / rowStep);
      if(!isFinite(idx) || idx < 0 || idx >= count) return -1;
      return idx;
    }

    _clampScrollByRows(rows){
      const count = Math.max(0, Number(rows) || 0);
      const rowStep = this.rowHeight + this.rowGap;
      const chartH = Math.max(1, this.height - this.topPadding - this.bottomPadding);
      const totalH = count * rowStep;
      const maxScroll = Math.max(0, totalH - chartH);
      if(this.scrollY < 0) this.scrollY = 0;
      if(this.scrollY > maxScroll) this.scrollY = maxScroll;
      return { rowStep, chartH, maxScroll };
    }

    _isTimelineNode(node){
      if(!node) return false;
      // Exclude Source/Sink nodes from timeline (always waiting; not informative)
      try{
        const srcCtor = (typeof window !== 'undefined') ? window.SourceNode : null;
        const sinkCtor = (typeof window !== 'undefined') ? window.SinkNode : null;
        const noteCtor = (typeof window !== 'undefined') ? window.NoteNode : null;
        const carrierCfgCtor = (typeof window !== 'undefined') ? window.CarrierConfigNode : null;
        if(srcCtor && node instanceof srcCtor) return false;
        if(sinkCtor && node instanceof sinkCtor) return false;
        if(noteCtor && node instanceof noteCtor) return false;
        if(carrierCfgCtor && node instanceof carrierCfgCtor) return false;
      }catch(_e){}
      const type = String(node.type || '').toLowerCase();
      if(type === 'source' || type.endsWith('/source')) return false;
      if(type === 'sink' || type.endsWith('/sink')) return false;
      if(type === 'note' || type.endsWith('/note')) return false;
      if(type === 'carrierconfig' || type.endsWith('/carrierconfig')) return false;
      if(type === 'palletcarrierconfig' || type.endsWith('/palletcarrierconfig')) return false;
      if(type === 'palletcarrier' || type.endsWith('/palletcarrier')) return false;
      if(type === 'carrierhome' || type.endsWith('/carrierhome')) return false;
      const title = String(node.title || '').toLowerCase();
      if(title === 'source' || title === 'sink') return false;
      return true;
    }

    _nodeKey(node){
      if(node && typeof node.id !== 'undefined') return node.id;
      if(node && typeof node._id !== 'undefined') return node._id;
      return String(node?.title || node?.type || 'node');
    }

    _nodeLabel(node){
      const t = node?.title || node?.type || 'Node';
      const id = (node && typeof node.id !== 'undefined') ? node.id : '';
      return (id !== '' ? `${t} #${id}` : t);
    }

    _stateFromNode(node){
      let s = null;
      if(node && node._state) s = node._state;
      else if(node && typeof node._stateName === 'string') s = node._stateName;
      if(!s) return 'other';
      s = String(s).toLowerCase();
      if(s.indexOf('process') === 0) return 'process';
      if(s.indexOf('wait') === 0) return 'wait';
      if(s.indexOf('down') === 0) return 'down';
      if(s.indexOf('idle') === 0) return 'idle';
      return 'other';
    }

    _workIdFromNode(node){
      const pick = (obj)=>{
        if(!obj || typeof obj !== 'object') return null;
        const id = obj.id;
        return (id === undefined || id === null) ? null : id;
      };
      return (
        pick(node?._currentWork) ??
        pick(node?._payload) ??
        pick(node?._workOffer) ??
        pick(node?._work1) ??
        pick(node?._work2) ??
        pick(node?._lastWork) ??
        null
      );
    }

    _agvIdFromNode(node){
      const pick = (obj)=>{
        if(!obj || typeof obj !== 'object') return null;
        const id = obj.id;
        return (id === undefined || id === null) ? null : id;
      };
      return (
        pick(node?._currentAgv) ??
        pick(node?._departingAgv) ??
        null
      );
    }

    _updateSelectionLabel(){
      if(!this._selectionEl) return;
      if(this.selectedNodeId !== null){
        this._selectionEl.textContent = `Selected: Node #${this.selectedNodeId}`;
        return;
      }
      if(this.selectedWorkId !== null){
        this._selectionEl.textContent = `Selected: Work ${this.selectedWorkId}`;
        return;
      }
      if(this.selectedAgvId !== null){
        this._selectionEl.textContent = `Selected: AGV ${this.selectedAgvId}`;
        return;
      }
      this._selectionEl.textContent = 'Nothing selected';
    }

    exportCsv(){
      const now = this._lastNow || this._nowSec();
      const cutoff = now - this.historySec;
      const rows = [];
      rows.push([
        'node','nodeId','nodeOrder','start','end','duration','state','workId','agvId'
      ]);
      const esc = (v)=>{
        if(v === null || typeof v === 'undefined') return '';
        const s = String(v);
        if(/[,"\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
        return s;
      };
      const nodes = this._nodeList();
      const orderMap = new Map();
      nodes.forEach((n, i)=>{
        orderMap.set(this._nodeKey(n), i + 1);
      });
      for(const n of nodes){
        const key = this._nodeKey(n);
        const entry = this.entries.get(key);
        if(!entry || !entry.segments || !entry.segments.length) continue;
        const nodeId = (n && typeof n.id !== 'undefined') ? n.id : '';
        const nodeOrder = orderMap.get(key) || '';
        for(const seg of entry.segments){
          const s = Math.max(seg.start, cutoff);
          const e = Math.min(seg.end, now);
          if(e <= cutoff || e <= s) continue;
          const dur = Math.max(0, e - s);
          const state = seg.state || 'other';
          rows.push([
            esc(entry.label || ''),
            esc(nodeId),
            nodeOrder,
            s.toFixed(3),
            e.toFixed(3),
            dur.toFixed(3),
            state,
            esc(seg.workId ?? ''),
            esc(seg.agvId ?? '')
          ]);
        }
      }
      const csv = rows.map(r=>r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g,'-');
      a.download = `timeline_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    _setSelectedWorkId(id){
      this.selectedWorkId = (id === null || typeof id === 'undefined') ? null : id;
      if(this.selectedWorkId !== null) this.selectedAgvId = null;
      this.selectedNodeId = null;
      this._updateSelectionLabel();
      window.selectedWorkId = this.selectedWorkId;
      window.selectedAgvId = this.selectedAgvId;
      window.selectedNodeId = this.selectedNodeId;
      try{
        if(window.canvas && typeof window.canvas.setDirty === 'function'){
          window.canvas.setDirty(true, true);
        }else if(window.canvas && typeof window.canvas.draw === 'function'){
          window.canvas.draw(true, true);
        }
      }catch(_e){}
    }

    _setSelectedAgvId(id){
      this.selectedAgvId = (id === null || typeof id === 'undefined') ? null : id;
      if(this.selectedAgvId !== null) this.selectedWorkId = null;
      this.selectedNodeId = null;
      this._updateSelectionLabel();
      window.selectedAgvId = this.selectedAgvId;
      window.selectedWorkId = this.selectedWorkId;
      window.selectedNodeId = this.selectedNodeId;
      try{
        if(window.canvas && typeof window.canvas.setDirty === 'function'){
          window.canvas.setDirty(true, true);
        }else if(window.canvas && typeof window.canvas.draw === 'function'){
          window.canvas.draw(true, true);
        }
      }catch(_e){}
    }

    _setSelectedNodeId(id){
      this.selectedNodeId = (id === null || typeof id === 'undefined') ? null : id;
      if(this.selectedNodeId !== null){
        this.selectedWorkId = null;
        this.selectedAgvId = null;
      }
      this._updateSelectionLabel();
      window.selectedNodeId = this.selectedNodeId;
      window.selectedWorkId = this.selectedWorkId;
      window.selectedAgvId = this.selectedAgvId;
      try{
        if(window.canvas && typeof window.canvas.setDirty === 'function'){
          window.canvas.setDirty(true, true);
        }else if(window.canvas && typeof window.canvas.draw === 'function'){
          window.canvas.draw(true, true);
        }
      }catch(_e){}
    }

    _findNodeRowIndexById(id){
      if(id === null || typeof id === 'undefined') return -1;
      const nodes = this._nodeList();
      for(let i = 0; i < nodes.length; i++){
        const node = nodes[i];
        const nid = (node && typeof node.id !== 'undefined') ? node.id : this._nodeKey(node);
        if(nid == id) return i;
      }
      return -1;
    }

    _scrollToRowIndex(rowIdx){
      if(!isFinite(rowIdx) || rowIdx < 0) return;
      const rowStep = this.rowHeight + this.rowGap;
      const chartH = Math.max(1, this.height - this.topPadding - this.bottomPadding);
      const totalRows = this._nodeList().length;
      const totalHeight = totalRows * rowStep;
      const maxScroll = Math.max(0, totalHeight - chartH);
      const rowTop = rowIdx * rowStep;
      const rowBottom = rowTop + rowStep;
      if(rowTop < this.scrollY) this.scrollY = rowTop;
      else if(rowBottom > this.scrollY + chartH) this.scrollY = rowBottom - chartH;
      if(this.scrollY < 0) this.scrollY = 0;
      if(this.scrollY > maxScroll) this.scrollY = maxScroll;
    }

    setSelectedNodeId(id, options){
      const opts = options || {};
      this._setSelectedNodeId(id);
      if(this.selectedNodeId !== null && opts.ensureVisible !== false){
        const rowIdx = this._findNodeRowIndexById(this.selectedNodeId);
        if(rowIdx >= 0) this._scrollToRowIndex(rowIdx);
      }
      if(opts.draw !== false) this.draw();
    }

    selectNodeFromGraph(node, options){
      const opts = options || {};
      if(!node || !this._isTimelineNode(node)){
        this.setSelectedNodeId(null, opts);
        return false;
      }
      const nid = (typeof node.id !== 'undefined') ? node.id : this._nodeKey(node);
      this.setSelectedNodeId(nid, opts);
      return true;
    }

    _utilizationStats(entry, now, cutoff){
      if(!entry || !Array.isArray(entry.segments) || !entry.segments.length){
        return { activeSec: 0, loadSec: 0, pct: null, text: '--' };
      }
      let activeSec = 0;
      let loadSec = 0;
      for(let i = 0; i < entry.segments.length; i++){
        const seg = entry.segments[i];
        if(!seg) continue;
        const s = Math.max(cutoff, Number(seg.start) || 0);
        const e = Math.min(now, Number(seg.end) || 0);
        if(e <= s) continue;
        const dur = e - s;
        const state = String(seg.state || 'other').toLowerCase();
        if(state === 'process' || state === 'down'){
          activeSec += dur;
        }
        if(state === 'process' || state === 'down' || state === 'wait' || state === 'idle'){
          loadSec += dur;
        }
      }
      if(loadSec <= 0){
        return { activeSec, loadSec, pct: null, text: '--' };
      }
      const pct = (activeSec / loadSec) * 100;
      return { activeSec, loadSec, pct, text: `${pct.toFixed(1)}%` };
    }

    _recordNode(node, now){
      const key = this._nodeKey(node);
      let entry = this.entries.get(key);
      if(!entry){
        entry = { node, label: this._nodeLabel(node), segments: [], lastState: null, lastWorkId: null, lastAgvId: null };
        this.entries.set(key, entry);
      }
      entry.node = node;
      entry.label = this._nodeLabel(node);
      const state = this._stateFromNode(node);
      const workId = this._workIdFromNode(node);
      const agvId = this._agvIdFromNode(node);
      if(entry.lastState === null){
        entry.segments.push({ start: now, end: now, state, workId, agvId });
        entry.lastState = state;
        entry.lastWorkId = workId;
        entry.lastAgvId = agvId;
        return;
      }
      if(state !== entry.lastState || workId !== entry.lastWorkId || agvId !== entry.lastAgvId){
        const last = entry.segments[entry.segments.length - 1];
        if(last) last.end = now;
        entry.segments.push({ start: now, end: now, state, workId, agvId });
        entry.lastState = state;
        entry.lastWorkId = workId;
        entry.lastAgvId = agvId;
        return;
      }
      const seg = entry.segments[entry.segments.length - 1];
      if(seg) seg.end = now;
    }

    _prune(now){
      const cutoff = now - this.historySec;
      this.entries.forEach(entry=>{
        while(entry.segments.length && entry.segments[0].end < cutoff){
          entry.segments.shift();
        }
        if(entry.segments.length && entry.segments[0].start < cutoff){
          entry.segments[0].start = cutoff;
        }
      });
    }

    _installEvents(){
      const el = this.canvas;
      el.addEventListener('wheel', (e)=>{
        if(this.width <= 0) return;
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const chartW = Math.max(1, this.width - this.leftGutter - 8);
        const scale = chartW / this.windowSec;
        if(e.ctrlKey || e.metaKey){
          const anchorT = this.offsetSec + (x - this.leftGutter) / scale;
          const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1;
          const nextWindow = Math.max(this.minWindowSec, Math.min(this.maxWindowSec, this.windowSec * zoomFactor));
          this.windowSec = nextWindow;
          const nextScale = chartW / this.windowSec;
          this.offsetSec = anchorT - (x - this.leftGutter) / nextScale;
          if(this.offsetSec < 0) this.offsetSec = 0;
          this.setFollow(false);
        }else if(e.shiftKey){
          this.offsetSec += (e.deltaY / scale);
          if(this.offsetSec < 0) this.offsetSec = 0;
          this.setFollow(false);
        }else{
          this.scrollY += e.deltaY;
        }
        this.draw();
      }, { passive: false });

      el.addEventListener('mousedown', (e)=>{
        if(e.button !== 0) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const nodes = this._nodeList();
        const rowIdx = this._rowIndexFromY(y, nodes.length);
        if(x < this.leftGutter && rowIdx >= 0){
          this._rowDrag = {
            x: e.clientX,
            y: e.clientY,
            startRow: rowIdx,
            targetRow: rowIdx,
            moved: false
          };
          this._drag = null;
          e.preventDefault();
          this.draw();
          return;
        }
        this._drag = {
          x: e.clientX,
          y: e.clientY,
          offset: this.offsetSec,
          scroll: this.scrollY,
          rect,
          moved: false
        };
        e.preventDefault();
      });
      this._windowMouseMoveHandler = (e)=>{
        if(this._rowDrag){
          const rd = this._rowDrag;
          if(Math.abs(e.clientY - rd.y) > 3) rd.moved = true;
          const rect = this.canvas.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const nodes = this._nodeList();
          if(nodes.length){
            const edge = 20;
            if(y < this.topPadding + edge){
              this.scrollY -= Math.max(1, (this.topPadding + edge - y) * 0.5);
            }else if(y > this.height - edge){
              this.scrollY += Math.max(1, (y - (this.height - edge)) * 0.5);
            }
            this._clampScrollByRows(nodes.length);
            let rowIdx = this._rowIndexFromY(y, nodes.length);
            if(rowIdx < 0){
              rowIdx = (y < this.topPadding) ? 0 : (nodes.length - 1);
            }
            rd.targetRow = rowIdx;
          }
          this.draw();
          return;
        }
        if(!this._drag) return;
        if(Math.abs(e.clientX - this._drag.x) > 3 || Math.abs(e.clientY - this._drag.y) > 3){
          this._drag.moved = true;
        }
        const dx = e.clientX - this._drag.x;
        const chartW = Math.max(1, this.width - this.leftGutter - 8);
        const scale = chartW / this.windowSec;
        this.offsetSec = this._drag.offset - dx / scale;
        if(this.offsetSec < 0) this.offsetSec = 0;
        this.setFollow(false);
        this.draw();
      };
      this._windowMouseUpHandler = (e)=>{
        if(this._rowDrag){
          const rd = this._rowDrag;
          if(rd.moved){
            this._moveTimelineRow(rd.startRow, rd.targetRow);
          }else{
            this._handleClick(e);
          }
          this._rowDrag = null;
          this.draw();
          return;
        }
        if(this._drag && !this._drag.moved){
          this._handleClick(e);
        }
        this._drag = null;
      };
      this.bindInteractionWindow(window);
      el.addEventListener('dblclick', ()=>{
        this.setFollow(true);
        this.draw();
      });
    }

    bindInteractionWindow(targetWindow){
      const nextWindow = targetWindow || window;
      const prevWindow = this._interactionWindow;
      if(prevWindow && this._windowMouseMoveHandler && this._windowMouseUpHandler){
        try{ prevWindow.removeEventListener('mousemove', this._windowMouseMoveHandler); }catch(_e){}
        try{ prevWindow.removeEventListener('mouseup', this._windowMouseUpHandler); }catch(_e){}
      }
      this._interactionWindow = nextWindow;
      if(this._windowMouseMoveHandler && this._windowMouseUpHandler){
        try{ nextWindow.addEventListener('mousemove', this._windowMouseMoveHandler); }catch(_e){}
        try{ nextWindow.addEventListener('mouseup', this._windowMouseUpHandler); }catch(_e){}
      }
    }

    _handleClick(e){
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if(y < this.topPadding) return;
      const nodes = this._nodeList();
      const rowIdx = this._rowIndexFromY(y, nodes.length);
      if(rowIdx < 0 || rowIdx >= nodes.length) return;
      const node = nodes[rowIdx];
      if(x < this.leftGutter){
        const nid = (node && typeof node.id !== 'undefined') ? node.id : this._nodeKey(node);
        if(this.selectedNodeId !== null && this.selectedNodeId == nid){
          this._setSelectedNodeId(null);
        }else{
          this._setSelectedNodeId(nid);
        }
        this.draw();
        return;
      }
      const entry = this.entries.get(this._nodeKey(node));
      if(!entry || !entry.segments.length){
        this._setSelectedWorkId(null);
        this._setSelectedAgvId(null);
        return;
      }
      const chartW = Math.max(1, this.width - this.leftGutter - 8);
      const scale = chartW / this.windowSec;
      const t = this.offsetSec + (x - this.leftGutter) / scale;
      let found = null;
      for(let i=entry.segments.length - 1; i>=0; i--){
        const seg = entry.segments[i];
        if(t >= seg.start && t <= seg.end){
          found = seg;
          break;
        }
      }
      if(found && (found.workId !== null || found.agvId !== null)){
        const hasWork = (found.workId !== null && typeof found.workId !== 'undefined');
        const hasAgv = (found.agvId !== null && typeof found.agvId !== 'undefined');
        if(hasWork && hasAgv){
          // Toggle between Work and AGV for the same segment
          if(this.selectedWorkId !== null && this.selectedWorkId == found.workId){
            if(this.selectedAgvId !== null && this.selectedAgvId == found.agvId){
              this._setSelectedWorkId(null);
              this._setSelectedAgvId(null);
            }else{
              this._setSelectedAgvId(found.agvId);
            }
          }else if(this.selectedAgvId !== null && this.selectedAgvId == found.agvId){
            this._setSelectedWorkId(found.workId);
          }else{
            this._setSelectedWorkId(found.workId);
          }
        }else if(hasWork){
          if(this.selectedWorkId !== null && this.selectedWorkId == found.workId){
            this._setSelectedWorkId(null);
          }else{
            this._setSelectedWorkId(found.workId);
          }
        }else if(hasAgv){
          if(this.selectedAgvId !== null && this.selectedAgvId == found.agvId){
            this._setSelectedAgvId(null);
          }else{
            this._setSelectedAgvId(found.agvId);
          }
        }
      }else{
        this._setSelectedWorkId(null);
        this._setSelectedAgvId(null);
        this._setSelectedNodeId(null);
      }
      this.draw();
    }

    draw(){
      const ctx = this.ctx;
      if(!ctx || this.width <= 0 || this.height <= 0) return;
      ctx.clearRect(0, 0, this.width, this.height);
      const palette = getTimelinePalette();

      const now = this._lastNow || this._nowSec();
      const chartW = Math.max(1, this.width - this.leftGutter - 8);
      const chartH = Math.max(1, this.height - this.topPadding - this.bottomPadding);
      if(this.follow){
        this.offsetSec = Math.max(0, now - this.windowSec);
      }
      const scale = chartW / this.windowSec;

      const nodes = this._nodeList();
      const totalRows = nodes.length;
      const { rowStep } = this._clampScrollByRows(totalRows);
      const cutoff = now - this.historySec;
      const utilColX = Math.max(64, this.leftGutter - this.utilColWidth);
      const labelColW = Math.max(60, utilColX - 6);

      // background
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, this.width, this.height);

      // label gutter background
      ctx.fillStyle = palette.gutterBg;
      ctx.fillRect(0, 0, this.leftGutter, this.height);

      // vertical grid
      const gridSec = niceStep(this.windowSec / 10);
      const startSec = Math.floor(this.offsetSec / gridSec) * gridSec;
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      ctx.font = '10px sans-serif';
      ctx.fillStyle = palette.axisText;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('Node', 8, 10);
      ctx.textAlign = 'right';
      ctx.fillText('Utilization', this.leftGutter - 8, 10);
      ctx.textAlign = 'left';
      for(let t = startSec; t <= this.offsetSec + this.windowSec + gridSec; t += gridSec){
        const x = this.leftGutter + (t - this.offsetSec) * scale;
        if(x < this.leftGutter || x > this.leftGutter + chartW) continue;
        ctx.beginPath();
        ctx.moveTo(x, this.topPadding);
        ctx.lineTo(x, this.height);
        ctx.stroke();
        const label = t.toFixed(gridSec < 1 ? 1 : 0);
        ctx.fillText(label, x + 2, 12);
      }

      // row data
      for(let i=0;i<nodes.length;i++){
        const y = this.topPadding + i * rowStep - this.scrollY;
        if(y + this.rowHeight < this.topPadding || y > this.height) continue;
        const node = nodes[i];
        const key = this._nodeKey(node);
        const nid = (node && typeof node.id !== 'undefined') ? node.id : key;
        const isNodeSelected = (this.selectedNodeId !== null && nid == this.selectedNodeId);
        const isDragSource = !!(this._rowDrag && this._rowDrag.startRow === i);
        const isDragTarget = !!(this._rowDrag && this._rowDrag.targetRow === i);
        const entry = this.entries.get(key);
        const label = entry ? entry.label : this._nodeLabel(node);
        const util = this._utilizationStats(entry, now, cutoff);

        ctx.fillStyle = (i % 2 === 0) ? palette.rowEven : palette.rowOdd;
        ctx.fillRect(this.leftGutter, y, chartW, this.rowHeight);
        if(isDragSource){
          ctx.fillStyle = palette.rowDragFill;
          ctx.fillRect(this.leftGutter, y, chartW, this.rowHeight);
        }

        if(isNodeSelected){
          ctx.fillStyle = palette.rowSelectedFill;
          ctx.fillRect(this.leftGutter, y, chartW, this.rowHeight);
          ctx.strokeStyle = palette.rowSelectedBorder;
          ctx.lineWidth = 1;
          ctx.strokeRect(this.leftGutter + 0.5, y + 0.5, Math.max(1, chartW - 1), Math.max(1, this.rowHeight - 1));
        }

        // row label
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, labelColW, this.rowHeight);
        ctx.clip();
        if(isDragSource){
          ctx.fillStyle = palette.labelDragFill;
          ctx.fillRect(0, y, labelColW, this.rowHeight);
        }else if(isDragTarget){
          ctx.fillStyle = palette.labelDropFill;
          ctx.fillRect(0, y, labelColW, this.rowHeight);
        }
        if(isNodeSelected){
          ctx.fillStyle = palette.labelSelectedFill;
          ctx.fillRect(0, y, labelColW, this.rowHeight);
          ctx.strokeStyle = palette.rowSelectedBorder;
          ctx.lineWidth = 2;
          ctx.strokeRect(1, y + 1, Math.max(1, labelColW - 2), this.rowHeight - 2);
        }
        ctx.fillStyle = isNodeSelected ? palette.labelSelectedText : palette.labelText;
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 8, y + this.rowHeight / 2);
        ctx.restore();

        // utilization column (2nd column)
        ctx.save();
        ctx.beginPath();
        ctx.rect(utilColX, y, this.leftGutter - utilColX - 2, this.rowHeight);
        ctx.clip();
        if(isDragSource){
          ctx.fillStyle = palette.labelDragFill;
          ctx.fillRect(utilColX, y, this.leftGutter - utilColX - 2, this.rowHeight);
        }else if(isDragTarget){
          ctx.fillStyle = palette.labelDropFill;
          ctx.fillRect(utilColX, y, this.leftGutter - utilColX - 2, this.rowHeight);
        }
        if(isNodeSelected){
          ctx.fillStyle = palette.labelSelectedFill;
          ctx.fillRect(utilColX, y, this.leftGutter - utilColX - 2, this.rowHeight);
        }
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillStyle = (util.pct === null)
          ? palette.utilMutedText
          : (isNodeSelected ? palette.labelSelectedText : palette.utilText);
        ctx.fillText(util.text, this.leftGutter - 8, y + this.rowHeight / 2);
        ctx.textAlign = 'left';
        ctx.restore();

        // segments
        if(entry && entry.segments.length){
          for(const seg of entry.segments){
            if(seg.end < this.offsetSec) continue;
            if(seg.start > this.offsetSec + this.windowSec) break;
            const sx = this.leftGutter + (seg.start - this.offsetSec) * scale;
            const ex = this.leftGutter + (seg.end - this.offsetSec) * scale;
            const x1 = Math.max(this.leftGutter, sx);
            const x2 = Math.min(this.leftGutter + chartW, ex);
            if(x2 <= x1) continue;
            const hasSel = (this.selectedWorkId !== null || this.selectedAgvId !== null);
            const match =
              (this.selectedWorkId !== null && seg.workId === this.selectedWorkId) ||
              (this.selectedAgvId !== null && seg.agvId === this.selectedAgvId);
            const dim = (hasSel && !match);
            ctx.fillStyle = palette.stateColors[seg.state] || palette.stateColors.other;
            ctx.globalAlpha = dim ? 0.2 : 1;
            ctx.fillRect(x1, y + 2, x2 - x1, this.rowHeight - 4);
            if(match){
              ctx.globalAlpha = 1;
              ctx.strokeStyle = palette.matchStroke;
              ctx.lineWidth = 2;
              ctx.strokeRect(x1 + 0.5, y + 2.5, x2 - x1 - 1, this.rowHeight - 5);
            }
            ctx.globalAlpha = 1;
          }
        }
      }

      if(this._rowDrag && nodes.length){
        const idx = Math.max(0, Math.min(nodes.length - 1, this._rowDrag.targetRow));
        const lineY = this.topPadding + idx * rowStep - this.scrollY + this.rowHeight + this.rowGap * 0.5;
        if(lineY >= this.topPadding - rowStep && lineY <= this.height + rowStep){
          ctx.strokeStyle = palette.dropLine;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, lineY);
          ctx.lineTo(this.width, lineY);
          ctx.stroke();
        }
      }

      // now line
      const xNow = this.leftGutter + (now - this.offsetSec) * scale;
      if(xNow >= this.leftGutter && xNow <= this.leftGutter + chartW){
        ctx.strokeStyle = palette.nowLine;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xNow, this.topPadding);
        ctx.lineTo(xNow, this.height);
        ctx.stroke();
      }

      // borders
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(utilColX, 0);
      ctx.lineTo(utilColX, this.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.leftGutter, 0);
      ctx.lineTo(this.leftGutter, this.height);
      ctx.stroke();
    }
  }

  window.TimelineChart = TimelineChart;
})();
