// Timeline chart for node states (process/wait/down/idle)
(function(){
  const STATE_COLORS = {
    process: '#2ecc71',
    wait: '#f39c12',
    down: '#3498db',
    idle: '#f1c40f',
    other: '#9ca3af'
  };

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
      this.leftGutter = 180;
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

    onStep(){
      if(!this.graph) return;
      const now = this._nowSec();
      this._lastNow = now;
      const nodes = this._nodeList();
      for(const n of nodes){
        this._recordNode(n, now);
      }
      this._prune(now);
      this.draw();
    }

    _nowSec(){
      if(typeof simNow === 'function') return simNow() / 1000;
      return Date.now() / 1000;
    }

    _nodeList(){
      if(!this.graph || !Array.isArray(this.graph._nodes)) return [];
      const nodes = this.graph._nodes.slice().filter(n => this._isTimelineNode(n));
      nodes.sort((a,b)=>{
        const oa = (typeof a.order === 'number') ? a.order : (typeof a.id === 'number' ? a.id : 0);
        const ob = (typeof b.order === 'number') ? b.order : (typeof b.id === 'number' ? b.id : 0);
        return oa - ob;
      });
      return nodes;
    }

    _isTimelineNode(node){
      if(!node) return false;
      // Exclude Source/Sink nodes from timeline (always waiting; not informative)
      try{
        const srcCtor = (typeof window !== 'undefined') ? window.SourceNode : null;
        const sinkCtor = (typeof window !== 'undefined') ? window.SinkNode : null;
        if(srcCtor && node instanceof srcCtor) return false;
        if(sinkCtor && node instanceof sinkCtor) return false;
      }catch(_e){}
      const type = String(node.type || '').toLowerCase();
      if(type === 'source' || type.endsWith('/source')) return false;
      if(type === 'sink' || type.endsWith('/sink')) return false;
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
      const w = (this.selectedWorkId === null) ? '-' : this.selectedWorkId;
      const a = (this.selectedAgvId === null) ? '-' : this.selectedAgvId;
      const n = (this.selectedNodeId === null) ? '-' : this.selectedNodeId;
      this._selectionEl.textContent = `Work: ${w}  AGV: ${a}  Node: ${n}`;
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
      window.addEventListener('mousemove', (e)=>{
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
      });
      window.addEventListener('mouseup', (e)=>{
        if(this._drag && !this._drag.moved){
          this._handleClick(e);
        }
        this._drag = null;
      });
      el.addEventListener('dblclick', ()=>{
        this.setFollow(true);
        this.draw();
      });
    }

    _handleClick(e){
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if(y < this.topPadding) return;
      const rowStep = this.rowHeight + this.rowGap;
      const rowIdx = Math.floor((y + this.scrollY - this.topPadding) / rowStep);
      const nodes = this._nodeList();
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

      const now = this._lastNow || this._nowSec();
      const chartW = Math.max(1, this.width - this.leftGutter - 8);
      const chartH = Math.max(1, this.height - this.topPadding - this.bottomPadding);
      if(this.follow){
        this.offsetSec = Math.max(0, now - this.windowSec);
      }
      const scale = chartW / this.windowSec;

      const nodes = this._nodeList();
      const totalRows = nodes.length;
      const rowStep = this.rowHeight + this.rowGap;
      const totalHeight = totalRows * rowStep;
      const maxScroll = Math.max(0, totalHeight - chartH);
      if(this.scrollY < 0) this.scrollY = 0;
      if(this.scrollY > maxScroll) this.scrollY = maxScroll;

      // background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.width, this.height);

      // label gutter background
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, this.leftGutter, this.height);

      // vertical grid
      const gridSec = niceStep(this.windowSec / 10);
      const startSec = Math.floor(this.offsetSec / gridSec) * gridSec;
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#6b7280';
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
        ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#fafafa';
        ctx.fillRect(this.leftGutter, y, chartW, this.rowHeight);

        // row label
        const node = nodes[i];
        const key = this._nodeKey(node);
        const entry = this.entries.get(key);
        const label = entry ? entry.label : this._nodeLabel(node);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, this.leftGutter - 6, this.rowHeight);
        ctx.clip();
        const isNodeSelected = (this.selectedNodeId !== null && ((node && typeof node.id !== 'undefined' ? node.id : key) == this.selectedNodeId));
        if(isNodeSelected){
          ctx.fillStyle = '#ede9fe';
          ctx.fillRect(0, y, this.leftGutter - 6, this.rowHeight);
          ctx.strokeStyle = '#7c3aed';
          ctx.lineWidth = 2;
          ctx.strokeRect(1, y + 1, this.leftGutter - 8, this.rowHeight - 2);
        }
        ctx.fillStyle = isNodeSelected ? '#5b21b6' : '#111827';
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 8, y + this.rowHeight / 2);
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
            ctx.fillStyle = STATE_COLORS[seg.state] || STATE_COLORS.other;
            ctx.globalAlpha = dim ? 0.2 : 1;
            ctx.fillRect(x1, y + 2, x2 - x1, this.rowHeight - 4);
            if(match){
              ctx.globalAlpha = 1;
              ctx.strokeStyle = '#111827';
              ctx.lineWidth = 2;
              ctx.strokeRect(x1 + 0.5, y + 2.5, x2 - x1 - 1, this.rowHeight - 5);
            }
            ctx.globalAlpha = 1;
          }
        }
      }

      // now line
      const xNow = this.leftGutter + (now - this.offsetSec) * scale;
      if(xNow >= this.leftGutter && xNow <= this.leftGutter + chartW){
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xNow, this.topPadding);
        ctx.lineTo(xNow, this.height);
        ctx.stroke();
      }

      // borders
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.leftGutter, 0);
      ctx.lineTo(this.leftGutter, this.height);
      ctx.stroke();
    }
  }

  window.TimelineChart = TimelineChart;
})();
